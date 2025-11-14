/**
 * Liquidity Helper Utilities
 * Provides functions to calculate optimal amounts for adding/removing liquidity
 */

/**
 * Calculate optimal token B amount given token A amount
 * Based on current pool ratio: amountB_optimal = (amountA * reserveB) / reserveA
 *
 * @param amountA - Amount of token A
 * @param reserveA - Pool reserve of token A
 * @param reserveB - Pool reserve of token B
 * @returns Optimal amount of token B
 */
export function calculateOptimalAmountB(
  amountA: bigint,
  reserveA: bigint,
  reserveB: bigint
): bigint {
  if (reserveA === 0n) return 0n;
  return (amountA * reserveB) / reserveA;
}

/**
 * Calculate optimal token A amount given token B amount
 * Based on current pool ratio: amountA_optimal = (amountB * reserveA) / reserveB
 *
 * @param amountB - Amount of token B
 * @param reserveA - Pool reserve of token A
 * @param reserveB - Pool reserve of token B
 * @returns Optimal amount of token A
 */
export function calculateOptimalAmountA(
  amountB: bigint,
  reserveA: bigint,
  reserveB: bigint
): bigint {
  if (reserveB === 0n) return 0n;
  return (amountB * reserveA) / reserveB;
}

/**
 * Calculate slippage tolerance percentage
 * Useful for setting minimum amounts with acceptable slippage
 *
 * @param amount - Original amount
 * @param slippagePercent - Slippage tolerance (e.g., 5 for 5%)
 * @returns Minimum acceptable amount
 */
export function applySlippage(
  amount: bigint,
  slippagePercent: number
): bigint {
  const slippage = BigInt(Math.floor((Number(amount) * slippagePercent) / 100));
  return amount - slippage;
}

/**
 * Calculate LP tokens to receive when adding liquidity
 * Formula: liquidity = (amountA * totalSupply) / reserveA
 *
 * @param amountA - Amount of token A being added
 * @param reserveA - Current reserve of token A
 * @param totalSupply - Current total LP token supply
 * @returns Approximate LP tokens to receive
 */
export function calculateLPTokens(
  amountA: bigint,
  reserveA: bigint,
  totalSupply: bigint
): bigint {
  if (reserveA === 0n) return 0n;
  return (amountA * totalSupply) / reserveA;
}

/**
 * Calculate tokens to receive when removing liquidity
 * Formula: amountOut = (liquidityBurned * reserve) / totalSupply
 *
 * @param liquidityToRemove - LP tokens to burn
 * @param reserve - Current reserve of the token
 * @param totalSupply - Current total LP token supply
 * @returns Amount of token to receive
 */
export function calculateTokensFromRemoveLiquidity(
  liquidityToRemove: bigint,
  reserve: bigint,
  totalSupply: bigint
): bigint {
  if (totalSupply === 0n) return 0n;
  return (liquidityToRemove * reserve) / totalSupply;
}

/**
 * Calculate price from pool reserves
 * Price of token A in terms of token B: priceA = reserveB / reserveA
 *
 * @param reserveA - Reserve of token A
 * @param reserveB - Reserve of token B
 * @returns Price of token A (as a decimal number)
 */
export function calculatePrice(
  reserveA: bigint,
  reserveB: bigint
): number {
  if (reserveA === 0n) return 0;
  return Number(reserveB) / Number(reserveA);
}

/**
 * Calculate expected output for a swap
 * Using constant product formula: amountOut = (amountIn * (10000 - fee) * reserveOut) / (reserveIn * 10000 + amountIn * (10000 - fee))
 *
 * @param amountIn - Input amount
 * @param reserveIn - Input token reserve
 * @param reserveOut - Output token reserve
 * @param feePercent - Fee in basis points (e.g., 30 for 0.3%)
 * @returns Approximate output amount
 */
export function calculateSwapOutput(
  amountIn: bigint,
  reserveIn: bigint,
  reserveOut: bigint,
  feeBasisPoints: number = 30
): bigint {
  if (reserveIn === 0n || reserveOut === 0n) return 0n;

  const feeMultiplier = 10000 - feeBasisPoints;
  const amountInWithFee = (amountIn * BigInt(feeMultiplier)) / 10000n;
  const numerator = amountInWithFee * reserveOut;
  const denominator = reserveIn * 10000n + amountInWithFee;

  return numerator / denominator;
}

/**
 * Example: Pool has 100 WMAS and 50 USDC
 * If we want to add 10 WMAS, how much USDC do we need?
 *
 * amountOptimal = (10 * 50) / 100 = 5 USDC
 */
export function exampleCalculateOptimalAmount(): void {
  const amountA = 10n * 10n ** 9n; // 10 WMAS
  const reserveA = 100n * 10n ** 9n; // 100 WMAS
  const reserveB = 50n * 10n ** 6n; // 50 USDC

  const optimalB = calculateOptimalAmountB(amountA, reserveA, reserveB);
  console.log(`To add 10 WMAS, need: ${Number(optimalB) / 1e6} USDC`);
  // Output: To add 10 WMAS, need: 5 USDC

  const price = calculatePrice(reserveA, reserveB);
  console.log(`Current price: 1 WMAS = ${price} USDC`);
  // Output: Current price: 1 WMAS = 0.5 USDC
}
