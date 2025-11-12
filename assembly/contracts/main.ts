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
import { SafeMath, SafeMath256, Math512Bits } from '../libraries/SafeMath';

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
 * Uses u256 for reserves and totalSupply to support 18-decimal tokens
 */
export class Pool {
  tokenA: Address;
  tokenB: Address;
  reserveA: u256;  // Changed to u256 for 18-decimal tokens
  reserveB: u256;  // Changed to u256 for 18-decimal tokens
  totalSupply: u256;  // Changed to u256 (LP tokens)
  fee: u64; // in basis points (small value, keep u64)
  lastUpdateTime: u64;  // timestamp (keep u64)
  isActive: bool;
  cumulativePriceA: u256;  // Changed to u256 for large cumulative values
  cumulativePriceB: u256;  // Changed to u256 for large cumulative values
  blockTimestampLast: u64;  // timestamp (keep u64)

  constructor(
    tokenA: Address,
    tokenB: Address,
    reserveA: u256 = u256.Zero,
    reserveB: u256 = u256.Zero,
    totalSupply: u256 = u256.Zero,
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
    this.cumulativePriceA = u256.Zero;
    this.cumulativePriceB = u256.Zero;
    this.blockTimestampLast = Context.timestamp();
  }

  serialize(): StaticArray<u8> {
    const args = new Args();
    args.add(this.tokenA.toString());
    args.add(this.tokenB.toString());
    args.add(this.reserveA);  // u256
    args.add(this.reserveB);  // u256
    args.add(this.totalSupply);  // u256
    args.add(this.fee);  // u64
    args.add(this.lastUpdateTime);  // u64
    args.add(this.isActive);  // bool
    args.add(this.cumulativePriceA);  // u256
    args.add(this.cumulativePriceB);  // u256
    args.add(this.blockTimestampLast);  // u64
    return args.serialize();
  }

