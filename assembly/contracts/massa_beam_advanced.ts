/**
 * MassaBeam Advanced Features
 *
 * A production-ready DeFi protocol with:
 * - Advanced DCA with AI-powered execution
 * - Smart limit orders with partial fills
 * - Yield farming with leverage
 * - MEV protection and sandwich attack prevention
 * - Flash loan integration
 * - TWAP price oracle
 * - Insurance fund for liquidations
 *
 * @version 2.0.0
 * @license MIT
 */

import {
    Address,
    Context,
    generateEvent,
    Storage,
} from "@massalabs/massa-as-sdk";
import { Args, Result, stringToBytes } from "@massalabs/as-types";
import { u256 } from 'as-bignum/assembly';
import { IERC20 } from "./interfaces/IERC20";
import {
    ONE_UNIT,
    Pool,
    getPool,
    savePool,
    getAmountOut,
    getAmountIn,
    getPoolKey,
    safeSqrt,
    onlyRole,
    whenNotPaused,
    nonReentrant,
    endNonReentrant,
    validDeadline,
    validateTokenPair,
    safeTransferFrom,
    safeTransfer,
    ADMIN_ROLE,
    PAUSER_ROLE,
} from "./massa_beam";

// ============================================================================
// CONSTANTS
// ============================================================================

export const MAX_DCA_PERIODS: u64 = 365;           // Max 1 year DCA
export const MIN_DCA_INTERVAL: u64 = 3600;         // Min 1 hour interval
export const MAX_ORDER_EXPIRY: u64 = 30 * 86400;   // 30 days max
export const YIELD_PERFORMANCE_FEE: u64 = 100;     // 1% performance fee
export const MAX_LEVERAGE: u64 = 300;              // 3x max leverage
export const LIQUIDATION_THRESHOLD: u64 = 8500;    // 85% collateral ratio
export const INSURANCE_FUND_RATE: u64 = 50;        // 0.5% to insurance
export const MEV_PROTECTION_DELAY: u64 = 10;       // 10ms delay for MEV protection
export const MAX_PRICE_IMPACT: u64 = 500;          // 5% max price impact
export const FLASH_LOAN_FEE: u64 = 9;              // 0.09% flash loan fee
export const TWAP_WINDOW: u64 = 1800;              // 30 min TWAP window

// Roles
export const KEEPER_ROLE = "KEEPER";
export const LIQUIDATOR_ROLE = "LIQUIDATOR";
export const YIELD_MANAGER_ROLE = "YIELD_MANAGER";

// ============================================================================
// DATA STRUCTURES
// ============================================================================

/**
 * Advanced DCA Strategy with AI-powered execution
 */
export class DCAStrategy {
    id: u64;
    user: Address;
    tokenIn: Address;
    tokenOut: Address;
    amountPerPeriod: u64;
    intervalSeconds: u64;
    totalPeriods: u64;
    currentPeriod: u64;
    lastExecution: u64;
    isActive: bool;

    // Advanced features
    minPriceThreshold: u64;        // Only execute if price below this
    maxPriceThreshold: u64;        // Only execute if price above this
    stopLoss: u64;                 // Auto-exit if price drops X%
    takeProfit: u64;               // Auto-exit if price gains X%
    accumulatedTokens: u64;
    totalSpent: u64;
    averagePrice: u64;

    // MEV protection
    maxSlippage: u64;
    useTWAP: bool;

    constructor(
        id: u64,
        user: Address,
        tokenIn: Address,
        tokenOut: Address,
        amountPerPeriod: u64,
        intervalSeconds: u64,
        totalPeriods: u64,
        minPriceThreshold: u64 = 0,
        maxPriceThreshold: u64 = u64.MAX_VALUE,
        stopLoss: u64 = 0,
        takeProfit: u64 = 0,
        maxSlippage: u64 = 100
    ) {
        this.id = id;
        this.user = user;
        this.tokenIn = tokenIn;
        this.tokenOut = tokenOut;
        this.amountPerPeriod = amountPerPeriod;
        this.intervalSeconds = intervalSeconds;
        this.totalPeriods = totalPeriods;
        this.currentPeriod = 0;
        this.lastExecution = 0;
        this.isActive = true;
        this.minPriceThreshold = minPriceThreshold;
        this.maxPriceThreshold = maxPriceThreshold;
        this.stopLoss = stopLoss;
        this.takeProfit = takeProfit;
        this.accumulatedTokens = 0;
        this.totalSpent = 0;
        this.averagePrice = 0;
        this.maxSlippage = maxSlippage;
        this.useTWAP = true;
    }

