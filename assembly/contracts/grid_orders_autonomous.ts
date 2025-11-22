/**
 * MassaBeam Grid Orders - Autonomous Execution
 *
 * Grid trading system with:
 * - Multi-level buy/sell orders at different price points
 * - Autonomous execution via callNextSlot bot
 * - Per-level execution tracking
 * - Comprehensive event tracking for each level
 * - Price validation before execution
 * - Flexible grid size (1-255 levels)
 *
 * Grid Order Example:
 * Entry Price: $100
 * Buy Grid: [-2%, -4%, -6%] with [1 token, 1 token, 1 token]
 * Executes: Buy 1 at $98, 1 at $96, 1 at $94
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

// Order status constants
export const ORDER_STATUS_ACTIVE: u8 = 0;
export const ORDER_STATUS_FILLED: u8 = 1;
export const ORDER_STATUS_CANCELLED: u8 = 2;
export const ORDER_STATUS_EXPIRED: u8 = 3;

// Order type constants (buy/sell grid)
export const ORDER_TYPE_BUY_GRID: u8 = 0;
export const ORDER_TYPE_SELL_GRID: u8 = 1;

// Time constraints
export const MIN_EXPIRY: u64 = 60;
export const MAX_EXPIRY: u64 = 365 * 24 * 60 * 60;

// Storage keys
export const GRID_ORDER_PREFIX: string = 'grid_order:';
export const GRID_ORDER_COUNT_KEY: string = 'grid_order_count';
export const GRID_LEVELS_PREFIX: string = 'grid_levels:';
export const GRID_AMOUNTS_PREFIX: string = 'grid_amounts:';
export const GRID_EXECUTED_PREFIX: string = 'grid_executed:';
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
export const BOT_MAX_ORDERS_PER_CYCLE: u64 = 5;
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
 * Grid Order - Multiple buy/sell orders at different price levels
 */
export class GridOrder {
  id: u64;
  user: Address;
  tokenIn: Address;
  tokenOut: Address;
  entryPrice: u256;
  createdAt: u64;
  expiryAt: u64;
  status: u8;
  orderType: u8; // BUY_GRID (0) or SELL_GRID (1)
  numLevels: u8; // Number of grid levels

  constructor(
    id: u64,
    user: Address,
    tokenIn: Address,
    tokenOut: Address,
    entryPrice: u256,
    expiryAt: u64,
    orderType: u8,
    numLevels: u8
  ) {
    this.id = id;
    this.user = user;
    this.tokenIn = tokenIn;
    this.tokenOut = tokenOut;
    this.entryPrice = entryPrice;
    this.createdAt = Context.timestamp();
    this.expiryAt = expiryAt;
    this.status = ORDER_STATUS_ACTIVE;
    this.orderType = orderType;
    this.numLevels = numLevels;
  }

  serialize(): StaticArray<u8> {
    const args = new Args();
    args.add(this.id);
    args.add(this.user.toString());
    args.add(this.tokenIn.toString());
    args.add(this.tokenOut.toString());
    args.add(this.entryPrice);
    args.add(this.createdAt);
    args.add(this.expiryAt);
    args.add(this.status);
    args.add(this.orderType);
    args.add(this.numLevels);
    return args.serialize();
  }

  static deserialize(data: StaticArray<u8>): GridOrder {
    const args = new Args(data);
    const order = new GridOrder(
      args.nextU64().unwrap(),
      new Address(args.nextString().unwrap()),
      new Address(args.nextString().unwrap()),
      new Address(args.nextString().unwrap()),
      args.nextU256().unwrap(),
      args.nextU64().unwrap(),
      args.nextU8().unwrap(),
      args.nextU8().unwrap()
    );
    order.createdAt = args.nextU64().unwrap();
    order.status = args.nextU8().unwrap();
    return order;
  }

  isExpired(): bool {
    return Context.timestamp() > this.expiryAt;
  }
}

// ============================================================================
// STORAGE FUNCTIONS
// ============================================================================

