/**
 * MassaBeam Limit Orders - Autonomous Execution
 *
 * Follows recurring_orders.ts pattern:
 * - Autonomous bot execution via callNextSlot
 * - Batch processing of limit orders
 * - Comprehensive event tracking for all bot stages
 * - Price validation before execution
 * - Storage with consistent stringToBytes() keys
 *
 * Bot Execution Flow:
 * 1. startBot() - Enable autonomous execution, schedule first advance()
 * 2. advance() - Check all active orders, execute eligible ones, schedule next
 * 3. callNextSlot() - Schedule advance() in next blockchain slot
 * 4. Event emissions track every stage for off-chain monitoring
 *
 * @version 2.1.0
 * @license MIT
 */

import {
  Address,
  asyncCall,
  Context,
  generateEvent,
  Slot,
  Storage,
} from '@massalabs/massa-as-sdk';
import { Args, stringToBytes, bytesToString } from '@massalabs/as-types';
import { u256 } from 'as-bignum/assembly/integer/u256';
import { IERC20 } from './interfaces/IERC20';
import { IMassaBeam } from './interfaces/IMassaBeam';

// ============================================================================
// CONSTANTS
// ============================================================================

// Order status constants
export const ORDER_STATUS_ACTIVE: u8 = 0;
export const ORDER_STATUS_FILLED: u8 = 1;
export const ORDER_STATUS_CANCELLED: u8 = 2;
export const ORDER_STATUS_EXPIRED: u8 = 3;

// Order type constants
export const ORDER_TYPE_BUY: u8 = 0;
export const ORDER_TYPE_SELL: u8 = 1;

// Time constraints
export const MIN_EXPIRY: u64 = 60;
export const MAX_EXPIRY: u64 = 365 * 24 * 60 * 60;

// Storage keys
export const ORDER_PREFIX: string = 'order:';
export const ORDER_COUNT_KEY: string = 'order_count';
export const USER_ORDERS_PREFIX: string = 'user_orders:';
export const MASSABEAM_KEY: string = 'massabeam_address';
export const PAUSED_KEY: string = 'paused';

// Autonomous bot configuration
export const BOT_ENABLED_KEY: string = 'bot_enabled';
export const BOT_COUNTER_KEY: string = 'bot_counter';
export const BOT_MAX_ITERATIONS: string = 'bot_max_iterations';
export const BOT_TOTAL_EXECUTED: string = 'bot_total_executed';
export const BOT_START_TIME: string = 'bot_start_time';

// Bot execution parameters
export const BOT_CHECK_INTERVAL: u64 = 3; // Check every 3 slots
export const BOT_MAX_ORDERS_PER_CYCLE: u64 = 10; // Process max 10 orders per cycle
export const GAS_COST_PER_EXECUTION: u64 = 500_000_000;

// ============================================================================
// STORAGE HELPER FUNCTIONS - Consistent Key Management
// ============================================================================

/**
 * Get a counter value from storage
 */
function getCounter(key: string): u64 {
  const keyBytes = stringToBytes(key);
  if (!Storage.has(keyBytes)) {
    return 0;
  }
  return u64(parseInt(bytesToString(Storage.get<StaticArray<u8>>(keyBytes))));
}

/**
 * Set a counter value in storage
 */
function setCounter(key: string, value: u64): void {
  Storage.set<StaticArray<u8>>(
    stringToBytes(key),
    stringToBytes(value.toString())
  );
}

/**
 * Increment a counter by 1 and return new value
 */
function incrementCounter(key: string): u64 {
  const current = getCounter(key);
  const next = current + 1;
  setCounter(key, next);
  return next;
}

/**
 * Get a string value from storage
 */
function getString(key: string): string {
  const keyBytes = stringToBytes(key);
  if (!Storage.has(keyBytes)) {
    return '';
  }
  return bytesToString(Storage.get<StaticArray<u8>>(keyBytes));
}

/**
 * Set a string value in storage
 */
function setString(key: string, value: string): void {
  Storage.set<StaticArray<u8>>(
    stringToBytes(key),
    stringToBytes(value)
  );
}

/**
 * Get a boolean value from storage
 */
function getBool(key: string): bool {
  return getString(key) === 'true';
}

/**
 * Set a boolean value in storage
 */
function setBool(key: string, value: bool): void {
  setString(key, value ? 'true' : 'false');
}

// ============================================================================
// DATA STRUCTURES
// ============================================================================

/**
 * Limit Order - Compact structure
 */
export class LimitOrder {
  id: u64;
  user: Address;
  tokenIn: Address;
  tokenOut: Address;
  amountIn: u256;
  minAmountOut: u256;
  limitPrice: u256;
  createdAt: u64;
  expiryAt: u64;
  status: u8;
  orderType: u8; // BUY (0) or SELL (1)