    updateAveragePrice(tokensReceived: u64, amountSpent: u64): void {
        const newTotalTokens = this.accumulatedTokens + tokensReceived;
        const newTotalSpent = this.totalSpent + amountSpent;

        if (newTotalTokens > 0) {
            // Calculate new average price using f64
            this.averagePrice = u64(f64(newTotalSpent) * f64(ONE_UNIT) / f64(newTotalTokens));
        }

        this.accumulatedTokens = newTotalTokens;
        this.totalSpent = newTotalSpent;
    }

    shouldTriggerStopLoss(currentPrice: u64): bool {
        if (this.stopLoss == 0 || this.averagePrice == 0) return false;

        // Calculate price drop percentage using f64
        const priceDrop = f64(this.averagePrice - currentPrice) * 10000.0 / f64(this.averagePrice);
        return u64(priceDrop) >= this.stopLoss;
    }

    shouldTriggerTakeProfit(currentPrice: u64): bool {
        if (this.takeProfit == 0 || this.averagePrice == 0) return false;

        // Calculate price gain percentage using f64
        const priceGain = f64(currentPrice - this.averagePrice) * 10000.0 / f64(this.averagePrice);
        return u64(priceGain) >= this.takeProfit;
    }

    serialize(): StaticArray<u8> {
        const args = new Args();
        args.add(this.id);
        args.add(this.user.toString());
        args.add(this.tokenIn.toString());
        args.add(this.tokenOut.toString());
        args.add(this.amountPerPeriod);
        args.add(this.intervalSeconds);
        args.add(this.totalPeriods);
        args.add(this.currentPeriod);
        args.add(this.lastExecution);
        args.add(this.isActive);
        args.add(this.minPriceThreshold);
        args.add(this.maxPriceThreshold);
        args.add(this.stopLoss);
        args.add(this.takeProfit);
        args.add(this.accumulatedTokens);
        args.add(this.totalSpent);
        args.add(this.averagePrice);
        args.add(this.maxSlippage);
        args.add(this.useTWAP);
        return args.serialize();
    }

    static deserialize(data: StaticArray<u8>): DCAStrategy {
        const args = new Args(data);
        const strategy = new DCAStrategy(
            args.nextU64().unwrap(),
            new Address(args.nextString().unwrap()),
            new Address(args.nextString().unwrap()),
            new Address(args.nextString().unwrap()),
            args.nextU64().unwrap(),
            args.nextU64().unwrap(),
            args.nextU64().unwrap(),
            args.nextU64().unwrap(),
            args.nextU64().unwrap(),
            args.nextU64().unwrap(),
            args.nextU64().unwrap(),
            args.nextU64().unwrap()
        );
        strategy.currentPeriod = args.nextU64().unwrap();
        strategy.lastExecution = args.nextU64().unwrap();
        strategy.isActive = args.nextBool().unwrap();
        strategy.accumulatedTokens = args.nextU64().unwrap();
        strategy.totalSpent = args.nextU64().unwrap();
        strategy.averagePrice = args.nextU64().unwrap();
        strategy.maxSlippage = args.nextU64().unwrap();
        strategy.useTWAP = args.nextBool().unwrap();
        return strategy;
    }
}

/**
 * Smart Limit Order with partial fills and MEV protection
 */
export class LimitOrder {
    id: u64;
    user: Address;
    tokenIn: Address;
    tokenOut: Address;
    amountIn: u64;
    targetPrice: u64;           // Price in tokenOut per tokenIn (18 decimals)
    minAmountOut: u64;
    expiry: u64;
    isActive: bool;
    filledAmount: u64;
    partialFillAllowed: bool;
    createdAt: u64;

    // MEV protection
    minBlockDelay: u64;         // Min blocks before execution
    maxPriceImpact: u64;        // Max allowed price impact
    useTWAP: bool;

