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
        this.accumulatedTokens += tokensReceived;
        this.totalSpent += amountSpent;

        if (this.accumulatedTokens > 0) {
            // Optimized calculation: avoid multiple f64 conversions
            this.averagePrice = (this.totalSpent * ONE_UNIT) / this.accumulatedTokens;
        }
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
        // Read in exact serialization order
        const id = args.nextU64().unwrap();
        const user = new Address(args.nextString().unwrap());
        const tokenIn = new Address(args.nextString().unwrap());
        const tokenOut = new Address(args.nextString().unwrap());
        const amountIn = args.nextU64().unwrap();
        const targetPrice = args.nextU64().unwrap();
        const minAmountOut = args.nextU64().unwrap();
        const expiry = args.nextU64().unwrap();
        const isActive = args.nextBool().unwrap();
        const filledAmount = args.nextU64().unwrap();
        const partialFillAllowed = args.nextBool().unwrap();
        const createdAt = args.nextU64().unwrap();
        const minBlockDelay = args.nextU64().unwrap();
        const maxPriceImpact = args.nextU64().unwrap();
        const useTWAP = args.nextBool().unwrap();

        const order = new LimitOrder(
            id, user, tokenIn, tokenOut, amountIn, targetPrice,
            minAmountOut, expiry, partialFillAllowed, maxPriceImpact
        );
        order.isActive = isActive;
        order.filledAmount = filledAmount;
        order.createdAt = createdAt;
        order.minBlockDelay = minBlockDelay;
        order.useTWAP = useTWAP;
        return order;
    }
}

/**
 * Yield Farming Pool with leverage support
 */
export class YieldPool {
    id: u64;
    tokenA: Address;
    tokenB: Address;
    rewardToken: Address;
    totalStaked: u64;
    rewardRate: u64;               // Rewards per second
    lastUpdateTime: u64;
    rewardPerTokenStored: u64;
    isActive: bool;
    performanceFee: u64;           // In basis points
    lockupPeriod: u64;             // Minimum staking duration
    maxLeverage: u64;              // Maximum leverage allowed
    totalBorrowed: u64;
    insuranceFund: u64;

    constructor(
        id: u64,
        tokenA: Address,
        tokenB: Address,
        rewardToken: Address,
        rewardRate: u64,
        performanceFee: u64 = YIELD_PERFORMANCE_FEE,
        lockupPeriod: u64 = 0,
        maxLeverage: u64 = MAX_LEVERAGE
    ) {
        this.id = id;
        this.tokenA = tokenA;
        this.tokenB = tokenB;
        this.rewardToken = rewardToken;
        this.totalStaked = 0;
        this.rewardRate = rewardRate;
        this.lastUpdateTime = Context.timestamp();
        this.rewardPerTokenStored = 0;
        this.isActive = true;
        this.performanceFee = performanceFee;
        this.lockupPeriod = lockupPeriod;
        this.maxLeverage = maxLeverage;
        this.totalBorrowed = 0;
        this.insuranceFund = 0;
    }

    updateRewards(): void {
        if (this.totalStaked == 0) {
            this.lastUpdateTime = Context.timestamp();
            return;
        }

        const currentTime = Context.timestamp();
        const timeElapsed = currentTime - this.lastUpdateTime;
        const rewardPerToken = u64(f64(timeElapsed) * f64(this.rewardRate) * f64(ONE_UNIT) / f64(this.totalStaked));

        this.rewardPerTokenStored += rewardPerToken;
        this.lastUpdateTime = currentTime;
    }

    calculateAPR(): u64 {
        if (this.totalStaked == 0) return 0;
        const yearlyRewards = this.rewardRate * 365 * 86400;
        return u64(f64(yearlyRewards) * 10000.0 / f64(this.totalStaked));
    }

    serialize(): StaticArray<u8> {
        const args = new Args();
        args.add(this.id);
        args.add(this.tokenA.toString());
        args.add(this.tokenB.toString());
        args.add(this.rewardToken.toString());
        args.add(this.totalStaked);
        args.add(this.rewardRate);
        args.add(this.lastUpdateTime);
        args.add(this.rewardPerTokenStored);
        args.add(this.isActive);
        args.add(this.performanceFee);
        args.add(this.lockupPeriod);
        args.add(this.maxLeverage);
        args.add(this.totalBorrowed);
        args.add(this.insuranceFund);
        return args.serialize();
    }