  constructor(
    id: u64,
    user: Address,
    tokenIn: Address,
    tokenOut: Address,
    amountIn: u256,
    minAmountOut: u256,
    limitPrice: u256,
    expiryAt: u64,
    orderType: u8 = ORDER_TYPE_BUY
  ) {
    this.id = id;
    this.user = user;
    this.tokenIn = tokenIn;
    this.tokenOut = tokenOut;
    this.amountIn = amountIn;
    this.minAmountOut = minAmountOut;
    this.limitPrice = limitPrice;
    this.createdAt = Context.timestamp();
    this.expiryAt = expiryAt;
    this.status = ORDER_STATUS_ACTIVE;
    this.orderType = orderType;
  }

  serialize(): StaticArray<u8> {
    const args = new Args();
    args.add(this.id);
    args.add(this.user.toString());
    args.add(this.tokenIn.toString());
    args.add(this.tokenOut.toString());
    args.add(this.amountIn);
    args.add(this.minAmountOut);
    args.add(this.limitPrice);
    args.add(this.createdAt);
    args.add(this.expiryAt);
    args.add(this.status);
    args.add(this.orderType);
    return args.serialize();
  }

  static deserialize(data: StaticArray<u8>): LimitOrder {
    const args = new Args(data);
    const id = args.nextU64().unwrap();
    const user = new Address(args.nextString().unwrap());
    const tokenIn = new Address(args.nextString().unwrap());
    const tokenOut = new Address(args.nextString().unwrap());
    const amountIn = args.nextU256().unwrap();
    const minAmountOut = args.nextU256().unwrap();
    const limitPrice = args.nextU256().unwrap();
    const createdAt = args.nextU64().unwrap();
    const expiryAt = args.nextU64().unwrap();
    const status = args.nextU8().unwrap();

    // Try to read orderType - if fails, this is an old format order
    let orderType = ORDER_TYPE_BUY;
    
    const readType = args.nextU8().unwrap();
    // Validate it's a valid order type
    if (readType === ORDER_TYPE_BUY || readType === ORDER_TYPE_SELL) {
      orderType = readType;
    }
    // If invalid value, keep orderType as BUY


    const order = new LimitOrder(
      id,
      user,
      tokenIn,
      tokenOut,
      amountIn,
      minAmountOut,
      limitPrice,
      expiryAt,
      orderType
    );
    order.createdAt = createdAt;
    order.status = status;
    return order;
  }

  isPriceConditionMet(currentPrice: u256): bool {
    if (this.orderType === ORDER_TYPE_BUY) {
      // BUY order: execute when current price is lower or equal to limit price
      return currentPrice <= this.limitPrice;
    } else {
      // SELL order: execute when current price is greater or equal to limit price
      return currentPrice >= this.limitPrice;
    }
  }

  isExpired(): bool {
    return Context.timestamp() > this.expiryAt;
  }

  isTimeValid(): bool {
    const now = Context.timestamp();
    return now <= this.expiryAt;
  }
}

// ============================================================================
// STORAGE FUNCTIONS
// ============================================================================

function getOrder(orderId: u64): LimitOrder | null {
  const keyBytes = stringToBytes(ORDER_PREFIX + orderId.toString());
  if (!Storage.has(keyBytes)) {
    return null;
  }
  const orderData = Storage.get<StaticArray<u8>>(keyBytes);
  return LimitOrder.deserialize(orderData);
}

function saveOrder(order: LimitOrder): void {
  const keyBytes = stringToBytes(ORDER_PREFIX + order.id.toString());
  Storage.set<StaticArray<u8>>(keyBytes, order.serialize());
}

function getNextOrderId(): u64 {
  return incrementCounter(ORDER_COUNT_KEY);
}

function getOrderCount(): u64 {
  return getCounter(ORDER_COUNT_KEY);
}

function isPaused(): bool {
  return getBool(PAUSED_KEY);
}

function requireNotPaused(): void {
  assert(!isPaused(), 'Contract is paused');
}

function getMassaBeamAddress(): Address {
  const address = getString(MASSABEAM_KEY);
  assert(address.length > 0, 'MassaBeam address not set');
  return new Address(address);
}

/**
 * Validate order type
 */
function isValidOrderType(orderType: u8): bool {
  return orderType === ORDER_TYPE_BUY || orderType === ORDER_TYPE_SELL;
}

/**
 * Get order type name for events
 */
function getOrderTypeName(orderType: u8): string {
  if (orderType === ORDER_TYPE_BUY) {
    return 'BUY';
  } else if (orderType === ORDER_TYPE_SELL) {
    return 'SELL';
  }
  return 'UNKNOWN';
}