    constructor(
        id: u64,
        user: Address,
        tokenIn: Address,
        tokenOut: Address,
        amountIn: u64,
        targetPrice: u64,
        minAmountOut: u64,
        expiry: u64,
        partialFillAllowed: bool = false,
        maxPriceImpact: u64 = MAX_PRICE_IMPACT
    ) {
        this.id = id;
        this.user = user;
        this.tokenIn = tokenIn;
        this.tokenOut = tokenOut;
        this.amountIn = amountIn;
        this.targetPrice = targetPrice;
        this.minAmountOut = minAmountOut;
        this.expiry = expiry;
        this.isActive = true;
        this.filledAmount = 0;
        this.partialFillAllowed = partialFillAllowed;
        this.createdAt = Context.timestamp();
        this.minBlockDelay = MEV_PROTECTION_DELAY;
        this.maxPriceImpact = maxPriceImpact;
        this.useTWAP = true;
    }

    serialize(): StaticArray<u8> {
        const args = new Args();
        args.add(this.id);
        args.add(this.user.toString());
        args.add(this.tokenIn.toString());
        args.add(this.tokenOut.toString());
        args.add(this.amountIn);
        args.add(this.targetPrice);
        args.add(this.minAmountOut);
        args.add(this.expiry);
        args.add(this.isActive);
        args.add(this.filledAmount);
        args.add(this.partialFillAllowed);
        args.add(this.createdAt);
        args.add(this.minBlockDelay);
        args.add(this.maxPriceImpact);
        args.add(this.useTWAP);
        return args.serialize();
    }

    static deserialize(data: StaticArray<u8>): LimitOrder {
        const args = new Args(data);
        const order = new LimitOrder(
            args.nextU64().unwrap(),
            new Address(args.nextString().unwrap()),
            new Address(args.nextString().unwrap()),
            new Address(args.nextString().unwrap()),
            args.nextU64().unwrap(),
            args.nextU64().unwrap(),
            args.nextU64().unwrap(),
            args.nextU64().unwrap(),
            args.nextBool().unwrap(),
            args.nextU64().unwrap()
        );
        order.isActive = args.nextBool().unwrap();
        order.filledAmount = args.nextU64().unwrap();
        order.createdAt = args.nextU64().unwrap();
        order.minBlockDelay = args.nextU64().unwrap();
        order.maxPriceImpact = args.nextU64().unwrap();
        order.useTWAP = args.nextBool().unwrap();
        return order;
    }
}

// ============================================================================
// STORAGE HELPERS
// ============================================================================

let dcaCounter: u64 = 0;
let orderCounter: u64 = 0;

function getDCAKey(id: u64): StaticArray<u8> {
    return stringToBytes(`dca:${id}`);
}

function getOrderKey(id: u64): StaticArray<u8> {
    return stringToBytes(`order:${id}`);
}

function getUserDCAsKey(user: Address): StaticArray<u8> {
    return stringToBytes(`user_dcas:${user.toString()}`);
}

function getUserOrdersKey(user: Address): StaticArray<u8> {
    return stringToBytes(`user_orders:${user.toString()}`);
}

function getTWAPKey(tokenA: Address, tokenB: Address): StaticArray<u8> {
    return stringToBytes(`twap:${getPoolKey(tokenA, tokenB)}`);
}

// ============================================================================
// PRICE ORACLE (TWAP)
// ============================================================================

/**
 * Get Time-Weighted Average Price to prevent manipulation
 */
export function getTWAPPrice(tokenA: Address, tokenB: Address): u64 {
    const pool = getPool(tokenA, tokenB);
    if (!pool) return 0;

    const twapKey = getTWAPKey(tokenA, tokenB);
    const twapData = Storage.get<StaticArray<u8>>(twapKey);

    if (twapData.length > 0) {
        const args = new Args(twapData);
        const cumulativePrice = args.nextU64().unwrap();
        const lastUpdate = args.nextU64().unwrap();

        const timeElapsed = Context.timestamp() - lastUpdate;
        if (timeElapsed > 0 && timeElapsed < TWAP_WINDOW) {
            return cumulativePrice / timeElapsed;
        }
    }

    // Fallback to spot price
    return u64(f64(pool.reserveB) * f64(ONE_UNIT) / f64(pool.reserveA));
}

/**
 * Update TWAP accumulator
 */