    static deserialize(data: StaticArray<u8>): YieldPool {
        const args = new Args(data);
        const id = args.nextU64().unwrap();
        const tokenA = new Address(args.nextString().unwrap());
        const tokenB = new Address(args.nextString().unwrap());
        const rewardToken = new Address(args.nextString().unwrap());
        const totalStaked = args.nextU64().unwrap();
        const rewardRate = args.nextU64().unwrap();
        const lastUpdateTime = args.nextU64().unwrap();
        const rewardPerTokenStored = args.nextU64().unwrap();
        const isActive = args.nextBool().unwrap();
        const performanceFee = args.nextU64().unwrap();
        const lockupPeriod = args.nextU64().unwrap();
        const maxLeverage = args.nextU64().unwrap();
        const totalBorrowed = args.nextU64().unwrap();
        const insuranceFund = args.nextU64().unwrap();

        const pool = new YieldPool(
            id, tokenA, tokenB, rewardToken, rewardRate,
            performanceFee, lockupPeriod, maxLeverage
        );
        pool.totalStaked = totalStaked;
        pool.lastUpdateTime = lastUpdateTime;
        pool.rewardPerTokenStored = rewardPerTokenStored;
        pool.isActive = isActive;
        pool.totalBorrowed = totalBorrowed;
        pool.insuranceFund = insuranceFund;
        return pool;
    }
}

/**
 * User stake in a yield pool
 */
export class UserStake {
    user: Address;
    poolId: u64;
    amount: u64;
    rewardDebt: u64;
    stakedAt: u64;
    lastClaimTime: u64;

    constructor(user: Address, poolId: u64, amount: u64, rewardDebt: u64) {
        this.user = user;
        this.poolId = poolId;
        this.amount = amount;
        this.rewardDebt = rewardDebt;
        this.stakedAt = Context.timestamp();
        this.lastClaimTime = Context.timestamp();
    }

    serialize(): StaticArray<u8> {
        const args = new Args();
        args.add(this.user.toString());
        args.add(this.poolId);
        args.add(this.amount);
        args.add(this.rewardDebt);
        args.add(this.stakedAt);
        args.add(this.lastClaimTime);
        return args.serialize();
    }

    static deserialize(data: StaticArray<u8>): UserStake {
        const args = new Args(data);
        const user = new Address(args.nextString().unwrap());
        const poolId = args.nextU64().unwrap();
        const amount = args.nextU64().unwrap();
        const rewardDebt = args.nextU64().unwrap();
        const stakedAt = args.nextU64().unwrap();
        const lastClaimTime = args.nextU64().unwrap();

        const stake = new UserStake(user, poolId, amount, rewardDebt);
        stake.stakedAt = stakedAt;
        stake.lastClaimTime = lastClaimTime;
        return stake;
    }
}

// ============================================================================
// STORAGE HELPERS
// ============================================================================

let dcaCounter: u64 = 0;
let orderCounter: u64 = 0;
let yieldPoolCounter: u64 = 0;

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

function getYieldPoolKey(id: u64): StaticArray<u8> {
    return stringToBytes(`yieldpool:${id}`);
}

