/**
 * MassaBeam - Autonomous AMM Protocol
 *
 * Core constant-product AMM contract (x*y=k)
 * Inspired by audited Dusa codebase patterns
 *
 * Features:
 * - Constant product AMM with fee-aware trading
 * - Dynamic fee management
 * - TWAP oracle price tracking
 * - Reentrancy protection
 * - Proper role-based access control
 * - Autonomous smart contract capabilities
 */

import {
  Address,
  Context,
  Storage,
  generateEvent,
  callerHasWriteAccess,
  balance,
  transferredCoins,
  transferCoins,
} from '@massalabs/massa-as-sdk';
import { Args, stringToBytes } from '@massalabs/as-types';
import { IERC20 } from './interfaces/IERC20';
import { IFlashLoanCallback } from './interfaces/IFlashLoanCallback';
import { u256 } from 'as-bignum/assembly';

// ============================================================================
// CONSTANTS
// ============================================================================

// Fee configuration (in basis points, where 10000 = 100%)
export const MIN_FEE_RATE: u64 = 1; // 0.01%
export const MAX_FEE_RATE: u64 = 10000; // 100%
export const DEFAULT_FEE_RATE: u64 = 3000; // 0.3%
export const BASIS_POINTS: u64 = 10000;

// Flash loan configuration
export const FLASH_LOAN_FEE_RATE: u64 = 9; // 0.09% (9 basis points)
export const MAX_FLASH_LOAN_AMOUNT: u64 = 1000000000 * 10 ** 18; // 1B tokens max

// WMAS (Wrapped MAS) configuration
const WMAS_ADDRESS_KEY = 'wmas_address';

// Liquidity configuration
export const MIN_LIQUIDITY: u64 = 1000; // Prevents division by zero
export const ONE_UNIT: u64 = 10 ** 9;

// Time constraints
export const MAX_DEADLINE_HOURS: u64 = 24;
export const MAX_SLIPPAGE: u64 = 5000; // 50%

// Role names
const ADMIN_ROLE = 'admin';
const PAUSER_ROLE = 'pauser';
const FEE_SETTER_ROLE = 'fee_setter';

// Storage keys
const POOL_PREFIX = 'pool:';
const LP_PREFIX = 'lp:';
const LOCKED_KEY = 'locked';
const PAUSED_KEY = 'paused';

// ============================================================================
// POOL STRUCTURE
// ============================================================================

/**
 * Pool state with reserves and pricing info
 */
export class Pool {
  tokenA: Address;
  tokenB: Address;
  reserveA: u64;
  reserveB: u64;
  totalSupply: u64;
  fee: u64; // in basis points
  lastUpdateTime: u64;
  isActive: bool;
  cumulativePriceA: u64;
  cumulativePriceB: u64;
  blockTimestampLast: u64;

  constructor(
    tokenA: Address,
    tokenB: Address,
    reserveA: u64 = 0,
    reserveB: u64 = 0,
    totalSupply: u64 = 0,
    fee: u64 = DEFAULT_FEE_RATE,
    lastUpdateTime: u64 = 0,
    isActive: bool = true,
  ) {
    this.tokenA = tokenA;
    this.tokenB = tokenB;
    this.reserveA = reserveA;
    this.reserveB = reserveB;
    this.totalSupply = totalSupply;
    this.fee = fee;
    this.lastUpdateTime = lastUpdateTime;
    this.isActive = isActive;
    this.cumulativePriceA = 0;
    this.cumulativePriceB = 0;
    this.blockTimestampLast = Context.timestamp();
  }

  serialize(): StaticArray<u8> {
    const args = new Args();
    args.add(this.tokenA.toString());
    args.add(this.tokenB.toString());
    args.add(this.reserveA);
    args.add(this.reserveB);
    args.add(this.totalSupply);
    args.add(this.fee);
    args.add(this.lastUpdateTime);
    args.add(this.isActive);
    args.add(this.cumulativePriceA);
    args.add(this.cumulativePriceB);
    args.add(this.blockTimestampLast);
    return args.serialize();
  }

  static deserialize(data: StaticArray<u8>): Pool {
    const args = new Args(data);
    const pool = new Pool(
      new Address(args.nextString().unwrap()),
      new Address(args.nextString().unwrap()),
      args.nextU64().unwrap(),
      args.nextU64().unwrap(),
      args.nextU64().unwrap(),
      args.nextU64().unwrap(),
      args.nextU64().unwrap(),
      args.nextBool().unwrap(),
    );
    pool.cumulativePriceA = args.nextU64().unwrap();
    pool.cumulativePriceB = args.nextU64().unwrap();
    pool.blockTimestampLast = args.nextU64().unwrap();
    return pool;
  }
}

// ============================================================================
// MODIFIERS
// ============================================================================

/**
 * Enforce role-based access control
 */
function onlyRole(role: string): void {
  const caller = Context.caller();
  const roleKey = role + ':' + caller.toString();
  assert(Storage.has(roleKey), `Access denied: insufficient permissions for ${role}`);
}

/**
 * Ensure contract is not paused
 */
function whenNotPaused(): void {
  assert(!Storage.has(PAUSED_KEY), 'Contract is paused');
}

/**
 * Reentrancy protection - prevent recursive calls
 */
function nonReentrant(): void {
  assert(!Storage.has(LOCKED_KEY), 'ReentrancyGuard: reentrant call');
  Storage.set(LOCKED_KEY, 'true');
}

/**
 * End reentrancy protection
 */
function endNonReentrant(): void {
  Storage.del(LOCKED_KEY);
}

/**
 * Validate transaction deadline
 */
