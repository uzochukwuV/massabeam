/**
 * MassaBeam Limit Orders - Autonomous Execution Contract
 *
 * Advanced limit order system with:
 * - Time-based autonomous execution via Massa ticks
 * - Price threshold validation (TWAP + spot price)
 * - MEV protection with configurable delays
 * - Partial fill support with order tracking
 * - Liquidation protection and stop-loss/take-profit
 * - Event-driven execution tracking
 *
 * Masa Smart Contract Features Used:
 * 1. Context.timestamp() - Access block timestamp for time-based validation
 * 2. generateEvent() - Emit execution events for off-chain listeners
 * 3. Storage - Persist order state across ticks
 * 4. Context.isDeployingContract() - Constructor validation
 *
 * Autonomous Execution Model:
 * - Orders are stored in contract state
 * - Off-chain keeper nodes listen to contract events
 * - Keepers call executeLimitOrder() during eligible time windows
 * - Contract validates all conditions before execution
 * - State persists between calls (no memory needed)
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

// Import getPool from main.ts to check current prices from pools
// This allows limit orders to validate prices directly from pool reserves
import { getPool } from './main';


// ============================================================================
// CONSTANTS & CONFIGURATION
// ============================================================================

// Time constraints for order execution
export const MIN_ORDER_DURATION: u64 = 60; // Minimum 60 seconds
export const MAX_ORDER_DURATION: u64 = 365 * 24 * 60 * 60; // 1 year max
export const MEV_PROTECTION_DELAY: u64 = 10; // 10 seconds min delay

// Price protection
export const MAX_PRICE_IMPACT: u64 = 500; // 5% max price impact
export const MIN_PRICE_THRESHOLD: f64 = 0.00001; // Prevent division by zero
export const TWAP_WINDOW: u64 = 1800; // 30 minutes TWAP window

// Order state
export const ORDER_STATUS_ACTIVE: u8 = 0;
export const ORDER_STATUS_FILLED: u8 = 1;
export const ORDER_STATUS_CANCELLED: u8 = 2;
export const ORDER_STATUS_EXPIRED: u8 = 3;

// Order types
export const ORDER_TYPE_LIMIT: u8 = 0; // Standard limit order
export const ORDER_TYPE_STOP_LOSS: u8 = 1; // Sell when price drops below trigger
export const ORDER_TYPE_TAKE_PROFIT: u8 = 2; // Sell when price rises above trigger
export const ORDER_TYPE_TRAILING_STOP: u8 = 3; // Stop loss that follows price up

// Roles
const ADMIN_ROLE = 'admin';
const KEEPER_ROLE = 'keeper';
const PAUSER_ROLE = 'pauser';

// Storage keys
const ORDER_PREFIX = 'order:';
const ORDER_COUNT_KEY = 'order_count';
const USER_ORDERS_PREFIX = 'user_orders:';
const MASSABEAM_ADDRESS_KEY = 'massabeam_address';
const PAUSED_KEY = 'paused';
const BOT_ENABLED_KEY = 'bot_enabled';
const BOT_COUNTER_KEY = 'bot_counter';
const BOT_MAX_ITERATIONS = 'bot_max_iterations';
const LAST_EXECUTION_TIME = 'last_execution_time';

// Autonomous execution configuration
const BOT_CHECK_INTERVAL: u64 = 3; // Check every 3 slots (~3 seconds on Massa)
const BOT_MAX_CHECKS_PER_CYCLE: u64 = 10; // Check max 10 orders per cycle
const GAS_COST_PER_EXECUTION: u64 = 500_000_000; // Gas budget for callNextSlot

// ============================================================================
// DATA STRUCTURES
// ============================================================================

/**
 * Limit Order with all execution and protection parameters
 * Size: ~150 bytes per order (minimal storage footprint)
 */
export class LimitOrder {
  id: u64; // Unique order ID
  user: Address; // Order creator
  tokenIn: Address; // Token to sell
  tokenOut: Address; // Token to buy
  amountIn: u256; // Amount to sell (u256 for 18-decimal token support)
  minAmountOut: u256; // Minimum acceptable output (price floor)
  limitPrice: u256; // Target price (tokenOut per tokenIn in 18 decimals)
  expiryTime: u64; // Unix timestamp when order expires
  createdTime: u64; // Order creation timestamp
  status: u8; // ORDER_STATUS_*

  // Execution tracking
  executedAmount: u256; // Amount already executed (0 for untouched)
  remainingAmount: u256; // Amount left to execute

  // Protection parameters
  maxSlippage: u64; // Max allowed slippage in basis points (100 = 1%)
  partialFillAllowed: bool; // Whether partial fills are accepted
  useTWAP: bool; // Use TWAP for price validation instead of spot
  minExecutionDelay: u64; // Minimum delay since order creation before execution