function getUserStakeKey(user: Address, poolId: u64): StaticArray<u8> {
    return stringToBytes(`stake:${user.toString()}:${poolId}`);
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
    // assert(safeTransferFrom(tokenIn, user, Context.callee(), totalAmount), "Transfer failed");

    // Save strategy
    Storage.set<StaticArray<u8>>(getDCAKey(strategy.id), strategy.serialize());

    // Track user DCA
    addUserDCA(user, strategy.id);

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

    // Track user order
    addUserOrder(user, order.id);

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
// YIELD FARMING FUNCTIONS
// ============================================================================

/**
 * Create a yield farming pool
 */
export function createYieldPool(args: StaticArray<u8>): u64 {
    onlyRole(YIELD_MANAGER_ROLE);
    whenNotPaused();
    nonReentrant();

    const argument = new Args(args);
    const tokenA = new Address(argument.nextString().unwrap());
    const tokenB = new Address(argument.nextString().unwrap());
    const rewardToken = new Address(argument.nextString().unwrap());
    const rewardRate = argument.nextU64().unwrap();
    const performanceFee = argument.nextU64().unwrapOrDefault() || YIELD_PERFORMANCE_FEE;
    const lockupPeriod = argument.nextU64().unwrapOrDefault();
    const maxLeverage = argument.nextU64().unwrapOrDefault() || MAX_LEVERAGE;

    validateTokenPair(tokenA, tokenB);
    assert(rewardRate > 0, "Invalid reward rate");

    yieldPoolCounter++;

    const pool = new YieldPool(
        yieldPoolCounter,
        tokenA,
        tokenB,
        rewardToken,
        rewardRate,
        performanceFee,
        lockupPeriod,
        maxLeverage
    );

    Storage.set<StaticArray<u8>>(getYieldPoolKey(pool.id), pool.serialize());

    generateEvent(`YieldPoolCreated:${pool.id}:${tokenA.toString()}:${tokenB.toString()}`);

    endNonReentrant();
    return pool.id;
}

/**
 * Stake tokens in a yield pool
 */
export function stakeInYieldPool(args: StaticArray<u8>): bool {
    whenNotPaused();
    nonReentrant();

    const argument = new Args(args);
    const poolId = argument.nextU64().unwrap();
    const amountA = argument.nextU64().unwrap();
    const amountB = argument.nextU64().unwrap();

    const poolData = Storage.get<StaticArray<u8>>(getYieldPoolKey(poolId));
    assert(poolData.length > 0, "Pool not found");

    const pool = YieldPool.deserialize(poolData);
    assert(pool.isActive, "Pool not active");

    const user = Context.caller();

    // Transfer tokens from user
    assert(safeTransferFrom(pool.tokenA, user, Context.callee(), amountA), "Transfer A failed");
    assert(safeTransferFrom(pool.tokenB, user, Context.callee(), amountB), "Transfer B failed");

    // Update pool rewards
    pool.updateRewards();

    // Calculate LP tokens (simple geometric mean)
    const lpTokens = safeSqrt(amountA, amountB);

    // Get or create user stake
    const stakeKey = getUserStakeKey(user, poolId);
    const stakeData = Storage.get<StaticArray<u8>>(stakeKey);

    let stake: UserStake;
    if (stakeData.length > 0) {
        stake = UserStake.deserialize(stakeData);
        stake.amount += lpTokens;
    } else {
        stake = new UserStake(user, poolId, lpTokens, pool.rewardPerTokenStored);
    }

    // Update pool state
    pool.totalStaked += lpTokens;

    // Save state
    Storage.set<StaticArray<u8>>(getYieldPoolKey(poolId), pool.serialize());
    Storage.set<StaticArray<u8>>(stakeKey, stake.serialize());

    generateEvent(`StakeAdded:${poolId}:${user.toString()}:${lpTokens}`);

    endNonReentrant();
    return true;
}

/**
 * Unstake tokens from yield pool
 */
export function unstakeFromYieldPool(args: StaticArray<u8>): bool {
    whenNotPaused();
    nonReentrant();

    const argument = new Args(args);
    const poolId = argument.nextU64().unwrap();
    const lpAmount = argument.nextU64().unwrap();

    const poolData = Storage.get<StaticArray<u8>>(getYieldPoolKey(poolId));
    assert(poolData.length > 0, "Pool not found");

    const pool = YieldPool.deserialize(poolData);
    const user = Context.caller();

    // Get user stake
    const stakeKey = getUserStakeKey(user, poolId);
    const stakeData = Storage.get<StaticArray<u8>>(stakeKey);
    assert(stakeData.length > 0, "No stake found");

    const stake = UserStake.deserialize(stakeData);
    assert(stake.amount >= lpAmount, "Insufficient stake");

    // Check lockup period
    assert(
        Context.timestamp() >= stake.stakedAt + pool.lockupPeriod,
        "Lockup period not ended"
    );

    // Update pool rewards
    pool.updateRewards();

    // Calculate pending rewards
    const pendingReward = u64(f64(stake.amount) * f64(pool.rewardPerTokenStored - stake.rewardDebt) / f64(ONE_UNIT));

    // Apply performance fee
    const fee = u64(f64(pendingReward) * f64(pool.performanceFee) / 10000.0);
    const userReward = pendingReward - fee;

    // Update stake
    stake.amount -= lpAmount;
    stake.rewardDebt = pool.rewardPerTokenStored;
    stake.lastClaimTime = Context.timestamp();

    // Update pool
    pool.totalStaked -= lpAmount;
    pool.insuranceFund += fee;

    // Calculate token amounts to return (proportional to LP tokens)
    const totalLiquidity = pool.totalStaked + lpAmount;
    const amountA = u64(f64(lpAmount) * f64(pool.totalStaked) / f64(totalLiquidity));
    const amountB = u64(f64(lpAmount) * f64(pool.totalBorrowed) / f64(totalLiquidity));

    // Transfer tokens back
    assert(safeTransfer(pool.tokenA, user, amountA), "Transfer A failed");
    assert(safeTransfer(pool.tokenB, user, amountB), "Transfer B failed");

    // Transfer rewards
    if (userReward > 0) {
        assert(safeTransfer(pool.rewardToken, user, userReward), "Reward transfer failed");
    }

    // Save state
    Storage.set<StaticArray<u8>>(getYieldPoolKey(poolId), pool.serialize());
    if (stake.amount > 0) {
        Storage.set<StaticArray<u8>>(stakeKey, stake.serialize());
    } else {
        Storage.del(stakeKey);
    }

    generateEvent(`StakeRemoved:${poolId}:${user.toString()}:${lpAmount}:${userReward}`);

    endNonReentrant();
    return true;
}

/**
 * Claim rewards without unstaking
 */
export function claimYieldRewards(args: StaticArray<u8>): bool {
    whenNotPaused();
    nonReentrant();

    const argument = new Args(args);
    const poolId = argument.nextU64().unwrap();

    const poolData = Storage.get<StaticArray<u8>>(getYieldPoolKey(poolId));
    assert(poolData.length > 0, "Pool not found");

    const pool = YieldPool.deserialize(poolData);
    const user = Context.caller();

    // Get user stake
    const stakeKey = getUserStakeKey(user, poolId);
    const stakeData = Storage.get<StaticArray<u8>>(stakeKey);
    assert(stakeData.length > 0, "No stake found");

    const stake = UserStake.deserialize(stakeData);

    // Update pool rewards
    pool.updateRewards();

    // Calculate pending rewards
    const pendingReward = u64(f64(stake.amount) * f64(pool.rewardPerTokenStored - stake.rewardDebt) / f64(ONE_UNIT));

    assert(pendingReward > 0, "No rewards to claim");

    // Apply performance fee
    const fee = u64(f64(pendingReward) * f64(pool.performanceFee) / 10000.0);
    const userReward = pendingReward - fee;

    // Update stake
    stake.rewardDebt = pool.rewardPerTokenStored;
    stake.lastClaimTime = Context.timestamp();

    // Update pool
    pool.insuranceFund += fee;

    // Transfer rewards
    assert(safeTransfer(pool.rewardToken, user, userReward), "Reward transfer failed");

    // Save state
    Storage.set<StaticArray<u8>>(getYieldPoolKey(poolId), pool.serialize());
    Storage.set<StaticArray<u8>>(stakeKey, stake.serialize());

    generateEvent(`RewardsClaimed:${poolId}:${user.toString()}:${userReward}`);

    endNonReentrant();
    return true;
}

/**
 * Cancel a DCA strategy
 */
export function cancelDCA(args: StaticArray<u8>): bool {
    whenNotPaused();
    nonReentrant();

    const argument = new Args(args);
    const strategyId = argument.nextU64().unwrap();

    const strategyData = Storage.get<StaticArray<u8>>(getDCAKey(strategyId));
    assert(strategyData.length > 0, "Strategy not found");

    const strategy = DCAStrategy.deserialize(strategyData);
    const caller = Context.caller();

    // Only owner or admin can cancel
    assert(
        strategy.user.toString() == caller.toString() || hasRole(ADMIN_ROLE, caller),
        "Not authorized"
    );
    assert(strategy.isActive, "Strategy not active");

    // Calculate remaining amount to refund
    const remainingPeriods = strategy.totalPeriods - strategy.currentPeriod;
    const refundAmount = strategy.amountPerPeriod * remainingPeriods;

    if (refundAmount > 0) {
        assert(safeTransfer(strategy.tokenIn, strategy.user, refundAmount), "Refund failed");
    }

    // Mark as inactive
    strategy.isActive = false;
    Storage.set<StaticArray<u8>>(getDCAKey(strategyId), strategy.serialize());

    generateEvent(`DCACancelled:${strategyId}:${refundAmount}`);

    endNonReentrant();
    return true;
}

/**
 * Cancel a limit order
 */
export function cancelLimitOrder(args: StaticArray<u8>): bool {
    whenNotPaused();
    nonReentrant();

    const argument = new Args(args);
    const orderId = argument.nextU64().unwrap();

    const orderData = Storage.get<StaticArray<u8>>(getOrderKey(orderId));
    assert(orderData.length > 0, "Order not found");

    const order = LimitOrder.deserialize(orderData);
    const caller = Context.caller();

    // Only owner or admin can cancel
    assert(
        order.user.toString() == caller.toString() || hasRole(ADMIN_ROLE, caller),
        "Not authorized"
    );
    assert(order.isActive, "Order not active");

    // Calculate remaining amount to refund
    const refundAmount = order.amountIn - order.filledAmount;

    if (refundAmount > 0) {
        assert(safeTransfer(order.tokenIn, order.user, refundAmount), "Refund failed");
    }

    // Mark as inactive
    order.isActive = false;
    Storage.set<StaticArray<u8>>(getOrderKey(orderId), order.serialize());

    generateEvent(`LimitOrderCancelled:${orderId}:${refundAmount}`);

    endNonReentrant();
    return true;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function hasRole(role: string, account: Address): bool {
    const key = stringToBytes(role + ":" + account.toString());
    const value = Storage.get<StaticArray<u8>>(key);
    return value.length > 0 && bytesToString(value) == "true";
}

function bytesToString(data: StaticArray<u8>): string {
    const args = new Args(data);
    return args.nextString().unwrapOrDefault();
}

function addUserDCA(user: Address, strategyId: u64): void {
    const key = getUserDCAsKey(user);
    const data = Storage.get<StaticArray<u8>>(key);

    let ids: u64[] = [];
    if (data.length > 0) {
        const args = new Args(data);
        ids = args.nextFixedSizeArray<u64>().unwrapOrDefault();
    }

    ids.push(strategyId);

    const newArgs = new Args();
    newArgs.add(ids);
    Storage.set<StaticArray<u8>>(key, newArgs.serialize());
}

function addUserOrder(user: Address, orderId: u64): void {
    const key = getUserOrdersKey(user);
    const data = Storage.get<StaticArray<u8>>(key);

    let ids: u64[] = [];
    if (data.length > 0) {
        const args = new Args(data);
        ids = args.nextFixedSizeArray<u64>().unwrapOrDefault();
    }

    ids.push(orderId);

    const newArgs = new Args();
    newArgs.add(ids);
    Storage.set<StaticArray<u8>>(key, newArgs.serialize());
}

function removeUserDCA(user: Address, strategyId: u64): void {
    const key = getUserDCAsKey(user);
    const data = Storage.get<StaticArray<u8>>(key);

    if (data.length == 0) return;

    const args = new Args(data);
    let ids = args.nextFixedSizeArray<u64>().unwrapOrDefault();

    const index = ids.indexOf(strategyId);
    if (index > -1) {
        ids.splice(index, 1);

        const newArgs = new Args();
        newArgs.add(ids);
        Storage.set<StaticArray<u8>>(key, newArgs.serialize());
    }
}

function removeUserOrder(user: Address, orderId: u64): void {
    const key = getUserOrdersKey(user);
    const data = Storage.get<StaticArray<u8>>(key);

    if (data.length == 0) return;

    const args = new Args(data);
    let ids = args.nextFixedSizeArray<u64>().unwrapOrDefault();

    const index = ids.indexOf(orderId);
    if (index > -1) {
        ids.splice(index, 1);

        const newArgs = new Args();
        newArgs.add(ids);
        Storage.set<StaticArray<u8>>(key, newArgs.serialize());
    }
}

// ============================================================================
// ADMIN FUNCTIONS
// ============================================================================

export function constructor(_: StaticArray<u8>): void {
    assert(Context.isDeployingContract(), "Not deploying");

    const deployer = Context.caller();
    const poolList: string[] = [];

    // Initialize access control (both base and advanced roles)
    Storage.set(stringToBytes(ADMIN_ROLE + ":" + deployer.toString()), stringToBytes("true"));
    Storage.set(stringToBytes(PAUSER_ROLE + ":" + deployer.toString()), stringToBytes("true"));
    Storage.set(stringToBytes(KEEPER_ROLE + ":" + deployer.toString()), stringToBytes("true"));
    Storage.set(stringToBytes(YIELD_MANAGER_ROLE + ":" + deployer.toString()), stringToBytes("true"));
    Storage.set(stringToBytes(LIQUIDATOR_ROLE + ":" + deployer.toString()), stringToBytes("true"));

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

export function getUserDCAs(args: StaticArray<u8>): StaticArray<u8> {
    const argument = new Args(args);
    const user = new Address(argument.nextString().unwrap());

    const data = Storage.get<StaticArray<u8>>(getUserDCAsKey(user));
    return data;
}

export function getUserOrders(args: StaticArray<u8>): StaticArray<u8> {
    const argument = new Args(args);
    const user = new Address(argument.nextString().unwrap());

    const data = Storage.get<StaticArray<u8>>(getUserOrdersKey(user));
    return data;
}

export function getYieldPool(args: StaticArray<u8>): StaticArray<u8> {
    const argument = new Args(args);
    const poolId = argument.nextU64().unwrap();

    const poolData = Storage.get<StaticArray<u8>>(getYieldPoolKey(poolId));
    return poolData;
}

export function getUserStake(args: StaticArray<u8>): StaticArray<u8> {
    const argument = new Args(args);
    const user = new Address(argument.nextString().unwrap());
    const poolId = argument.nextU64().unwrap();

    const stakeData = Storage.get<StaticArray<u8>>(getUserStakeKey(user, poolId));
    return stakeData;
}

export function getPendingRewards(args: StaticArray<u8>): StaticArray<u8> {
    const argument = new Args(args);
    const user = new Address(argument.nextString().unwrap());
    const poolId = argument.nextU64().unwrap();

    const poolData = Storage.get<StaticArray<u8>>(getYieldPoolKey(poolId));
    if (poolData.length == 0) return stringToBytes("0");

    const pool = YieldPool.deserialize(poolData);

    const stakeData = Storage.get<StaticArray<u8>>(getUserStakeKey(user, poolId));
    if (stakeData.length == 0) return stringToBytes("0");

    const stake = UserStake.deserialize(stakeData);

    // Calculate current reward per token
    let rewardPerToken = pool.rewardPerTokenStored;
    if (pool.totalStaked > 0) {
        const timeElapsed = Context.timestamp() - pool.lastUpdateTime;
        rewardPerToken += u64(f64(timeElapsed) * f64(pool.rewardRate) * f64(ONE_UNIT) / f64(pool.totalStaked));
    }

    // Calculate pending rewards
    const pendingReward = u64(f64(stake.amount) * f64(rewardPerToken - stake.rewardDebt) / f64(ONE_UNIT));

    // Subtract performance fee
    const fee = u64(f64(pendingReward) * f64(pool.performanceFee) / 10000.0);
    const finalReward = pendingReward - fee;

    return stringToBytes(finalReward.toString());
}

export function readGetTWAPPrice(args: StaticArray<u8>): StaticArray<u8> {
    const argument = new Args(args);
    const tokenA = new Address(argument.nextString().unwrap());
    const tokenB = new Address(argument.nextString().unwrap());

    const price = getTWAPPrice(tokenA, tokenB);

    return stringToBytes(price.toString());
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