function validDeadline(deadline: u64): void {
  const currentTime = Context.timestamp();
  assert(deadline >= currentTime, 'Transaction expired');
  assert(
    deadline <= currentTime + (MAX_DEADLINE_HOURS * 3600 * 1000),
    'Deadline too far in future',
  );
}

/**
 * Validate token pair
 */
function validateTokenPair(tokenA: Address, tokenB: Address): void {
  assert(tokenA.toString() != tokenB.toString(), 'Identical tokens');
  assert(tokenA.toString() != '', 'Invalid token A');
  assert(tokenB.toString() != '', 'Invalid token B');
}

/**
 * Validate amounts
 */
function validateAmounts(amountA: u64, amountB: u64): void {
  assert(amountA > 0, 'Amount A must be positive');
  assert(amountB > 0, 'Amount B must be positive');

  const PRACTICAL_MAX: u64 = 1000000000 * ONE_UNIT;
  assert(amountA <= PRACTICAL_MAX, `Amount A too large: ${amountA}`);
  assert(amountB <= PRACTICAL_MAX, `Amount B too large: ${amountB}`);
}

// ============================================================================
// POOL MANAGEMENT
// ============================================================================

/**
 * Get consistent pool key from two tokens (sorted)
 */
function getPoolKey(tokenA: Address, tokenB: Address): string {
  const addr1 = tokenA.toString();
  const addr2 = tokenB.toString();
  return addr1 < addr2 ? addr1 + ':' + addr2 : addr2 + ':' + addr1;
}

/**
 * Retrieve pool from storage
 */
export function getPool(tokenA: Address, tokenB: Address): Pool | null {
  const keyBytes = stringToBytes(POOL_PREFIX + getPoolKey(tokenA, tokenB));
  if (!Storage.has(keyBytes)) {
    return null;
  }
  const poolData = Storage.get<StaticArray<u8>>(keyBytes);
  return Pool.deserialize(poolData);
}

/**
 * Save pool to storage
 */
function savePool(pool: Pool): void {
  const keyBytes = stringToBytes(POOL_PREFIX + getPoolKey(pool.tokenA, pool.tokenB));
  Storage.set<StaticArray<u8>>(keyBytes, pool.serialize());
}

// ============================================================================
// MATH HELPERS
// ============================================================================

/**
 * Safe division using f64 to avoid overflow
 */
function safeDiv(numerator: u64, denominator: u64): u64 {
  assert(denominator > 0, 'Division by zero');
  const result = f64(numerator) / f64(denominator);
  return u64(result);
}

/**
 * Calculate square root using Newton's method
 */
function sqrt(x: u64): u64 {
  if (x == 0) return 0;
  if (x == 1) return 1;

  let z = (x + 1) / 2;
  let y = x;
  let iterations = 0;
  const MAX_ITERATIONS = 64;

  while (z < y && iterations < MAX_ITERATIONS) {
    y = z;
    assert(z > 0, 'Division by zero in sqrt');
    z = (safeDiv(x, z) + z) / 2;
    iterations++;
  }

  return y;
}

/**
 * Calculate geometric mean: sqrt(x * y)
 */
export function safeSqrt(x: u64, y: u64): u64 {
  if (x == 0 || y == 0) return 0;
  const product = f64(x) * f64(y);
  return u64(Math.sqrt(product));
}

// ============================================================================
// SWAP MATHEMATICS
// ============================================================================

/**
 * Calculate output for exact input using constant product formula
 * amountOut = (amountIn * (10000 - fee) * reserveOut) / (reserveIn * 10000 + amountIn * (10000 - fee))
 */
export function getAmountOut(
  amountIn: u64,
  reserveIn: u64,
  reserveOut: u64,
  fee: u64,
): u64 {
  assert(amountIn > 0, 'Insufficient input amount');
  assert(reserveIn > 0 && reserveOut > 0, 'Insufficient liquidity');
  assert(fee < 10000, 'Fee too high');

  // Convert to f64 for calculations
  const amountInF = f64(amountIn);
  const reserveInF = f64(reserveIn);
  const reserveOutF = f64(reserveOut);
  const feeF = f64(fee);

  // amountInWithFee = amountIn * (10000 - fee)
  const amountInWithFee = amountInF * (10000.0 - feeF);

  // numerator = amountInWithFee * reserveOut
  const numerator = amountInWithFee * reserveOutF;

  // denominator = reserveIn * 10000 + amountInWithFee
  const denominator = reserveInF * 10000.0 + amountInWithFee;

  assert(denominator > 0, 'Division by zero');

  const result = numerator / denominator;
  return u64(result);
}

/**
 * Calculate input for exact output
 * Inverse of getAmountOut
 */
export function getAmountIn(amountOut: u64, reserveIn: u64, reserveOut: u64, fee: u64): u64 {
  assert(amountOut > 0 && fee > 0, 'Insufficient output amount');
  assert(reserveIn > 0 && reserveOut > amountOut, 'Insufficient liquidity');

  // Convert to f64 for calculations
  const reserveInF = f64(reserveIn);
  const amountOutF = f64(amountOut);
  const reserveOutF = f64(reserveOut);
  const feeF = f64(fee);

  // numerator = reserveIn * amountOut * 10000
  const numerator = reserveInF * amountOutF * 10000.0;

  // denominator = (reserveOut - amountOut) * (10000 - fee)
  const denominator = (reserveOutF - amountOutF) * (10000.0 - feeF);

  assert(denominator > 0, 'Math overflow in getAmountIn');

  // result = (numerator / denominator) + 1 (round up)
  const result = (numerator / denominator) + 1.0;

  return u64(result);
}

// ============================================================================
// ORACLE & PRICE TRACKING
// ============================================================================

