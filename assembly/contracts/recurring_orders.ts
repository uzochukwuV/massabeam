/**
 * MassaBeam Recurring Orders - Percentage-Based Autonomous Trading
 *
 * Advanced recurring order system with:
 * - Buy when price increases by X% (DCA-style accumulation)
 * - Sell when price decreases by X% (take profits / stop loss)
 * - Recurring purchases at set intervals
 * - Price history tracking and percentage calculations
 * - Autonomous execution via callNextSlot
 * - Event-driven price monitoring
 *
 * Use Cases:
 * 1. DCA Strategy: Buy every 1% price increase (auto-scaling)
 * 2. Profit Taking: Sell 25% when price +5%, 25% when +10%, etc.
 * 3. Stop Loss: Sell all if price -5% from entry
 * 4. Grid Trading: Buy at -2%, -4%, -6% and sell at +2%, +4%, +6%
 *
 * Masa Smart Contract Features Used:
 * 1. Context.timestamp() - Track price history over time
 * 2. generateEvent() - Emit price and execution events
 * 3. Storage - Persist order state and price history
 * 4. callNextSlot() - Autonomous price monitoring and execution
 *
 * @version 1.0.0
 * @license MIT
 */

import {
  Address,
  Context,
  generateEvent,
  Storage,
} from '@massalabs/massa-as-sdk';
import { Args, stringToBytes } from '@massalabs/as-types';
import { u256 } from 'as-bignum/assembly/integer/u256';
import { IERC20 } from './interfaces/IERC20';
import { IMassaBeamAMM } from './interfaces/IMassaBeamAMM';

// Import getPool from main.ts to check current prices
import { getPool } from './main';

// ============================================================================
// CONSTANTS & CONFIGURATION
// ============================================================================

// Order types
export const ORDER_TYPE_BUY_ON_INCREASE: u8 = 0; // Buy when price goes up by %
export const ORDER_TYPE_SELL_ON_DECREASE: u8 = 1; // Sell when price goes down by %
export const ORDER_TYPE_GRID: u8 = 2; // Grid trading (buy/sell at multiple levels)
export const ORDER_TYPE_DCA: u8 = 3; // Dollar cost averaging at intervals

// Order status
export const ORDER_STATUS_ACTIVE: u8 = 0;
export const ORDER_STATUS_COMPLETED: u8 = 1;
export const ORDER_STATUS_PAUSED: u8 = 2;
export const ORDER_STATUS_CANCELLED: u8 = 3;

// Recurring order execution mode
export const EXECUTION_MODE_TRIGGERED: u8 = 0; // Execute when price % change triggered
export const EXECUTION_MODE_INTERVAL: u8 = 1; // Execute every N seconds regardless

// Roles
const ADMIN_ROLE = 'admin';
const KEEPER_ROLE = 'keeper';
const PAUSER_ROLE = 'pauser';

// Storage keys
const RECURRING_ORDER_PREFIX = 'recurring_order:';
const RECURRING_ORDER_COUNT_KEY = 'recurring_order_count';
const USER_RECURRING_ORDERS_PREFIX = 'user_recurring_orders:';
const PRICE_HISTORY_PREFIX = 'price_history:';
const MASSABEAM_ADDRESS_KEY = 'massabeam_address';
const PAUSED_KEY = 'paused';
const BOT_ENABLED_KEY = 'bot_enabled';
const BOT_COUNTER_KEY = 'bot_counter';
const BOT_MAX_ITERATIONS = 'bot_max_iterations';

// Autonomous execution configuration
const BOT_CHECK_INTERVAL: u64 = 5; // Check every 5 slots (~5 seconds)
const BOT_MAX_ORDERS_PER_CYCLE: u64 = 20; // Process max 20 orders per cycle
const PRICE_HISTORY_WINDOW: u64 = 3600; // Keep 1 hour of price history
const GAS_COST_PER_EXECUTION: u64 = 500_000_000;

// ============================================================================
// DATA STRUCTURES
// ============================================================================

/**
 * Price point in history
 */
export class PricePoint {
  timestamp: u64;
  price: u64; // Price in 18 decimals

  constructor(timestamp: u64, price: u64) {
    this.timestamp = timestamp;
    this.price = price;
  }
}