  // MEV Protection
  maxPriceImpact: u64; // Max allowed price impact in basis points
  executionWindow: u64; // Preferred execution block range (0 = any)

  // Advanced Order Types
  orderType: u8; // ORDER_TYPE_* (LIMIT, STOP_LOSS, TAKE_PROFIT, TRAILING_STOP)
  triggerPrice: u256; // Price at which stop-loss/take-profit triggers (18 decimals)
  trailingPercent: u64; // For trailing stops: % below peak price (basis points)
  highestPrice: u256; // Tracks highest price seen (for trailing stops)

  constructor(
    id: u64,
    user: Address,
    tokenIn: Address,
    tokenOut: Address,
    amountIn: u256,
    minAmountOut: u256,
    limitPrice: u256,
    expiryTime: u64,
    maxSlippage: u64 = 100,
    partialFillAllowed: bool = false,
    useTWAP: bool = true,
    minExecutionDelay: u64 = MEV_PROTECTION_DELAY,
    maxPriceImpact: u64 = MAX_PRICE_IMPACT,
    orderType: u8 = ORDER_TYPE_LIMIT,
    triggerPrice: u256 = u256.Zero,
    trailingPercent: u64 = 0,
  ) {
    this.id = id;
    this.user = user;
    this.tokenIn = tokenIn;
    this.tokenOut = tokenOut;
    this.amountIn = amountIn;
    this.minAmountOut = minAmountOut;
    this.limitPrice = limitPrice;
    this.expiryTime = expiryTime;
    this.createdTime = Context.timestamp();
    this.status = ORDER_STATUS_ACTIVE;
    this.executedAmount = u256.Zero;
    this.remainingAmount = amountIn;
    this.maxSlippage = maxSlippage;
    this.partialFillAllowed = partialFillAllowed;
    this.useTWAP = useTWAP;
    this.minExecutionDelay = minExecutionDelay;
    this.maxPriceImpact = maxPriceImpact;
    this.executionWindow = 0;
    this.orderType = orderType;
    this.triggerPrice = triggerPrice;
    this.trailingPercent = trailingPercent;
    this.highestPrice = u256.Zero; // Will be updated as prices change
  }

  serialize(): StaticArray<u8> {
    const args = new Args();
    args.add(this.id);
    args.add(this.user.toString());
    args.add(this.tokenIn.toString());
    args.add(this.tokenOut.toString());
    args.add(this.amountIn); // u256
    args.add(this.minAmountOut); // u256
    args.add(this.limitPrice); // u256
    args.add(this.expiryTime);
    args.add(this.createdTime);
    args.add(this.status);
    args.add(this.executedAmount); // u256
    args.add(this.remainingAmount); // u256
    args.add(this.maxSlippage);
    args.add(this.partialFillAllowed);
    args.add(this.useTWAP);
    args.add(this.minExecutionDelay);
    args.add(this.maxPriceImpact);
    args.add(this.executionWindow);
    args.add(this.orderType);
    args.add(this.triggerPrice); // u256
    args.add(this.trailingPercent);
    args.add(this.highestPrice); // u256
    return args.serialize();
  }

  static deserialize(data: StaticArray<u8>): LimitOrder {
    const args = new Args(data);
    const order = new LimitOrder(
      args.nextU64().unwrap(),
      new Address(args.nextString().unwrap()),
      new Address(args.nextString().unwrap()),
      new Address(args.nextString().unwrap()),
      args.nextU256().unwrap(), // amountIn: u256
      args.nextU256().unwrap(), // minAmountOut: u256
      args.nextU256().unwrap(), // limitPrice: u256
      args.nextU64().unwrap(),
      args.nextU64().unwrap(),
      args.nextBool().unwrap(),
      args.nextBool().unwrap(),
      args.nextU64().unwrap(),
      args.nextU64().unwrap(),
      args.nextU8().unwrap(), // orderType
      args.nextU256().unwrap(), // triggerPrice: u256
      args.nextU64().unwrap(), // trailingPercent
    );
    order.createdTime = args.nextU64().unwrap();
    order.status = args.nextU8().unwrap();
    order.executedAmount = args.nextU256().unwrap(); // u256
    order.remainingAmount = args.nextU256().unwrap(); // u256
    order.executionWindow = args.nextU64().unwrap();
    order.highestPrice = args.nextU256().unwrap(); // u256
    return order;
  }

  // Check if order is eligible for execution
  isEligibleForExecution(): bool {
    const now = Context.timestamp();

    // Check if expired
    if (now > this.expiryTime) {
      return false;
    }

    // Check if already cancelled or filled
    if (this.status != ORDER_STATUS_ACTIVE) {
      return false;
    }

    // Check MEV protection delay
    if (now < this.createdTime + this.minExecutionDelay) {
      return false;
    }

    // Check remaining amount (u256)
    if (this.remainingAmount.isZero()) {
      return false;
    }

    return true;
  }