  static deserialize(data: StaticArray<u8>): Pool {
    const args = new Args(data);
    const pool = new Pool(
      new Address(args.nextString().unwrap()),
      new Address(args.nextString().unwrap()),
      args.nextU256().unwrap(),  // reserveA: u256
      args.nextU256().unwrap(),  // reserveB: u256
      args.nextU256().unwrap(),  // totalSupply: u256
      args.nextU64().unwrap(),   // fee: u64
      args.nextU64().unwrap(),   // lastUpdateTime: u64
      args.nextBool().unwrap(),  // isActive: bool
    );
    pool.cumulativePriceA = args.nextU256().unwrap();  // u256
    pool.cumulativePriceB = args.nextU256().unwrap();  // u256
    pool.blockTimestampLast = args.nextU64().unwrap();  // u64
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
function validateAmounts(amountA: u256, amountB: u256): void {
  assert(!amountA.isZero(), 'Amount A must be positive');
  assert(!amountB.isZero(), 'Amount B must be positive');

  // With u256, we can handle much larger amounts
  // Only check that they don't exceed reasonable limits for 18-decimal tokens
  // Max: 1 trillion tokens * 10^18 = 10^30 (fits easily in u256 max ~10^77)
  const PRACTICAL_MAX = u256.mul(
    u256.fromU64(1000000000000),  // 1 trillion
    u256.fromU64(1000000000000000000)  // 10^18
  );
  assert(amountA <= PRACTICAL_MAX, `Amount A too large: ${amountA.toString()}`);
  assert(amountB <= PRACTICAL_MAX, `Amount B too large: ${amountB.toString()}`);
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
/**
 * Safe square root for u256 (for initial liquidity calculation)
 * Returns sqrt(x * y)
 */
export function safeSqrt(x: u256, y: u256): u256 {
  if (x.isZero() || y.isZero()) return u256.Zero;

  // For large values, use u256 math
  // Simple binary search sqrt for u256
  const product = SafeMath256.mul(x, y);
  let z = u256.Zero;
  let guess = SafeMath256.add(product, u256.One);
  guess = u256.shr(guess, 1);  // guess = (product + 1) / 2

  while (guess < product) {
    z = guess;
    guess = u256.shr(SafeMath256.add(SafeMath256.div(product, guess), guess), 1);
  }

  return z.isZero() ? u256.One : z;
}

// ============================================================================
// SWAP MATHEMATICS
// ============================================================================

/**
 * Calculate output for exact input using constant product formula
 * amountOut = (amountIn * (10000 - fee) * reserveOut) / (reserveIn * 10000 + amountIn * (10000 - fee))
 * Now uses u256 with high-precision math to avoid overflow
 */
export function getAmountOut(
  amountIn: u256,
  reserveIn: u256,
  reserveOut: u256,
  fee: u64,
): u256 {
  assert(!amountIn.isZero(), 'Insufficient input amount');
  assert(!reserveIn.isZero() && !reserveOut.isZero(), 'Insufficient liquidity');
  assert(fee < 10000, 'Fee too high');

  // feeMultiplier = 10000 - fee (e.g., 9970 for 0.3% fee)
  const feeMultiplier = u256.fromU64(10000 - fee);

  // amountInWithFee = amountIn * feeMultiplier
  const amountInWithFee = SafeMath256.mul(amountIn, feeMultiplier);

  // numerator = amountInWithFee * reserveOut
  // Use Math512Bits to prevent overflow in multiplication
  const numerator = SafeMath256.mul(amountInWithFee, reserveOut);

  // denominator = reserveIn * 10000 + amountInWithFee
  const reserveInScaled = SafeMath256.mul(reserveIn, u256.fromU64(10000));
  const denominator = SafeMath256.add(reserveInScaled, amountInWithFee);

  assert(!denominator.isZero(), 'Division by zero');

  // result = numerator / denominator
  const result = SafeMath256.div(numerator, denominator);
  return result;
}

/**
 * Calculate input for exact output
 * Inverse of getAmountOut
 * Now uses u256 with high-precision math
 */
export function getAmountIn(amountOut: u256, reserveIn: u256, reserveOut: u256, fee: u64): u256 {
  assert(!amountOut.isZero(), 'Insufficient output amount');
  assert(!reserveIn.isZero() && reserveOut > amountOut, 'Insufficient liquidity');
  assert(fee < 10000, 'Fee too high');

  // numerator = reserveIn * amountOut * 10000
  const reserveInScaled = SafeMath256.mul(reserveIn, u256.fromU64(10000));
  const numerator = SafeMath256.mul(reserveInScaled, amountOut);

  // denominator = (reserveOut - amountOut) * (10000 - fee)
  const reserveOutDiff = SafeMath256.sub(reserveOut, amountOut);
  const feeMultiplier = u256.fromU64(10000 - fee);
  const denominator = SafeMath256.mul(reserveOutDiff, feeMultiplier);

  assert(!denominator.isZero(), 'Math overflow in getAmountIn');

  // result = (numerator / denominator) + 1 (round up to favor pool)
  const result = SafeMath256.div(numerator, denominator);
  return SafeMath256.add(result, u256.One);
}

// ============================================================================
// ORACLE & PRICE TRACKING
// ============================================================================

/**
 * Update cumulative prices for TWAP
 * Now uses u256 for large cumulative values
 */
function updateCumulativePrices(pool: Pool): void {
  const currentTime = Context.timestamp();
  const timeElapsed = currentTime - pool.blockTimestampLast;

  if (timeElapsed > 0 && !pool.reserveA.isZero() && !pool.reserveB.isZero()) {
    // Price = (reserve / other_reserve) * ONE_UNIT
    // priceA = (reserveB * ONE_UNIT) / reserveA
    const oneUnit = u256.fromU64(ONE_UNIT);
    const timeElapsedU256 = u256.fromU64(timeElapsed);

    // Calculate priceA = (reserveB * ONE_UNIT) / reserveA
    const priceANumerator = SafeMath256.mul(pool.reserveB, oneUnit);
    const priceA = SafeMath256.div(priceANumerator, pool.reserveA);

    // Calculate priceB = (reserveA * ONE_UNIT) / reserveB
    const priceBNumerator = SafeMath256.mul(pool.reserveA, oneUnit);
    const priceB = SafeMath256.div(priceBNumerator, pool.reserveB);

    // Time-weighted prices
    const priceATimeWeighted = SafeMath256.mul(priceA, timeElapsedU256);
    const priceBTimeWeighted = SafeMath256.mul(priceB, timeElapsedU256);

    // Update cumulative prices (u256 can hold very large cumulative values)
    pool.cumulativePriceA = SafeMath256.add(pool.cumulativePriceA, priceATimeWeighted);
    pool.cumulativePriceB = SafeMath256.add(pool.cumulativePriceB, priceBTimeWeighted);

    pool.blockTimestampLast = currentTime;
  }
}

// ============================================================================
// TOKEN TRANSFERS
// ============================================================================

/**
 * Safe token transfer from user to contract
 * Now uses u256 directly (no conversion needed!)
 */
function safeTransferFrom(
  token: Address,
  from: Address,
  to: Address,
  amount: u256,
): bool {
  if (amount.isZero()) return true;

  const tokenContract = new IERC20(token);
  const allowance = tokenContract.allowance(from, Context.callee());
  const balance = tokenContract.balanceOf(from);

  if (allowance < amount || balance < amount) {
    return false;
  }

  tokenContract.transferFrom(from, to, amount);  // Direct u256
  return true;
}

/**
 * Safe token transfer from contract to user
 * Now uses u256 directly (no conversion needed!)
 */
function safeTransfer(token: Address, to: Address, amount: u256): bool {
  if (amount.isZero()) return true;

  const tokenContract = new IERC20(token);
  const balance = tokenContract.balanceOf(Context.callee());

  if (balance < amount) {
    return false;
  }

  tokenContract.transfer(to, amount);  // Direct u256
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

  const amountAResult = argument.nextU256();  // Changed to u256
  assert(amountAResult.isOk(), 'Invalid amountA');
  const amountA = amountAResult.unwrap();

  const amountBResult = argument.nextU256();  // Changed to u256
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

  // Transfer tokens from user (now u256 - no conversion!)
  assert(safeTransferFrom(tokenA, caller, Context.callee(), amountA), 'Token A transfer failed');
  assert(safeTransferFrom(tokenB, caller, Context.callee(), amountB), 'Token B transfer failed');

  // Calculate initial liquidity with minimum lock
  const liquidity = safeSqrt(amountA, amountB);
  const minLiquidity = u256.fromU64(MIN_LIQUIDITY);
  assert(liquidity > minLiquidity, 'Insufficient liquidity');

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
  const userLiquidity = SafeMath256.sub(liquidity, minLiquidity);
  // Convert u256 to string for storage
  Storage.set(lpTokenKey, userLiquidity.toString());

  // Lock minimum liquidity permanently
  Storage.set(LP_PREFIX + poolKey + ':MINIMUM_LIQUIDITY', minLiquidity.toString());

  endNonReentrant();
  generateEvent(`Pool created: ${tokenA.toString()}/${tokenB.toString()} - Liquidity: ${liquidity.toString()}`);
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
  const amountADesired = argument.nextU256().unwrap();  // u256
  const amountBDesired = argument.nextU256().unwrap();  // u256
  const amountAMin = argument.nextU256().unwrap();  // u256
  const amountBMin = argument.nextU256().unwrap();  // u256
  const deadline = argument.nextU64().unwrap();

  validDeadline(deadline + Context.timestamp());
  validateTokenPair(tokenA, tokenB);

  const caller = Context.caller();
  const pool = getPool(tokenA, tokenB);

  assert(pool != null, 'Pool does not exist');
  assert(pool!.isActive, 'Pool is not active');

  // Calculate optimal amounts with slippage protection using u256
  let amountA: u256, amountB: u256;

  if (pool!.reserveA.isZero() || pool!.reserveB.isZero()) {
    amountA = amountADesired;
    amountB = amountBDesired;
  } else {
    // amountBOptimal = (amountADesired * reserveB) / reserveA
    const amountBOptimal = SafeMath256.div(
      SafeMath256.mul(amountADesired, pool!.reserveB),
      pool!.reserveA
    );
    if (amountBOptimal <= amountBDesired) {
      assert(amountBOptimal >= amountBMin, 'Insufficient B amount');
      amountA = amountADesired;
      amountB = amountBOptimal;
    } else {
      // amountAOptimal = (amountBDesired * reserveA) / reserveB
      const amountAOptimal = SafeMath256.div(
        SafeMath256.mul(amountBDesired, pool!.reserveA),
        pool!.reserveB
      );
      assert(amountAOptimal <= amountADesired && amountAOptimal >= amountAMin, 'Insufficient A amount');
      amountA = amountAOptimal;
      amountB = amountBDesired;
    }
  }

  validateAmounts(amountA, amountB);

  // Transfer tokens (now u256 - no conversion!)
  assert(safeTransferFrom(tokenA, caller, Context.callee(), amountA), 'Token A transfer failed');
  assert(safeTransferFrom(tokenB, caller, Context.callee(), amountB), 'Token B transfer failed');

  // Calculate liquidity to mint: (amountA * totalSupply) / reserveA
  const liquidity = SafeMath256.div(
    SafeMath256.mul(amountA, pool!.totalSupply),
    pool!.reserveA
  );
  assert(!liquidity.isZero(), 'Insufficient liquidity minted');

  // Update pool state
  pool!.reserveA = SafeMath256.add(pool!.reserveA, amountA);
  pool!.reserveB = SafeMath256.add(pool!.reserveB, amountB);
  pool!.totalSupply = SafeMath256.add(pool!.totalSupply, liquidity);
  updateCumulativePrices(pool!);
  savePool(pool!);

  // Update user LP balance
  const lpTokenKey = LP_PREFIX + getPoolKey(tokenA, tokenB) + ':' + caller.toString();
  const currentBalanceStr = Storage.has(lpTokenKey) ? Storage.get(lpTokenKey) : '0';
  // Parse u256 from string
  const currentBalance = u256.fromBytes(currentBalanceStr);
  const newBalance = SafeMath256.add(currentBalance, liquidity);
  Storage.set(lpTokenKey, newBalance.toString());

  endNonReentrant();
  generateEvent(`Liquidity added: ${amountA.toString()}/${amountB.toString()} - LP tokens: ${liquidity.toString()}`);
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
  const liquidity = argument.nextU256().unwrap();  // u256
  const amountAMin = argument.nextU256().unwrap();  // u256
  const amountBMin = argument.nextU256().unwrap();  // u256
  const deadline = argument.nextU64().unwrap();

  validDeadline(deadline + Context.timestamp());
  validateTokenPair(tokenA, tokenB);
  assert(!liquidity.isZero(), 'Insufficient liquidity');

  const caller = Context.caller();
  const pool = getPool(tokenA, tokenB);
  assert(pool != null, 'Pool does not exist');
  assert(pool!.isActive, 'Pool is not active');

  // Check user LP balance
  const lpTokenKey = LP_PREFIX + getPoolKey(tokenA, tokenB) + ':' + caller.toString();
  const userBalanceStr = Storage.has(lpTokenKey) ? Storage.get(lpTokenKey) : '0';
  const userBalance = u256.fromBytes(userBalanceStr);
  assert(userBalance >= liquidity, 'Insufficient LP balance');

  // Calculate amounts with slippage protection using u256
  // amountA = (liquidity * reserveA) / totalSupply
  const amountA = SafeMath256.div(
    SafeMath256.mul(liquidity, pool!.reserveA),
    pool!.totalSupply
  );
  // amountB = (liquidity * reserveB) / totalSupply
  const amountB = SafeMath256.div(
    SafeMath256.mul(liquidity, pool!.reserveB),
    pool!.totalSupply
  );

  assert(amountA >= amountAMin, 'Insufficient A amount');
  assert(amountB >= amountBMin, 'Insufficient B amount');
  assert(!amountA.isZero() && !amountB.isZero(), 'Insufficient liquidity burned');

  // Update pool state
  pool!.reserveA = SafeMath256.sub(pool!.reserveA, amountA);
  pool!.reserveB = SafeMath256.sub(pool!.reserveB, amountB);
  pool!.totalSupply = SafeMath256.sub(pool!.totalSupply, liquidity);
  updateCumulativePrices(pool!);
  savePool(pool!);

  // Update user LP balance
  const newBalance = SafeMath256.sub(userBalance, liquidity);
  Storage.set(lpTokenKey, newBalance.toString());

  // Transfer tokens back (now u256 - no conversion!)
  assert(safeTransfer(tokenA, caller, amountA), 'Token A transfer failed');
  assert(safeTransfer(tokenB, caller, amountB), 'Token B transfer failed');

  endNonReentrant();
  generateEvent(`Liquidity removed: ${amountA.toString()}/${amountB.toString()} - LP tokens: ${liquidity.toString()}`);
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
  const sent = transferredCoins();  // u64 - native MAS amount

  const argument = new Args(args);
  const tokenOut = new Address(argument.nextString().unwrap());
  const minAmountOut = argument.nextU256().unwrap();  // u256 - token amount
  const deadline = argument.nextU64().unwrap();
  const to = new Address(argument.nextString().unwrap());

  // Validation
  assert(sent > 0, 'No MAS sent');
  assert(!minAmountOut.isZero(), 'Invalid min output');
  assert(Context.timestamp() <= deadline, 'Deadline expired');

  // Get WMAS and pool
  const wmas = getWMASAddress();
  const pool = getPool(wmas, tokenOut);
  assert(pool != null, 'Pool does not exist');

  // Convert sent MAS (u64) to u256 for calculations
  const amountIn = u256.fromU64(sent);

  // Calculate output using u256 math
  const tokenInIsA = pool!.tokenA.toString() == wmas.toString();
  const reserveIn = tokenInIsA ? pool!.reserveA : pool!.reserveB;
  const reserveOut = tokenInIsA ? pool!.reserveB : pool!.reserveA;

  // Use getAmountOut (which is now u256)
  const amountOut = getAmountOut(amountIn, reserveIn, reserveOut, pool!.fee);

  assert(amountOut >= minAmountOut, 'Insufficient output');

  // Update reserves (treat sent MAS as WMAS with u256)
  if (tokenInIsA) {
    pool!.reserveA = SafeMath256.add(pool!.reserveA, amountIn);
    pool!.reserveB = SafeMath256.sub(pool!.reserveB, amountOut);
  } else {
    pool!.reserveB = SafeMath256.add(pool!.reserveB, amountIn);
    pool!.reserveA = SafeMath256.sub(pool!.reserveA, amountOut);
  }

  // Transfer tokens (u256)
  const outputToken = new IERC20(tokenOut);
  outputToken.transfer(to, amountOut);

  updateCumulativePrices(pool!);
  savePool(pool!);

  // Calculate fee: (amountIn * fee) / 10000
  const feeAmount = SafeMath256.div(
    SafeMath256.mul(amountIn, u256.fromU64(pool!.fee)),
    u256.fromU64(10000)
  );
  const totalFeesStr = Storage.get('total_fees');
  const totalFees = totalFeesStr ? u256.fromBytes(totalFeesStr) : u256.Zero;
  Storage.set('total_fees', SafeMath256.add(totalFees, feeAmount).toString());

  transferRemainingMAS(balanceBefore, balance(), sent, Context.caller());
  endNonReentrant();
  generateEvent(`SwapMASForTokens: ${sent} MAS → ${amountOut.toString()} tokens`);
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
  const amountIn = argument.nextU256().unwrap();  // u256 - token amount
  const minAmountOut = argument.nextU64().unwrap();  // u64 - MAS amount
  const deadline = argument.nextU64().unwrap();
  const to = new Address(argument.nextString().unwrap());

  // Validation
  assert(!amountIn.isZero(), 'Invalid input');
  assert(minAmountOut > 0, 'Invalid min output');
  assert(Context.timestamp() <= deadline, 'Deadline expired');

  // Get WMAS and pool
  const wmas = getWMASAddress();
  const pool = getPool(tokenIn, wmas);
  assert(pool != null, 'Pool does not exist');

  // Transfer input tokens (u256)
  const caller = Context.caller();
  const tokenInContract = new IERC20(tokenIn);
  tokenInContract.transferFrom(caller, Context.callee(), amountIn);

  // Calculate MAS output using u256 math
  const tokenInIsA = pool!.tokenA.toString() == tokenIn.toString();
  const reserveIn = tokenInIsA ? pool!.reserveA : pool!.reserveB;
  const reserveOut = tokenInIsA ? pool!.reserveB : pool!.reserveA;

  // Use getAmountOut (which is now u256)
  const amountOutU256 = getAmountOut(amountIn, reserveIn, reserveOut, pool!.fee);

  // Convert to u64 for MAS transfer
  // Assert that output fits in u64 (MAS has 9 decimals, so reasonable amounts should fit)
  assert(amountOutU256 <= u256.fromU64(u64.MAX_VALUE), 'MAS output exceeds u64 max');
  const amountOut = amountOutU256.toU64();

  assert(amountOut >= minAmountOut, 'Insufficient output');

  // Update reserves (u256)
  if (tokenInIsA) {
    pool!.reserveA = SafeMath256.add(pool!.reserveA, amountIn);
    pool!.reserveB = SafeMath256.sub(pool!.reserveB, amountOutU256);
  } else {
    pool!.reserveB = SafeMath256.add(pool!.reserveB, amountIn);
    pool!.reserveA = SafeMath256.sub(pool!.reserveA, amountOutU256);
  }

  // Send MAS (u64)
  transferCoins(to, amountOut);

  updateCumulativePrices(pool!);
  savePool(pool!);

  // Calculate fee: (amountIn * fee) / 10000
  const feeAmount = SafeMath256.div(
    SafeMath256.mul(amountIn, u256.fromU64(pool!.fee)),
    u256.fromU64(10000)
  );
  const totalFeesStr = Storage.get('total_fees');
  const totalFees = totalFeesStr ? u256.fromBytes(totalFeesStr) : u256.Zero;
  Storage.set('total_fees', SafeMath256.add(totalFees, feeAmount).toString());

  endNonReentrant();
  generateEvent(`SwapTokensForMAS: ${amountIn.toString()} tokens → ${amountOut} MAS`);
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
  const amountIn = argument.nextU256().unwrap();  // u256
  const amountOutMin = argument.nextU256().unwrap();  // u256
  const deadline = argument.nextU64().unwrap();

  validDeadline(deadline + Context.timestamp());
  validateTokenPair(tokenIn, tokenOut);
  assert(!amountIn.isZero(), 'Invalid input amount');
  assert(!amountOutMin.isZero(), 'Invalid minimum output');

  const caller = Context.caller();
  const pool = getPool(tokenIn, tokenOut);
  assert(pool != null, 'Pool does not exist');
  assert(pool!.isActive, 'Pool is not active');

  // Determine token order and reserves
  const tokenInIsA = pool!.tokenA.toString() == tokenIn.toString();
  const reserveIn = tokenInIsA ? pool!.reserveA : pool!.reserveB;
  const reserveOut = tokenInIsA ? pool!.reserveB : pool!.reserveA;

  // Calculate output with slippage protection (now u256!)
  const amountOut = getAmountOut(amountIn, reserveIn, reserveOut, pool!.fee);
  assert(amountOut >= amountOutMin, 'Insufficient output amount');
  assert(amountOut < reserveOut, 'Insufficient liquidity');

  // Transfer input token from user (u256 - no conversion!)
  assert(safeTransferFrom(tokenIn, caller, Context.callee(), amountIn), 'Input transfer failed');

  // Transfer output token to user (u256 - no conversion!)
  assert(safeTransfer(tokenOut, caller, amountOut), 'Output transfer failed');

  // Update reserves using SafeMath256
  const newReserveIn = SafeMath256.add(reserveIn, amountIn);
  const newReserveOut = SafeMath256.sub(reserveOut, amountOut);

  // K invariant check using u256 math
  // oldK = reserveIn * reserveOut
  const oldK = SafeMath256.mul(reserveIn, reserveOut);
  // newK = newReserveIn * newReserveOut (after fee)
  // Actually: (reserveIn + amountIn * (10000 - fee) / 10000) * (reserveOut - amountOut)
  const feeMultiplier = u256.fromU64(10000 - pool!.fee);
  const amountInWithFee = SafeMath256.div(
    SafeMath256.mul(amountIn, feeMultiplier),
    u256.fromU64(10000)
  );
  const newReserveInWithFee = SafeMath256.add(reserveIn, amountInWithFee);
  const newK = SafeMath256.mul(newReserveInWithFee, newReserveOut);
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

  // Update statistics (u256)
  const totalVolumeStr = Storage.get('total_volume');
  const totalVolume = totalVolumeStr ? u256.fromBytes(totalVolumeStr) : u256.Zero;
  Storage.set('total_volume', SafeMath256.add(totalVolume, amountIn).toString());

  // Calculate fee: (amountIn * fee) / 10000
  const feeAmount = SafeMath256.div(
    SafeMath256.mul(amountIn, u256.fromU64(pool!.fee)),
    u256.fromU64(10000)
  );
  const totalFeesStr = Storage.get('total_fees');
  const totalFees = totalFeesStr ? u256.fromBytes(totalFeesStr) : u256.Zero;
  Storage.set('total_fees', SafeMath256.add(totalFees, feeAmount).toString());

  endNonReentrant();
  generateEvent(`Swap: ${amountIn.toString()} ${tokenIn.toString()} → ${amountOut.toString()} ${tokenOut.toString()}`);
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
  const amount = argument.nextU256().unwrap();  // u256
  const data = argument.nextBytes().unwrapOrDefault();

  // Validation
  assert(!amount.isZero(), 'Flash loan amount must be positive');

  // MAX_FLASH_LOAN_AMOUNT constant is u64, convert to u256 for comparison
  const maxAmount = u256.fromU64(MAX_FLASH_LOAN_AMOUNT);
  assert(amount <= maxAmount, 'Flash loan amount exceeds maximum');

  const caller = Context.caller();
  const tokenContract = new IERC20(token);

  // Check contract has sufficient balance (u256)
  const contractBalance = tokenContract.balanceOf(Context.callee());
  assert(
    contractBalance >= amount,
    'Insufficient contract balance for flash loan',
  );

  // Calculate fee (0.09% = 9 basis points): (amount * 9) / 10000
  const fee = SafeMath256.div(
    SafeMath256.mul(amount, u256.fromU64(FLASH_LOAN_FEE_RATE)),
    u256.fromU64(BASIS_POINTS)
  );
  assert(!fee.isZero(), 'Flash loan fee must be positive');

  // Record balance before loan
  const balanceBefore = tokenContract.balanceOf(Context.callee());

  // Transfer tokens to receiver (u256 - no conversion!)
  assert(safeTransfer(token, receiver, amount), 'Flash loan transfer failed');

  generateEvent(`FlashLoan: ${amount.toString()} tokens loaned to ${receiver.toString()} (fee: ${fee.toString()})`);

  // Execute callback on receiver (amount and fee are already u256)
  const callback = new IFlashLoanCallback(receiver);
  callback.onFlashLoan(caller, token, amount, fee, data);

  // Verify repayment + fee (u256)
  const balanceAfter = tokenContract.balanceOf(Context.callee());
  const expectedBalance = SafeMath256.add(balanceBefore, fee);

  assert(
    balanceAfter >= expectedBalance,
    `Flash loan not repaid: expected ${expectedBalance.toString()}, got ${balanceAfter.toString()}`,
  );

  // Update flash loan statistics (u256)
  const flashLoanVolumeStr = Storage.has('flash_loan_volume') ? Storage.get('flash_loan_volume') : '0';
  const flashLoanVolume = u256.fromBytes(flashLoanVolumeStr);

  const flashLoanCountStr = Storage.has('flash_loan_count') ? Storage.get('flash_loan_count') : '0';
  const flashLoanCount = u64(parseInt(flashLoanCountStr));

  const flashLoanFeesStr = Storage.has('flash_loan_fees') ? Storage.get('flash_loan_fees') : '0';
  const flashLoanFees = u256.fromBytes(flashLoanFeesStr);

  Storage.set('flash_loan_volume', SafeMath256.add(flashLoanVolume, amount).toString());
  Storage.set('flash_loan_count', (flashLoanCount + 1).toString());
  Storage.set('flash_loan_fees', SafeMath256.add(flashLoanFees, fee).toString());

  endNonReentrant();
  generateEvent(`FlashLoan: Repaid successfully with fee ${fee.toString()}`);
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
  const amountIn = argument.nextU256().unwrap();

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
  const amountIn = argument.nextU256().unwrap();
  const reserveIn = argument.nextU256().unwrap();
  const reserveOut = argument.nextU256().unwrap();
  const fee = argument.nextU64().unwrap();

  const amountOut = getAmountOut(amountIn, reserveIn, reserveOut, fee);

  return stringToBytes(amountOut.toString());
}

/**
 * Quote exact output swap
 */
export function readGetAmountIn(args: StaticArray<u8>): StaticArray<u8> {
  const argument = new Args(args);
  const amountOut = argument.nextU256().unwrap();
  const reserveIn = argument.nextU256().unwrap();
  const reserveOut = argument.nextU256().unwrap();
  const fee = argument.nextU64().unwrap();

  const amountIn = getAmountIn(amountOut, reserveIn, reserveOut, fee);

  return stringToBytes(amountIn.toString());
}

/**
 * Quote liquidity addition
 */
export function readSafeSqrt(args: StaticArray<u8>): StaticArray<u8> {
  const argument = new Args(args);
  const x = argument.nextU256().unwrap();
  const y = argument.nextU256().unwrap();

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