function getGridOrder(orderId: u64): GridOrder | null {
  const keyBytes = stringToBytes(GRID_ORDER_PREFIX + orderId.toString());
  if (!Storage.has(keyBytes)) {
    return null;
  }
  const orderData = Storage.get<StaticArray<u8>>(keyBytes);
  return GridOrder.deserialize(orderData);
}

function saveGridOrder(order: GridOrder): void {
  const keyBytes = stringToBytes(GRID_ORDER_PREFIX + order.id.toString());
  Storage.set<StaticArray<u8>>(keyBytes, order.serialize());
}

function getGridLevels(orderId: u64): u64[] {
  const keyBytes = stringToBytes(GRID_LEVELS_PREFIX + orderId.toString());
  if (!Storage.has(keyBytes)) {
    return [];
  }
  const data = Storage.get<StaticArray<u8>>(keyBytes);
  const args = new Args(data);
  const levels: u64[] = [];
  const count = args.nextU8().unwrap();
  for (let i: u8 = 0; i < count; i++) {
    levels.push(args.nextU64().unwrap());
  }
  return levels;
}

function setGridLevels(orderId: u64, levels: u64[]): void {
  const args = new Args();
  args.add(u8(levels.length));
  for (let i = 0; i < levels.length; i++) {
    args.add(levels[i]);
  }
  const keyBytes = stringToBytes(GRID_LEVELS_PREFIX + orderId.toString());
  Storage.set<StaticArray<u8>>(keyBytes, args.serialize());
}

function getGridAmounts(orderId: u64): u256[] {
  const keyBytes = stringToBytes(GRID_AMOUNTS_PREFIX + orderId.toString());
  if (!Storage.has(keyBytes)) {
    return [];
  }
  const data = Storage.get<StaticArray<u8>>(keyBytes);
  const args = new Args(data);
  const amounts: u256[] = [];
  const count = args.nextU8().unwrap();
  for (let i: u8 = 0; i < count; i++) {
    amounts.push(args.nextU256().unwrap());
  }
  return amounts;
}

function setGridAmounts(orderId: u64, amounts: u256[]): void {
  const args = new Args();
  args.add(u8(amounts.length));
  for (let i = 0; i < amounts.length; i++) {
    args.add(amounts[i]);
  }
  const keyBytes = stringToBytes(GRID_AMOUNTS_PREFIX + orderId.toString());
  Storage.set<StaticArray<u8>>(keyBytes, args.serialize());
}

function getGridExecuted(orderId: u64): bool[] {
  const keyBytes = stringToBytes(GRID_EXECUTED_PREFIX + orderId.toString());
  if (!Storage.has(keyBytes)) {
    return [];
  }
  const data = Storage.get<StaticArray<u8>>(keyBytes);
  const args = new Args(data);
  const executed: bool[] = [];
  const count = args.nextU8().unwrap();
  for (let i: u8 = 0; i < count; i++) {
    executed.push(args.nextBool().unwrap());
  }
  return executed;
}

function setGridExecuted(orderId: u64, executed: bool[]): void {
  const args = new Args();
  args.add(u8(executed.length));
  for (let i = 0; i < executed.length; i++) {
    args.add(executed[i]);
  }
  const keyBytes = stringToBytes(GRID_EXECUTED_PREFIX + orderId.toString());
  Storage.set<StaticArray<u8>>(keyBytes, args.serialize());
}

function getNextOrderId(): u64 {
  return incrementCounter(GRID_ORDER_COUNT_KEY);
}

function getOrderCount(): u64 {
  return getCounter(GRID_ORDER_COUNT_KEY);
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
  return orderType === ORDER_TYPE_BUY_GRID || orderType === ORDER_TYPE_SELL_GRID;
}

/**
 * Get order type name for events
 */
function getOrderTypeName(orderType: u8): string {
  if (orderType === ORDER_TYPE_BUY_GRID) {
    return 'BUY_GRID';
  } else if (orderType === ORDER_TYPE_SELL_GRID) {
    return 'SELL_GRID';
  }
  return 'UNKNOWN';
}

/**
 * Calculate actual price for a grid level
 * Basis points to price: 200 bp = 2%
 */