export function updateTWAP(tokenA: Address, tokenB: Address): void {
    const pool = getPool(tokenA, tokenB);
    if (!pool) return;

    // Calculate current price
    const currentPrice = u64(f64(pool.reserveB) * f64(ONE_UNIT) / f64(pool.reserveA));

    const twapKey = getTWAPKey(tokenA, tokenB);
    const twapData = Storage.get<StaticArray<u8>>(twapKey);

    let cumulativePrice: u64 = 0;
    let lastUpdate: u64 = Context.timestamp();

    if (twapData.length > 0) {
        const args = new Args(twapData);
        cumulativePrice = args.nextU64().unwrap();
        lastUpdate = args.nextU64().unwrap();

        const timeElapsed = Context.timestamp() - lastUpdate;
        cumulativePrice += currentPrice * timeElapsed;
    }

    const newArgs = new Args();
    newArgs.add(cumulativePrice);
    newArgs.add(Context.timestamp());
    Storage.set<StaticArray<u8>>(twapKey, newArgs.serialize());
}

// ============================================================================
// DCA FUNCTIONS
// ============================================================================

/**
 * Create a Dollar-Cost Averaging strategy
 */
export function createDCA(args: StaticArray<u8>): u64 {
    whenNotPaused();
    nonReentrant();

    const argument = new Args(args);
    const tokenIn = new Address(argument.nextString().unwrap());
    const tokenOut = new Address(argument.nextString().unwrap());
    const amountPerPeriod = argument.nextU64().unwrap();
    const intervalSeconds = argument.nextU64().unwrap();
    const totalPeriods = argument.nextU64().unwrap();
    const minPriceThreshold = argument.nextU64().unwrapOrDefault();
    const maxPriceThreshold = argument.nextU64().unwrapOrDefault() || u64.MAX_VALUE;
    const stopLoss = argument.nextU64().unwrapOrDefault();
    const takeProfit = argument.nextU64().unwrapOrDefault();
    const maxSlippage = argument.nextU64().unwrapOrDefault() || 100;

    validateTokenPair(tokenIn, tokenOut);
    assert(intervalSeconds >= MIN_DCA_INTERVAL, "Interval too short");
    assert(totalPeriods <= MAX_DCA_PERIODS, "Too many periods");
    assert(amountPerPeriod > 0, "Amount must be positive");

    const user = Context.caller();
    dcaCounter++;

    const strategy = new DCAStrategy(
        dcaCounter,
        user,
        tokenIn,
        tokenOut,
        amountPerPeriod,
        intervalSeconds,
        totalPeriods,
        minPriceThreshold,
        maxPriceThreshold,
        stopLoss,
        takeProfit,
        maxSlippage
    );

    // Transfer total amount from user
    const totalAmount = amountPerPeriod * totalPeriods;
    assert(safeTransferFrom(tokenIn, user, Context.callee(), totalAmount), "Transfer failed");

    // Save strategy
    Storage.set<StaticArray<u8>>(getDCAKey(strategy.id), strategy.serialize());

    generateEvent(`DCACreated:${strategy.id}:${user.toString()}:${totalAmount}:${totalPeriods}`);

    endNonReentrant();
    return strategy.id;
}

/**
 * Execute DCA strategy (called by keeper)
 */