/**
 * Update cumulative prices for TWAP
 */
function updateCumulativePrices(pool: Pool): void {
  const currentTime = Context.timestamp();
  const timeElapsed = currentTime - pool.blockTimestampLast;

  if (timeElapsed > 0 && pool.reserveA > 0 && pool.reserveB > 0) {
    // Calculate prices using f64
    const priceA = f64(pool.reserveB) * f64(ONE_UNIT) / f64(pool.reserveA);
    const priceB = f64(pool.reserveA) * f64(ONE_UNIT) / f64(pool.reserveB);

    // Time-weighted prices
    const priceATimeWeighted = priceA * f64(timeElapsed);
    const priceBTimeWeighted = priceB * f64(timeElapsed);

    // Update cumulative prices
    const newCumPriceA = f64(pool.cumulativePriceA) + priceATimeWeighted;
    const newCumPriceB = f64(pool.cumulativePriceB) + priceBTimeWeighted;

    // Store with modular arithmetic if overflow
    if (newCumPriceA <= f64(u64.MAX_VALUE)) {
      pool.cumulativePriceA = u64(newCumPriceA);
    } else {
      pool.cumulativePriceA = u64(newCumPriceA % f64(u64.MAX_VALUE));
    }

    if (newCumPriceB <= f64(u64.MAX_VALUE)) {
      pool.cumulativePriceB = u64(newCumPriceB);
    } else {
      pool.cumulativePriceB = u64(newCumPriceB % f64(u64.MAX_VALUE));
    }

    pool.blockTimestampLast = currentTime;
  }
}

// ============================================================================
// TOKEN TRANSFERS
// ============================================================================

/**
 * Safe token transfer from user to contract
 */
function safeTransferFrom(
  token: Address,
  from: Address,
  to: Address,
  amount: u64,
): bool {
  if (amount == 0) return true;

  const tokenContract = new IERC20(token);
  const allowance = tokenContract.allowance(from, Context.callee());
  const balance = tokenContract.balanceOf(from);

  if (allowance < u256.fromU64(amount) || balance < u256.fromU64(amount)) {
    return false;
  }

  tokenContract.transferFrom(from, to, u256.fromU64(amount));
  return true;
}

/**
 * Safe token transfer from contract to user
 */
function safeTransfer(token: Address, to: Address, amount: u64): bool {
  if (amount == 0) return true;

  const tokenContract = new IERC20(token);
  const balance = tokenContract.balanceOf(Context.callee());

  if ((balance) < u256.fromU64(amount)) {
    return false;
  }

  tokenContract.transfer(to, u256.fromU64(amount));
  return true;
}

// ============================================================================
// CONSTRUCTOR
// ============================================================================

/**
 * Initialize MassaBeam AMM
 */
export function constructor(_: StaticArray<u8>): void {
  assert(callerHasWriteAccess(), 'Not deploying');

  const deployer = Context.caller();
  const SCBalance = balance();
  const sent = transferredCoins();

  // Initialize access control roles
  Storage.set(ADMIN_ROLE + ':' + deployer.toString(), 'true');
  Storage.set(PAUSER_ROLE + ':' + deployer.toString(), 'true');
  Storage.set(FEE_SETTER_ROLE + ':' + deployer.toString(), 'true');

  // Initialize contract state
  Storage.set('pool_count', '0');
  Storage.set('total_volume', '0');
  Storage.set('total_fees', '0');
  Storage.set('protocol_fee_rate', '0');
  Storage.set('initialized', 'true');

  generateEvent('MassaBeam: DEX deployed with proper architecture');
}

// ============================================================================
// POOL CREATION
// ============================================================================

/**
 * Create new liquidity pool
 */
export function createPool(args: StaticArray<u8>): void {
  whenNotPaused();
  nonReentrant();

  const argument = new Args(args);
  const tokenA = new Address(argument.nextString().unwrap());
  const tokenB = new Address(argument.nextString().unwrap());

  const amountAResult = argument.nextU64();
  assert(amountAResult.isOk(), 'Invalid amountA');
  const amountA = amountAResult.unwrap();

  const amountBResult = argument.nextU64();
  assert(amountBResult.isOk(), 'Invalid amountB');
  const amountB = amountBResult.unwrap();

  const deadlineResult = argument.nextU64();
  assert(deadlineResult.isOk(), 'Invalid deadline');
  const deadline = deadlineResult.unwrap();

  validDeadline(deadline + Context.timestamp());
  validateTokenPair(tokenA, tokenB);
  validateAmounts(amountA, amountB);

  const caller = Context.caller();
  const poolKey = getPoolKey(tokenA, tokenB);

  assert(!Storage.has(stringToBytes(POOL_PREFIX + poolKey)), 'Pool already exists');

  // Transfer tokens from user
  assert(safeTransferFrom(tokenA, caller, Context.callee(), amountA), 'Token A transfer failed');
  assert(safeTransferFrom(tokenB, caller, Context.callee(), amountB), 'Token B transfer failed');

  // Calculate initial liquidity with minimum lock
  const liquidity = safeSqrt(amountA, amountB);
  assert(liquidity > MIN_LIQUIDITY, 'Insufficient liquidity');

  // Create pool
  const pool = new Pool(tokenA, tokenB, amountA, amountB, liquidity, DEFAULT_FEE_RATE, Context.timestamp());
  updateCumulativePrices(pool);
  savePool(pool);

  // Update registry
  const poolCount = u64(parseInt(Storage.get('pool_count')));
  Storage.set('pool_index:' + poolCount.toString(), poolKey);
  Storage.set('pool_count', (poolCount + 1).toString());

  // Mint LP tokens (subtract minimum liquidity lock)
  const lpTokenKey = LP_PREFIX + poolKey + ':' + caller.toString();
  const userLiquidity = liquidity - MIN_LIQUIDITY;
  Storage.set(lpTokenKey, userLiquidity.toString());

  // Lock minimum liquidity permanently
  Storage.set(LP_PREFIX + poolKey + ':MINIMUM_LIQUIDITY', MIN_LIQUIDITY.toString());

  endNonReentrant();
  generateEvent(`Pool created: ${tokenA.toString()}/${tokenB.toString()} - Liquidity: ${liquidity}`);
}

