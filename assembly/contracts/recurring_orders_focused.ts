/**
 * MassaBeam Recurring Orders - Pure Recurring Functionality
 *
 * Simple recurring order system with:
 * - DCA (Dollar Cost Averaging): Execute at fixed intervals
 * - Trigger-based: Execute when price changes by X%
 * - Recurring execution: Multiple executions until max reached
 * - Price history tracking: Track entry and reference prices
 * - Autonomous bot execution via callNextSlot
 * - Comprehensive event tracking for all executions
 *
 * Execution Modes:
 * 1. INTERVAL: Execute every N seconds regardless of price
 * 2. TRIGGER: Execute when price changes by X% from reference
 *
 * Use Cases:
 * - DCA Strategy: Buy every week for 1 year
 * - Triggered Selling: Sell when price drops 5% (stop loss)
 * - Triggered Buying: Buy when price increases 3% (momentum)
 *
 * @version 1.0.0
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
import { SafeMath256 } from '../libraries/SafeMath';

// ============================================================================
// CONSTANTS
// ============================================================================

// Execution mode constants
export const EXECUTION_MODE_INTERVAL: u8 = 0; // Execute every N seconds
export const EXECUTION_MODE_TRIGGER: u8 = 1;  // Execute when price changes by %

// Order type constants
export const ORDER_TYPE_RECURRING_BUY: u8 = 0;
export const ORDER_TYPE_RECURRING_SELL: u8 = 1;

// Order status constants
export const ORDER_STATUS_ACTIVE: u8 = 0;
export const ORDER_STATUS_COMPLETED: u8 = 1;
export const ORDER_STATUS_PAUSED: u8 = 2;
export const ORDER_STATUS_CANCELLED: u8 = 3;

// Time constraints
export const MIN_INTERVAL: u64 = 60;        // 1 minute minimum
export const MAX_INTERVAL: u64 = 365 * 24 * 60 * 60;  // 1 year maximum
export const MIN_EXPIRY: u64 = 60;
export const MAX_EXPIRY: u64 = 10 * 365 * 24 * 60 * 60;  // 10 years

// Storage keys
export const RECURRING_ORDER_PREFIX: string = 'recurring_order:';
export const RECURRING_ORDER_COUNT_KEY: string = 'recurring_order_count';
export const PRICE_HISTORY_PREFIX: string = 'price_history:';
export const EXECUTION_HISTORY_PREFIX: string = 'execution_history:';
export const MASSABEAM_KEY: string = 'massabeam_address';
export const PAUSED_KEY: string = 'paused';

// Autonomous bot configuration
export const BOT_ENABLED_KEY: string = 'bot_enabled';
export const BOT_COUNTER_KEY: string = 'bot_counter';
export const BOT_MAX_ITERATIONS: string = 'bot_max_iterations';
export const BOT_TOTAL_EXECUTED: string = 'bot_total_executed';
export const BOT_START_TIME: string = 'bot_start_time';

// Bot execution parameters
export const BOT_CHECK_INTERVAL: u64 = 3;
export const BOT_MAX_ORDERS_PER_CYCLE: u64 = 10;
export const GAS_COST_PER_EXECUTION: u64 = 500_000_000;

// ============================================================================
// STORAGE HELPER FUNCTIONS
// ============================================================================

function getCounter(key: string): u64 {
  const keyBytes = stringToBytes(key);
  if (!Storage.has(keyBytes)) {
    return 0;
  }
  return u64(parseInt(bytesToString(Storage.get<StaticArray<u8>>(keyBytes))));
}

function setCounter(key: string, value: u64): void {
  Storage.set<StaticArray<u8>>(
    stringToBytes(key),
    stringToBytes(value.toString())
  );
}

function incrementCounter(key: string): u64 {
  const current = getCounter(key);
  const next = current + 1;
  setCounter(key, next);
  return next;
}

function getString(key: string): string {
  const keyBytes = stringToBytes(key);
  if (!Storage.has(keyBytes)) {
    return '';
  }
  return bytesToString(Storage.get<StaticArray<u8>>(keyBytes));
}

function setString(key: string, value: string): void {
  Storage.set<StaticArray<u8>>(
    stringToBytes(key),
    stringToBytes(value)
  );
}

function getBool(key: string): bool {
  return getString(key) === 'true';
}

function setBool(key: string, value: bool): void {
  setString(key, value ? 'true' : 'false');
}

// ============================================================================
// DATA STRUCTURES
// ============================================================================

/**
 * Recurring Order - Executes multiple times based on interval or price trigger
 */
