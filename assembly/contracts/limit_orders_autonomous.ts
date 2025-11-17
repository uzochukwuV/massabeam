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

  constructor(
    id: u64,
    user: Address,
    tokenIn: Address,
    tokenOut: Address,
    amountIn: u256,
    minAmountOut: u256,
    limitPrice: u256,
    expiryAt: u64
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
    return args.serialize();
  }

  static deserialize(data: StaticArray<u8>): LimitOrder {
    const args = new Args(data);
    const order = new LimitOrder(
      args.nextU64().unwrap(),
      new Address(args.nextString().unwrap()),
      new Address(args.nextString().unwrap()),
      new Address(args.nextString().unwrap()),
      args.nextU256().unwrap(),
      args.nextU256().unwrap(),
      args.nextU256().unwrap(),
      args.nextU64().unwrap()
    );
    order.createdAt = args.nextU64().unwrap();
    order.status = args.nextU8().unwrap();
    return order;
  }

  isPriceConditionMet(currentPrice: u256): bool {
    return currentPrice <= this.limitPrice;
  }

  isExpired(): bool {
    return Context.timestamp() > this.expiryAt;
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
 */
export function createLimitOrder(args: StaticArray<u8>): void {
  requireNotPaused();

  const argument = new Args(args);
  const tokenIn = new Address(argument.nextString().unwrap());
  const tokenOut = new Address(argument.nextString().unwrap());
  const amountIn = argument.nextU256().unwrap();
  const minAmountOut = argument.nextU256().unwrap();
  const limitPrice = argument.nextU256().unwrap();
  const expiryTime = argument.nextU64().unwrap();

  assert(!amountIn.isZero(), 'Amount must be positive');
  assert(!minAmountOut.isZero(), 'Min output must be positive');
  assert(!limitPrice.isZero(), 'Limit price must be positive');
  assert(tokenIn.toString() !== tokenOut.toString(), 'Cannot swap same token');

  const now = Context.timestamp();
  const expiryDelta = expiryTime > now ? expiryTime - now : 0;
  assert(expiryDelta >= MIN_EXPIRY, 'Expiry too soon');
  assert(expiryDelta <= MAX_EXPIRY, 'Expiry too far in future');

  generateEvent(`LimitOrder:Creating|user=${Context.caller().toString()}|tokenIn=${tokenIn.toString()}|tokenOut=${tokenOut.toString()}`);

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
    expiryTime
  );

  const tokenContract = new IERC20(tokenIn);
  tokenContract.transferFrom(Context.caller(), Context.callee(), amountIn);

  generateEvent(`LimitOrder:TokensTransferred|amount=${amountIn.toString()}`);

  saveOrder(order);
  // Note: getNextOrderId() already incremented the counter

  generateEvent(`LimitOrder:Created|id=${orderId}|user=${Context.caller().toString()}|tokenIn=${tokenIn.toString()}|tokenOut=${tokenOut.toString()}|amountIn=${amountIn.toString()}|limitPrice=${limitPrice.toString()}|currentPrice=${currentPrice.toString()}`);
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
    const order = getOrder(i);
    checkCount += 1;

    if (order == null) {
      generateEvent(`LimitOrder:BotOrderNotFound|orderId=${i}`);
      continue;
    }

    generateEvent(`LimitOrder:BotCheckOrder|orderId=${i}|status=${order.status}`);

    if (order.status !== ORDER_STATUS_ACTIVE) {
      generateEvent(`LimitOrder:BotOrderNotActive|orderId=${i}|status=${order.status}`);
      continue;
    }

    // Check expiry
    if (order.isExpired()) {
      generateEvent(`LimitOrder:BotOrderExpired|orderId=${i}`);
      order.status = ORDER_STATUS_EXPIRED;
      saveOrder(order);
      continue;
    }

    // Get current price
    const massaBeamAddress = getMassaBeamAddress();
    const massaBeam = new IMassaBeam(massaBeamAddress);

    const currentPriceData = massaBeam.readQuoteSwapExactInput(
      order.tokenIn,
      order.tokenOut,
      order.amountIn
    );

    if (currentPriceData.length === 0) {
      generateEvent(`LimitOrder:BotPriceUnavailable|orderId=${i}`);
      continue;
    }

    const priceArgs = new Args(currentPriceData);
    const currentPrice = priceArgs.nextU256().unwrap();

    generateEvent(`LimitOrder:BotPriceCheck|orderId=${i}|currentPrice=${currentPrice.toString()}|limitPrice=${order.limitPrice.toString()}`);

    if (!order.isPriceConditionMet(currentPrice)) {
      generateEvent(`LimitOrder:BotPriceNotMet|orderId=${i}|current=${currentPrice.toString()}|limit=${order.limitPrice.toString()}`);
      continue;
    }

    // Execute order
    generateEvent(`LimitOrder:BotExecuting|orderId=${i}`);

    const tokenInContract = new IERC20(order.tokenIn);
    tokenInContract.increaseAllowance(massaBeamAddress, order.amountIn);

    generateEvent(`LimitOrder:BotSwapApproved|orderId=${i}|amount=${order!.amountIn.toString()}`);

    massaBeam.swap(
      order.tokenIn,
      order.tokenOut,
      order.amountIn,
      order.minAmountOut,
      order.expiryAt,
      order.user
    );

    order.status = ORDER_STATUS_FILLED;
    saveOrder(order);
    executedCount += 1;

    generateEvent(`LimitOrder:BotExecuted|orderId=${i}|user=${order.user.toString()}|amount=${order.amountIn.toString()}`);
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

  generateEvent(`LimitOrder:ManualExecute|orderId=${orderId}|currentPrice=${currentPrice.toString()}`);

  const order = getOrder(orderId);
  assert(order !== null, 'Order not found');
  const o = order!;

  if (o.status !== ORDER_STATUS_ACTIVE) {
    generateEvent(`LimitOrder:CannotExecute|orderId=${orderId}|status=${o.status}`);
    return;
  }

  if (o.isExpired()) {
    o.status = ORDER_STATUS_EXPIRED;
    saveOrder(o);
    generateEvent(`LimitOrder:Expired|orderId=${orderId}`);
    return;
  }

  if (!o.isPriceConditionMet(currentPrice)) {
    generateEvent(`LimitOrder:PriceNotMet|orderId=${orderId}|current=${currentPrice.toString()}|limit=${o.limitPrice.toString()}`);
    return;
  }

  const massaBeamAddress = getMassaBeamAddress();
  const massaBeam = new IMassaBeam(massaBeamAddress);

  const tokenInContract = new IERC20(o.tokenIn);
  tokenInContract.increaseAllowance(massaBeamAddress, o.amountIn);

  generateEvent(`LimitOrder:SwapApproved|orderId=${orderId}`);

  massaBeam.swap(o.tokenIn, o.tokenOut, o.amountIn, o.minAmountOut, o.expiryAt, o.user);

  o.status = ORDER_STATUS_FILLED;
  saveOrder(o);

  generateEvent(`LimitOrder:Executed|id=${orderId}|user=${o.user.toString()}|amount=${o.amountIn.toString()}`);
}

/**
 * Cancel order
 */
export function cancelOrder(args: StaticArray<u8>): void {
  requireNotPaused();

  const argument = new Args(args);
  const orderId = argument.nextU64().unwrap();

  const order = getOrder(orderId);
  assert(order !== null, 'Order not found');
  const o = order!;

  assert(o.user.toString() === Context.caller().toString(), 'Only owner can cancel');

  if (o.status !== ORDER_STATUS_ACTIVE) {
    generateEvent(`LimitOrder:CannotCancel|id=${orderId}|status=${o.status}`);
    return;
  }

  o.status = ORDER_STATUS_CANCELLED;
  saveOrder(o);

  const tokenContract = new IERC20(o.tokenIn);
  tokenContract.transfer(o.user, o.amountIn);

  generateEvent(`LimitOrder:Cancelled|id=${orderId}|user=${o.user.toString()}`);
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