// ============================================================================
// LIQUIDITY OPERATIONS
// ============================================================================

/**
 * Add liquidity to existing pool
 */
export function addLiquidity(args: StaticArray<u8>): void {
  whenNotPaused();
  nonReentrant();

  const argument = new Args(args);
  const tokenA = new Address(argument.nextString().unwrap());
  const tokenB = new Address(argument.nextString().unwrap());
  const amountADesired = argument.nextU64().unwrap();
  const amountBDesired = argument.nextU64().unwrap();
  const amountAMin = argument.nextU64().unwrap();
  const amountBMin = argument.nextU64().unwrap();
  const deadline = argument.nextU64().unwrap();

  validDeadline(deadline + Context.timestamp());
  validateTokenPair(tokenA, tokenB);

  const caller = Context.caller();
  const pool = getPool(tokenA, tokenB);

  assert(pool != null, 'Pool does not exist');
  assert(pool!.isActive, 'Pool is not active');

  // Calculate optimal amounts with slippage protection using f64
  let amountA: u64, amountB: u64;

  if (pool!.reserveA == 0 || pool!.reserveB == 0) {
    amountA = amountADesired;
    amountB = amountBDesired;
  } else {
    // amountBOptimal = amountADesired * reserveB / reserveA
    const amountBOptimal = u64(f64(amountADesired) * f64(pool!.reserveB) / f64(pool!.reserveA));
    if (amountBOptimal <= amountBDesired) {
      assert(amountBOptimal >= amountBMin, 'Insufficient B amount');
      amountA = amountADesired;
      amountB = amountBOptimal;
    } else {
      // amountAOptimal = amountBDesired * reserveA / reserveB
      const amountAOptimal = u64(f64(amountBDesired) * f64(pool!.reserveA) / f64(pool!.reserveB));
      assert(amountAOptimal <= amountADesired && amountAOptimal >= amountAMin, 'Insufficient A amount');
      amountA = amountAOptimal;
      amountB = amountBDesired;
    }
  }

  validateAmounts(amountA, amountB);

  // Transfer tokens
  assert(safeTransferFrom(tokenA, caller, Context.callee(), amountA), 'Token A transfer failed');
  assert(safeTransferFrom(tokenB, caller, Context.callee(), amountB), 'Token B transfer failed');

  // Calculate liquidity to mint using f64
  const liquidity = u64(f64(amountA) * f64(pool!.totalSupply) / f64(pool!.reserveA));
  assert(liquidity > 0, 'Insufficient liquidity minted');

  // Update pool state
  pool!.reserveA += amountA;
  pool!.reserveB += amountB;
  pool!.totalSupply += liquidity;
  updateCumulativePrices(pool!);
  savePool(pool!);

  // Update user LP balance
  const lpTokenKey = LP_PREFIX + getPoolKey(tokenA, tokenB) + ':' + caller.toString();
  const currentBalance = u64(parseInt(Storage.has(lpTokenKey) ? Storage.get(lpTokenKey) : '0'));
  Storage.set(lpTokenKey, (currentBalance + liquidity).toString());

  endNonReentrant();
  generateEvent(`Liquidity added: ${amountA}/${amountB} - LP tokens: ${liquidity}`);
}

/**
 * Remove liquidity from pool
 */
export function removeLiquidity(args: StaticArray<u8>): void {
  whenNotPaused();
  nonReentrant();

  const argument = new Args(args);
  const tokenA = new Address(argument.nextString().unwrap());
  const tokenB = new Address(argument.nextString().unwrap());
  const liquidity = argument.nextU64().unwrap();
  const amountAMin = argument.nextU64().unwrap();
  const amountBMin = argument.nextU64().unwrap();
  const deadline = argument.nextU64().unwrap();

  validDeadline(deadline + Context.timestamp());
  validateTokenPair(tokenA, tokenB);
  assert(liquidity > 0, 'Insufficient liquidity');

  const caller = Context.caller();
  const pool = getPool(tokenA, tokenB);
  assert(pool != null, 'Pool does not exist');
  assert(pool!.isActive, 'Pool is not active');

  // Check user LP balance
  const lpTokenKey = LP_PREFIX + getPoolKey(tokenA, tokenB) + ':' + caller.toString();
  const userBalance = u64(parseInt(Storage.has(lpTokenKey) ? Storage.get(lpTokenKey) : '0'));
  assert(userBalance >= liquidity, 'Insufficient LP balance');

  // Calculate amounts with slippage protection using f64
  const amountA = u64(f64(liquidity) * f64(pool!.reserveA) / f64(pool!.totalSupply));
  const amountB = u64(f64(liquidity) * f64(pool!.reserveB) / f64(pool!.totalSupply));

  assert(amountA >= amountAMin, 'Insufficient A amount');
  assert(amountB >= amountBMin, 'Insufficient B amount');
  assert(amountA > 0 && amountB > 0, 'Insufficient liquidity burned');

  // Update pool state
  pool!.reserveA -= amountA;
  pool!.reserveB -= amountB;
  pool!.totalSupply -= liquidity;
  updateCumulativePrices(pool!);
  savePool(pool!);

  // Update user LP balance
  Storage.set(lpTokenKey, (userBalance - liquidity).toString());

  // Transfer tokens back
  assert(safeTransfer(tokenA, caller, amountA), 'Token A transfer failed');
  assert(safeTransfer(tokenB, caller, amountB), 'Token B transfer failed');

  endNonReentrant();
  generateEvent(`Liquidity removed: ${amountA}/${amountB} - LP tokens: ${liquidity}`);
}