// ============================================================================
// EXTERNAL FUNCTIONS
// ============================================================================

/**
 * Initialize contract
 */
export function constructor(args: StaticArray<u8>): void {
  assert(Context.isDeployingContract(), 'Constructor only on deployment');

  const argument = new Args(args);
  const massaBeamAddress = argument.nextString().unwrap();

  setString(MASSABEAM_KEY, massaBeamAddress);
  setCounter(ORDER_COUNT_KEY, 0);
  setBool(PAUSED_KEY, false);
  setBool(BOT_ENABLED_KEY, false);
  setCounter(BOT_COUNTER_KEY, 0);
  setCounter(BOT_TOTAL_EXECUTED, 0);

  generateEvent(`LimitOrders:Initialized|massabeam=${massaBeamAddress}`);
}

/**
 * Create a limit order
 * Args: tokenIn, tokenOut, amountIn, minAmountOut, limitPrice, duration, orderType
 */
export function createLimitOrder(args: StaticArray<u8>): void {
  requireNotPaused();

  const argument = new Args(args);
  const tokenIn = new Address(argument.nextString().unwrap());
  const tokenOut = new Address(argument.nextString().unwrap());
  const amountIn = argument.nextU256().unwrap();
  const minAmountOut = argument.nextU256().unwrap();
  const limitPrice = argument.nextU256().unwrap();
  const duration = argument.nextU64().unwrap();
  const orderType = argument.nextU8().unwrapOrDefault() || ORDER_TYPE_BUY;

  assert(!amountIn.isZero(), 'Amount must be positive');
  assert(!minAmountOut.isZero(), 'Min output must be positive');
  assert(!limitPrice.isZero(), 'Limit price must be positive');
  assert(tokenIn.toString() !== tokenOut.toString(), 'Cannot swap same token');
  assert(isValidOrderType(orderType), 'Invalid order type: must be BUY (0) or SELL (1)');

  const now = Context.timestamp();

  assert(duration >= MIN_EXPIRY, `Order duration must be at least ${MIN_EXPIRY} seconds`);
  assert(duration <= MAX_EXPIRY, `Order duration must not exceed ${MAX_EXPIRY} seconds`);

  const expiryAt = now + duration;

  generateEvent(
    `LimitOrder:Creating|user=${Context.caller().toString()}|type=${getOrderTypeName(
      orderType
    )}|tokenIn=${tokenIn.toString()}|tokenOut=${tokenOut.toString()}`
  );

  const massaBeamAddress = getMassaBeamAddress();
  const massaBeam = new IMassaBeam(massaBeamAddress);

  const poolData = massaBeam.readPool(tokenIn, tokenOut);
  assert(poolData.length > 0, 'Pool does not exist');

  const poolArgs = new Args(poolData);
  const poolExists = poolArgs.nextBool().unwrap();
  assert(poolExists, 'Pool does not exist for this token pair');

  generateEvent(`LimitOrder:PoolVerified|poolExists=true`);

  const currentPriceData = massaBeam.readQuoteSwapExactInput(tokenIn, tokenOut, amountIn);
  const priceArgs = new Args(currentPriceData);
  const currentPrice = priceArgs.nextU256().unwrap();
  assert(!currentPrice.isZero(), 'Could not determine current price');

  generateEvent(`LimitOrder:PriceCheck|currentPrice=${currentPrice.toString()}|limitPrice=${limitPrice.toString()}`);

  const orderId = getNextOrderId();
  const order = new LimitOrder(
    orderId,
    Context.caller(),
    tokenIn,
    tokenOut,
    amountIn,
    minAmountOut,
    limitPrice,
    expiryAt,
    orderType
  );

  const tokenContract = new IERC20(tokenIn);
  tokenContract.transferFrom(Context.caller(), Context.callee(), amountIn);

  generateEvent(`LimitOrder:TokensTransferred|amount=${amountIn.toString()}`);

  saveOrder(order);
  // Note: getNextOrderId() already incremented the counter

  const eventMsg =
    `LimitOrder:Created|id=${orderId}|user=${Context.caller().toString()}` +
    `|type=${getOrderTypeName(orderType)}|tokenIn=${tokenIn.toString()}` +
    `|tokenOut=${tokenOut.toString()}|amountIn=${amountIn.toString()}` +
    `|limitPrice=${limitPrice.toString()}|currentPrice=${currentPrice.toString()}` +
    `|expiryAt=${expiryAt}`;
  generateEvent(eventMsg);
}

/**
 * Start autonomous bot execution
 * Args: maxIterations (u64) - max cycles to run
 */