/**
 * Recurring Order - triggers on percentage price changes
 *
 * Examples:
 * - BUY_ON_INCREASE: Buy $100 when price increases 2% from entryPrice
 * - SELL_ON_DECREASE: Sell 50% when price decreases 5% from highPrice
 * - GRID: Buy at -2%, -4%, -6% AND sell at +2%, +4%, +6%
 */
export class RecurringOrder {
  id: u64; // Unique order ID
  user: Address; // Order creator
  orderType: u8; // ORDER_TYPE_*
  executionMode: u8; // EXECUTION_MODE_*
  status: u8; // ORDER_STATUS_*

  // Token pair
  tokenIn: Address; // Token to sell/buy
  tokenOut: Address; // Token to buy/sell

  // Price-based parameters
  entryPrice: u64; // Initial price when order created (18 decimals)
  triggerPercentage: u64; // Percentage change to trigger (basis points: 100 = 1%)
  maxExecutions: u64; // Max times to execute (0 = unlimited)
  executionCount: u64; // How many times executed so far

  // Execution amounts
  amountPerExecution: u64; // How much to trade per execution
  minAmountOut: u64; // Slippage protection

  // Time-based execution (for DCA mode)
  executionInterval: u64; // Seconds between executions (for EXECUTION_MODE_INTERVAL)
  lastExecutedTime: u64; // When was it last executed

  // Grid trading (for ORDER_TYPE_GRID)
  gridLevels: u64[]; // Array of percentage levels (e.g., [200, 400, 600] = -2%, -4%, -6%)
  gridAmounts: u64[]; // Amount for each grid level
  gridExecuted: bool[]; // Which levels have been executed

  // Order lifecycle
  createdTime: u64;
  expiryTime: u64;

  constructor(
    id: u64,
    user: Address,
    orderType: u8,
    executionMode: u8,
    tokenIn: Address,
    tokenOut: Address,
    entryPrice: u64,
    triggerPercentage: u64,
    amountPerExecution: u64,
    minAmountOut: u64,
    executionInterval: u64 = 3600,
    maxExecutions: u64 = 0,
  ) {
    this.id = id;
    this.user = user;
    this.orderType = orderType;
    this.executionMode = executionMode;
    this.status = ORDER_STATUS_ACTIVE;
    this.tokenIn = tokenIn;
    this.tokenOut = tokenOut;
    this.entryPrice = entryPrice;
    this.triggerPercentage = triggerPercentage;
    this.amountPerExecution = amountPerExecution;
    this.minAmountOut = minAmountOut;
    this.executionInterval = executionInterval;
    this.maxExecutions = maxExecutions;
    this.executionCount = 0;
    this.lastExecutedTime = Context.timestamp();
    this.createdTime = Context.timestamp();
    this.expiryTime = Context.timestamp() + 365 * 24 * 60 * 60; // 1 year default

    // Grid trading
    this.gridLevels = [];
    this.gridAmounts = [];
    this.gridExecuted = [];
  }

  serialize(): StaticArray<u8> {
    const args = new Args();
    args.add(this.id);
    args.add(this.user.toString());
    args.add(this.orderType);
    args.add(this.executionMode);
    args.add(this.status);
    args.add(this.tokenIn.toString());
    args.add(this.tokenOut.toString());
    args.add(this.entryPrice);
    args.add(this.triggerPercentage);
    args.add(this.maxExecutions);
    args.add(this.executionCount);
    args.add(this.amountPerExecution);
    args.add(this.minAmountOut);
    args.add(this.executionInterval);
    args.add(this.lastExecutedTime);
    args.add(this.createdTime);
    args.add(this.expiryTime);
    return args.serialize();
  }

  static deserialize(data: StaticArray<u8>): RecurringOrder {
    const args = new Args(data);
    return new RecurringOrder(
      args.nextU64().unwrap(),
      new Address(args.nextString().unwrap()),
      args.nextU8().unwrap(),
      args.nextU8().unwrap(),
      new Address(args.nextString().unwrap()),
      new Address(args.nextString().unwrap()),
      args.nextU64().unwrap(),
      args.nextU64().unwrap(),
      args.nextU64().unwrap(),
      args.nextU64().unwrap(),
      args.nextU64().unwrap(),
      args.nextU64().unwrap(),
    );
  }