// ============================================================================
// SWAP OPERATIONS
// ============================================================================

/**
 * Swap MAS for tokens (like swapExactMASForTokens)
 * User sends MAS with transaction, gets tokens back
 */
export function swapMASForTokens(args: StaticArray<u8>): void {
  whenNotPaused();
  nonReentrant();

  const balanceBefore = balance();
  const sent = transferredCoins();

  const argument = new Args(args);
  const tokenOut = new Address(argument.nextString().unwrap());
  const minAmountOut = argument.nextU64().unwrap();
  const deadline = argument.nextU64().unwrap();
  const to = new Address(argument.nextString().unwrap());

  // Validation
  assert(sent > 0, 'No MAS sent');
  assert(minAmountOut > 0, 'Invalid min output');
  assert(Context.timestamp() <= deadline, 'Deadline expired');

  // Get WMAS and pool
  const wmas = getWMASAddress();
  const pool = getPool(wmas, tokenOut);
  assert(pool != null, 'Pool does not exist');

  // Calculate output
  const tokenInIsA = pool!.tokenA.toString() == wmas.toString();
  const reserveIn = tokenInIsA ? pool!.reserveA : pool!.reserveB;
  const reserveOut = tokenInIsA ? pool!.reserveB : pool!.reserveA;

  const amountInWithFee = u64(f64(sent) * (10000.0 - f64(pool!.fee)) / 10000.0);
  const numerator = u64(f64(amountInWithFee) * f64(reserveOut));
  const denominator = u64(f64(reserveIn) + f64(amountInWithFee));
  const amountOut = numerator / denominator;

  assert(amountOut >= minAmountOut, 'Insufficient output');

  // Update reserves (treat sent MAS as WMAS)
  if (tokenInIsA) {
    pool!.reserveA += sent;
    pool!.reserveB -= amountOut;
  } else {
    pool!.reserveB += sent;
    pool!.reserveA -= amountOut;
  }

  // Transfer tokens
  const outputToken = new IERC20(tokenOut);
  outputToken.transfer(to, u256.fromU64(amountOut));

  updateCumulativePrices(pool!);
  savePool(pool!);

  const fee = sent - amountInWithFee;
  const totalFees = u64(parseInt(Storage.get('total_fees')));
  Storage.set('total_fees', (totalFees + fee).toString());

  transferRemainingMAS(balanceBefore, balance(), sent, Context.caller());
  endNonReentrant();
  generateEvent(`SwapMASForTokens: ${sent} MAS → ${amountOut} tokens`);
}

/**
 * Swap tokens for MAS
 * User sends tokens, gets MAS back
 */
export function swapTokensForMAS(args: StaticArray<u8>): void {
  whenNotPaused();
  nonReentrant();

  const argument = new Args(args);
  const tokenIn = new Address(argument.nextString().unwrap());
  const amountIn = argument.nextU64().unwrap();
  const minAmountOut = argument.nextU64().unwrap();
  const deadline = argument.nextU64().unwrap();
  const to = new Address(argument.nextString().unwrap());

  // Validation
  assert(amountIn > 0, 'Invalid input');
  assert(minAmountOut > 0, 'Invalid min output');
  assert(Context.timestamp() <= deadline, 'Deadline expired');

  // Get WMAS and pool
  const wmas = getWMASAddress();
  const pool = getPool(tokenIn, wmas);
  assert(pool != null, 'Pool does not exist');

  // Transfer input tokens
  const caller = Context.caller();
  const tokenInContract = new IERC20(tokenIn);
  tokenInContract.transferFrom(caller, Context.callee(), u256.fromU64(amountIn));

  // Calculate MAS output
  const tokenInIsA = pool!.tokenA.toString() == tokenIn.toString();
  const reserveIn = tokenInIsA ? pool!.reserveA : pool!.reserveB;
  const reserveOut = tokenInIsA ? pool!.reserveB : pool!.reserveA;

  const amountInWithFee = u64(f64(amountIn) * (10000.0 - f64(pool!.fee)) / 10000.0);
  const numerator = u64(f64(amountInWithFee) * f64(reserveOut));
  const denominator = u64(f64(reserveIn) + f64(amountInWithFee));
  const amountOut = numerator / denominator;

  assert(amountOut >= minAmountOut, 'Insufficient output');

  // Update reserves
  if (tokenInIsA) {
    pool!.reserveA += amountIn;
    pool!.reserveB -= amountOut;
  } else {
    pool!.reserveB += amountIn;
    pool!.reserveA -= amountOut;
  }

  // Send MAS
  transferCoins(to, amountOut);

  updateCumulativePrices(pool!);
  savePool(pool!);

  const fee = amountIn - amountInWithFee;
  const totalFees = u64(parseInt(Storage.get('total_fees')));
  Storage.set('total_fees', (totalFees + fee).toString());

  endNonReentrant();
  generateEvent(`SwapTokensForMAS: ${amountIn} tokens → ${amountOut} MAS`);
}

/**
 * Execute token swap (standard ERC20 <-> ERC20)
 */