export function startBot(args: StaticArray<u8>): void {
  const argument = new Args(args);
  const maxIterations = argument.nextU64().unwrapOrDefault() || 1000;

  generateEvent(`LimitOrder:BotStarting|maxIterations=${maxIterations}`);

  setBool(BOT_ENABLED_KEY, true);
  setCounter(BOT_COUNTER_KEY, 0);
  setCounter(BOT_MAX_ITERATIONS, maxIterations);
  setCounter(BOT_START_TIME, Context.timestamp());

  generateEvent(`LimitOrder:BotStarted|maxIterations=${maxIterations}|timestamp=${Context.timestamp()}`);

  advance(new Args().serialize());
}

/**
 * Stop autonomous bot
 */
export function stopBot(_: StaticArray<u8>): void {
  const botEnabled = getBool(BOT_ENABLED_KEY);

  if (!botEnabled) {
    generateEvent(`LimitOrder:BotAlreadyStopped`);
    return;
  }

  setBool(BOT_ENABLED_KEY, false);

  const currentCounter = getCounter(BOT_COUNTER_KEY);
  const totalExecuted = getCounter(BOT_TOTAL_EXECUTED);

  generateEvent(`LimitOrder:BotStopped|cycles=${currentCounter}|totalExecuted=${totalExecuted}`);
}

/**
 * Autonomous execution cycle
 * Processes orders in batches and reschedules itself via callNextSlot
 */
export function advance(_: StaticArray<u8>): void {
  const enabled = getBool(BOT_ENABLED_KEY);
  if (!enabled) {
    generateEvent(`LimitOrder:BotDisabled`);
    return;
  }

  generateEvent(`LimitOrder:BotAdvanceStarted`);

  let botCounter = getCounter(BOT_COUNTER_KEY);
  const maxIterations = getCounter(BOT_MAX_ITERATIONS);

  generateEvent(`LimitOrder:BotState|counter=${botCounter}|maxIterations=${maxIterations}`);

  if (botCounter >= maxIterations) {
    generateEvent(`LimitOrder:BotMaxIterationsReached|counter=${botCounter}|max=${maxIterations}`);
    setBool(BOT_ENABLED_KEY, false);
    return;
  }

  const totalOrders = getOrderCount();
  const callee = Context.callee();

  generateEvent(`LimitOrder:BotProcessing|totalOrders=${totalOrders}|maxPerCycle=${BOT_MAX_ORDERS_PER_CYCLE}`);

  let startOrderId = botCounter * BOT_MAX_ORDERS_PER_CYCLE + 1;
  let endOrderId = startOrderId + BOT_MAX_ORDERS_PER_CYCLE;

  if (endOrderId > totalOrders) {
    endOrderId = totalOrders;
  }

  generateEvent(`LimitOrder:BotCheckingOrders|start=${startOrderId}|end=${endOrderId}`);

  let executedCount: u64 = 0;
  let checkCount: u64 = 0;

  for (let i = startOrderId; i <= endOrderId; i++) {
    const fetchedOrder = getOrder(i);
    checkCount += 1;

    if (fetchedOrder == null) {
      generateEvent(`LimitOrder:BotOrderNotFound|orderId=${i}`);
      continue;
    }

    const currentOrder: LimitOrder = fetchedOrder;

    const orderTypeStr = getOrderTypeName(currentOrder.orderType);
    generateEvent(
      `LimitOrder:BotCheckOrder|orderId=${i}|status=${currentOrder.status}|type=${orderTypeStr}`
    );

    if (currentOrder.status !== ORDER_STATUS_ACTIVE) {
      generateEvent(
        `LimitOrder:BotOrderNotActive|orderId=${i}|status=${currentOrder.status}`
      );
      continue;
    }

    // Check expiry
    if (currentOrder.isExpired()) {
      generateEvent(`LimitOrder:BotOrderExpired|orderId=${i}|type=${orderTypeStr}`);
      currentOrder.status = ORDER_STATUS_EXPIRED;
      saveOrder(currentOrder);
      continue;
    }

    // Get current price
    const massaBeamAddress = getMassaBeamAddress();
    const massaBeam = new IMassaBeam(massaBeamAddress);

    const currentPriceData = massaBeam.readQuoteSwapExactInput(
      currentOrder.tokenIn,
      currentOrder.tokenOut,
      currentOrder.amountIn
    );

    if (currentPriceData.length === 0) {
      generateEvent(`LimitOrder:BotPriceUnavailable|orderId=${i}`);
      continue;
    }

    const priceArgs = new Args(currentPriceData);
    const currentPrice = priceArgs.nextU256().unwrap();

    const priceCheckMsg =
      `LimitOrder:BotPriceCheck|orderId=${i}|type=${orderTypeStr}` +
      `|currentPrice=${currentPrice.toString()}` +
      `|limitPrice=${currentOrder.limitPrice.toString()}`;
    generateEvent(priceCheckMsg);

    if (!currentOrder.isPriceConditionMet(currentPrice)) {
      const priceNotMetMsg =
        `LimitOrder:BotPriceNotMet|orderId=${i}|type=${orderTypeStr}` +
        `|current=${currentPrice.toString()}` +
        `|limit=${currentOrder.limitPrice.toString()}`;
      generateEvent(priceNotMetMsg);
      continue;
    }

    // Execute order
    generateEvent(`LimitOrder:BotExecuting|orderId=${i}`);

    const tokenInContract = new IERC20(currentOrder.tokenIn);
    tokenInContract.increaseAllowance(massaBeamAddress, currentOrder.amountIn);

    generateEvent(`LimitOrder:BotSwapApproved|orderId=${i}|amount=${currentOrder.amountIn.toString()}`);

    massaBeam.swap(
      currentOrder.tokenIn,
      currentOrder.tokenOut,
      currentOrder.amountIn,
      currentOrder.minAmountOut,
      currentOrder.expiryAt,
      currentOrder.user
    );

    currentOrder.status = ORDER_STATUS_FILLED;
    saveOrder(currentOrder);
    executedCount += 1;

    generateEvent(`LimitOrder:BotExecuted|orderId=${i}|user=${currentOrder.user.toString()}|amount=${currentOrder.amountIn.toString()}`);
  }

  // Update counters
  botCounter += 1;
  setCounter(BOT_COUNTER_KEY, botCounter);

  const totalExecuted = getCounter(BOT_TOTAL_EXECUTED) + executedCount;
  setCounter(BOT_TOTAL_EXECUTED, totalExecuted);

  generateEvent(`LimitOrder:BotCycleComplete|cycle=${botCounter}|checked=${checkCount}|executed=${executedCount}|totalExecuted=${totalExecuted}`);

  // Schedule next cycle
  if (botCounter < maxIterations) {
    generateEvent(`LimitOrder:BotSchedulingNext|cycle=${botCounter}|nextCycle=${botCounter + 1}`);
    callNextSlot(callee, 'advance', GAS_COST_PER_EXECUTION);
  } else {
    generateEvent(`LimitOrder:BotCompleted|totalCycles=${botCounter}|totalExecuted=${totalExecuted}`);
    setBool(BOT_ENABLED_KEY, false);
  }
}


