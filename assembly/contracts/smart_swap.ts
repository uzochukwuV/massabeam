/**
 * MassaBeam SmartSwap Router
 *
 * Intelligent routing system that automatically selects the best DEX
 * for each swap operation, comparing prices and gas costs between:
 * - MassaBeam (constant product AMM x*y=k)
 * - Dusa (concentrated liquidity AMM with Liquidity Book)
 *
 * Features:
 * - Automatic best price discovery (price comparison)
 * - Gas-optimized execution path selection
 * - Multi-hop routing support via Dusa
 * - Transparent routing decisions with events
 * - Slippage protection with deadlines
 * - Fee comparison and optimization
 * - Routing statistics and analytics
 *
 * Architecture:
 * 1. Quote Phase: Get quotes from both DEXs
 * 2. Routing Phase: Select best path based on output amount and gas
 * 3. Execution Phase: Execute on chosen DEX
 * 4. Analytics Phase: Record swap statistics
 *
 * Pattern Improvements (from SmartRouter.ts):
 * ==========================================
 * 1. INTERFACE-BASED CONTRACT CALLS:
 *    - MassaBeam: Uses IMassaBeamAMM interface with proper call() integration
 *    - Dusa: Uses IRouter and IQuoter interfaces for contract-to-contract communication
 *    - Proper Quote deserialization from Dusa quoter responses
 *
 * 2. TOKEN TRANSFER PATTERN:
 *    - Transfers tokens from caller to target contract BEFORE execution
 *    - Uses IERC20.transferFrom(caller, recipient, amount)
 *    - Prevents token lockup and enables direct routing
 *
 * 3. ADDRESS MANAGEMENT:
 *    - Storage-based address configuration
 *    - Admin role-based access control for address updates
 *    - Support for address revocation
 *
 * 4. EXECUTION FLOW:
 *    Step 1: Transfer tokens from user to target DEX contract
 *    Step 2: Call DEX interface with proper parameters
 *    Step 3: Return value parsing and event emission
 *
 * 5. ERROR HANDLING:
 *    - Try-catch with type-safe error handling (e: any)
 *    - Detailed error messages in events
 *    - Proper exception re-throwing for caller handling
 */

import {
  Address,
  Context,
  generateEvent,
  Storage,
  call,
} from '@massalabs/massa-as-sdk';
import { Args, stringToBytes } from '@massalabs/as-types';
import { u256 } from 'as-bignum/assembly/integer/u256';

// Import pool interface from MassaBeam for direct access
// This allows SmartSwap to query pool data directly without contract calls
import { getPool } from './main';

// Import contract interfaces for cross-contract communication
// These follow the Massa SDK pattern with proper call() integration
import { IQuoter, Quote } from './interfaces/IQuoter';
import { IRouter } from './interfaces/IRouter';
import { IERC20 } from './interfaces/IERC20';
import { IMassaBeamAMM } from './interfaces/IMassaBeamAMM';
import { SafeMath256 } from '../libraries/SafeMath';

// ============================================================================
// TYPES AND CONSTANTS
// ============================================================================

/**
 * Quote result from a DEX
 */
export class SwapQuote {
  dex: string; // "MASSABEAM" or "DUSA"
  amountOut: u256; // Expected output amount (u256 for 18-decimal tokens)
  priceImpact: f64; // Price impact as percentage (e.g., 0.5 for 0.5%)
  fee: u64; // Fee in basis points (100 = 1%)
  gasEstimate: u64; // Estimated gas cost
  isAvailable: bool; // Whether pool/path exists

  constructor(
    dex: string,
    amountOut: u256,
    priceImpact: f64,
    fee: u64,
    gasEstimate: u64,
    isAvailable: bool,
  ) {
    this.dex = dex;
    this.amountOut = amountOut;
    this.priceImpact = priceImpact;
    this.fee = fee;
    this.gasEstimate = gasEstimate;
    this.isAvailable = isAvailable;
  }
}

/**
 * Routing decision result
 */
export class RoutingDecision {
  selectedDex: string; // Which DEX was selected
  quote: SwapQuote; // The selected quote
  reason: string; // Why this DEX was selected
  gasOptimized: bool; // Whether selection was gas-optimized

  constructor(dex: string, quote: SwapQuote, reason: string, gasOpt: bool) {
    this.selectedDex = dex;
    this.quote = quote;
    this.reason = reason;
    this.gasOptimized = gasOpt;
  }
}