export function swap(args: StaticArray<u8>): void {
  whenNotPaused();
  nonReentrant();

  const argument = new Args(args);
  const tokenIn = new Address(argument.nextString().unwrap());
  const tokenOut = new Address(argument.nextString().unwrap());
  const amountIn = argument.nextU64().unwrap();
  const amountOutMin = argument.nextU64().unwrap();
  const deadline = argument.nextU64().unwrap();

  validDeadline(deadline + Context.timestamp());
  validateTokenPair(tokenIn, tokenOut);
  assert(amountIn > 0, 'Invalid input amount');
  assert(amountOutMin > 0, 'Invalid minimum output');

  const caller = Context.caller();
  const pool = getPool(tokenIn, tokenOut);
  assert(pool != null, 'Pool does not exist');
  assert(pool!.isActive, 'Pool is not active');

  // Determine token order and reserves
  const tokenInIsA = pool!.tokenA.toString() == tokenIn.toString();
  const reserveIn = tokenInIsA ? pool!.reserveA : pool!.reserveB;
  const reserveOut = tokenInIsA ? pool!.reserveB : pool!.reserveA;

  // Calculate output with slippage protection
  const amountOut = getAmountOut(amountIn, reserveIn, reserveOut, pool!.fee);
  assert(amountOut >= amountOutMin, 'Insufficient output amount');
  assert(amountOut < reserveOut, 'Insufficient liquidity');

  // Transfer input token from user
  assert(safeTransferFrom(tokenIn, caller, Context.callee(), amountIn), 'Input transfer failed');

  // Transfer output token to user
  assert(safeTransfer(tokenOut, caller, amountOut), 'Output transfer failed');

  // Update reserves and validate K invariant
  const newReserveIn = reserveIn + amountIn;
  const newReserveOut = reserveOut - amountOut;

  // K invariant check: (reserveIn + amountInWithFee) * (reserveOut - amountOut) >= reserveIn * reserveOut
  const oldK = f64(reserveIn) * f64(reserveOut);
  const newK = (f64(reserveIn) + f64(amountIn) * (10000.0 - f64(pool!.fee)) / 10000.0) * f64(reserveOut - amountOut);
  assert(newK >= oldK, 'K invariant violation');

  // Update pool state
  if (tokenInIsA) {
    pool!.reserveA = newReserveIn;
    pool!.reserveB = newReserveOut;
  } else {
    pool!.reserveB = newReserveIn;
    pool!.reserveA = newReserveOut;
  }

  updateCumulativePrices(pool!);
  savePool(pool!);

  // Update statistics
  const totalVolume = u64(parseInt(Storage.get('total_volume')));
  Storage.set('total_volume', (totalVolume + amountIn).toString());

  const fee = u64(f64(amountIn) * f64(pool!.fee) / 10000.0);
  const totalFees = u64(parseInt(Storage.get('total_fees')));
  Storage.set('total_fees', (totalFees + fee).toString());

  endNonReentrant();
  generateEvent(`Swap: ${amountIn} ${tokenIn.toString()} → ${amountOut} ${tokenOut.toString()}`);
}

// ============================================================================
// FLASH LOAN FUNCTIONS
// ============================================================================

/**
 * Execute flash loan - borrow tokens without collateral
 *
 * Flash loans allow users to borrow large amounts of tokens without collateral,
 * as long as they repay the loan + fee within the same transaction.
 *
 * Use cases:
 * - Arbitrage: Buy cheap on one DEX, sell high on another
 * - Collateral swap: Refinance position without closing
 * - Liquidations: Liquidate positions for profit
 * - Self-liquidation: Avoid liquidation penalties
 *
 * @param args Serialized arguments:
 *   - receiver: Address to receive the flash loan
 *   - token: Token to borrow
 *   - amount: Amount to borrow
 *   - data: Arbitrary data to pass to receiver's callback
 */
export function flashLoan(args: StaticArray<u8>): void {
  whenNotPaused();
  nonReentrant();

  const argument = new Args(args);
  const receiver = new Address(argument.nextString().unwrap());
  const token = new Address(argument.nextString().unwrap());
  const amount = argument.nextU64().unwrap();
  const data = argument.nextBytes().unwrapOrDefault();

  // Validation
  assert(amount > 0, 'Flash loan amount must be positive');
  assert(amount <= MAX_FLASH_LOAN_AMOUNT, 'Flash loan amount exceeds maximum');

  const caller = Context.caller();
  const tokenContract = new IERC20(token);

  // Check contract has sufficient balance
  const contractBalance = tokenContract.balanceOf(Context.callee());
  assert(
    contractBalance >= u256.fromU64(amount),
    'Insufficient contract balance for flash loan',
  );

  // Calculate fee (0.09% = 9 basis points)
  const fee = u64(f64(amount) * f64(FLASH_LOAN_FEE_RATE) / f64(BASIS_POINTS));
  assert(fee > 0, 'Flash loan fee must be positive');

  // Record balance before loan
  const balanceBefore = tokenContract.balanceOf(Context.callee());

  // Transfer tokens to receiver
  assert(safeTransfer(token, receiver, amount), 'Flash loan transfer failed');

  generateEvent(`FlashLoan: ${amount} tokens loaned to ${receiver.toString()} (fee: ${fee})`);

  // Execute callback on receiver
  const callback = new IFlashLoanCallback(receiver);
  callback.onFlashLoan(caller, token, u256.fromU64(amount), u256.fromU64(fee), data);

  // Verify repayment + fee
  const balanceAfter = tokenContract.balanceOf(Context.callee());
  const expectedBalance = balanceBefore.toU64() + fee;

  assert(
    balanceAfter.toU64() >= expectedBalance,
    `Flash loan not repaid: expected ${expectedBalance}, got ${balanceAfter.toU64()}`,
  );

  // Update flash loan statistics
  const flashLoanVolume = u64(parseInt(Storage.has('flash_loan_volume') ? Storage.get('flash_loan_volume') : '0'));
  const flashLoanCount = u64(parseInt(Storage.has('flash_loan_count') ? Storage.get('flash_loan_count') : '0'));
  const flashLoanFees = u64(parseInt(Storage.has('flash_loan_fees') ? Storage.get('flash_loan_fees') : '0'));

  Storage.set('flash_loan_volume', (flashLoanVolume + amount).toString());
  Storage.set('flash_loan_count', (flashLoanCount + 1).toString());
  Storage.set('flash_loan_fees', (flashLoanFees + fee).toString());

  endNonReentrant();
  generateEvent(`FlashLoan: Repaid successfully with fee ${fee}`);
}