function callNextSlot(contractAddress: Address, functionName: string, gasBudget: u64): void {
  // Get current period and thread
  const currentPeriod = Context.currentPeriod();
  const currentThread = Context.currentThread();

  // Calculate next slot (next thread in current period, or first thread in next period)
  let nextPeriod = currentPeriod;
  let nextThread = currentThread + 1;

  if (nextThread >= 32) {
    nextPeriod = currentPeriod + 1;
    nextThread = 0;
  }

  // Schedule async call for next slot
  asyncCall(
    contractAddress,
    functionName,
    new Slot(nextPeriod, nextThread),
    new Slot(nextPeriod + 10, nextThread), // End slot = 5 periods later
    gasBudget,
    0, // Coins to send
    new Args().serialize()
  );

  generateEvent('LimitOrder:NextSlotScheduled');
}

/**
 * Manual order execution (for testing/emergency)
 */
export function executeLimitOrder(args: StaticArray<u8>): void {
  requireNotPaused();

  const argument = new Args(args);
  const orderId = argument.nextU64().unwrap();
  const currentPrice = argument.nextU256().unwrap();

  const foundOrder = getOrder(orderId);
  assert(foundOrder !== null, 'Order not found');
  const existingOrder: LimitOrder = foundOrder as LimitOrder;

  const orderTypeStr = getOrderTypeName(existingOrder.orderType);
  generateEvent(
    `LimitOrder:ManualExecute|orderId=${orderId}|type=${orderTypeStr}|currentPrice=${currentPrice.toString()}`
  );

  if (existingOrder.status !== ORDER_STATUS_ACTIVE) {
    generateEvent(
      `LimitOrder:CannotExecute|orderId=${orderId}|status=${existingOrder.status}`
    );
    return;
  }

  if (existingOrder.isExpired()) {
    existingOrder.status = ORDER_STATUS_EXPIRED;
    saveOrder(existingOrder);
    generateEvent(
      `LimitOrder:Expired|orderId=${orderId}|type=${orderTypeStr}`
    );
    return;
  }

  if (!existingOrder.isPriceConditionMet(currentPrice)) {
    const priceMsg =
      `LimitOrder:PriceNotMet|orderId=${orderId}|type=${orderTypeStr}` +
      `|current=${currentPrice.toString()}` +
      `|limit=${existingOrder.limitPrice.toString()}`;
    generateEvent(priceMsg);
    return;
  }

  const massaBeamAddress = getMassaBeamAddress();
  const massaBeam = new IMassaBeam(massaBeamAddress);

  const tokenInContract = new IERC20(existingOrder.tokenIn);
  tokenInContract.increaseAllowance(
    massaBeamAddress,
    existingOrder.amountIn
  );

  generateEvent(`LimitOrder:SwapApproved|orderId=${orderId}`);

  massaBeam.swap(
    existingOrder.tokenIn,
    existingOrder.tokenOut,
    existingOrder.amountIn,
    existingOrder.minAmountOut,
    existingOrder.expiryAt,
    existingOrder.user
  );

  existingOrder.status = ORDER_STATUS_FILLED;
  saveOrder(existingOrder);

  const execMsg =
    `LimitOrder:Executed|id=${orderId}|user=${existingOrder.user.toString()}` +
    `|type=${orderTypeStr}|amount=${existingOrder.amountIn.toString()}`;
  generateEvent(execMsg);
}