export class RecurringOrder {
  id: u64;
  user: Address;
  orderType: u8;        // RECURRING_BUY or RECURRING_SELL
  executionMode: u8;    // INTERVAL or TRIGGER
  status: u8;           // ACTIVE, COMPLETED, PAUSED, CANCELLED

  // Token pair
  tokenIn: Address;
  tokenOut: Address;

  // Execution parameters
  amountPerExecution: u256;  // How much to trade each time
  minAmountOut: u256;        // Slippage protection

  // Interval mode (time-based)
  executionInterval: u64;    // Seconds between executions
  lastExecutedTime: u64;     // When was last execution

  // Trigger mode (price-based)
  triggerPercentage: u64;    // Basis points (100 = 1%)
  entryPrice: u256;          // Price when created
  referencePrice: u256;      // Current reference for next trigger

  // Execution tracking
  maxExecutions: u64;        // Max times to execute (0 = unlimited)
  executionCount: u64;       // How many times executed so far

  // Order lifecycle
  createdAt: u64;
  expiryAt: u64;

  constructor(
    id: u64,
    user: Address,
    orderType: u8,
    executionMode: u8,
    tokenIn: Address,
    tokenOut: Address,
    amountPerExecution: u256,
    minAmountOut: u256,
    executionInterval: u64,
    triggerPercentage: u64,
    maxExecutions: u64,
    expiryAt: u64
  ) {
    this.id = id;
    this.user = user;
    this.orderType = orderType;
    this.executionMode = executionMode;
    this.status = ORDER_STATUS_ACTIVE;
    this.tokenIn = tokenIn;
    this.tokenOut = tokenOut;
    this.amountPerExecution = amountPerExecution;
    this.minAmountOut = minAmountOut;
    this.executionInterval = executionInterval;
    this.triggerPercentage = triggerPercentage;
    this.maxExecutions = maxExecutions;
    this.executionCount = 0;
    this.createdAt = Context.timestamp();
    this.lastExecutedTime = Context.timestamp();
    this.expiryAt = expiryAt;
    this.entryPrice = u256.Zero;
    this.referencePrice = u256.Zero;
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
    args.add(this.amountPerExecution);
    args.add(this.minAmountOut);
    args.add(this.executionInterval);
    args.add(this.triggerPercentage);
    args.add(this.maxExecutions);
    args.add(this.executionCount);
    args.add(this.createdAt);
    args.add(this.lastExecutedTime);
    args.add(this.expiryAt);
    args.add(this.entryPrice);
    args.add(this.referencePrice);
    return args.serialize();
  }

  static deserialize(data: StaticArray<u8>): RecurringOrder {
    const args = new Args(data);
    const order = new RecurringOrder(
      args.nextU64().unwrap(),
      new Address(args.nextString().unwrap()),
      args.nextU8().unwrap(),
      args.nextU8().unwrap(),
      new Address(args.nextString().unwrap()),
      new Address(args.nextString().unwrap()),
      args.nextU256().unwrap(),
      args.nextU256().unwrap(),
      args.nextU64().unwrap(),
      args.nextU64().unwrap(),
      args.nextU64().unwrap(),
      args.nextU64().unwrap()
    );
    order.executionCount = args.nextU64().unwrap();
    order.createdAt = args.nextU64().unwrap();
    order.lastExecutedTime = args.nextU64().unwrap();
    order.expiryAt = args.nextU64().unwrap();
    order.entryPrice = args.nextU256().unwrap();
    order.referencePrice = args.nextU256().unwrap();
    return order;
  }