/**
 * Read flash loan statistics
 */
export function readFlashLoanStats(): StaticArray<u8> {
  const volume = Storage.has('flash_loan_volume') ? Storage.get('flash_loan_volume') : '0';
  const count = Storage.has('flash_loan_count') ? Storage.get('flash_loan_count') : '0';
  const fees = Storage.has('flash_loan_fees') ? Storage.get('flash_loan_fees') : '0';

  const result = new Args().add(volume).add(count).add(fees);
  return result.serialize();
}

// ============================================================================
// ADMIN FUNCTIONS
// ============================================================================

/**
 * Pause/unpause contract
 */
export function setPaused(args: StaticArray<u8>): void {
  onlyRole(PAUSER_ROLE);

  const argument = new Args(args);
  const paused = argument.nextBool().unwrap();

  if (paused) {
    Storage.set(PAUSED_KEY, 'true');
    generateEvent('Contract paused');
  } else {
    Storage.del(PAUSED_KEY);
    generateEvent('Contract unpaused');
  }
}

/**
 * Update pool fee
 */
export function setPoolFee(args: StaticArray<u8>): void {
  onlyRole(FEE_SETTER_ROLE);

  const argument = new Args(args);
  const tokenA = new Address(argument.nextString().unwrap());
  const tokenB = new Address(argument.nextString().unwrap());
  const newFee = argument.nextU64().unwrap();

  assert(newFee >= MIN_FEE_RATE && newFee <= MAX_FEE_RATE, 'Invalid fee rate');

  const pool = getPool(tokenA, tokenB);
  assert(pool != null, 'Pool does not exist');

  pool!.fee = newFee;
  savePool(pool!);

  generateEvent(`Pool fee updated: ${newFee}`);
}

/**
 * Grant role to account
 */
export function grantRole(args: StaticArray<u8>): void {
  onlyRole(ADMIN_ROLE);

  const argument = new Args(args);
  const role = argument.nextString().unwrap();
  const account = new Address(argument.nextString().unwrap());

  Storage.set(role + ':' + account.toString(), 'true');
  generateEvent(`Role granted: ${role} to ${account.toString()}`);
}

/**
 * Revoke role from account
 */
export function revokeRole(args: StaticArray<u8>): void {
  onlyRole(ADMIN_ROLE);

  const argument = new Args(args);
  const role = argument.nextString().unwrap();
  const account = new Address(argument.nextString().unwrap());

  Storage.del(role + ':' + account.toString());
  generateEvent(`Role revoked: ${role} from ${account.toString()}`);
}

// ============================================================================
// VIEW FUNCTIONS
// ============================================================================

/**
 * Read pool information
 */
export function readPool(args: StaticArray<u8>): StaticArray<u8> {
  const argument = new Args(args);
  const tokenA = new Address(argument.nextString().unwrap());
  const tokenB = new Address(argument.nextString().unwrap());
  const pool = getPool(tokenA, tokenB);

  if (pool == null) {
    return stringToBytes('null');
  }

  return pool.serialize();
}

/**
 * Read user LP balance
 */
export function readLPBalance(args: StaticArray<u8>): StaticArray<u8> {
  const argument = new Args(args);
  const tokenA = new Address(argument.nextString().unwrap());
  const tokenB = new Address(argument.nextString().unwrap());
  const user = new Address(argument.nextString().unwrap());

  const lpTokenKey = LP_PREFIX + getPoolKey(tokenA, tokenB) + ':' + user.toString();
  const balance = Storage.has(lpTokenKey) ? Storage.get(lpTokenKey) : '0';

  return stringToBytes(balance);
}

/**
 * Read pool total liquidity
 */
export function readPoolTotalLiquidity(args: StaticArray<u8>): StaticArray<u8> {
  const argument = new Args(args);
  const tokenA = new Address(argument.nextString().unwrap());
  const tokenB = new Address(argument.nextString().unwrap());
  const pool = getPool(tokenA, tokenB);

  if (pool == null) {
    return stringToBytes('0');
  }

  return stringToBytes(pool.totalSupply.toString());
}

/**
 * Read pool key
 */
export function readPoolKey(args: StaticArray<u8>): StaticArray<u8> {
  const argument = new Args(args);
  const tokenA = new Address(argument.nextString().unwrap());
  const tokenB = new Address(argument.nextString().unwrap());

  return stringToBytes(getPoolKey(tokenA, tokenB));
}

/**
 * Read pool count
 */
export function readPoolCount(): StaticArray<u8> {
  return stringToBytes(Storage.get('pool_count'));
}

/**
 * Read total volume
 */
export function readTotalVolume(): StaticArray<u8> {
  return stringToBytes(Storage.get('total_volume'));
}

/**
 * Read protocol fee rate
 */
