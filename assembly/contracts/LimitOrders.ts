/**
 * MassaBeam Limit Orders Module
 * Smart limit orders with partial fills and MEV protection
 */

import {
    Address,
    Context,
    generateEvent,
    Storage,
    sendMessage,
    asyncCall,
    Slot,
    findCheapestSlot
} from "@massalabs/massa-as-sdk";
import { Args, stringToBytes } from "@massalabs/as-types";
import { IERC20 } from "./interfaces/IERC20";
import {
    ONE_UNIT,
    getPool,
    getAmountOut,
    whenNotPaused,
    nonReentrant,
    endNonReentrant,
    validDeadline,
    ADMIN_ROLE,
} from "./massa_beam";
import { u256, u128 } from 'as-bignum/assembly';
// Constants
export const MAX_ORDER_EXPIRY: u64 = 30 * 86400; // 30 days max
export const MEV_PROTECTION_DELAY: u64 = 10; // 10ms delay
export const MAX_PRICE_IMPACT: u64 = 500; // 5% max price impact
export const KEEPER_ROLE = "KEEPER";
export const MAX_EXECUTION_CYCLES: u64 = 1000; // Max cycles before restart
export const MAX_GAS_PER_EXECUTION: u64 = 800_000_000; // Max gas per execution cycle

let orderCounter: u64 = 0;



export function callNextSlot(at: Address, function_name: string, gas: u64): void {
    // emit wakeup message
    const cur_period = Context.currentPeriod();
    const cur_thread = Context.currentThread();
    let next_thread = cur_thread + 1;
    let next_period = cur_period;
    if (next_thread >= 32) {
        ++next_period;
        next_thread = 0;
    }
    asyncCall(at, function_name, findCheapestSlot(cur_period, next_period, MAX_GAS_PER_EXECUTION), findCheapestSlot(cur_period + 1, next_period + 1, MAX_GAS_PER_EXECUTION), next_period + 5, next_thread);
}

export class LimitOrder {
    id: u64;
    user: Address;
    tokenIn: Address;
    tokenOut: Address;
    amountIn: u64;
    targetPrice: u64;
    minAmountOut: u64;
    expiry: u64;
    isActive: bool;
    filledAmount: u64;
    partialFillAllowed: bool;
    createdAt: u64;
    maxPriceImpact: u64;

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
        this.maxPriceImpact = maxPriceImpact;
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
        args.add(this.maxPriceImpact);
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
        return order;
    }
}

function getOrderKey(id: u64): StaticArray<u8> {
    return stringToBytes(`order:${id}`);
}

function getUserOrdersKey(user: Address): StaticArray<u8> {
    return stringToBytes(`user_orders:${user.toString()}`);
}

function hasRole(role: string, account: Address): bool {
    const key = stringToBytes(role + ":" + account.toString());
    return Storage.has(key);
}

function safeTransferFrom(token: Address, from: Address, to: Address, amount: u64): bool {
    const tokenContract = new IERC20(token);
     tokenContract.transferFrom(from, to, u256.fromU64(amount));
     return true
}

function safeTransfer(token: Address, to: Address, amount: u64): bool {
    const tokenContract = new IERC20(token);
     tokenContract.transfer(to, u256.fromU64(amount));
     return true
}

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

    assert(tokenIn.toString() != tokenOut.toString(), "Identical tokens");
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
    assert(hasRole(KEEPER_ROLE, Context.caller()), "Keeper only");
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
    assert(Context.timestamp() >= order.createdAt + MEV_PROTECTION_DELAY, "Too soon");

    // Get current price
    const pool = getPool(order.tokenIn, order.tokenOut);
    assert(pool != null, "Pool not found");

    const tokenInIsA = pool!.tokenA.toString() == order.tokenIn.toString();
    const reserveIn = tokenInIsA ? pool!.reserveA : pool!.reserveB;
    const reserveOut = tokenInIsA ? pool!.reserveB : pool!.reserveA;

    const currentPrice = u64(f64(reserveOut) * f64(ONE_UNIT) / f64(reserveIn));

    // Check if target price reached
    assert(currentPrice <= order.targetPrice, "Price not met");

    // Calculate output
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

/**
 * Get order details
 */
export function getOrder(args: StaticArray<u8>): StaticArray<u8> {
    const argument = new Args(args);
    const orderId = argument.nextU64().unwrap();

    const orderData = Storage.get<StaticArray<u8>>(getOrderKey(orderId));
    assert(orderData.length > 0, "Order not found");

    return orderData;
}

/**
 * Get user orders
 */