  isExpired(): bool {
    return Context.timestamp() > this.expiryAt;
  }

  isCompleted(): bool {
    return this.maxExecutions > 0 && this.executionCount >= this.maxExecutions;
  }

  canExecuteByInterval(): bool {
    const now = Context.timestamp();
    return now >= this.lastExecutedTime + this.executionInterval;
  }

  canExecuteByTrigger(currentPrice: u256): bool {
    if (this.referencePrice.isZero()) {
      return false; // No reference set yet
    }

    const basisPoints = u256.from(this.triggerPercentage);
    const divisor = u256.from(10000);
    const threshold = SafeMath256.div(u256.mul(this.referencePrice, basisPoints), divisor);

    if (this.orderType === ORDER_TYPE_RECURRING_BUY) {
      // Buy: execute when price drops by X%
      const targetPrice = u256.sub(this.referencePrice, threshold);
      return currentPrice <= targetPrice;
    } else {
      // Sell: execute when price increases by X%
      const targetPrice = u256.add(this.referencePrice, threshold);
      return currentPrice >= targetPrice;
    }
  }
}

// ============================================================================
// STORAGE FUNCTIONS
// ============================================================================

function getRecurringOrder(orderId: u64): RecurringOrder | null {
  const keyBytes = stringToBytes(RECURRING_ORDER_PREFIX + orderId.toString());
  if (!Storage.has(keyBytes)) {
    return null;
  }
  const orderData = Storage.get<StaticArray<u8>>(keyBytes);
  return RecurringOrder.deserialize(orderData);
}

function saveRecurringOrder(order: RecurringOrder): void {
  const keyBytes = stringToBytes(RECURRING_ORDER_PREFIX + order.id.toString());
  Storage.set<StaticArray<u8>>(keyBytes, order.serialize());
}

function getNextOrderId(): u64 {
  return incrementCounter(RECURRING_ORDER_COUNT_KEY);
}