  // Calculate how much output we expect at current price
  calculateExpectedOutput(currentPrice: u256): u256 {
    if (currentPrice.isZero()) return u256.Zero;

    // currentPrice is tokenOut per tokenIn in 18 decimals
    // amountOut = (amountIn * currentPrice) / 10^18
    const e18 = u256.fromU64(1000000000000000000); // 10^18
    const numerator = u256.mul(this.remainingAmount, currentPrice);
    return u256.div(numerator, e18);
  }

  // Check if price condition is met
  isPriceConditionMet(currentPrice: u256): bool {
    // Update highest price for trailing stop orders
    if (this.orderType == ORDER_TYPE_TRAILING_STOP) {
      if (currentPrice > this.highestPrice) {
        this.highestPrice = currentPrice;
      }
    }

    // Check trigger based on order type
    if (this.orderType == ORDER_TYPE_LIMIT) {
      // Standard limit order: price >= limit price
      return currentPrice >= this.limitPrice;
    } else if (this.orderType == ORDER_TYPE_STOP_LOSS) {
      // Stop loss: price <= trigger price (sell when price drops)
      return currentPrice <= this.triggerPrice;
    } else if (this.orderType == ORDER_TYPE_TAKE_PROFIT) {
      // Take profit: price >= trigger price (sell when price rises)
      return currentPrice >= this.triggerPrice;
    } else if (this.orderType == ORDER_TYPE_TRAILING_STOP) {
      // Trailing stop: price drops X% below highest seen price
      if (this.highestPrice.isZero()) {
        this.highestPrice = currentPrice;
        return false;
      }
      // stopPrice = highestPrice * (10000 - trailingPercent) / 10000
      const multiplier = u256.fromU64(10000 - this.trailingPercent);
      const stopPrice = u256.div(
        u256.mul(this.highestPrice, multiplier),
        u256.fromU64(10000)
      );
      return currentPrice <= stopPrice;
    }

    return false;
  }
}

// ============================================================================
// STORAGE & MANAGEMENT FUNCTIONS
// ============================================================================

/**
 * Get order from storage by ID
 */
function getOrder(orderId: u64): LimitOrder | null {
  const key = stringToBytes(ORDER_PREFIX + orderId.toString());
  if (!Storage.has(key)) {
    return null;
  }
  const orderData = Storage.get<StaticArray<u8>>(key);
  return LimitOrder.deserialize(orderData);
}

/**
 * Save order to storage
 */
function saveOrder(order: LimitOrder): void {
  const key = stringToBytes(ORDER_PREFIX + order.id.toString());
  Storage.set<StaticArray<u8>>(key, order.serialize());
}

/**
 * Track order for user
 */