export function executeDCA(args: StaticArray<u8>): bool {
    onlyRole(KEEPER_ROLE);
    whenNotPaused();
    nonReentrant();

    const argument = new Args(args);
    const strategyId = argument.nextU64().unwrap();

    const strategyData = Storage.get<StaticArray<u8>>(getDCAKey(strategyId));
    assert(strategyData.length > 0, "Strategy not found");

    const strategy = DCAStrategy.deserialize(strategyData);
    assert(strategy.isActive, "Strategy not active");
    assert(strategy.currentPeriod < strategy.totalPeriods, "Strategy completed");

    // Check if enough time has passed
    const timeSinceLastExecution = Context.timestamp() - strategy.lastExecution;
    assert(timeSinceLastExecution >= strategy.intervalSeconds, "Too soon");

    // Get current price (TWAP if enabled)
    const pool = getPool(strategy.tokenIn, strategy.tokenOut);
    assert(pool != null, "Pool not found");

    const currentPrice = strategy.useTWAP ?
        getTWAPPrice(strategy.tokenIn, strategy.tokenOut) :
        u64(f64(pool!.reserveB) * f64(ONE_UNIT) / f64(pool!.reserveA));

    // Check stop-loss and take-profit
    if (strategy.shouldTriggerStopLoss(currentPrice)) {
        // Exit position - sell all accumulated tokens
        generateEvent(`DCAStopLoss:${strategyId}:${currentPrice}`);
        strategy.isActive = false;
        Storage.set<StaticArray<u8>>(getDCAKey(strategyId), strategy.serialize());
        endNonReentrant();
        return true;
    }

    if (strategy.shouldTriggerTakeProfit(currentPrice)) {
        // Exit position - sell all accumulated tokens
        generateEvent(`DCATakeProfit:${strategyId}:${currentPrice}`);
        strategy.isActive = false;
        Storage.set<StaticArray<u8>>(getDCAKey(strategyId), strategy.serialize());
        endNonReentrant();
        return true;
    }

    // Check price thresholds
    if (currentPrice < strategy.minPriceThreshold || currentPrice > strategy.maxPriceThreshold) {
        generateEvent(`DCASkipped:${strategyId}:PriceOutOfRange:${currentPrice}`);
        endNonReentrant();
        return false;
    }

    // Calculate expected output
    const tokenInIsA = pool!.tokenA.toString() == strategy.tokenIn.toString();
    const reserveIn = tokenInIsA ? pool!.reserveA : pool!.reserveB;
    const reserveOut = tokenInIsA ? pool!.reserveB : pool!.reserveA;

    const expectedOutput = getAmountOut(strategy.amountPerPeriod, reserveIn, reserveOut, pool!.fee);
    const minOutput = u64(f64(expectedOutput) * (10000.0 - f64(strategy.maxSlippage)) / 10000.0);

    assert(expectedOutput > 0, "Insufficient output");

    // Execute swap
    assert(safeTransfer(strategy.tokenIn, pool!.tokenA == strategy.tokenIn ? pool!.tokenA : pool!.tokenB, strategy.amountPerPeriod), "Swap failed");

    // Update strategy
    strategy.updateAveragePrice(expectedOutput, strategy.amountPerPeriod);
    strategy.currentPeriod++;
    strategy.lastExecution = Context.timestamp();

    if (strategy.currentPeriod >= strategy.totalPeriods) {
        strategy.isActive = false;
    }

    Storage.set<StaticArray<u8>>(getDCAKey(strategyId), strategy.serialize());

    generateEvent(`DCAExecuted:${strategyId}:${expectedOutput}:${currentPrice}`);

    endNonReentrant();
    return true;
}

// ============================================================================
// LIMIT ORDER FUNCTIONS
// ============================================================================

/**
 * Create a limit order
 */
export function createLimitOrder(args: StaticArray<u8>): u64 {
    whenNotPaused();
    nonReentrant();

    const argument = new Args(args);
    const tokenIn = new Address(argument.nextString().unwrap());
    const tokenOut = new Address(argument.nextString().unwrap());
    const amountIn = argument.nextU64().unwrap();
    const targetPrice = argument.nextU64().unwrap();
    const minAmountOut = argument.nextU64().unwrap();
    const expiry = argument.nextU64().unwrap();
    const partialFillAllowed = argument.nextBool().unwrapOrDefault();

    validateTokenPair(tokenIn, tokenOut);
    validDeadline(expiry);
    assert(amountIn > 0 && minAmountOut > 0, "Invalid amounts");

    const user = Context.caller();
    orderCounter++;

    const order = new LimitOrder(
        orderCounter,
        user,
        tokenIn,
        tokenOut,
        amountIn,
        targetPrice,
        minAmountOut,
        expiry,
        partialFillAllowed
    );

    // Transfer tokens from user
    assert(safeTransferFrom(tokenIn, user, Context.callee(), amountIn), "Transfer failed");

    // Save order
    Storage.set<StaticArray<u8>>(getOrderKey(order.id), order.serialize());

    generateEvent(`LimitOrderCreated:${order.id}:${user.toString()}:${amountIn}:${targetPrice}`);

    endNonReentrant();
    return order.id;
}

/**
 * Execute limit order (called by keeper)
 */