function getOrderCount(): u64 {
  return getCounter(RECURRING_ORDER_COUNT_KEY);
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
 * Validate execution mode
 */
function isValidExecutionMode(mode: u8): bool {
  return mode === EXECUTION_MODE_INTERVAL || mode === EXECUTION_MODE_TRIGGER;
}

/**
 * Validate order type
 */
function isValidOrderType(orderType: u8): bool {
  return orderType === ORDER_TYPE_RECURRING_BUY || orderType === ORDER_TYPE_RECURRING_SELL;
}

/**
 * Get order type name for events
 */
function getOrderTypeName(orderType: u8): string {
  if (orderType === ORDER_TYPE_RECURRING_BUY) {
    return 'RECURRING_BUY';
  } else if (orderType === ORDER_TYPE_RECURRING_SELL) {
    return 'RECURRING_SELL';
  }
  return 'UNKNOWN';
}

/**
 * Get execution mode name
 */
function getExecutionModeName(mode: u8): string {
  if (mode === EXECUTION_MODE_INTERVAL) {
    return 'INTERVAL';
  } else if (mode === EXECUTION_MODE_TRIGGER) {
    return 'TRIGGER';
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
  setCounter(RECURRING_ORDER_COUNT_KEY, 0);
  setBool(PAUSED_KEY, false);
  setBool(BOT_ENABLED_KEY, false);
  setCounter(BOT_COUNTER_KEY, 0);
  setCounter(BOT_TOTAL_EXECUTED, 0);

  generateEvent(`RecurringOrders:Initialized|massabeam=${massaBeamAddress}`);
}

/**
 * Create a recurring order (DCA or trigger-based)
 * Args: tokenIn, tokenOut, amountPerExecution, minAmountOut, orderType, executionMode,
 *       executionInterval, triggerPercentage, maxExecutions, duration
 */
export function createRecurringOrder(args: StaticArray<u8>): void {
  requireNotPaused();

  const argument = new Args(args);
  const tokenIn = new Address(argument.nextString().unwrap());
  const tokenOut = new Address(argument.nextString().unwrap());
  const amountPerExecution = argument.nextU256().unwrap();
  const minAmountOut = argument.nextU256().unwrap();
  const orderType = argument.nextU8().unwrap();
  const executionMode = argument.nextU8().unwrap();
  const executionInterval = argument.nextU64().unwrap();
  const triggerPercentage = argument.nextU64().unwrap();
  const maxExecutions = argument.nextU64().unwrap();
  const duration = argument.nextU64().unwrap();

  // Validation
  assert(!amountPerExecution.isZero(), 'Amount must be positive');
  assert(!minAmountOut.isZero(), 'Min output must be positive');
  assert(tokenIn.toString() !== tokenOut.toString(), 'Cannot swap same token');
  assert(isValidOrderType(orderType), 'Invalid order type');
  assert(isValidExecutionMode(executionMode), 'Invalid execution mode');
  assert(duration >= MIN_EXPIRY, `Duration must be at least ${MIN_EXPIRY} seconds`);
  assert(duration <= MAX_EXPIRY, `Duration must not exceed ${MAX_EXPIRY} seconds`);

  // Mode-specific validation
  if (executionMode === EXECUTION_MODE_INTERVAL) {
    assert(
      executionInterval >= MIN_INTERVAL && executionInterval <= MAX_INTERVAL,
      'Interval must be 60 seconds to 1 year'
    );
  } else {
    // TRIGGER mode
    assert(triggerPercentage > 0 && triggerPercentage <= 100000, 'Trigger % must be 1-1000%');
  }

  const now = Context.timestamp();
  const expiryAt = now + duration;

  generateEvent(
    `RecurringOrder:Creating|user=${Context.caller().toString()}|type=${getOrderTypeName(
      orderType
    )}|mode=${getExecutionModeName(executionMode)}`
  );

  // Verify pool exists
  const massaBeamAddress = getMassaBeamAddress();
  const massaBeam = new IMassaBeam(massaBeamAddress);

  const poolData = massaBeam.readPool(tokenIn, tokenOut);
  assert(poolData.length > 0, 'Pool does not exist');

  const poolArgs = new Args(poolData);
  const poolExists = poolArgs.nextBool().unwrap();
  assert(poolExists, 'Pool does not exist for this token pair');

  // Get current price
  const currentPriceData = massaBeam.readQuoteSwapExactInput(tokenIn, tokenOut, amountPerExecution);
  const priceArgs = new Args(currentPriceData);
  const currentPrice = priceArgs.nextU256().unwrap();
  assert(!currentPrice.isZero(), 'Could not determine current price');

  // Create order
  const orderId = getNextOrderId();
  const order = new RecurringOrder(
    orderId,
    Context.caller(),
    orderType,
    executionMode,
    tokenIn,
    tokenOut,
    amountPerExecution,
    minAmountOut,
    executionInterval,
    triggerPercentage,
    maxExecutions,
    expiryAt
  );

  order.entryPrice = currentPrice;
  order.referencePrice = currentPrice;

  // Transfer initial amount
  const tokenContract = new IERC20(tokenIn);

  // Calculate total amount needed (for all possible executions)
  let totalAmount = amountPerExecution;
  if (maxExecutions > 1) {
    totalAmount = u256.mul(amountPerExecution, u256.from(maxExecutions));
  }

  tokenContract.transferFrom(Context.caller(), Context.callee(), totalAmount);

  generateEvent(`RecurringOrder:TokensTransferred|amount=${totalAmount.toString()}`);

  saveRecurringOrder(order);

  const eventMsg =
    `RecurringOrder:Created|id=${orderId}|user=${Context.caller().toString()}` +
    `|type=${getOrderTypeName(orderType)}|mode=${getExecutionModeName(executionMode)}` +
    `|amountPerExecution=${amountPerExecution.toString()}|maxExecutions=${maxExecutions}` +
    `|expiryAt=${expiryAt}`;
  generateEvent(eventMsg);
}

/**
 * Start autonomous bot execution
 */
export function startBot(args: StaticArray<u8>): void {
  const argument = new Args(args);
  const maxIterations = argument.nextU64().unwrapOrDefault() || 1000;

  generateEvent(`RecurringOrder:BotStarting|maxIterations=${maxIterations}`);

  setBool(BOT_ENABLED_KEY, true);
  setCounter(BOT_COUNTER_KEY, 0);
  setCounter(BOT_MAX_ITERATIONS, maxIterations);
  setCounter(BOT_START_TIME, Context.timestamp());

  generateEvent(`RecurringOrder:BotStarted|maxIterations=${maxIterations}|timestamp=${Context.timestamp()}`);

  advance(new Args().serialize());
}

/**
 * Stop autonomous bot
 */
export function stopBot(_: StaticArray<u8>): void {
  const botEnabled = getBool(BOT_ENABLED_KEY);

  if (!botEnabled) {
    generateEvent(`RecurringOrder:BotAlreadyStopped`);
    return;
  }

  setBool(BOT_ENABLED_KEY, false);

  const currentCounter = getCounter(BOT_COUNTER_KEY);
  const totalExecuted = getCounter(BOT_TOTAL_EXECUTED);

  generateEvent(`RecurringOrder:BotStopped|cycles=${currentCounter}|totalExecuted=${totalExecuted}`);
}

/**
 * Autonomous execution cycle
 */
export function advance(_: StaticArray<u8>): void {
  const enabled = getBool(BOT_ENABLED_KEY);
  if (!enabled) {
    generateEvent(`RecurringOrder:BotDisabled`);
    return;
  }

  generateEvent(`RecurringOrder:BotAdvanceStarted`);

  let botCounter = getCounter(BOT_COUNTER_KEY);
  const maxIterations = getCounter(BOT_MAX_ITERATIONS);

  if (botCounter >= maxIterations) {
    generateEvent(`RecurringOrder:BotMaxIterationsReached|counter=${botCounter}|max=${maxIterations}`);
    setBool(BOT_ENABLED_KEY, false);
    return;
  }

  const totalOrders = getOrderCount();
  const callee = Context.callee();

  generateEvent(`RecurringOrder:BotProcessing|totalOrders=${totalOrders}|maxPerCycle=${BOT_MAX_ORDERS_PER_CYCLE}`);

  let startOrderId = botCounter * BOT_MAX_ORDERS_PER_CYCLE + 1;
  let endOrderId = startOrderId + BOT_MAX_ORDERS_PER_CYCLE;

  if (endOrderId > totalOrders) {
    endOrderId = totalOrders;
  }

  generateEvent(`RecurringOrder:BotCheckingOrders|start=${startOrderId}|end=${endOrderId}`);

  let executedCount: u64 = 0;
  let checkCount: u64 = 0;

  const massaBeamAddress = getMassaBeamAddress();
  const massaBeam = new IMassaBeam(massaBeamAddress);

  for (let i = startOrderId; i <= endOrderId; i++) {
    const fetchedOrder = getRecurringOrder(i);
    checkCount += 1;

    if (fetchedOrder == null) {
      generateEvent(`RecurringOrder:BotOrderNotFound|orderId=${i}`);
      continue;
    }

    const currentOrder: RecurringOrder = fetchedOrder;

    generateEvent(
      `RecurringOrder:BotCheckOrder|orderId=${i}|status=${currentOrder.status}|type=${getOrderTypeName(
        currentOrder.orderType
      )}`
    );

    if (currentOrder.status !== ORDER_STATUS_ACTIVE) {
      generateEvent(
        `RecurringOrder:BotOrderNotActive|orderId=${i}|status=${currentOrder.status}`
      );
      continue;
    }

    // Check expiry
    if (currentOrder.isExpired()) {
      generateEvent(`RecurringOrder:BotOrderExpired|orderId=${i}`);
      currentOrder.status = ORDER_STATUS_COMPLETED;
      saveRecurringOrder(currentOrder);
      continue;
    }

    // Check if completed
    if (currentOrder.isCompleted()) {
      generateEvent(`RecurringOrder:BotOrderCompleted|orderId=${i}|totalExecutions=${currentOrder.executionCount}`);
      currentOrder.status = ORDER_STATUS_COMPLETED;
      saveRecurringOrder(currentOrder);
      continue;
    }

    // Check execution eligibility
    let shouldExecute = false;

    if (currentOrder.executionMode === EXECUTION_MODE_INTERVAL) {
      shouldExecute = currentOrder.canExecuteByInterval();
    } else {
      // TRIGGER mode - need current price
      const priceData = massaBeam.readQuoteSwapExactInput(
        currentOrder.tokenIn,
        currentOrder.tokenOut,
        currentOrder.amountPerExecution
      );

      if (priceData.length > 0) {
        const priceArgs = new Args(priceData);
        const currentPrice = priceArgs.nextU256().unwrap();
        shouldExecute = currentOrder.canExecuteByTrigger(currentPrice);

        generateEvent(
          `RecurringOrder:BotPriceCheck|orderId=${i}|currentPrice=${currentPrice.toString()}` +
          `|referencePrice=${currentOrder.referencePrice.toString()}`
        );
      }
    }

    if (!shouldExecute) {
      continue;
    }

    // Execute order
    generateEvent(
      `RecurringOrder:BotExecuting|orderId=${i}|executionCount=${currentOrder.executionCount + 1}|maxExecutions=${currentOrder.maxExecutions}`
    );

    const tokenInContract = new IERC20(currentOrder.tokenIn);
    tokenInContract.increaseAllowance(massaBeamAddress, currentOrder.amountPerExecution);

    generateEvent(`RecurringOrder:BotSwapApproved|orderId=${i}|amount=${currentOrder.amountPerExecution.toString()}`);

    massaBeam.swap(
      currentOrder.tokenIn,
      currentOrder.tokenOut,
      currentOrder.amountPerExecution,
      currentOrder.minAmountOut,
      currentOrder.expiryAt,
      currentOrder.user
    );

    currentOrder.executionCount += 1;
    currentOrder.lastExecutedTime = Context.timestamp();

    // Update reference price for next trigger
    if (currentOrder.executionMode === EXECUTION_MODE_TRIGGER) {
      const priceData = massaBeam.readQuoteSwapExactInput(
        currentOrder.tokenIn,
        currentOrder.tokenOut,
        currentOrder.amountPerExecution
      );
      if (priceData.length > 0) {
        const priceArgs = new Args(priceData);
        currentOrder.referencePrice = priceArgs.nextU256().unwrap();
      }
    }

    // Check if completed after execution
    if (currentOrder.isCompleted()) {
      currentOrder.status = ORDER_STATUS_COMPLETED;
    }

    saveRecurringOrder(currentOrder);
    executedCount += 1;

    generateEvent(
      `RecurringOrder:BotExecuted|orderId=${i}|executionCount=${currentOrder.executionCount}|user=${currentOrder.user.toString()}`
    );
  }

  // Update counters
  botCounter += 1;
  setCounter(BOT_COUNTER_KEY, botCounter);

  const totalExecuted = getCounter(BOT_TOTAL_EXECUTED) + executedCount;
  setCounter(BOT_TOTAL_EXECUTED, totalExecuted);

  generateEvent(`RecurringOrder:BotCycleComplete|cycle=${botCounter}|checked=${checkCount}|executed=${executedCount}|totalExecuted=${totalExecuted}`);

  // Schedule next cycle
  if (botCounter < maxIterations) {
    generateEvent(`RecurringOrder:BotSchedulingNext|cycle=${botCounter}|nextCycle=${botCounter + 1}`);
    callNextSlot(callee, 'advance', GAS_COST_PER_EXECUTION);
  } else {
    generateEvent(`RecurringOrder:BotCompleted|totalCycles=${botCounter}|totalExecuted=${totalExecuted}`);
    setBool(BOT_ENABLED_KEY, false);
  }
}

function callNextSlot(contractAddress: Address, functionName: string, gasBudget: u64): void {
  const currentPeriod = Context.currentPeriod();
  const currentThread = Context.currentThread();

  let nextPeriod = currentPeriod;
  let nextThread = currentThread + 1;

  if (nextThread >= 32) {
    nextPeriod = currentPeriod + 1;
    nextThread = 0;
  }

  asyncCall(
    contractAddress,
    functionName,
    new Slot(nextPeriod, nextThread),
    new Slot(nextPeriod + 10, nextThread),
    gasBudget,
    0,
    new Args().serialize()
  );

  generateEvent('RecurringOrder:NextSlotScheduled');
}

/**
 * Pause a recurring order
 */
export function pauseOrder(args: StaticArray<u8>): void {
  requireNotPaused();

  const argument = new Args(args);
  const orderId = argument.nextU64().unwrap();

  const foundOrder = getRecurringOrder(orderId);
  assert(foundOrder !== null, 'Order not found');
  const order: RecurringOrder = foundOrder as RecurringOrder;

  assert(order.user.toString() === Context.caller().toString(), 'Only owner can pause');
  assert(order.status === ORDER_STATUS_ACTIVE, 'Order not active');

  order.status = ORDER_STATUS_PAUSED;
  saveRecurringOrder(order);

  generateEvent(`RecurringOrder:Paused|orderId=${orderId}|user=${order.user.toString()}`);
}

/**
 * Resume a paused recurring order
 */
export function resumeOrder(args: StaticArray<u8>): void {
  requireNotPaused();

  const argument = new Args(args);
  const orderId = argument.nextU64().unwrap();

  const foundOrder = getRecurringOrder(orderId);
  assert(foundOrder !== null, 'Order not found');
  const order: RecurringOrder = foundOrder as RecurringOrder;

  assert(order.user.toString() === Context.caller().toString(), 'Only owner can resume');
  assert(order.status === ORDER_STATUS_PAUSED, 'Order not paused');

  order.status = ORDER_STATUS_ACTIVE;
  saveRecurringOrder(order);

  generateEvent(`RecurringOrder:Resumed|orderId=${orderId}|user=${order.user.toString()}`);
}

/**
 * Cancel a recurring order
 */
export function cancelOrder(args: StaticArray<u8>): void {
  requireNotPaused();

  const argument = new Args(args);
  const orderId = argument.nextU64().unwrap();

  const foundOrder = getRecurringOrder(orderId);
  assert(foundOrder !== null, 'Order not found');
  const order: RecurringOrder = foundOrder as RecurringOrder;

  assert(order.user.toString() === Context.caller().toString(), 'Only owner can cancel');
  assert(
    order.status === ORDER_STATUS_ACTIVE || order.status === ORDER_STATUS_PAUSED,
    'Order cannot be cancelled in this state'
  );

  order.status = ORDER_STATUS_CANCELLED;
  saveRecurringOrder(order);

  // Calculate refund
  let totalAmount = u256.Zero;
  if (order.maxExecutions > 0) {
    const remainingExecutions = order.maxExecutions - order.executionCount;
    totalAmount = u256.mul(order.amountPerExecution, u256.from(remainingExecutions));
  }

  if (!totalAmount.isZero()) {
    const tokenContract = new IERC20(order.tokenIn);
    tokenContract.transfer(order.user, totalAmount);

    generateEvent(`RecurringOrder:Refunded|orderId=${orderId}|amount=${totalAmount.toString()}`);
  }

  generateEvent(`RecurringOrder:Cancelled|orderId=${orderId}|user=${order.user.toString()}`);
}

/**
 * Set pause status
 */
export function setPaused(args: StaticArray<u8>): void {
  const argument = new Args(args);
  const paused = argument.nextBool().unwrap();
  setBool(PAUSED_KEY, paused);
  generateEvent(`RecurringOrders:${paused ? 'Paused' : 'Unpaused'}`);
}

/**
 * Update MassaBeam address
 */
export function setMassaBeamAddress(args: StaticArray<u8>): void {
  const argument = new Args(args);
  const newAddress = argument.nextString().unwrap();
  setString(MASSABEAM_KEY, newAddress);
  generateEvent(`RecurringOrders:MassaBeamUpdated|address=${newAddress}`);
}

// ============================================================================
// READ FUNCTIONS
// ============================================================================

/**
 * Read recurring order by ID
 */
export function readRecurringOrder(args: StaticArray<u8>): StaticArray<u8> {
  const argument = new Args(args);
  const orderId = argument.nextU64().unwrap();

  const order = getRecurringOrder(orderId);
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
 * Get all active orders
 */
export function getActiveOrders(_: StaticArray<u8>): StaticArray<u8> {
  const totalOrders = getOrderCount();
  const activeOrderIds: u64[] = [];

  for (let i: u64 = 1; i <= totalOrders; i++) {
    const order = getRecurringOrder(i);
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
    const order = getRecurringOrder(i);
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
 * Get orders by type
 */
export function getOrdersByType(args: StaticArray<u8>): StaticArray<u8> {
  const argument = new Args(args);
  const orderType = argument.nextU8().unwrap();

  const totalOrders = getOrderCount();
  const matchingOrders: u64[] = [];

  for (let i: u64 = 1; i <= totalOrders; i++) {
    const order = getRecurringOrder(i);
    if (order != null && order.orderType === orderType) {
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
 * Get orders by execution mode
 */
export function getOrdersByMode(args: StaticArray<u8>): StaticArray<u8> {
  const argument = new Args(args);
  const mode = argument.nextU8().unwrap();

  const totalOrders = getOrderCount();
  const matchingOrders: u64[] = [];

  for (let i: u64 = 1; i <= totalOrders; i++) {
    const order = getRecurringOrder(i);
    if (order != null && order.executionMode === mode) {
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
 * Get orders expiring soon
 */
export function getExpiringOrders(args: StaticArray<u8>): StaticArray<u8> {
  const argument = new Args(args);
  const timeWindow = argument.nextU64().unwrap();

  const totalOrders = getOrderCount();
  const expiringOrders: u64[] = [];
  const now = Context.timestamp();

  for (let i: u64 = 1; i <= totalOrders; i++) {
    const order = getRecurringOrder(i);
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
 * Platform-wide statistics
 */
export function getPlatformStatistics(_: StaticArray<u8>): StaticArray<u8> {
  const totalOrders = getOrderCount();

  let activeOrders: u64 = 0;
  let completedOrders: u64 = 0;
  let pausedOrders: u64 = 0;
  let cancelledOrders: u64 = 0;
  let totalExecutions: u64 = 0;

  for (let i: u64 = 1; i <= totalOrders; i++) {
    const order = getRecurringOrder(i);
    if (order != null) {
      if (order.status === ORDER_STATUS_ACTIVE) {
        activeOrders += 1;
      } else if (order.status === ORDER_STATUS_COMPLETED) {
        completedOrders += 1;
      } else if (order.status === ORDER_STATUS_PAUSED) {
        pausedOrders += 1;
      } else if (order.status === ORDER_STATUS_CANCELLED) {
        cancelledOrders += 1;
      }
      totalExecutions += order.executionCount;
    }
  }

  const enabled = getBool(BOT_ENABLED_KEY);
  const counter = getCounter(BOT_COUNTER_KEY);
  const botTotalExecuted = getCounter(BOT_TOTAL_EXECUTED);

  const result = new Args();
  result.add(totalOrders);
  result.add(activeOrders);
  result.add(completedOrders);
  result.add(pausedOrders);
  result.add(cancelledOrders);
  result.add(totalExecutions);
  result.add(enabled);
  result.add(counter);
  result.add(botTotalExecuted);

  return result.serialize();
}