/**
 * Cancel order
 */
export function cancelOrder(args: StaticArray<u8>): void {
  requireNotPaused();

  const argument = new Args(args);
  const orderId = argument.nextU64().unwrap();

  const foundOrder = getOrder(orderId);
  assert(foundOrder !== null, 'Order not found');
  const existingOrder: LimitOrder = foundOrder as LimitOrder;

  assert(existingOrder.user.toString() === Context.caller().toString(), 'Only owner can cancel');

  if (existingOrder.status !== ORDER_STATUS_ACTIVE) {
    generateEvent(`LimitOrder:CannotCancel|id=${orderId}|status=${existingOrder.status}`);
    return;
  }

  existingOrder.status = ORDER_STATUS_CANCELLED;
  saveOrder(existingOrder);

  const tokenContract = new IERC20(existingOrder.tokenIn);
  tokenContract.transfer(existingOrder.user, existingOrder.amountIn);

  generateEvent(`LimitOrder:Cancelled|id=${orderId}|user=${existingOrder.user.toString()}`);
}

/**
 * Set pause status
 */
export function setPaused(args: StaticArray<u8>): void {
  const argument = new Args(args);
  const paused = argument.nextBool().unwrap();
  setBool(PAUSED_KEY, paused);
  generateEvent(`LimitOrders:${paused ? 'Paused' : 'Unpaused'}`);
}

/**
 * Update MassaBeam address
 */
export function setMassaBeamAddress(args: StaticArray<u8>): void {
  const argument = new Args(args);
  const newAddress = argument.nextString().unwrap();
  setString(MASSABEAM_KEY, newAddress);
  generateEvent(`LimitOrders:MassaBeamUpdated|address=${newAddress}`);
}

// ============================================================================
// READ FUNCTIONS
// ============================================================================

/**
 * Read order by ID
 */
export function readOrder(args: StaticArray<u8>): StaticArray<u8> {
  const argument = new Args(args);
  const orderId = argument.nextU64().unwrap();

  const order = getOrder(orderId);
  if (order === null) {
    return stringToBytes('null');
  }

  return order.serialize();
}

/**
 * Get order count
 */
export function readOrderCount(): StaticArray<u8> {
  const count = getOrderCount();
  return new Args().add(count.toString()).serialize();
}

/**
 * Get bot status
 */
export function readBotStatus(): StaticArray<u8> {
  const enabled = getBool(BOT_ENABLED_KEY);
  const counter = getCounter(BOT_COUNTER_KEY);
  const maxIter = getCounter(BOT_MAX_ITERATIONS);
  const totalExec = getCounter(BOT_TOTAL_EXECUTED);

  return new Args()
    .add(enabled)
    .add(counter)
    .add(maxIter)
    .add(totalExec)
    .serialize();
}

/**
 * Get contract status
 */
export function readContractStatus(): StaticArray<u8> {
  const paused = isPaused();
  const massabeam = getMassaBeamAddress().toString();
  const count = getOrderCount();

  return new Args()
    .add(paused)
    .add(massabeam)
    .add(count)
    .serialize();
}

/**
 * Get all orders for a specific user
 */
export function getUserOrders(args: StaticArray<u8>): StaticArray<u8> {
  const argument = new Args(args);
  const userAddress = new Address(argument.nextString().unwrap());

  const totalOrders = getOrderCount();
  const userOrders: u64[] = [];

  // Iterate through all orders and find user's orders
  for (let i: u64 = 1; i <= totalOrders; i++) {
    const order = getOrder(i);
    if (order != null && order.user.toString() == userAddress.toString()) {
      userOrders.push(i);
    }
  }

  // Serialize the order IDs
  const result = new Args();
  result.add(u64(userOrders.length));
  for (let i = 0; i < userOrders.length; i++) {
    result.add(userOrders[i]);
  }

  return result.serialize();
}