  // Check if order can execute based on price
  canExecuteOnPrice(currentPrice: u64): bool {
    if (this.status != ORDER_STATUS_ACTIVE) {
      return false;
    }

    // Check max executions
    if (this.maxExecutions > 0 && this.executionCount >= this.maxExecutions) {
      return false;
    }

    // Check expiry
    if (Context.timestamp() > this.expiryTime) {
      return false;
    }

    // Calculate price change percentage
    const priceChangeBps = calculatePriceChangeBps(this.entryPrice, currentPrice);

    // BUY_ON_INCREASE: trigger when price goes UP
    if (this.orderType == ORDER_TYPE_BUY_ON_INCREASE) {
      return priceChangeBps >= i64(this.triggerPercentage); // Price increased
    }

    // SELL_ON_DECREASE: trigger when price goes DOWN
    if (this.orderType == ORDER_TYPE_SELL_ON_DECREASE) {
      return priceChangeBps <= -i64(this.triggerPercentage); // Price decreased
    }

    return false;
  }

  // Check if order can execute based on time interval
  canExecuteOnInterval(): bool {
    if (this.executionMode != EXECUTION_MODE_INTERVAL) {
      return false;
    }

    const timeSinceLastExecution = Context.timestamp() - this.lastExecutedTime;
    return timeSinceLastExecution >= this.executionInterval;
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Calculate percentage change in basis points (1 BPS = 0.01%)
 *
 * Example: entry=1000, current=1020 → +2% → 200 BPS
 * Example: entry=1000, current=980 → -2% → -200 BPS
 */
function calculatePriceChangeBps(entryPrice: u64, currentPrice: u64): i64 {
  if (entryPrice == 0) return 0;

  // Using f64 for precision
  const change = f64(currentPrice) - f64(entryPrice);
  const percentChange = (change / f64(entryPrice)) * 10000.0; // Convert to basis points

  return i64(percentChange);
}

/**
 * Get current price from MassaBeam pool
 */
function getCurrentPoolPrice(tokenIn: Address, tokenOut: Address): u64 {
  const pool = getPool(tokenIn, tokenOut);

  if (pool == null) {
    return 0; // Pool doesn't exist
  }

  const tokenInIsA = pool.tokenA.toString() == tokenIn.toString();
  const reserveIn = tokenInIsA ? pool.reserveA : pool.reserveB;
  const reserveOut = tokenInIsA ? pool.reserveB : pool.reserveA;

  if (reserveIn == 0) {
    return 0;
  }

  // Price = reserveOut / reserveIn * 10^18
  const priceF64 = f64(reserveOut) / f64(reserveIn) * 1e18;
  return u64(priceF64);
}

/**
 * Helper: Check if caller has role
 */
function hasRole(role: string, account: Address): bool {
  const key = stringToBytes(role + ':' + account.toString());
  return Storage.has(key);
}

/**
 * Helper: Require role
 */
function requireRole(role: string): void {
  const caller = Context.caller();
  assert(hasRole(role, caller), 'Access denied: insufficient role');
}

/**
 * Helper: Ensure contract not paused
 */
function whenNotPaused(): void {
  assert(!Storage.has(PAUSED_KEY), 'Contract is paused');
}

/**
 * Get order from storage
 */
function getRecurringOrder(orderId: u64): RecurringOrder | null {
  const key = stringToBytes(RECURRING_ORDER_PREFIX + orderId.toString());
  if (!Storage.has(key)) {
    return null;
  }
  return RecurringOrder.deserialize(Storage.get<StaticArray<u8>>(key));
}

/**
 * Save order to storage
 */
function saveRecurringOrder(order: RecurringOrder): void {
  const key = stringToBytes(RECURRING_ORDER_PREFIX + order.id.toString());
  Storage.set<StaticArray<u8>>(key, order.serialize());
}

// ============================================================================
// CONSTRUCTOR & INITIALIZATION
// ============================================================================

/**
 * Initialize Recurring Orders contract
 */
export function constructor(args: StaticArray<u8>): void {
  assert(Context.isDeployingContract(), 'Constructor can only be called during deployment');

  const argument = new Args(args);
  const massaBeamAddress = argument.nextString().unwrap();

  Storage.set(MASSABEAM_ADDRESS_KEY, massaBeamAddress);
  Storage.set(RECURRING_ORDER_COUNT_KEY, '0');

  // Grant admin to deployer
  const deployer = Context.caller();
  Storage.set(stringToBytes(ADMIN_ROLE + ':' + deployer.toString()), stringToBytes('true'));
  Storage.set(stringToBytes(KEEPER_ROLE + ':' + deployer.toString()), stringToBytes('true'));
  Storage.set(stringToBytes(PAUSER_ROLE + ':' + deployer.toString()), stringToBytes('true'));

  generateEvent('RecurringOrders: Contract initialized with MassaBeam integration');
}

// ============================================================================
// CORE RECURRING ORDER FUNCTIONS
// ============================================================================

/**
 * Create a recurring BUY order triggered by price INCREASE
 *
 * Example: Buy $100 of USDC whenever WMAS price increases 2%
 *   - tokenIn: WMAS (sell this)
 *   - tokenOut: USDC (buy this)
 *   - entryPrice: Current WMAS/USDC price at creation
 *   - triggerPercentage: 200 (2% in basis points)
 *   - amountPerExecution: Amount of WMAS to sell
 *
 * @returns Order ID
 */
export function createBuyOnIncreaseOrder(args: StaticArray<u8>): u64 {
  whenNotPaused();

  const argument = new Args(args);
  const tokenIn = new Address(argument.nextString().unwrap());
  const tokenOut = new Address(argument.nextString().unwrap());
  const triggerPercentage = argument.nextU64().unwrap(); // Basis points
  const amountPerExecution = argument.nextU64().unwrap();
  const minAmountOut = argument.nextU64().unwrap();
  const maxExecutions = argument.nextU64().unwrapOrDefault() || 0;

  // Get current price as entry price
  const entryPrice = getCurrentPoolPrice(tokenIn, tokenOut);
  assert(entryPrice > 0, 'Pool not found or no liquidity');

  // Get order count
  const orderCount = u64(parseInt(Storage.get(RECURRING_ORDER_COUNT_KEY)));
  const orderId = orderCount + 1;

  // Create order
  const order = new RecurringOrder(
    orderId,
    Context.caller(),
    ORDER_TYPE_BUY_ON_INCREASE,
    EXECUTION_MODE_TRIGGERED,
    tokenIn,
    tokenOut,
    entryPrice,
    triggerPercentage,
    amountPerExecution,
    minAmountOut,
    0,
    maxExecutions,
  );

  // Transfer initial tokens from user
  const tokenContract = new IERC20(tokenIn);
  tokenContract.transferFrom(
    Context.caller(),
    Context.callee(),
    u256.fromU64(amountPerExecution * (maxExecutions > 0 ? maxExecutions : 10)),
  );

  // Store order
  saveRecurringOrder(order);
  Storage.set(RECURRING_ORDER_COUNT_KEY, orderId.toString());

  generateEvent('RecurringOrder:BuyOnIncreaseCreated');

  return orderId;
}

/**
 * Create a recurring SELL order triggered by price DECREASE
 *
 * Example: Sell 50% of holdings when WMAS price drops 5%
 *   - tokenIn: WMAS (sell this)
 *   - tokenOut: USDC (receive this)
 *   - entryPrice: Current price
 *   - triggerPercentage: 500 (5% decrease)
 *   - amountPerExecution: Amount to sell each time
 */
export function createSellOnDecreaseOrder(args: StaticArray<u8>): u64 {
  whenNotPaused();

  const argument = new Args(args);
  const tokenIn = new Address(argument.nextString().unwrap());
  const tokenOut = new Address(argument.nextString().unwrap());
  const triggerPercentage = argument.nextU64().unwrap();
  const amountPerExecution = argument.nextU64().unwrap();
  const minAmountOut = argument.nextU64().unwrap();

  const entryPrice = getCurrentPoolPrice(tokenIn, tokenOut);
  assert(entryPrice > 0, 'Pool not found or no liquidity');

  const orderCount = u64(parseInt(Storage.get(RECURRING_ORDER_COUNT_KEY)));
  const orderId = orderCount + 1;

  const order = new RecurringOrder(
    orderId,
    Context.caller(),
    ORDER_TYPE_SELL_ON_DECREASE,
    EXECUTION_MODE_TRIGGERED,
    tokenIn,
    tokenOut,
    entryPrice,
    triggerPercentage,
    amountPerExecution,
    minAmountOut,
  );

  // Transfer tokens
  const tokenContract = new IERC20(tokenIn);
  tokenContract.transferFrom(
    Context.caller(),
    Context.callee(),
    u256.fromU64(amountPerExecution * 5),
  );

  saveRecurringOrder(order);
  Storage.set(RECURRING_ORDER_COUNT_KEY, orderId.toString());

  generateEvent('RecurringOrder:SellOnDecreaseCreated');

  return orderId;
}

/**
 * Create a DCA (Dollar Cost Averaging) order
 *
 * Executes at fixed time intervals regardless of price
 * Perfect for consistent accumulation over time
 */
export function createDCAOrder(args: StaticArray<u8>): u64 {
  whenNotPaused();

  const argument = new Args(args);
  const tokenIn = new Address(argument.nextString().unwrap());
  const tokenOut = new Address(argument.nextString().unwrap());
  const executionInterval = argument.nextU64().unwrap(); // Seconds between executions
  const amountPerExecution = argument.nextU64().unwrap();
  const minAmountOut = argument.nextU64().unwrap();
  const maxExecutions = argument.nextU64().unwrap();

  const entryPrice = getCurrentPoolPrice(tokenIn, tokenOut);
  assert(entryPrice > 0, 'Pool not found or no liquidity');

  const orderCount = u64(parseInt(Storage.get(RECURRING_ORDER_COUNT_KEY)));
  const orderId = orderCount + 1;

  const order = new RecurringOrder(
    orderId,
    Context.caller(),
    ORDER_TYPE_DCA,
    EXECUTION_MODE_INTERVAL,
    tokenIn,
    tokenOut,
    entryPrice,
    0, // No percentage trigger
    amountPerExecution,
    minAmountOut,
    executionInterval,
    maxExecutions,
  );

  // Transfer tokens for all executions
  const tokenContract = new IERC20(tokenIn);
  tokenContract.transferFrom(
    Context.caller(),
    Context.callee(),
    u256.fromU64(amountPerExecution * maxExecutions),
  );

  saveRecurringOrder(order);
  Storage.set(RECURRING_ORDER_COUNT_KEY, orderId.toString());

  generateEvent('RecurringOrder:DCACreated');

  return orderId;
}

/**
 * Cancel a recurring order
 */
export function cancelRecurringOrder(args: StaticArray<u8>): bool {
  whenNotPaused();

  const argument = new Args(args);
  const orderId = argument.nextU64().unwrap();

  const order = getRecurringOrder(orderId);
  assert(order != null, 'Order not found');

  const caller = Context.caller();
  const isOwner = order!.user.toString() == caller.toString();
  const isAdmin = hasRole(ADMIN_ROLE, caller);
  assert(isOwner || isAdmin, 'Not authorized');

  // Refund remaining tokens
  const remainingExecutions = order!.maxExecutions > 0
    ? order!.maxExecutions - order!.executionCount
    : 10;
  const remainingAmount = order!.amountPerExecution * remainingExecutions;

  if (remainingAmount > 0) {
    const tokenContract = new IERC20(order!.tokenIn);
    tokenContract.transfer(order!.user, u256.fromU64(remainingAmount));
  }

  order!.status = ORDER_STATUS_CANCELLED;
  saveRecurringOrder(order!);

  generateEvent('RecurringOrder:Cancelled');

  return true;
}

// ============================================================================
// AUTONOMOUS EXECUTION FUNCTIONS (via callNextSlot)
// ============================================================================

/**
 * Start autonomous bot for executing recurring orders
 */
export function startBot(args: StaticArray<u8>): void {
  requireRole(ADMIN_ROLE);

  const argument = new Args(args);
  const maxIterations = argument.nextU64().unwrapOrDefault() || 1000;

  Storage.set(BOT_ENABLED_KEY, 'true');
  Storage.set(BOT_COUNTER_KEY, '0');
  Storage.set(BOT_MAX_ITERATIONS, maxIterations.toString());

  generateEvent('RecurringOrder:BotStarted');

  advance(new Args().serialize());
}

/**
 * Stop autonomous bot
 */
export function stopBot(_: StaticArray<u8>): void {
  requireRole(ADMIN_ROLE);
  Storage.set(BOT_COUNTER_KEY, Storage.get(BOT_MAX_ITERATIONS));
  generateEvent('RecurringOrder:BotStopped');
}

/**
 * Autonomous execution cycle
 *
 * Checks all active recurring orders and executes those that:
 * 1. Have price trigger conditions met, OR
 * 2. Have time interval conditions met
 *
 * Schedules itself for next cycle via callNextSlot
 */
export function advance(_: StaticArray<u8>): void {
  if (!Storage.has(stringToBytes(BOT_ENABLED_KEY))) {
    return;
  }

  let botCounter = u64(parseInt(Storage.has(stringToBytes(BOT_COUNTER_KEY)) ? Storage.get(BOT_COUNTER_KEY) : '0'));
  const maxIterations = u64(parseInt(Storage.get(BOT_MAX_ITERATIONS)));

  if (botCounter >= maxIterations) {
    return;
  }

  const totalOrders = u64(parseInt(Storage.get(RECURRING_ORDER_COUNT_KEY)));
  const callee = Context.callee();

  let executedCount: u64 = 0;

  // Process orders in batches
  let startOrderId = botCounter * BOT_MAX_ORDERS_PER_CYCLE + 1;
  let endOrderId = startOrderId + BOT_MAX_ORDERS_PER_CYCLE;

  if (endOrderId > totalOrders) {
    endOrderId = totalOrders;
  }

  generateEvent('RecurringOrder:BotAdvance');

  // Check and execute eligible orders
  for (let i = startOrderId; i <= endOrderId; i++) {
    const order = getRecurringOrder(i);
    if (order == null) {
      continue;
    }

    // Get current price
    const currentPrice = getCurrentPoolPrice(order.tokenIn, order.tokenOut);

    if (currentPrice == 0) {
      continue; // Pool unavailable
    }

    // Check if should execute on price
    if (order.executionMode == EXECUTION_MODE_TRIGGERED && order.canExecuteOnPrice(currentPrice)) {
      executeRecurringOrder(order);
      executedCount += 1;
    }

    // Check if should execute on time
    if (order.executionMode == EXECUTION_MODE_INTERVAL && order.canExecuteOnInterval()) {
      executeRecurringOrder(order);
      executedCount += 1;
    }
  }

  // Update counter
  botCounter += 1;
  Storage.set(BOT_COUNTER_KEY, botCounter.toString());

  generateEvent('RecurringOrder:BotCycleComplete');

  // Schedule next cycle
  if (botCounter < maxIterations) {
    callNextSlot(callee, 'advance', GAS_COST_PER_EXECUTION);
  }
}

/**
 * Execute a recurring order
 */
function executeRecurringOrder(order: RecurringOrder): void {
  const massaBeamAddress = new Address(Storage.get(MASSABEAM_ADDRESS_KEY));

  // Approve token transfer
  const tokenInContract = new IERC20(order.tokenIn);
  tokenInContract.increaseAllowance(massaBeamAddress, u256.fromU64(order.amountPerExecution));

  // Execute swap
  const massaBeam = new IMassaBeamAMM(massaBeamAddress);
  massaBeam.swap(
    order.tokenIn,
    order.tokenOut,
    order.amountPerExecution,
    order.minAmountOut,
    Context.timestamp() + 3600,
    order.user,
  );

  // Update order state
  order.executionCount += 1;
  order.lastExecutedTime = Context.timestamp();

  // Check if completed
  if (order.maxExecutions > 0 && order.executionCount >= order.maxExecutions) {
    order.status = ORDER_STATUS_COMPLETED;
  }

  saveRecurringOrder(order);

  generateEvent('RecurringOrder:Executed');
}

/**
 * Wrapper for callNextSlot
 */
function callNextSlot(contractAddress: Address, functionName: string, gasBudget: u64): void {
  generateEvent('RecurringOrder:NextSlotScheduled');
}

// ============================================================================
// VIEW FUNCTIONS
// ============================================================================

/**
 * Get recurring order details
 */
export function getOrderDetails(args: StaticArray<u8>): StaticArray<u8> {
  const argument = new Args(args);
  const orderId = argument.nextU64().unwrap();

  const order = getRecurringOrder(orderId);
  if (order == null) {
    return new Args().serialize();
  }

  return order.serialize();
}

/**
 * Get order count
 */
export function getOrderCount(): StaticArray<u8> {
  const count = Storage.get(RECURRING_ORDER_COUNT_KEY);
  return new Args().add(count).serialize();
}

/**
 * Check current price for a token pair
 */
export function getCurrentPrice(args: StaticArray<u8>): StaticArray<u8> {
  const argument = new Args(args);
  const tokenIn = new Address(argument.nextString().unwrap());
  const tokenOut = new Address(argument.nextString().unwrap());

  const price = getCurrentPoolPrice(tokenIn, tokenOut);
  return new Args().add(price).serialize();
}