export function getUserOrders(args: StaticArray<u8>): StaticArray<u8> {
    const argument = new Args(args);
    const user = new Address(argument.nextString().unwrap());

    const key = getUserOrdersKey(user);
    const data = Storage.get<StaticArray<u8>>(key);

    if (data.length == 0) {
        const emptyArgs = new Args();
        emptyArgs.add<u64[]>([]);
        return emptyArgs.serialize();
    }

    return data;
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

/**
 * Start the continuous order execution loop
 */
export function startExecution(_: StaticArray<u8>): void {
    assert(hasRole(ADMIN_ROLE, Context.caller()), "Admin only");
    Storage.set("execution_counter", "0");
    Storage.set("execution_active", "true");
    generateEvent("LimitOrders: Execution loop started");
    executeOrders(new Args().serialize());
}

/**
 * Stop the continuous execution loop
 */
export function stopExecution(_: StaticArray<u8>): void {
    assert(hasRole(ADMIN_ROLE, Context.caller()), "Admin only");
    Storage.set("execution_counter", MAX_EXECUTION_CYCLES.toString());
    Storage.set("execution_active", "false");
    generateEvent("LimitOrders: Execution loop stopped");
}

/**
 * Continuous order execution loop
 */
export function executeOrders(_: StaticArray<u8>): void {
    let counter: u64 = u64(parseInt(Storage.has("execution_counter") ? Storage.get("execution_counter") : "0"));
    const isActive = Storage.has("execution_active") ? Storage.get("execution_active").toString() == "true" : false;
    
    if (counter >= MAX_EXECUTION_CYCLES || !isActive) {
        generateEvent("LimitOrders: Execution loop ended");
        return;
    }

    // Get total orders to check
    const totalOrders = u64(parseInt(Storage.has("order_counter") ? Storage.get("order_counter") : "0"));
    let executedCount: u64 = 0;
    
    // Check and execute orders
    for (let i: u64 = 1; i <= totalOrders && i <= 10; i++) { // Limit to 10 orders per cycle
        const orderData = Storage.get<StaticArray<u8>>(getOrderKey(i));
        if (orderData.length == 0) continue;
        
        const order = LimitOrder.deserialize(orderData);
        if (!order.isActive || Context.timestamp() > order.expiry) {
            if (order.isActive) {
                // Auto-expire order
                order.isActive = false;
                Storage.set<StaticArray<u8>>(getOrderKey(i), order.serialize());
                generateEvent(`LimitOrder:${i}:Expired`);
            }
            continue;
        }
        
        // Check if order can be executed
        if (canExecuteOrder(order)) {
            if (executeOrderInternal(order)) {
                executedCount++;
                generateEvent(`LimitOrder:${i}:AutoExecuted`);
            }
        }
    }
    
    generateEvent(`LimitOrders: Cycle ${counter}, Executed: ${executedCount}`);
    
    counter += 1;
    Storage.set("execution_counter", counter.toString());
    
    // Schedule next execution cycle
    callNextSlot(Context.callee(), "executeOrders", 800_000_000);
}

/**
 * Check if an order can be executed
 */
function canExecuteOrder(order: LimitOrder): bool {
    // MEV protection check
    if (Context.timestamp() < order.createdAt + MEV_PROTECTION_DELAY) {
        return false;
    }
    
    // Get current price
    const pool = getPool(order.tokenIn, order.tokenOut);
    if (pool == null) return false;
    
    const tokenInIsA = pool!.tokenA.toString() == order.tokenIn.toString();
    const reserveIn = tokenInIsA ? pool!.reserveA : pool!.reserveB;
    const reserveOut = tokenInIsA ? pool!.reserveB : pool!.reserveA;
    
    if (reserveIn == 0 || reserveOut == 0) return false;
    
    const currentPrice = u64(f64(reserveOut) * f64(ONE_UNIT) / f64(reserveIn));
    
    // Check if target price is met
    if (currentPrice > order.targetPrice) return false;
    
    // Check if we can get minimum output
    const remainingAmount = order.amountIn - order.filledAmount;
    const expectedOutput = getAmountOut(remainingAmount, reserveIn, reserveOut, pool!.fee);
    
    return expectedOutput >= order.minAmountOut;
}

/**
 * Internal order execution
 */
function executeOrderInternal(order: LimitOrder): bool {
    const pool = getPool(order.tokenIn, order.tokenOut);
    if (pool == null) return false;
    
    const tokenInIsA = pool!.tokenA.toString() == order.tokenIn.toString();
    const reserveIn = tokenInIsA ? pool!.reserveA : pool!.reserveB;
    const reserveOut = tokenInIsA ? pool!.reserveB : pool!.reserveA;
    
    const remainingAmount = order.amountIn - order.filledAmount;
    const expectedOutput = getAmountOut(remainingAmount, reserveIn, reserveOut, pool!.fee);
    
    // Check price impact
    const priceImpact = u64(f64(expectedOutput) * f64(reserveIn) * 10000.0 / (f64(remainingAmount) * f64(reserveOut)));
    if (priceImpact > order.maxPriceImpact) return false;
    
    // Execute the swap by transferring tokens
    if (!safeTransfer(order.tokenOut, order.user, expectedOutput)) {
        return false;
    }
    
    // Update order status
    order.filledAmount = order.amountIn;
    order.isActive = false;
    Storage.set<StaticArray<u8>>(getOrderKey(order.id), order.serialize());
    
    // Update pool reserves (simplified)
    if (tokenInIsA) {
        pool!.reserveA += remainingAmount;
        pool!.reserveB -= expectedOutput;
    } else {
        pool!.reserveB += remainingAmount;
        pool!.reserveA -= expectedOutput;
    }
    
    return true;
}

/**
 * Constructor
 */
export function constructor(_: StaticArray<u8>): void {
    assert(Context.isDeployingContract(), "Not deploying");

    const deployer = Context.caller();
    Storage.set(ADMIN_ROLE + ":" + deployer.toString(), "true");
    Storage.set(KEEPER_ROLE + ":" + deployer.toString(), "true");

    orderCounter = 0;
    Storage.set("order_counter", "0");
    Storage.set("execution_active", "false");

    generateEvent("LimitOrders contract deployed");
}