/**
 * Check if an order is eligible for execution
 * Returns: [isEligible: bool, reason: string]
 */
export function isOrderEligible(args: StaticArray<u8>): StaticArray<u8> {
  const argument = new Args(args);
  const orderId = argument.nextU64().unwrap();

  const order = getOrder(orderId);

  if (order === null) {
    return new Args()
      .add(false)
      .add('Order not found')
      .serialize();
  }

  // Check if order is active
  if (order.status !== ORDER_STATUS_ACTIVE) {
    return new Args()
      .add(false)
      .add('Order not active')
      .serialize();
  }

  // Check if expired
  if (order.isExpired()) {
    return new Args()
      .add(false)
      .add('Order expired')
      .serialize();
  }

  // Check if price condition is met
  const massaBeamAddress = getMassaBeamAddress();
  const massaBeam = new IMassaBeam(massaBeamAddress);

  const currentPriceData = massaBeam.readQuoteSwapExactInput(
    order.tokenIn,
    order.tokenOut,
    order.amountIn
  );

  if (currentPriceData.length === 0) {
    return new Args()
      .add(false)
      .add('Cannot determine current price')
      .serialize();
  }

  const priceArgs = new Args(currentPriceData);
  const currentPrice = priceArgs.nextU256().unwrap();

  if (!order.isPriceConditionMet(currentPrice)) {
    const reason =
      `Price not met (${getOrderTypeName(order.orderType)} order): ` +
      `current=${currentPrice.toString()}, ` +
      `limit=${order.limitPrice.toString()}`;
    return new Args().add(false).add(reason).serialize();
  }

  // Order is eligible
  const eligibleMsg =
    `Order eligible for execution (${getOrderTypeName(order.orderType)} order)`;
  return new Args().add(true).add(eligibleMsg).serialize();
}

/**
 * Get all active orders (for monitoring/analytics)
 */
export function getActiveOrders(_: StaticArray<u8>): StaticArray<u8> {
  const totalOrders = getOrderCount();
  const activeOrderIds: u64[] = [];

  for (let i: u64 = 1; i <= totalOrders; i++) {
    const order = getOrder(i);
    if (order != null && order.status === ORDER_STATUS_ACTIVE && !order.isExpired()) {
      activeOrderIds.push(i);
    }
  }

  const result = new Args();
  result.add(u64(activeOrderIds.length));
  for (let i = 0; i < activeOrderIds.length; i++) {
    result.add(activeOrderIds[i]);
  }

  return result.serialize();
}

/**
 * Get orders by status
 */
export function getOrdersByStatus(args: StaticArray<u8>): StaticArray<u8> {
  const argument = new Args(args);
  const status = argument.nextU8().unwrap();

  const totalOrders = getOrderCount();
  const matchingOrders: u64[] = [];

  for (let i: u64 = 1; i <= totalOrders; i++) {
    const order = getOrder(i);
    if (order != null && order.status === status) {
      matchingOrders.push(i);
    }
  }

  const result = new Args();
  result.add(u64(matchingOrders.length));
  for (let i = 0; i < matchingOrders.length; i++) {
    result.add(matchingOrders[i]);
  }

  return result.serialize();
}

/**
 * Get orders expiring soon (within next N seconds)
 * Returns: [count: u64, orderId1: u64, orderId2: u64, ...]
 */
export function getExpiringLimitOrders(args: StaticArray<u8>): StaticArray<u8> {
  const argument = new Args(args);
  const timeWindow = argument.nextU64().unwrap(); // Seconds

  const totalOrders = getOrderCount();
  const expiringOrders: u64[] = [];
  const now = Context.timestamp();

  for (let i: u64 = 1; i <= totalOrders; i++) {
    const order = getOrder(i);
    if (order != null && order.status === ORDER_STATUS_ACTIVE) {
      if (order.expiryAt > now && order.expiryAt <= now + timeWindow) {
        expiringOrders.push(i);
      }
    }
  }

  const result = new Args();
  result.add(u64(expiringOrders.length));
  for (let i = 0; i < expiringOrders.length; i++) {
    result.add(expiringOrders[i]);
  }

  return result.serialize();
}

/**
 * Get user's performance summary
 * Returns: [totalOrders: u64, activeOrders: u64, filledOrders: u64, cancelledOrders: u64, expiredOrders: u64, fillRate: u64]
 */