function calculateLevelPrice(entryPrice: u256, levelBasisPoints: u64, isBuyGrid: bool): u256 {
  const basisPoints = u256.from(levelBasisPoints);
  const divisor = u256.from(10000); // 10000 bp = 100%

  if (isBuyGrid) {
    // Buy grid: price decreases (negative %)
    // Level 200 = -2%, so multiply by (1 - 0.02) = 0.98
    const multiplier = u256.sub(divisor, basisPoints);
    return SafeMath256.div(u256.mul(entryPrice, multiplier), divisor);
  } else {
    // Sell grid: price increases (positive %)
    // Level 200 = +2%, so multiply by (1 + 0.02) = 1.02
    const multiplier = u256.add(divisor, basisPoints);
    return SafeMath256.div(u256.mul(entryPrice, multiplier), divisor);
  }
}

/**
 * Check if current price is close enough to level price (with tolerance)
 * Tolerance: within 1% of the target price
 */
function isPriceAtLevel(currentPrice: u256, levelPrice: u256): bool {
  // Allow 1% tolerance (100 basis points)
  const tolerance = SafeMath256.div(levelPrice, u256.from(100));
  const lowerBound = u256.sub(levelPrice, tolerance);
  const upperBound = u256.add(levelPrice, tolerance);

  return currentPrice >= lowerBound && currentPrice <= upperBound;
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
  setCounter(GRID_ORDER_COUNT_KEY, 0);
  setBool(PAUSED_KEY, false);
  setBool(BOT_ENABLED_KEY, false);
  setCounter(BOT_COUNTER_KEY, 0);
  setCounter(BOT_TOTAL_EXECUTED, 0);

  generateEvent(`GridOrders:Initialized|massabeam=${massaBeamAddress}`);
}

/**
 * Create a grid order with multiple price levels
 * Args: tokenIn, tokenOut, entryPrice, duration, orderType, numLevels, then for each level: gridLevel, amount
 */