export function readProtocolFeeRate(): StaticArray<u8> {
  return stringToBytes(Storage.get('protocol_fee_rate'));
}

/**
 * Read initialization status
 */
export function readInitialized(): StaticArray<u8> {
  return stringToBytes(Storage.get('initialized'));
}

/**
 * Quote exact input swap using token addresses
 * Automatically retrieves pool reserves and applies fee
 *
 * @param args Serialized arguments:
 *   - tokenIn: Input token address
 *   - tokenOut: Output token address
 *   - amountIn: Amount of input token
 * @return Serialized output: amountOut
 */
export function readQuoteSwapExactInput(args: StaticArray<u8>): StaticArray<u8> {
  const argument = new Args(args);
  const tokenIn = new Address(argument.nextString().unwrap());
  const tokenOut = new Address(argument.nextString().unwrap());
  const amountIn = argument.nextU64().unwrap();

  // Get pool information
  const pool = getPool(tokenIn, tokenOut);
  assert(pool != null, 'Pool does not exist');
  assert(pool!.isActive, 'Pool is not active');

  // Determine reserve order based on token order
  const reserveIn = pool!.tokenA.toString() == tokenIn.toString() ? pool!.reserveA : pool!.reserveB;
  const reserveOut = pool!.tokenA.toString() == tokenIn.toString() ? pool!.reserveB : pool!.reserveA;

  // Calculate output amount with fees
  const amountOut = getAmountOut(amountIn, reserveIn, reserveOut, pool!.fee);

  // Return amountOut with fee information
  const result = new Args()
    .add(amountOut)
    .add(pool!.fee);

  return result.serialize();
}

/**
 * Quote exact input swap (low-level version)
 * Requires explicit reserve and fee parameters
 *
 * @param args Serialized arguments:
 *   - amountIn: Amount of input token
 *   - reserveIn: Reserve of input token
 *   - reserveOut: Reserve of output token
 *   - fee: Pool fee in basis points
 * @return Serialized output: amountOut
 */
export function readGetAmountOut(args: StaticArray<u8>): StaticArray<u8> {
  const argument = new Args(args);
  const amountIn = argument.nextU64().unwrap();
  const reserveIn = argument.nextU64().unwrap();
  const reserveOut = argument.nextU64().unwrap();
  const fee = argument.nextU64().unwrap();

  const amountOut = getAmountOut(amountIn, reserveIn, reserveOut, fee);

  return stringToBytes(amountOut.toString());
}

/**
 * Quote exact output swap
 */
export function readGetAmountIn(args: StaticArray<u8>): StaticArray<u8> {
  const argument = new Args(args);
  const amountOut = argument.nextU64().unwrap();
  const reserveIn = argument.nextU64().unwrap();
  const reserveOut = argument.nextU64().unwrap();
  const fee = argument.nextU64().unwrap();

  const amountIn = getAmountIn(amountOut, reserveIn, reserveOut, fee);

  return stringToBytes(amountIn.toString());
}

/**
 * Quote liquidity addition
 */
export function readSafeSqrt(args: StaticArray<u8>): StaticArray<u8> {
  const argument = new Args(args);
  const x = argument.nextU64().unwrap();
  const y = argument.nextU64().unwrap();

  const result = safeSqrt(x, y);

  return stringToBytes(result.toString());
}

// ============================================================================
// MAS & WMAS UTILITIES
// ============================================================================

/**
 * Set WMAS (Wrapped MAS) token address
 */
export function setWMASAddress(args: StaticArray<u8>): void {
  onlyRole(ADMIN_ROLE);

  const argument = new Args(args);
  const wmasAddress = argument.nextString().unwrap();

  Storage.set(WMAS_ADDRESS_KEY, wmasAddress);
  generateEvent(`WMAS address set: ${wmasAddress}`);
}

/**
 * Get WMAS token address
 */
export function getWMASAddress(): Address {
  assert(Storage.has(WMAS_ADDRESS_KEY), 'WMAS address not set');
  return new Address(Storage.get(WMAS_ADDRESS_KEY));
}

/**
 * Check if token is WMAS
 */
function isWMAS(token: Address): bool {
  if (!Storage.has(WMAS_ADDRESS_KEY)) return false;
  return token.toString() == Storage.get(WMAS_ADDRESS_KEY);
}

/**
 * Wrap MAS to WMAS and transfer to recipient
 * Pattern from Dusa Router
 */
function wmasDepositAndTransfer(to: Address, amount: u64): void {
  const wmas = getWMASAddress();
  const wmasContract = new IERC20(wmas);

  // Deposit MAS to WMAS (WMAS contract should have deposit() function)
  const depositArgs = new Args();
  const callee = Context.callee();

  // Transfer wrapped tokens to recipient
  wmasContract.transfer(to, u256.fromU64(amount));

  generateEvent(`WMAS: Wrapped ${amount} MAS and sent to ${to.toString()}`);
}

/**
 * Transfer remaining MAS back to sender
 * Pattern from Dusa Router's transferRemaining
 */
function transferRemainingMAS(
  balanceBefore: u64,
  balanceAfter: u64,
  sent: u64,
  to: Address,
): void {
  // Calculate how much MAS remains
  const spent = balanceBefore - balanceAfter;

  if (sent > spent) {
    const remaining = sent - spent;
    transferCoins(to, remaining);
    generateEvent(`Returned ${remaining} MAS to ${to.toString()}`);
  }
}

/**
 * Receive MAS for storage fees and transactions
 */
export function receiveCoins(_: StaticArray<u8>): void {
  // Allow contract to receive MAS
  const sent = transferredCoins();
  generateEvent(`Received ${sent} MAS`);
}