export function getUserPerformance(args: StaticArray<u8>): StaticArray<u8> {
  const argument = new Args(args);
  const userAddress = new Address(argument.nextString().unwrap());

  const totalOrders = getOrderCount();

  let userTotalOrders: u64 = 0;
  let userActiveOrders: u64 = 0;
  let userFilledOrders: u64 = 0;
  let userCancelledOrders: u64 = 0;
  let userExpiredOrders: u64 = 0;

  for (let i: u64 = 1; i <= totalOrders; i++) {
    const order = getOrder(i);
    if (order != null && order.user.toString() == userAddress.toString()) {
      userTotalOrders++;

      if (order.status === ORDER_STATUS_ACTIVE) {
        userActiveOrders++;
      } else if (order.status === ORDER_STATUS_FILLED) {
        userFilledOrders++;
      } else if (order.status === ORDER_STATUS_CANCELLED) {
        userCancelledOrders++;
      } else if (order.status === ORDER_STATUS_EXPIRED) {
        userExpiredOrders++;
      }
    }
  }

  // Calculate fill rate (filled vs total)
  const fillRate = userTotalOrders > 0
    ? (userFilledOrders * 10000) / userTotalOrders
    : 0;

  const result = new Args();
  result.add(userTotalOrders);
  result.add(userActiveOrders);
  result.add(userFilledOrders);
  result.add(userCancelledOrders);
  result.add(userExpiredOrders);
  result.add(fillRate); // In basis points

  return result.serialize();
}

/**
 * Get platform-wide statistics
 * Returns comprehensive stats for the entire limit order system
 */
export function getPlatformStatistics(_: StaticArray<u8>): StaticArray<u8> {
  const totalOrders = getOrderCount();

  let activeOrders: u64 = 0;
  let filledOrders: u64 = 0;
  let cancelledOrders: u64 = 0;
  let expiredOrders: u64 = 0;

  for (let i: u64 = 1; i <= totalOrders; i++) {
    const order = getOrder(i);
    if (order != null) {
      if (order.status === ORDER_STATUS_ACTIVE) {
        activeOrders++;
      } else if (order.status === ORDER_STATUS_FILLED) {
        filledOrders++;
      } else if (order.status === ORDER_STATUS_CANCELLED) {
        cancelledOrders++;
      } else if (order.status === ORDER_STATUS_EXPIRED) {
        expiredOrders++;
      }
    }
  }

  const enabled = getBool(BOT_ENABLED_KEY);
  const counter = getCounter(BOT_COUNTER_KEY);
  const totalExecuted = getCounter(BOT_TOTAL_EXECUTED);

  const result = new Args();
  result.add(totalOrders);
  result.add(activeOrders);
  result.add(filledOrders);
  result.add(cancelledOrders);
  result.add(expiredOrders);
  result.add(enabled);
  result.add(counter);
  result.add(totalExecuted);

  return result.serialize();
}

/**
 * Get orders by price range
 * Returns orders where limitPrice is within specified range
 */
export function getOrdersByPriceRange(args: StaticArray<u8>): StaticArray<u8> {
  const argument = new Args(args);
  const minPrice = argument.nextU256().unwrap();
  const maxPrice = argument.nextU256().unwrap();

  const totalOrders = getOrderCount();
  const matchingOrders: u64[] = [];

  for (let i: u64 = 1; i <= totalOrders; i++) {
    const order = getOrder(i);
    if (order != null && order.status === ORDER_STATUS_ACTIVE) {
      if (order.limitPrice >= minPrice && order.limitPrice <= maxPrice) {
        matchingOrders.push(i);
      }
    }
  }

  const result = new Args();
  result.add(u64(matchingOrders.length));
  for (let i = 0; i < matchingOrders.length; i++) {
    result.add(matchingOrders[i]);
  }

  return result.serialize();
}

/**
 * Get orders for specific token pair
 * Returns all active orders for tokenIn/tokenOut pair
 */
export function getOrdersByTokenPair(args: StaticArray<u8>): StaticArray<u8> {
  const argument = new Args(args);
  const tokenIn = new Address(argument.nextString().unwrap());
  const tokenOut = new Address(argument.nextString().unwrap());

  const totalOrders = getOrderCount();
  const matchingOrders: u64[] = [];

  for (let i: u64 = 1; i <= totalOrders; i++) {
    const order = getOrder(i);
    if (order != null && order.status === ORDER_STATUS_ACTIVE) {
      if (order.tokenIn.toString() == tokenIn.toString() &&
          order.tokenOut.toString() == tokenOut.toString()) {
        matchingOrders.push(i);
      }
    }
  }

  const result = new Args();
  result.add(u64(matchingOrders.length));
  for (let i = 0; i < matchingOrders.length; i++) {
    result.add(matchingOrders[i]);
  }

  return result.serialize();
}