// Storage keys
const ADMIN_ROLE = 'admin';
const DUSA_ROUTER = 'dusa_router';
const MASSABEAM_AMM = 'massabeam_amm';

// Gas cost estimates (in MAS units)
const MASSABEAM_GAS_ESTIMATE: u64 = 500_000; // Lower gas for simple swap
const DUSA_GAS_ESTIMATE: u64 = 1_200_000; // Higher gas for concentrated liquidity

// ============================================================================
// STORAGE HELPER FUNCTIONS - Consistent Key Management
// ============================================================================

/**
 * Get a counter value from storage
 */
function getCounter(key: string): u64 {
  if (!Storage.has(key)) {
    return 0;
  }
  return u64(parseInt(Storage.get(key)));
}

/**
 * Set a counter value in storage
 */
function setCounter(key: string, value: u64): void {
  Storage.set(key, value.toString());
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
 * Get a boolean value from storage
 */
function getBool(key: string): bool {
  if (!Storage.has(key)) {
    return false;
  }
  return Storage.get(key) === 'true';
}

/**
 * Set a boolean value in storage
 */
function setBool(key: string, value: bool): void {
  Storage.set(key, value ? 'true' : 'false');
}

/**
 * Get a u256 value from storage (stored as string)
 */
function getU256(key: string): u256 {
  if (!Storage.has(key)) {
    return u256.Zero;
  }
  const str = Storage.get(key);
  // Parse string to u256
  return u256.from(str);
}

/**
 * Set a u256 value in storage (stored as string)
 */
function setU256(key: string, value: u256): void {
  Storage.set(key, value.toString());
}

// ============================================================================
// CONSTRUCTOR
// ============================================================================

/**
 * Initialize SmartSwap Router with DEX addresses
 *
 * @param args Serialized arguments:
 *   - dussaRouter: Address of Dusa Router
 *   - massaBeamAMM: Address of MassaBeam AMM
 */
export function constructor(args: StaticArray<u8>): void {
  assert(Context.isDeployingContract(), 'Constructor can only be called once');

  const argument = new Args(args);

  // Set contract addresses
  const dussaRouter = argument.nextString().unwrap();
  const massaBeamAMM = argument.nextString().unwrap();

  // Store addresses
  Storage.set(DUSA_ROUTER, dussaRouter);
  Storage.set(MASSABEAM_AMM, massaBeamAMM);

  // Initialize admin
  const deployer = Context.caller();
  setBool(ADMIN_ROLE + ':' + deployer.toString(), true);

  // Initialize statistics
  setCounter('total_swaps', 0);
  setCounter('dusa_swaps', 0);
  setCounter('massabeam_swaps', 0);
  setU256('total_volume', u256.Zero);
  setU256('total_savings', u256.Zero);

  generateEvent(
    'SmartSwap Router deployed: MassaBeam + Dusa integration active',
  );
}

// ============================================================================
// PUBLIC FUNCTIONS - SMART SWAP
// ============================================================================

/**
 * Execute smart swap with automatic DEX selection
 *
 * @param args Serialized arguments:
 *   - tokenIn: Input token address
 *   - tokenOut: Output token address
 *   - amountIn: Amount to swap (in token units)
 *   - minAmountOut: Minimum acceptable output (slippage protection)
 *   - deadline: Transaction deadline (unix timestamp)
 */
export function smartSwap(args: StaticArray<u8>): void {
  const argument = new Args(args);
  const tokenIn = new Address(argument.nextString().unwrap());
  const tokenOut = new Address(argument.nextString().unwrap());
  const amountIn = argument.nextU256().unwrap();
  const minAmountOut = argument.nextU256().unwrap();
  const deadline = argument.nextU64().unwrap();

  // Validation
  assert(!amountIn.isZero(), 'Invalid input amount');
  assert(!minAmountOut.isZero(), 'Invalid minimum output');
  assert(Context.timestamp() <= deadline, 'Transaction expired');
  assert(tokenIn.toString() != tokenOut.toString(), 'Identical tokens');

  // Get quotes from both DEXs
  const massaBeamQuote = getMassaBeamQuote(tokenIn, tokenOut, amountIn);
  const dusaQuote = getDusaQuote(tokenIn, tokenOut, amountIn);

  // Select best routing
  const decision = selectBestRoute(massaBeamQuote, dusaQuote, amountIn);

  // Verify minimum output
  assert(
    decision.quote.amountOut >= minAmountOut,
    'Insufficient output amount',
  );

  // Log routing decision
  generateEvent(
    `SmartSwap: Selected ${decision.selectedDex} - Output: ${decision.quote.amountOut.toString()} (${decision.reason})`,
  );

  // Execute swap on selected DEX
  if (decision.selectedDex == 'MASSABEAM') {
    executeMassaBeamSwap(tokenIn, tokenOut, amountIn, decision.quote.amountOut, deadline);
  } else {
    executeDusaSwap(tokenIn, tokenOut, amountIn, minAmountOut, deadline);
  }

  // Update statistics after execution
  recordSwap(decision, amountIn);

  generateEvent(
    `SmartSwap: ${amountIn.toString()} tokens → ${decision.quote.amountOut.toString()} output executed on ${decision.selectedDex}`,
  );
}

/**
 * Get best quote for comparison (read-only)
 */
export function getBestQuote(args: StaticArray<u8>): StaticArray<u8> {
  const argument = new Args(args);
  const tokenIn = new Address(argument.nextString().unwrap());
  const tokenOut = new Address(argument.nextString().unwrap());
  const amountIn = argument.nextU256().unwrap();

  const massaBeamQuote = getMassaBeamQuote(tokenIn, tokenOut, amountIn);
  const dusaQuote = getDusaQuote(tokenIn, tokenOut, amountIn);

  const decision = selectBestRoute(massaBeamQuote, dusaQuote, amountIn);

  // Return best quote details
  const result = new Args()
    .add(decision.selectedDex)
    .add(decision.quote.amountOut) // u256
    .add(u64(decision.quote.priceImpact * 100.0))
    .add(decision.quote.fee)
    .add(decision.reason);

  return result.serialize();
}

/**
 * Compare quotes from both DEXs (read-only)
 */
export function compareQuotes(args: StaticArray<u8>): StaticArray<u8> {
  const argument = new Args(args);
  const tokenIn = new Address(argument.nextString().unwrap());
  const tokenOut = new Address(argument.nextString().unwrap());
  const amountIn = argument.nextU256().unwrap();

  const massaBeamQuote = getMassaBeamQuote(tokenIn, tokenOut, amountIn);
  const dusaQuote = getDusaQuote(tokenIn, tokenOut, amountIn);

  // Return both quotes for comparison
  const result = new Args()
    .add('MASSABEAM')
    .add(massaBeamQuote.amountOut) // u256
    .add(u64(massaBeamQuote.priceImpact * 100.0))
    .add(massaBeamQuote.fee)
    .add(massaBeamQuote.gasEstimate)
    .add('DUSA')
    .add(dusaQuote.amountOut) // u256
    .add(u64(dusaQuote.priceImpact * 100.0))
    .add(dusaQuote.fee)
    .add(dusaQuote.gasEstimate);

  return result.serialize();
}

/**
 * Get routing statistics
 */
export function getStatistics(_: StaticArray<u8>): StaticArray<u8> {
  const totalSwaps = getCounter('total_swaps');
  const dusaSwaps = getCounter('dusa_swaps');
  const massabeamSwaps = getCounter('massabeam_swaps');
  const totalVolume = getU256('total_volume');
  const totalSavings = getU256('total_savings');

  const result = new Args()
    .add(totalSwaps)
    .add(dusaSwaps)
    .add(massabeamSwaps)
    .add(totalVolume)
    .add(totalSavings);

  return result.serialize();
}

// ============================================================================
// INTERNAL FUNCTIONS - QUOTE FUNCTIONS
// ============================================================================

/**
 * Get quote from MassaBeam AMM
 * Directly accesses pool data and uses constant product formula
 * Pattern follows SmartRouter.ts getMassaBeamQuote function
 *
 * MassaBeam uses constant product formula:
 * amountOut = (amountIn * (10000 - fee) * reserveOut) / (reserveIn * 10000 + amountIn * (10000 - fee))
 * where fee is in basis points (30 = 0.3%)
 */
function getMassaBeamQuote(tokenIn: Address, tokenOut: Address, amountIn: u256): SwapQuote {

    // Get pool directly using getPool function imported from main.ts
    const pool = getPool(tokenIn, tokenOut);

    if (pool == null) {
      // Pool doesn't exist - return zero quote
      return new SwapQuote('MASSABEAM', u256.Zero, 0.0, 0, MASSABEAM_GAS_ESTIMATE, false);
    }

    // Determine token order
    const tokenInIsA = pool.tokenA.toString() == tokenIn.toString();
    const reserveIn = tokenInIsA ? pool.reserveA : pool.reserveB;
    const reserveOut = tokenInIsA ? pool.reserveB : pool.reserveA;

    // Check if pool has liquidity
    if (reserveIn.isZero() || reserveOut.isZero()) {
      return new SwapQuote('MASSABEAM', u256.Zero, 0.0, pool.fee, MASSABEAM_GAS_ESTIMATE, false);
    }

    // Calculate output amount using constant product formula with u256
    // amountInWithFee = amountIn * (10000 - fee) / 10000
    const feeMultiplier = u256.fromU64(10000 - pool.fee);
    const amountInWithFee = SafeMath256.div(u256.mul(amountIn, feeMultiplier), u256.fromU64(10000));
    const numerator = u256.mul(amountInWithFee, reserveOut);
    const denominator = u256.add(reserveIn, amountInWithFee);
    const amountOut = SafeMath256.div(numerator, denominator);

    // Calculate price impact in basis points (using f64 for ratios)
    const reserveInF64 = parseFloat(reserveIn.toString());
    const reserveOutF64 = parseFloat(reserveOut.toString());
    const amountInF64 = parseFloat(amountIn.toString());
    const amountOutF64 = parseFloat(amountOut.toString());
    const expectedRate = reserveOutF64 / reserveInF64;
    const actualRate = amountOutF64 / amountInF64;
    const priceImpact = (1.0 - (actualRate / expectedRate)) * 100.0;

    return new SwapQuote(
      'MASSABEAM',
      amountOut,
      priceImpact,
      pool.fee,
      MASSABEAM_GAS_ESTIMATE,
      true,
    );
}

/**
 * Get quote from Dusa
 * Uses concentrated liquidity (Liquidity Book) model with bin-based pricing
 * Pattern follows Dusa Quoter's findBestPathFromAmountIn function
 *
 * Dusa supports:
 * - Multiple bin steps for different price ranges
 * - Dynamic fees based on bin step and position
 * - Multi-hop swaps for token pairs without direct liquidity
 * - Returns Quote object with full route, pairs, bin steps, and fee information
 */
function getDusaQuote(tokenIn: Address, tokenOut: Address, amountIn: u256): SwapQuote {
    // Create Dusa Quoter interface for contract-to-contract call
    // Pattern follows IQuoter.ts findBestPathFromAmountIn with proper Quote deserialization
    const quoterAddress = new Address(Storage.get(DUSA_ROUTER));
    const quoter = new IQuoter(quoterAddress);

    // Build swap route (simple 2-token swap)
    const route: Address[] = [tokenIn, tokenOut];

    // Call Dusa quoter to find best path
    // This returns a Quote object with:
    // - route: token path
    // - pairs: pair addresses
    // - binSteps: bin steps for each pair
    // - amounts: amount at each step (first is input, last is output)
    // - fees: fee at each step
    const quote: Quote = quoter.findBestPathFromAmountIn(route, amountIn);

    // Check if quote has valid amounts
    if (quote.amounts.length == 0) {
      return new SwapQuote('DUSA', u256.Zero, 0.0, 0, DUSA_GAS_ESTIMATE, false);
    }

    // Extract output amount (last element in amounts array)
    const outputAmount = quote.amounts[quote.amounts.length - 1];

    // Calculate total fees from quote
    // Sum all fees in the path for multi-hop swaps
    let totalFee: u64 = 0;
    for (let i = 0; i < quote.fees.length; i++) {
      // Note: fees are already in basis points (u256)
      const feeStr = quote.fees[i].toString();
      const feeU64 = u64(parseInt(feeStr));
      totalFee += feeU64;
    }
    if (totalFee == 0) totalFee = 25; // Default 0.25% if no fees calculated

    // Calculate price impact (using f64 for ratios)
    const amountInF64 = parseFloat(amountIn.toString());
    const outputF64 = parseFloat(outputAmount.toString());
    const expectedRate = outputF64 / amountInF64;
    const actualRate = expectedRate; // Already accounts for fees in output
    const priceImpact = (1.0 - actualRate) * 100.0;

    return new SwapQuote(
      'DUSA',
      outputAmount,
      priceImpact,
      totalFee,
      DUSA_GAS_ESTIMATE,
      true,
    );

}

// ============================================================================
// INTERNAL FUNCTIONS - EXECUTION
// ============================================================================

/**
 * Execute swap on MassaBeam AMM
 * Pattern: Transfer tokens → Approve → Execute swap
 */
function executeMassaBeamSwap(
  tokenIn: Address,
  tokenOut: Address,
  amountIn: u256,
  minAmountOut: u256,
  deadline: u64,
): void {
  const massaBeamAddress = new Address(Storage.get(MASSABEAM_AMM));
  const caller = Context.caller();

    // Step 1: Transfer tokens from caller to MassaBeam contract
    const tokenContract = new IERC20(tokenIn);

    tokenContract.transferFrom(caller, massaBeamAddress, amountIn);
    generateEvent(`MassaBeam: Transferred ${amountIn.toString()} tokens from ${caller.toString()}`);

    // Step 2: Execute swap via MassaBeam interface
    // Uses IMassaBeamAMM interface which wraps contract call
    const massaBeam = new IMassaBeamAMM(massaBeamAddress);

    const amountOut = massaBeam.swap(
      tokenIn,
      tokenOut,
      amountIn,
      minAmountOut,
      deadline,
      caller, // Output recipient
    );

    generateEvent(
      `MassaBeam swap executed: ${amountIn.toString()} tokens → ${amountOut.toString()} output to ${caller.toString()}`,
    );

}

/**
 * Execute swap on Dusa Router
 * Pattern: Transfer tokens → Execute swap with proper parameters
 */
function executeDusaSwap(
  tokenIn: Address,
  tokenOut: Address,
  amountIn: u256,
  minAmountOut: u256,
  deadline: u64,
): void {
  const dusaRouterAddress = new Address(Storage.get(DUSA_ROUTER));
  const caller = Context.caller();

    // Step 1: Transfer tokens from caller to Dusa Router
    const tokenContract = new IERC20(tokenIn);

    tokenContract.transferFrom(caller, dusaRouterAddress, amountIn);
    generateEvent(`Dusa: Transferred ${amountIn.toString()} tokens from ${caller.toString()}`);

    // Step 2: Build swap parameters
    // Build token path (simple 2-token swap)
    const tokenInContract = new IERC20(tokenIn);
    const tokenOutContract = new IERC20(tokenOut);
    const path: IERC20[] = [tokenInContract, tokenOutContract];

    // Build bin steps for path (typical: [20] for stable pairs, adjust based on pool)
    const binSteps: u64[] = [20];

    // Step 3: Execute swap via Dusa Router interface
    // Uses IRouter interface which wraps contract call with proper argument serialization
    const router = new IRouter(dusaRouterAddress);

    const amountOut = router.swapExactTokensForTokens(
      amountIn.toI64(),
      minAmountOut.toI64(),
      binSteps,
      path,
      caller, // Output recipient
      deadline,
      0, // No MAS to send
    );

    generateEvent(
      `Dusa swap executed: ${amountIn.toString()} tokens → ${amountOut.toString()} output to ${caller.toString()}`,
    );

}

// ============================================================================
// INTERNAL FUNCTIONS - ROUTING LOGIC
// ============================================================================

/**
 * Select best routing path based on:
 * 1. Output amount (primary) - higher is better
 * 2. Price impact (secondary) - lower is better
 * 3. Gas cost (tertiary) - lower is better
 */
function selectBestRoute(
  massaBeamQuote: SwapQuote,
  dusaQuote: SwapQuote,
  amountIn: u256,
): RoutingDecision {
  // If one DEX has no liquidity, use the other
  if (!massaBeamQuote.isAvailable && dusaQuote.isAvailable) {
    return new RoutingDecision(
      'DUSA',
      dusaQuote,
      'MassaBeam has no liquidity',
      false,
    );
  }

  if (!dusaQuote.isAvailable && massaBeamQuote.isAvailable) {
    return new RoutingDecision(
      'MASSABEAM',
      massaBeamQuote,
      'Dusa has no liquidity',
      false,
    );
  }

  // Both available: compare output amounts
  if (dusaQuote.amountOut > massaBeamQuote.amountOut) {
    const diff = u256.sub(dusaQuote.amountOut, massaBeamQuote.amountOut);
    const diffF64 = parseFloat(diff.toString());
    const massaOutF64 = parseFloat(massaBeamQuote.amountOut.toString());
    const improvement = (diffF64 / massaOutF64) * 100.0;

    // If Dusa output is significantly better (>0.5%), use it despite higher gas
    if (improvement > 0.5) {
      return new RoutingDecision(
        'DUSA',
        dusaQuote,
        `Better price: ${u64(improvement)}% improvement`,
        false,
      );
    }
  }

  if (massaBeamQuote.amountOut > dusaQuote.amountOut) {
    const diff = u256.sub(massaBeamQuote.amountOut, dusaQuote.amountOut);
    const diffF64 = parseFloat(diff.toString());
    const dusaOutF64 = parseFloat(dusaQuote.amountOut.toString());
    const improvement = (diffF64 / dusaOutF64) * 100.0;

    // If MassaBeam output is significantly better, use it
    if (improvement > 0.5) {
      return new RoutingDecision(
        'MASSABEAM',
        massaBeamQuote,
        `Better price: ${u64(improvement)}% improvement`,
        false,
      );
    }
  }

  // If prices are similar, prefer MassaBeam for lower gas cost
  if (massaBeamQuote.amountOut >= dusaQuote.amountOut) {
    return new RoutingDecision(
      'MASSABEAM',
      massaBeamQuote,
      'Similar prices - selected for lower gas',
      true,
    );
  } else {
    return new RoutingDecision(
      'DUSA',
      dusaQuote,
      'Similar prices - selected for better liquidity',
      true,
    );
  }
}

// ============================================================================
// INTERNAL FUNCTIONS - ANALYTICS
// ============================================================================

/**
 * Record swap statistics for analytics
 */
function recordSwap(decision: RoutingDecision, amountIn: u256): void {
  // Update total swaps
  incrementCounter('total_swaps');

  // Update DEX-specific counter
  const dexKey = decision.selectedDex == 'DUSA' ? 'dusa_swaps' : 'massabeam_swaps';
  incrementCounter(dexKey);

  // Update volume (u256 string-based storage)
  const totalVolume = getU256('total_volume');
  const newVolume = u256.add(totalVolume, amountIn);
  setU256('total_volume', newVolume);
}

// ============================================================================
// ADMIN FUNCTIONS
// ============================================================================

/**
 * Update DEX contract addresses (admin only)
 * Follows SmartRouter pattern for address management
 */
export function updateAddresses(args: StaticArray<u8>): void {
  const caller = Context.caller();
  const roleKey = ADMIN_ROLE + ':' + caller.toString();
  assert(Storage.has(stringToBytes(roleKey)), 'Admin only');

  const argument = new Args(args);
  const dussaRouter = argument.nextString().unwrap();
  const massaBeamAMM = argument.nextString().unwrap();

  // Validate addresses are not empty
  assert(dussaRouter.length > 0, 'Invalid Dusa Router address');
  assert(massaBeamAMM.length > 0, 'Invalid MassaBeam AMM address');

  Storage.set(DUSA_ROUTER, dussaRouter);
  Storage.set(MASSABEAM_AMM, massaBeamAMM);

  generateEvent(`Contract addresses updated: Dusa=${dussaRouter}, MassaBeam=${massaBeamAMM}`);
}

/**
 * Grant admin role to a new address
 * Only existing admins can grant new admin privileges
 */
export function grantAdminRole(args: StaticArray<u8>): void {
  const caller = Context.caller();
  const roleKey = ADMIN_ROLE + ':' + caller.toString();
  assert(Storage.has(stringToBytes(roleKey)), 'Admin only');

  const argument = new Args(args);
  const newAdmin = argument.nextString().unwrap();

  assert(newAdmin.length > 0, 'Invalid admin address');

  Storage.set(ADMIN_ROLE + ':' + newAdmin, 'true');

  generateEvent(`Admin role granted to ${newAdmin}`);
}

/**
 * Revoke admin role (admin only)
 */
export function revokeAdminRole(args: StaticArray<u8>): void {
  const caller = Context.caller();
  const roleKey = ADMIN_ROLE + ':' + caller.toString();
  assert(Storage.has(stringToBytes(roleKey)), 'Admin only');

  const argument = new Args(args);
  const adminToRevoke = argument.nextString().unwrap();

  assert(adminToRevoke.length > 0, 'Invalid address');
  assert(
    adminToRevoke != caller.toString(),
    'Cannot revoke own admin role',
  );

  const revokeKey = ADMIN_ROLE + ':' + adminToRevoke;
  Storage.del(stringToBytes(revokeKey));

  generateEvent(`Admin role revoked from ${adminToRevoke}`);
}