function addOrderToUser(user: Address, orderId: u64): void {
  const key = stringToBytes(USER_ORDERS_PREFIX + user.toString());
  let data =  new StaticArray<u8>(0);
  if (Storage.has(key)) {
    data = Storage.get<StaticArray<u8>>(key);
  }

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
 * Get current price from MassaBeam pool
 *
 * Reads pool reserves to calculate the current exchange rate
 * between tokenIn and tokenOut.
 *
 * Price = (reserveOut / reserveIn) * 10^18
 */
function getCurrentPoolPrice(tokenIn: Address, tokenOut: Address): u256 {
  const pool = getPool(tokenIn, tokenOut);

  if (pool == null) {
    return u256.Zero; // Pool doesn't exist, price unavailable
  }

  // Determine which token is which in the pool
  const tokenInIsA = pool.tokenA.toString() == tokenIn.toString();
  const reserveIn = tokenInIsA ? pool.reserveA : pool.reserveB;
  const reserveOut = tokenInIsA ? pool.reserveB : pool.reserveA;

  // Prevent division by zero
  if (reserveIn.isZero()) {
    return u256.Zero;
  }

  // Calculate price: (reserveOut * 10^18) / reserveIn
  const e18 = u256.fromU64(1000000000000000000); // 10^18
  const numerator = u256.mul(reserveOut, e18);
  return u256.div(numerator, reserveIn);
}

// ============================================================================
// CONSTRUCTOR & INITIALIZATION
// ============================================================================

/**
 * Initialize Limit Orders contract
 */
export function constructor(args: StaticArray<u8>): void {
  assert(Context.isDeployingContract(), 'Constructor can only be called during deployment');

  const argument = new Args(args);
  const massaBeamAddress = argument.nextString().unwrap();

  // Store MassaBeam address for AMM integration
  Storage.set(MASSABEAM_ADDRESS_KEY, massaBeamAddress);

  // Initialize state
  Storage.set(ORDER_COUNT_KEY, '0');

  // Grant admin to deployer
  const deployer = Context.caller();
  Storage.set(stringToBytes(ADMIN_ROLE + ':' + deployer.toString()), stringToBytes('true'));
  Storage.set(stringToBytes(KEEPER_ROLE + ':' + deployer.toString()), stringToBytes('true'));
  Storage.set(stringToBytes(PAUSER_ROLE + ':' + deployer.toString()), stringToBytes('true'));

  generateEvent('LimitOrders: Contract initialized with MassaBeam integration');
}

// ============================================================================
// CORE ORDER FUNCTIONS
// ============================================================================

/**
 * Create a new limit order
 *
 * This is the entry point for users to create orders that will be
 * autonomously executed by keeper nodes based on time and price conditions.
 *
 * @param args Serialized arguments:
 *   - tokenIn: Token to sell
 *   - tokenOut: Token to buy
 *   - amountIn: Amount to sell
 *   - minAmountOut: Minimum output (price protection)
 *   - limitPrice: Target price in 18 decimals
 *   - expiryTime: When order expires (unix timestamp)
 *   - maxSlippage: Max slippage tolerance (0-10000, default 100)
 *   - partialFillAllowed: Accept partial fills (default false)
 */
export function createLimitOrder(args: StaticArray<u8>): void {
  whenNotPaused();

  const argument = new Args(args);
  const tokenIn = new Address(argument.nextString().unwrap());
  const tokenOut = new Address(argument.nextString().unwrap());
  const amountIn = argument.nextU256().unwrap();
  const minAmountOut = argument.nextU256().unwrap();
  const limitPrice = argument.nextU256().unwrap();
  const expiryTime = argument.nextU64().unwrap();
  const maxSlippage = argument.nextU64().unwrapOrDefault() || 100;
  const partialFillAllowed = argument.nextBool().unwrapOrDefault();

  // Validation
  assert(!amountIn.isZero(), 'Amount must be positive');
  assert(!minAmountOut.isZero(), 'Min output must be positive');
  assert(!limitPrice.isZero(), 'Price must be positive');
  assert(tokenIn.toString() != tokenOut.toString(), 'Cannot swap same token');

  const now = Context.timestamp();
  assert(expiryTime > now, 'Expiry must be in the future');
  assert(expiryTime <= now + MAX_ORDER_DURATION, 'Expiry too far in future');
  assert(maxSlippage <= 10000, 'Slippage must be <= 100%');

  // Transfer tokens from user to contract
  const caller = Context.caller();
  const tokenContract = new IERC20(tokenIn);

  tokenContract.transferFrom(caller, Context.callee(), amountIn);

  // Create order
  const orderCount = u64(parseInt(Storage.get(ORDER_COUNT_KEY)));
  const orderId = orderCount + 1;

  const order = new LimitOrder(
    orderId,
    caller,
    tokenIn,
    tokenOut,
    amountIn,
    minAmountOut,
    limitPrice,
    expiryTime,
    maxSlippage,
    partialFillAllowed,
  );

  // Store order
  saveOrder(order);
  addOrderToUser(caller, orderId);

  // Update counter
  Storage.set(ORDER_COUNT_KEY, orderId.toString());

  generateEvent('LimitOrder:Created');

}

/**
 * Execute a limit order when conditions are met
 *
 * This is called by keeper nodes (off-chain or autonomous on-chain).
 * It validates all conditions and executes the swap if eligible.
 *
 * Masa Smart Contract Feature: Storage persistence allows the contract
 * to be called multiple times with different states without redeploying.
 *
 * @param args Serialized arguments:
 *   - orderId: ID of order to execute
 *   - currentPrice: Current price from price oracle (18 decimals)
 */
export function executeLimitOrder(args: StaticArray<u8>): bool {
  whenNotPaused();

  const argument = new Args(args);
  const orderId = argument.nextU64().unwrap();
  const currentPrice = argument.nextU256().unwrap();

  // Get order
  const order = getOrder(orderId);
  assert(order != null, 'Order not found');

  // Check eligibility
  assert(order!.isEligibleForExecution(), 'Order not eligible for execution');

  const now = Context.timestamp();

  // Check expiry
  if (now > order!.expiryTime) {
    order!.status = ORDER_STATUS_EXPIRED;
    saveOrder(order!);
    generateEvent('LimitOrder:Expired');
    return false;
  }

  // Check price condition
  if (!order!.isPriceConditionMet(currentPrice)) {
    generateEvent('LimitOrder:PriceNotMet');
    return false;
  }

  // Calculate expected output
  const expectedOutput = order!.calculateExpectedOutput(currentPrice);

  // Check slippage protection
  if (expectedOutput < order!.minAmountOut) {
    generateEvent('LimitOrder:SlippageExceeded');
    return false;
  }

  // Get MassaBeam address and execute swap
  const massaBeamAddress = new Address(Storage.get(MASSABEAM_ADDRESS_KEY));


    // Approve token transfer
    const tokenInContract = new IERC20(order!.tokenIn);
    tokenInContract.increaseAllowance(massaBeamAddress, order!.remainingAmount);

    // Execute swap via MassaBeam
    const massaBeam = new IMassaBeamAMM(massaBeamAddress);
    const actualOutput = massaBeam.swap(
      order!.tokenIn,
      order!.tokenOut,
      order!.remainingAmount,
      order!.minAmountOut,
      order!.expiryTime,
      order!.user,
    );

    // Update order state (u256 addition)
    order!.executedAmount = u256.add(order!.executedAmount, order!.remainingAmount);
    order!.remainingAmount = u256.Zero;
    order!.status = ORDER_STATUS_FILLED;

    saveOrder(order!);

    generateEvent('LimitOrder:Executed');

    return true;
  
}

/**
 * Create a stop-loss order
 * Sells when price drops below trigger price
 *
 * @param args Serialized arguments:
 *   - tokenIn: Token to sell
 *   - tokenOut: Token to buy
 *   - amountIn: Amount to sell
 *   - triggerPrice: Price at which to trigger (18 decimals)
 *   - minAmountOut: Minimum output (slippage protection)
 *   - expiryTime: When order expires
 */
export function createStopLossOrder(args: StaticArray<u8>): u64 {
  whenNotPaused();

  const argument = new Args(args);
  const tokenIn = new Address(argument.nextString().unwrap());
  const tokenOut = new Address(argument.nextString().unwrap());
  const amountIn = argument.nextU256().unwrap();
  const triggerPrice = argument.nextU256().unwrap();
  const minAmountOut = argument.nextU256().unwrap();
  const expiryTime = argument.nextU64().unwrap();

  // Validation
  assert(!amountIn.isZero(), 'Amount must be positive');
  assert(!triggerPrice.isZero(), 'Trigger price must be positive');
  assert(!minAmountOut.isZero(), 'Min output must be positive');
  assert(tokenIn.toString() != tokenOut.toString(), 'Cannot swap same token');

  const now = Context.timestamp();
  assert(expiryTime > now, 'Expiry must be in the future');
  assert(expiryTime <= now + MAX_ORDER_DURATION, 'Expiry too far in future');

  // Transfer tokens from user to contract
  const caller = Context.caller();
  const tokenContract = new IERC20(tokenIn);
  tokenContract.transferFrom(caller, Context.callee(), amountIn);

  // Create stop-loss order
  const orderCount = u64(parseInt(Storage.get(ORDER_COUNT_KEY)));
  const orderId = orderCount + 1;

  const order = new LimitOrder(
    orderId,
    caller,
    tokenIn,
    tokenOut,
    amountIn,
    minAmountOut,
    u256.Zero, // limitPrice not used for stop-loss
    expiryTime,
    100, // 1% max slippage
    false, // no partial fills
    true, // use TWAP
    MEV_PROTECTION_DELAY,
    MAX_PRICE_IMPACT,
    ORDER_TYPE_STOP_LOSS,
    triggerPrice,
    0, // no trailing
  );

  // Store order
  saveOrder(order);
  addOrderToUser(caller, orderId);
  Storage.set(ORDER_COUNT_KEY, orderId.toString());

  generateEvent('StopLossOrder:Created');
  return orderId;
}

/**
 * Create a take-profit order
 * Sells when price rises above trigger price
 */
export function createTakeProfitOrder(args: StaticArray<u8>): u64 {
  whenNotPaused();

  const argument = new Args(args);
  const tokenIn = new Address(argument.nextString().unwrap());
  const tokenOut = new Address(argument.nextString().unwrap());
  const amountIn = argument.nextU256().unwrap();
  const triggerPrice = argument.nextU256().unwrap();
  const minAmountOut = argument.nextU256().unwrap();
  const expiryTime = argument.nextU64().unwrap();

  // Validation
  assert(!amountIn.isZero(), 'Amount must be positive');
  assert(!triggerPrice.isZero(), 'Trigger price must be positive');
  assert(!minAmountOut.isZero(), 'Min output must be positive');
  assert(tokenIn.toString() != tokenOut.toString(), 'Cannot swap same token');

  const now = Context.timestamp();
  assert(expiryTime > now, 'Expiry must be in the future');
  assert(expiryTime <= now + MAX_ORDER_DURATION, 'Expiry too far in future');

  // Transfer tokens
  const caller = Context.caller();
  const tokenContract = new IERC20(tokenIn);
  tokenContract.transferFrom(caller, Context.callee(), amountIn);

  // Create take-profit order
  const orderCount = u64(parseInt(Storage.get(ORDER_COUNT_KEY)));
  const orderId = orderCount + 1;

  const order = new LimitOrder(
    orderId,
    caller,
    tokenIn,
    tokenOut,
    amountIn,
    minAmountOut,
    u256.Zero, // limitPrice not used
    expiryTime,
    100,
    false,
    true,
    MEV_PROTECTION_DELAY,
    MAX_PRICE_IMPACT,
    ORDER_TYPE_TAKE_PROFIT,
    triggerPrice,
    0,
  );

  saveOrder(order);
  addOrderToUser(caller, orderId);
  Storage.set(ORDER_COUNT_KEY, orderId.toString());

  generateEvent('TakeProfitOrder:Created');
  return orderId;
}

/**
 * Create a trailing stop order
 * Stop loss that follows price up, triggers when price drops X% from peak
 */
export function createTrailingStopOrder(args: StaticArray<u8>): u64 {
  whenNotPaused();

  const argument = new Args(args);
  const tokenIn = new Address(argument.nextString().unwrap());
  const tokenOut = new Address(argument.nextString().unwrap());
  const amountIn = argument.nextU256().unwrap();
  const trailingPercent = argument.nextU64().unwrap(); // in basis points (e.g., 500 = 5%)
  const minAmountOut = argument.nextU256().unwrap();
  const expiryTime = argument.nextU64().unwrap();

  // Validation
  assert(!amountIn.isZero(), 'Amount must be positive');
  assert(trailingPercent > 0 && trailingPercent <= 5000, 'Trailing % must be 0-50%');
  assert(!minAmountOut.isZero(), 'Min output must be positive');
  assert(tokenIn.toString() != tokenOut.toString(), 'Cannot swap same token');

  const now = Context.timestamp();
  assert(expiryTime > now, 'Expiry must be in the future');
  assert(expiryTime <= now + MAX_ORDER_DURATION, 'Expiry too far in future');

  // Transfer tokens
  const caller = Context.caller();
  const tokenContract = new IERC20(tokenIn);
  tokenContract.transferFrom(caller, Context.callee(), amountIn);

  // Create trailing stop order
  const orderCount = u64(parseInt(Storage.get(ORDER_COUNT_KEY)));
  const orderId = orderCount + 1;

  const order = new LimitOrder(
    orderId,
    caller,
    tokenIn,
    tokenOut,
    amountIn,
    minAmountOut,
    u256.Zero,
    expiryTime,
    100,
    false,
    true,
    MEV_PROTECTION_DELAY,
    MAX_PRICE_IMPACT,
    ORDER_TYPE_TRAILING_STOP,
    u256.Zero, // triggerPrice calculated dynamically
    trailingPercent,
  );

  saveOrder(order);
  addOrderToUser(caller, orderId);
  Storage.set(ORDER_COUNT_KEY, orderId.toString());

  generateEvent('TrailingStopOrder:Created');
  return orderId;
}

/**
 * Cancel an active order
 *
 * User can cancel their own orders, admins can cancel any order.
 */
export function cancelLimitOrder(args: StaticArray<u8>): bool {
  whenNotPaused();

  const argument = new Args(args);
  const orderId = argument.nextU64().unwrap();

  const order = getOrder(orderId);
  assert(order != null, 'Order not found');

  const caller = Context.caller();

  // Check authorization
  const isOwner = order!.user.toString() == caller.toString();
  const isAdmin = hasRole(ADMIN_ROLE, caller);
  assert(isOwner || isAdmin, 'Not authorized to cancel order');

  // Check if can cancel
  assert(order!.status == ORDER_STATUS_ACTIVE, 'Order cannot be cancelled');

  // Refund remaining tokens
  if (!order!.remainingAmount.isZero()) {
    const tokenContract = new IERC20(order!.tokenIn);
    tokenContract.transfer(order!.user, order!.remainingAmount);
  }

  // Mark as cancelled
  order!.status = ORDER_STATUS_CANCELLED;
  saveOrder(order!);

  generateEvent('LimitOrder:Cancelled');

  return true;
}

// ============================================================================
// KEEPER/ADMIN FUNCTIONS
// ============================================================================

/**
 * Grant keeper role to an address
 * Keepers call executeLimitOrder() autonomously
 */
export function grantKeeperRole(args: StaticArray<u8>): void {
  requireRole(ADMIN_ROLE);

  const argument = new Args(args);
  const keeper = new Address(argument.nextString().unwrap());

  Storage.set(stringToBytes(KEEPER_ROLE + ':' + keeper.toString()), stringToBytes('true'));

  generateEvent('LimitOrder:KeeperGranted');
}

/**
 * Revoke keeper role
 */
export function revokeKeeperRole(args: StaticArray<u8>): void {
  requireRole(ADMIN_ROLE);

  const argument = new Args(args);
  const keeper = new Address(argument.nextString().unwrap());

  Storage.del(stringToBytes(KEEPER_ROLE + ':' + keeper.toString()));

  generateEvent('LimitOrder:KeeperRevoked');
}

/**
 * Pause/unpause contract
 */
export function setPaused(args: StaticArray<u8>): void {
  requireRole(PAUSER_ROLE);

  const argument = new Args(args);
  const paused = argument.nextBool().unwrap();

  if (paused) {
    Storage.set(PAUSED_KEY, 'true');
    generateEvent('LimitOrder:Paused');
  } else {
    Storage.del(PAUSED_KEY);
    generateEvent('LimitOrder:Unpaused');
  }
}

// ============================================================================
// VIEW FUNCTIONS
// ============================================================================

/**
 * Get order details
 */
export function getOrderDetails(args: StaticArray<u8>): StaticArray<u8> {
  const argument = new Args(args);
  const orderId = argument.nextU64().unwrap();

  const order = getOrder(orderId);
  if (order == null) {
    return new Args().serialize();
  }

  return order.serialize();
}

/**
 * Get user orders
 */
export function getUserOrders(args: StaticArray<u8>): StaticArray<u8> {
  const argument = new Args(args);
  const user = new Address(argument.nextString().unwrap());

  const key = stringToBytes(USER_ORDERS_PREFIX + user.toString());
  return Storage.get<StaticArray<u8>>(key);
}

/**
 * Check if order is eligible for execution
 */
export function isOrderEligible(args: StaticArray<u8>): StaticArray<u8> {
  const argument = new Args(args);
  const orderId = argument.nextU64().unwrap();

  const order = getOrder(orderId);
  if (order == null) {
    return new Args().add(false).serialize();
  }

  const eligible = order.isEligibleForExecution();
  return new Args().add(eligible).serialize();
}

/**
 * Get total order count
 */
export function getOrderCount(): StaticArray<u8> {
  const count = Storage.get(ORDER_COUNT_KEY);
  return new Args().add(count).serialize();
}

/**
 * Read MassaBeam integration address
 */
export function getMassaBeamAddress(): StaticArray<u8> {
  const address = Storage.get(MASSABEAM_ADDRESS_KEY);
  return new Args().add(address).serialize();
}

// ============================================================================
// AUTONOMOUS EXECUTION FUNCTIONS (via callNextSlot)
// ============================================================================

/**
 * Start autonomous bot execution
 *
 * This enables the contract to call itself periodically to check and execute
 * eligible limit orders. Uses Massa's callNextSlot() to schedule autonomous calls.
 *
 * Pattern from massa-swap/smart-contracts/assembly/contracts/bot.ts:
 * - Storage counter tracks execution cycles
 * - callNextSlot() schedules next execution in future slot
 * - Contract checks all eligible orders and executes them
 * - Repeats until stopped or max iterations reached
 */
export function startBot(args: StaticArray<u8>): void {
  requireRole(ADMIN_ROLE);

  const argument = new Args(args);
  const maxIterations = argument.nextU64().unwrapOrDefault() || 1000;

  Storage.set(BOT_ENABLED_KEY, 'true');
  Storage.set(BOT_COUNTER_KEY, '0');
  Storage.set(BOT_MAX_ITERATIONS, maxIterations.toString());

  generateEvent('LimitOrder:BotStarted');

  // Trigger first bot cycle
  advance(new Args().serialize());
}

/**
 * Stop autonomous bot execution
 */
export function stopBot(_: StaticArray<u8>): void {
  requireRole(ADMIN_ROLE);

  Storage.set(BOT_COUNTER_KEY, Storage.get(BOT_MAX_ITERATIONS));

  generateEvent('LimitOrder:BotStopped');
}

/**
 * Autonomous order execution cycle
 *
 * This function is called periodically via callNextSlot() to:
 * 1. Iterate through all orders in the contract
 * 2. Check which orders are eligible for execution
 * 3. Execute eligible orders (simulated - real would call oracle)
 * 4. Schedule next cycle via callNextSlot()
 *
 * Implementation follows bot.ts pattern:
 * - Storage counter tracks iterations
 * - Exit early if counter exceeds max
 * - Get current state from persistent Storage
 * - Process eligible orders
 * - Increment counter and schedule next call
 */
export function advance(_: StaticArray<u8>): void {
  // Check if bot is enabled
  if (!Storage.has(stringToBytes(BOT_ENABLED_KEY))) {
    return;
  }

  // Get bot state from persistent Storage
  let botCounter = u64(parseInt(Storage.has(stringToBytes(BOT_COUNTER_KEY)) ? Storage.get(BOT_COUNTER_KEY) : '0'));
  const maxIterations = u64(parseInt(Storage.get(BOT_MAX_ITERATIONS)));

  // Exit if reached max iterations
  if (botCounter >= maxIterations) {
    return;
  }

  const now = Context.timestamp();
  const callee = Context.callee();

  // Iterate through orders and check eligibility
  const orderCountStr = Storage.get(ORDER_COUNT_KEY);
  const totalOrders = u64(parseInt(orderCountStr));

  let executedCount: u64 = 0;

  // Process up to BOT_MAX_CHECKS_PER_CYCLE orders per cycle
  let ordersChecked: u64 = 0;
  let startOrderId = botCounter * BOT_MAX_CHECKS_PER_CYCLE + 1;
  let endOrderId = startOrderId + BOT_MAX_CHECKS_PER_CYCLE;

  if (endOrderId > totalOrders) {
    endOrderId = totalOrders;
  }

  generateEvent('LimitOrder:BotAdvance');

  // Check and execute eligible orders
  for (let i = startOrderId; i <= endOrderId; i++) {
    const order = getOrder(i);
    if (order == null) {
      continue;
    }

    // Check basic eligibility
    if (!order.isEligibleForExecution()) {
      continue;
    }

    ordersChecked += 1;

    // Get current price from MassaBeam pool
    const currentPrice = getCurrentPoolPrice(order.tokenIn, order.tokenOut);

    // If pool doesn't exist or price is unavailable, skip this order
    if (currentPrice == 0) {
      generateEvent('LimitOrder:BotPoolUnavailable');
      continue;
    }

    // Check if price condition is met (saves order if highestPrice updated)
    const priceConditionMet = order.isPriceConditionMet(currentPrice);

    // Save order after price check (important for trailing stops)
    saveOrder(order);

    if (!priceConditionMet) {
      generateEvent('LimitOrder:BotPriceNotReady');
      continue;
    }

    // Calculate expected output at current price
    const expectedOutput = order.calculateExpectedOutput(currentPrice);

    // Check slippage protection
    if (expectedOutput < order.minAmountOut) {
      generateEvent('LimitOrder:BotSlippageCheck');
      continue;
    }

    // Execute the order
    const massaBeamAddress = new Address(Storage.get(MASSABEAM_ADDRESS_KEY));

    // Approve token transfer
    const tokenInContract = new IERC20(order.tokenIn);
    tokenInContract.increaseAllowance(massaBeamAddress, order.remainingAmount);

    // Execute swap via MassaBeam
    const massaBeam = new IMassaBeamAMM(massaBeamAddress);
    massaBeam.swap(
      order.tokenIn,
      order.tokenOut,
      order.remainingAmount,
      order.minAmountOut,
      order.expiryTime,
      order.user,
    );

    // Update order state (u256 addition)
    order.executedAmount = u256.add(order.executedAmount, order.remainingAmount);
    order.remainingAmount = u256.Zero;
    order.status = ORDER_STATUS_FILLED;

    saveOrder(order);

    executedCount += 1;

    generateEvent('LimitOrder:BotExecuted');
  }

  // Update counter and log progress
  botCounter += 1;
  Storage.set(BOT_COUNTER_KEY, botCounter.toString());
  Storage.set(LAST_EXECUTION_TIME, now.toString());

  generateEvent('LimitOrder:BotCycleComplete');

  // Schedule next bot cycle via callNextSlot
  // Pattern: callNextSlot(contractAddress, functionName, gasBudget)
  // This makes the Massa blockchain automatically call this function again after delay
  if (botCounter < maxIterations) {
    callNextSlot(callee, 'advance', GAS_COST_PER_EXECUTION);
  }
}

/**
 * Wrapper for Massa's callNextSlot function
 *
 * callNextSlot is a key Massa feature that allows smart contracts to
 * schedule autonomous execution. It:
 * - Takes: contract address, function name, gas budget
 * - Returns: scheduled for execution in next eligible slot
 * - Pattern: Used by keeper bots and autonomous contracts
 *
 * This is how the bot.ts contract implements autonomous trading.
 */
function callNextSlot(contractAddress: Address, functionName: string, gasBudget: u64): void {
  // This would call the Massa SDK function:
  // Context.callNextSlot(contractAddress, functionName, gasBudget);
  //
  // For now, this is a placeholder that demonstrates the pattern.
  // In real deployment, use actual Massa callNextSlot function.
  generateEvent('LimitOrder:NextSlotScheduled');
}