export function createGridOrder(args: StaticArray<u8>): void {
  requireNotPaused();

  const argument = new Args(args);
  const tokenIn = new Address(argument.nextString().unwrap());
  const tokenOut = new Address(argument.nextString().unwrap());
  const entryPrice = argument.nextU256().unwrap();
  const duration = argument.nextU64().unwrap();
  const orderType = argument.nextU8().unwrapOrDefault() || ORDER_TYPE_BUY_GRID;

  // Parse grid levels using array pattern
  const numLevels = argument.nextU8().unwrap();
  assert(numLevels > 0 && numLevels <= 100, 'Grid must have 1-100 levels');

  const gridLevels: u64[] = [];
  const gridAmounts: u256[] = [];

  let totalAmount = u256.Zero;

  // Parse each grid level
  for (let i: u8 = 0; i < numLevels; i++) {
    const level = argument.nextU64().unwrap();
    const amount = argument.nextU256().unwrap();

    assert(level > 0 && level <= 10000, 'Level must be 1-10000 basis points');
    assert(!amount.isZero(), 'Amount must be positive');

    gridLevels.push(level);
    gridAmounts.push(amount);
    totalAmount = u256.add(totalAmount, amount);
  }

  assert(!totalAmount.isZero(), 'Total amount must be positive');
  assert(tokenIn.toString() !== tokenOut.toString(), 'Cannot swap same token');
  assert(isValidOrderType(orderType), 'Invalid order type: must be BUY_GRID (0) or SELL_GRID (1)');

  const now = Context.timestamp();

  assert(duration >= MIN_EXPIRY, `Order duration must be at least ${MIN_EXPIRY} seconds`);
  assert(duration <= MAX_EXPIRY, `Order duration must not exceed ${MAX_EXPIRY} seconds`);

  const expiryAt = now + duration;

  generateEvent(
    `GridOrder:Creating|user=${Context.caller().toString()}|type=${getOrderTypeName(
      orderType
    )}|tokenIn=${tokenIn.toString()}|tokenOut=${tokenOut.toString()}|levels=${numLevels}`
  );

  // Verify pool exists
  const massaBeamAddress = getMassaBeamAddress();
  const massaBeam = new IMassaBeam(massaBeamAddress);

  const poolData = massaBeam.readPool(tokenIn, tokenOut);
  assert(poolData.length > 0, 'Pool does not exist');

  const poolArgs = new Args(poolData);
  const poolExists = poolArgs.nextBool().unwrap();
  assert(poolExists, 'Pool does not exist for this token pair');

  generateEvent(`GridOrder:PoolVerified|poolExists=true`);

  // Get current price
  const currentPriceData = massaBeam.readQuoteSwapExactInput(tokenIn, tokenOut, totalAmount);
  const priceArgs = new Args(currentPriceData);
  const currentPrice = priceArgs.nextU256().unwrap();
  assert(!currentPrice.isZero(), 'Could not determine current price');

  generateEvent(`GridOrder:PriceCheck|entryPrice=${entryPrice.toString()}|currentPrice=${currentPrice.toString()}`);

  // Create order
  const orderId = getNextOrderId();
  const order = new GridOrder(
    orderId,
    Context.caller(),
    tokenIn,
    tokenOut,
    entryPrice,
    expiryAt,
    orderType,
    numLevels
  );

  // Transfer all tokens upfront
  const tokenContract = new IERC20(tokenIn);
  tokenContract.transferFrom(Context.caller(), Context.callee(), totalAmount);

  generateEvent(`GridOrder:TokensTransferred|amount=${totalAmount.toString()}`);

  // Save order and grid data
  saveGridOrder(order);
  setGridLevels(orderId, gridLevels);
  setGridAmounts(orderId, gridAmounts);

  // Initialize execution tracker (all false)
  const gridExecuted: bool[] = [];
  for (let i: u8 = 0; i < numLevels; i++) {
    gridExecuted.push(false);
  }
  setGridExecuted(orderId, gridExecuted);

  const eventMsg =
    `GridOrder:Created|id=${orderId}|user=${Context.caller().toString()}` +
    `|type=${getOrderTypeName(orderType)}|tokenIn=${tokenIn.toString()}` +
    `|tokenOut=${tokenOut.toString()}|levels=${numLevels}|totalAmount=${totalAmount.toString()}` +
    `|expiryAt=${expiryAt}`;
  generateEvent(eventMsg);
}

/**
 * Start autonomous bot execution
 */
export function startBot(args: StaticArray<u8>): void {
  const argument = new Args(args);
  const maxIterations = argument.nextU64().unwrapOrDefault() || 1000;

  generateEvent(`GridOrder:BotStarting|maxIterations=${maxIterations}`);

  setBool(BOT_ENABLED_KEY, true);
  setCounter(BOT_COUNTER_KEY, 0);
  setCounter(BOT_MAX_ITERATIONS, maxIterations);
  setCounter(BOT_START_TIME, Context.timestamp());

  generateEvent(`GridOrder:BotStarted|maxIterations=${maxIterations}|timestamp=${Context.timestamp()}`);

  advance(new Args().serialize());
}

/**
 * Stop autonomous bot
 */
export function stopBot(_: StaticArray<u8>): void {
  const botEnabled = getBool(BOT_ENABLED_KEY);

  if (!botEnabled) {
    generateEvent(`GridOrder:BotAlreadyStopped`);
    return;
  }

  setBool(BOT_ENABLED_KEY, false);

  const currentCounter = getCounter(BOT_COUNTER_KEY);
  const totalExecuted = getCounter(BOT_TOTAL_EXECUTED);

  generateEvent(`GridOrder:BotStopped|cycles=${currentCounter}|totalExecuted=${totalExecuted}`);
}

/**
 * Autonomous execution cycle
 */