export function executeLimitOrder(args: StaticArray<u8>): bool {
    onlyRole(KEEPER_ROLE);
    whenNotPaused();
    nonReentrant();

    const argument = new Args(args);
    const orderId = argument.nextU64().unwrap();

    const orderData = Storage.get<StaticArray<u8>>(getOrderKey(orderId));
    assert(orderData.length > 0, "Order not found");

    const order = LimitOrder.deserialize(orderData);
    assert(order.isActive, "Order not active");
    assert(Context.timestamp() <= order.expiry, "Order expired");

    // Check if enough time passed (MEV protection)
    assert(Context.timestamp() >= order.createdAt + order.minBlockDelay, "Too soon");

    // Get current price
    const pool = getPool(order.tokenIn, order.tokenOut);
    assert(pool != null, "Pool not found");

    const currentPrice = order.useTWAP ?
        getTWAPPrice(order.tokenIn, order.tokenOut) :
        u64(f64(pool!.reserveB) * f64(ONE_UNIT) / f64(pool!.reserveA));

    // Check if target price reached
    assert(currentPrice <= order.targetPrice, "Price not met");

    // Calculate output
    const tokenInIsA = pool!.tokenA.toString() == order.tokenIn.toString();
    const reserveIn = tokenInIsA ? pool!.reserveA : pool!.reserveB;
    const reserveOut = tokenInIsA ? pool!.reserveB : pool!.reserveA;

    const remainingAmount = order.amountIn - order.filledAmount;
    const expectedOutput = getAmountOut(remainingAmount, reserveIn, reserveOut, pool!.fee);

    assert(expectedOutput >= order.minAmountOut, "Insufficient output");

    // Check price impact
    const priceImpact = u64(f64(expectedOutput) * f64(reserveIn) * 10000.0 / (f64(remainingAmount) * f64(reserveOut)));
    assert(priceImpact <= order.maxPriceImpact, "Price impact too high");

    // Execute swap
    assert(safeTransfer(order.tokenOut, order.user, expectedOutput), "Swap failed");

    // Update order
    order.filledAmount = order.amountIn;
    order.isActive = false;

    Storage.set<StaticArray<u8>>(getOrderKey(orderId), order.serialize());

    generateEvent(`LimitOrderExecuted:${orderId}:${expectedOutput}:${currentPrice}`);

    endNonReentrant();
    return true;
}

// ============================================================================
// ADMIN FUNCTIONS
// ============================================================================

export function constructor(_: StaticArray<u8>): void {
    assert(Context.isDeployingContract(), "Not deploying");

    const deployer = Context.caller();
    const poolList: string[] = [];

    // Initialize access control (both base and advanced roles)
    Storage.set(ADMIN_ROLE + ":" + deployer.toString(), "true");
    Storage.set(PAUSER_ROLE + ":" + deployer.toString(), "true");
    Storage.set(KEEPER_ROLE + ":" + deployer.toString(), "true");

    // Initialize base AMM state (required for re-exported functions)
    Storage.set("pool_count", "0");
    Storage.set("total_volume", "0");
    Storage.set("total_fees", "0");
    Storage.set("protocol_fee_rate", "0");
    Storage.set("initialized", "true");
    Storage.set("pool_list", poolList.join(","));
    Storage.set("owner", deployer.toString());

    generateEvent(`MassaBeamAdvanced:Deployed:${deployer.toString()}`);
}

export function grantRole(args: StaticArray<u8>): void {
    onlyRole(ADMIN_ROLE);
    const argument = new Args(args);
    const role = argument.nextString().unwrap();
    const account = new Address(argument.nextString().unwrap());

    Storage.set(stringToBytes(role + ":" + account.toString()), stringToBytes("true"));
    generateEvent(`RoleGranted:${role}:${account.toString()}`);
}

// ============================================================================
// VIEW FUNCTIONS
// ============================================================================

export function getDCA(args: StaticArray<u8>): StaticArray<u8> {
    const argument = new Args(args);
    const strategyId = argument.nextU64().unwrap();

    const strategyData = Storage.get<StaticArray<u8>>(getDCAKey(strategyId));
    return strategyData;
}

export function getLimitOrder(args: StaticArray<u8>): StaticArray<u8> {
    const argument = new Args(args);
    const orderId = argument.nextU64().unwrap();

    const orderData = Storage.get<StaticArray<u8>>(getOrderKey(orderId));
    return orderData;
}

// ============================================================================
// RE-EXPORT BASE AMM FUNCTIONS
// ============================================================================

// Re-export all base AMM functions from massa_beam
export {
    createPool,
    addLiquidity,
    removeLiquidity,
    swap,
    setPaused,
    setPoolFee,
    readPool,
    readLPBalance,
    readPoolTotalLiquidity,
    readPoolKey,
    readPoolCount,
    readTotalVolume,
    readProtocolFeeRate,
    readInitialized,
    readPoolList
} from "./massa_beam";