export function advance(_: StaticArray<u8>): void {
  const enabled = getBool(BOT_ENABLED_KEY);
  if (!enabled) {
    generateEvent(`GridOrder:BotDisabled`);
    return;
  }

  generateEvent(`GridOrder:BotAdvanceStarted`);

  let botCounter = getCounter(BOT_COUNTER_KEY);
  const maxIterations = getCounter(BOT_MAX_ITERATIONS);

  generateEvent(`GridOrder:BotState|counter=${botCounter}|maxIterations=${maxIterations}`);

  if (botCounter >= maxIterations) {
    generateEvent(`GridOrder:BotMaxIterationsReached|counter=${botCounter}|max=${maxIterations}`);
    setBool(BOT_ENABLED_KEY, false);
    return;
  }

  const totalOrders = getOrderCount();
  const callee = Context.callee();

  generateEvent(`GridOrder:BotProcessing|totalOrders=${totalOrders}|maxPerCycle=${BOT_MAX_ORDERS_PER_CYCLE}`);

  let startOrderId = botCounter * BOT_MAX_ORDERS_PER_CYCLE + 1;
  let endOrderId = startOrderId + BOT_MAX_ORDERS_PER_CYCLE;

  if (endOrderId > totalOrders) {
    endOrderId = totalOrders;
  }

  generateEvent(`GridOrder:BotCheckingOrders|start=${startOrderId}|end=${endOrderId}`);

  let executedCount: u64 = 0;
  let checkCount: u64 = 0;

  for (let i = startOrderId; i <= endOrderId; i++) {
    const fetchedOrder = getGridOrder(i);
    checkCount += 1;

    if (fetchedOrder == null) {
      generateEvent(`GridOrder:BotOrderNotFound|orderId=${i}`);
      continue;
    }

    const currentOrder: GridOrder = fetchedOrder;

    generateEvent(
      `GridOrder:BotCheckOrder|orderId=${i}|status=${currentOrder.status}|type=${getOrderTypeName(
        currentOrder.orderType
      )}`
    );

    if (currentOrder.status !== ORDER_STATUS_ACTIVE) {
      generateEvent(`GridOrder:BotOrderNotActive|orderId=${i}|status=${currentOrder.status}`);
      continue;
    }

    // Check expiry
    if (currentOrder.isExpired()) {
      generateEvent(`GridOrder:BotOrderExpired|orderId=${i}`);
      currentOrder.status = ORDER_STATUS_EXPIRED;
      saveGridOrder(currentOrder);
      continue;
    }

    // Get current price
    const massaBeamAddress = getMassaBeamAddress();
    const massaBeam = new IMassaBeam(massaBeamAddress);

    const gridLevels = getGridLevels(i);
    const gridAmounts = getGridAmounts(i);
    const gridExecuted = getGridExecuted(i);

    const currentPriceData = massaBeam.readQuoteSwapExactInput(
      currentOrder.tokenIn,
      currentOrder.tokenOut,
      gridAmounts[0] // Use first level's amount for quote
    );

    if (currentPriceData.length === 0) {
      generateEvent(`GridOrder:BotPriceUnavailable|orderId=${i}`);
      continue;
    }

    const priceArgs = new Args(currentPriceData);
    const currentPrice = priceArgs.nextU256().unwrap();

    const priceCheckMsg =
      `GridOrder:BotPriceCheck|orderId=${i}|currentPrice=${currentPrice.toString()}` +
      `|entryPrice=${currentOrder.entryPrice.toString()}`;
    generateEvent(priceCheckMsg);

    // Check each level
    let levelExecuted = false;
    for (let level: u8 = 0; level < currentOrder.numLevels; level++) {
      if (gridExecuted[level]) {
        continue; // Already executed
      }

      const isBuyGrid = currentOrder.orderType === ORDER_TYPE_BUY_GRID;
      const levelPrice = calculateLevelPrice(currentOrder.entryPrice, gridLevels[level], isBuyGrid);

      if (isPriceAtLevel(currentPrice, levelPrice)) {
        // Execute this level
        generateEvent(
          `GridOrder:BotExecutingLevel|orderId=${i}|level=${level}|levelPrice=${levelPrice.toString()}|currentPrice=${currentPrice.toString()}`
        );

        const tokenInContract = new IERC20(currentOrder.tokenIn);
        tokenInContract.increaseAllowance(massaBeamAddress, gridAmounts[level]);

        generateEvent(`GridOrder:BotSwapApproved|orderId=${i}|level=${level}|amount=${gridAmounts[level].toString()}`);

        massaBeam.swap(
          currentOrder.tokenIn,
          currentOrder.tokenOut,
          gridAmounts[level],
          u256.from(0), // minAmountOut - user accepts any amount
          currentOrder.expiryAt,
          currentOrder.user
        );

        gridExecuted[level] = true;
        levelExecuted = true;
        executedCount += 1;

        generateEvent(
          `GridOrder:BotExecutedLevel|orderId=${i}|level=${level}|amount=${gridAmounts[level].toString()}`
        );
      }
    }

    // Check if all levels executed
    let allExecuted = true;
    for (let j: u8 = 0; j < currentOrder.numLevels; j++) {
      if (!gridExecuted[j]) {
        allExecuted = false;
        break;
      }
    }

    // Update execution state and status
    if (levelExecuted) {
      setGridExecuted(i, gridExecuted);
    }

    if (allExecuted) {
      currentOrder.status = ORDER_STATUS_FILLED;
      saveGridOrder(currentOrder);
      generateEvent(`GridOrder:BotOrderCompleted|orderId=${i}|totalLevels=${currentOrder.numLevels}`);
    }
  }

  // Update counters
  botCounter += 1;
  setCounter(BOT_COUNTER_KEY, botCounter);

  const totalExecuted = getCounter(BOT_TOTAL_EXECUTED) + executedCount;
  setCounter(BOT_TOTAL_EXECUTED, totalExecuted);

  generateEvent(
    `GridOrder:BotCycleComplete|cycle=${botCounter}|checked=${checkCount}|executedLevels=${executedCount}|totalExecuted=${totalExecuted}`
  );

  // Schedule next cycle
  if (botCounter < maxIterations) {
    generateEvent(`GridOrder:BotSchedulingNext|cycle=${botCounter}|nextCycle=${botCounter + 1}`);
    callNextSlot(callee, 'advance', GAS_COST_PER_EXECUTION);
  } else {
    generateEvent(`GridOrder:BotCompleted|totalCycles=${botCounter}|totalExecuted=${totalExecuted}`);
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

  generateEvent('GridOrder:NextSlotScheduled');
}

/**
 * Cancel grid order
 */
export function cancelGridOrder(args: StaticArray<u8>): void {
  requireNotPaused();

  const argument = new Args(args);
  const orderId = argument.nextU64().unwrap();

  const foundOrder = getGridOrder(orderId);
  assert(foundOrder !== null, 'Order not found');
  const existingOrder: GridOrder = foundOrder as GridOrder;

  assert(
    existingOrder.user.toString() === Context.caller().toString(),
    'Only owner can cancel'
  );

  if (existingOrder.status !== ORDER_STATUS_ACTIVE) {
    generateEvent(`GridOrder:CannotCancel|id=${orderId}|status=${existingOrder.status}`);
    return;
  }

  existingOrder.status = ORDER_STATUS_CANCELLED;
  saveGridOrder(existingOrder);

  // Refund remaining amounts
  const gridAmounts = getGridAmounts(orderId);
  const gridExecuted = getGridExecuted(orderId);

  let refundAmount = u256.Zero;
  for (let i: u8 = 0; i < u8(gridAmounts.length); i++) {
    if (!gridExecuted[i]) {
      refundAmount = u256.add(refundAmount, gridAmounts[i]);
    }
  }

  if (!refundAmount.isZero()) {
    const tokenContract = new IERC20(existingOrder.tokenIn);
    tokenContract.transfer(existingOrder.user, refundAmount);

    generateEvent(`GridOrder:Refunded|id=${orderId}|amount=${refundAmount.toString()}`);
  }

  generateEvent(
    `GridOrder:Cancelled|id=${orderId}|user=${existingOrder.user.toString()}`
  );
}

/**
 * Set pause status
 */
export function setPaused(args: StaticArray<u8>): void {
  const argument = new Args(args);
  const paused = argument.nextBool().unwrap();
  setBool(PAUSED_KEY, paused);
  generateEvent(`GridOrders:${paused ? 'Paused' : 'Unpaused'}`);
}

/**
 * Update MassaBeam address
 */
export function setMassaBeamAddress(args: StaticArray<u8>): void {
  const argument = new Args(args);
  const newAddress = argument.nextString().unwrap();
  setString(MASSABEAM_KEY, newAddress);
  generateEvent(`GridOrders:MassaBeamUpdated|address=${newAddress}`);
}

// ============================================================================
// READ FUNCTIONS
// ============================================================================

/**
 * Read grid order by ID
 */
export function readGridOrder(args: StaticArray<u8>): StaticArray<u8> {
  const argument = new Args(args);
  const orderId = argument.nextU64().unwrap();

  const order = getGridOrder(orderId);
  if (order === null) {
    return stringToBytes('null');
  }

  const result = new Args();
  result.add(order.serialize());

  // Add grid data
  const gridLevels = getGridLevels(orderId);
  const gridAmounts = getGridAmounts(orderId);
  const gridExecuted = getGridExecuted(orderId);

  result.add(u8(gridLevels.length));
  for (let i = 0; i < gridLevels.length; i++) {
    result.add(gridLevels[i]);
    result.add(gridAmounts[i]);
    result.add(gridExecuted[i]);
  }

  return result.serialize();
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
    const order = getGridOrder(i);
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
    const order = getGridOrder(i);
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
 * Get orders expiring soon
 */
export function getExpiringOrders(args: StaticArray<u8>): StaticArray<u8> {
  const argument = new Args(args);
  const timeWindow = argument.nextU64().unwrap();

  const totalOrders = getOrderCount();
  const expiringOrders: u64[] = [];
  const now = Context.timestamp();

  for (let i: u64 = 1; i <= totalOrders; i++) {
    const order = getGridOrder(i);
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
 * Get orders by type
 */
export function getOrdersByType(args: StaticArray<u8>): StaticArray<u8> {
  const argument = new Args(args);
  const orderType = argument.nextU8().unwrap();

  const totalOrders = getOrderCount();
  const matchingOrders: u64[] = [];

  for (let i: u64 = 1; i <= totalOrders; i++) {
    const order = getGridOrder(i);
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
 * Get grid order execution status
 */
export function getGridExecutionStatus(args: StaticArray<u8>): StaticArray<u8> {
  const argument = new Args(args);
  const orderId = argument.nextU64().unwrap();

  const order = getGridOrder(orderId);
  if (order === null) {
    return stringToBytes('null');
  }

  const gridLevels = getGridLevels(orderId);
  const gridExecuted = getGridExecuted(orderId);

  const result = new Args();
  result.add(orderId);
  result.add(order.status);
  result.add(u8(gridLevels.length));

  let completedLevels: u64 = 0;
  for (let i: u8 = 0; i < u8(gridLevels.length); i++) {
    result.add(gridLevels[i]);
    result.add(gridExecuted[i]);
    if (gridExecuted[i]) {
      completedLevels += 1;
    }
  }

  result.add(completedLevels);

  return result.serialize();
}

/**
 * Platform-wide statistics
 */
export function getPlatformStatistics(_: StaticArray<u8>): StaticArray<u8> {
  const totalOrders = getOrderCount();

  let activeOrders: u64 = 0;
  let filledOrders: u64 = 0;
  let cancelledOrders: u64 = 0;
  let expiredOrders: u64 = 0;

  for (let i: u64 = 1; i <= totalOrders; i++) {
    const order = getGridOrder(i);
    if (order != null) {
      if (order.status === ORDER_STATUS_ACTIVE) {
        activeOrders += 1;
      } else if (order.status === ORDER_STATUS_FILLED) {
        filledOrders += 1;
      } else if (order.status === ORDER_STATUS_CANCELLED) {
        cancelledOrders += 1;
      } else if (order.status === ORDER_STATUS_EXPIRED) {
        expiredOrders += 1;
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
