import { Args, bytesToU256, bytesToU64, stringToBytes } from "@massalabs/as-types";
import { Address, call } from "@massalabs/massa-as-sdk";
import { u256 } from "as-bignum/assembly/integer/u256";

/**
 * IMassaBeam - Interface for MassaBeam AMM Contract
 *
 * This interface wraps external calls to the MassaBeam contract
 * allowing limit orders and other contracts to interact with pool functions
 */
export class IMassaBeam {
  _origin: Address;

  /**
   * Creates an IMassaBeam interface for the given contract address
   * @param at - Address of the MassaBeam contract
   */
  constructor(at: Address) {
    this._origin = at;
  }

  // =========================================================================
  // POOL MANAGEMENT FUNCTIONS
  // =========================================================================

  /**
   * Create a new pool with two ERC20 tokens
   * @param tokenA - Address of first token
   * @param tokenB - Address of second token
   * @param fee - Pool fee in basis points (100 = 1%)
   */
  createPool(tokenA: Address, tokenB: Address, fee: u64): void {
    const args = new Args()
      .add(tokenA)
      .add(tokenB)
      .add(fee);
    call(this._origin, "createPool", args, 0);
  }

  /**
   * Add liquidity to an existing pool
   * @param tokenA - Address of first token
   * @param tokenB - Address of second token
   * @param amountA - Amount of first token
   * @param amountB - Amount of second token
   * @param minLpAmount - Minimum LP tokens to receive
   * @param to - Recipient of LP tokens
   * @param deadline - Transaction deadline
   */
  addLiquidity(
    tokenA: Address,
    tokenB: Address,
    amountA: u256,
    amountB: u256,
    minLpAmount: u256,
    to: Address,
    deadline: u64
  ): void {
    const args = new Args()
      .add(tokenA)
      .add(tokenB)
      .add(amountA)
      .add(amountB)
      .add(minLpAmount)
      .add(to)
      .add(deadline);
    call(this._origin, "addLiquidity", args, 0);
  }

  /**
   * Create a pool with MAS as one side
   * @param token - ERC20 token address
   * @param amountToken - Amount of ERC20 token
   * @param fee - Pool fee in basis points
   * @param masToSend - Amount of MAS (passed via coins)
   */
  createPoolWithMAS(token: Address, amountToken: u256, fee: u64, masToSend: u64): void {
    const args = new Args()
      .add(token)
      .add(amountToken)
      .add(fee);
    call(this._origin, "createPoolWithMAS", args, masToSend);
  }

  /**
   * Add liquidity with MAS as one side
   * @param token - ERC20 token address
   * @param amountToken - Amount of ERC20 token
   * @param minLpAmount - Minimum LP tokens to receive
   * @param to - Recipient of LP tokens
   * @param deadline - Transaction deadline
   * @param masToSend - Amount of MAS (passed via coins)
   */
  addLiquidityWithMAS(
    token: Address,
    amountToken: u256,
    minLpAmount: u256,
    to: Address,
    deadline: u64,
    masToSend: u64
  ): void {
    const args = new Args()
      .add(token)
      .add(amountToken)
      .add(minLpAmount)
      .add(to)
      .add(deadline);
    call(this._origin, "addLiquidityWithMAS", args, masToSend);
  }

  /**
   * Remove liquidity from a pool
   * @param tokenA - Address of first token
   * @param tokenB - Address of second token
   * @param lpAmount - Amount of LP tokens to burn
   * @param minAmountA - Minimum first token to receive
   * @param minAmountB - Minimum second token to receive
   * @param to - Recipient of tokens
   * @param deadline - Transaction deadline
   */
  removeLiquidity(
    tokenA: Address,
    tokenB: Address,
    lpAmount: u256,
    minAmountA: u256,
    minAmountB: u256,
    to: Address,
    deadline: u64
  ): void {
    const args = new Args()
      .add(tokenA)
      .add(tokenB)
      .add(lpAmount)
      .add(minAmountA)
      .add(minAmountB)
      .add(to)
      .add(deadline);
    call(this._origin, "removeLiquidity", args, 0);
  }

  /**
   * Remove liquidity with MAS as one side
   * @param token - ERC20 token address
   * @param lpAmount - Amount of LP tokens to burn
   * @param minAmountToken - Minimum token to receive
   * @param minAmountMAS - Minimum MAS to receive
   * @param to - Recipient of tokens
   * @param deadline - Transaction deadline
   */
  removeLiquidityWithMAS(
    token: Address,
    lpAmount: u256,
    minAmountToken: u256,
    minAmountMAS: u256,
    to: Address,
    deadline: u64
  ): void {
    const args = new Args()
      .add(token)
      .add(lpAmount)
      .add(minAmountToken)
      .add(minAmountMAS)
      .add(to)
      .add(deadline);
    call(this._origin, "removeLiquidityWithMAS", args, 0);
  }

  // =========================================================================
  // SWAP FUNCTIONS
  // =========================================================================

  /**
   * Swap MAS for ERC20 tokens
   * @param tokenOut - Output token address
   * @param minAmountOut - Minimum amount to receive
   * @param deadline - Transaction deadline
   * @param to - Recipient of tokens
   * @param masToSend - Amount of MAS (passed via coins)
   */
  swapMASForTokens(
    tokenOut: Address,
    minAmountOut: u256,
    deadline: u64,
    to: Address,
    masToSend: u64
  ): void {
    const args = new Args()
      .add(tokenOut)
      .add(minAmountOut)
      .add(deadline)
      .add(to);
    call(this._origin, "swapMASForTokens", args, masToSend);
  }

  /**
   * Swap ERC20 tokens for MAS
   * @param tokenIn - Input token address
   * @param amountIn - Amount of input token
   * @param minAmountOut - Minimum MAS to receive
   * @param deadline - Transaction deadline
   * @param to - Recipient of MAS
   */
  swapTokensForMAS(
    tokenIn: Address,
    amountIn: u256,
    minAmountOut: u256,
    deadline: u64,
    to: Address
  ): void {
    const args = new Args()
      .add(tokenIn)
      .add(amountIn)
      .add(minAmountOut)
      .add(deadline)
      .add(to);
    call(this._origin, "swapTokensForMAS", args, 0);
  }

  /**
   * Swap between two ERC20 tokens
   * @param tokenIn - Input token address
   * @param tokenOut - Output token address
   * @param amountIn - Amount of input token
   * @param minAmountOut - Minimum amount to receive
   * @param deadline - Transaction deadline
   * @param to - Recipient of tokens
   */
  swap(
    tokenIn: Address,
    tokenOut: Address,
    amountIn: u256,
    minAmountOut: u256,
    deadline: u64,
    to: Address
  ): void {
    const args = new Args()
      .add(tokenIn)
      .add(tokenOut)
      .add(amountIn)
      .add(minAmountOut)
      .add(deadline)
      .add(to);
    call(this._origin, "swap", args, 0);
  }

  // =========================================================================
  // FLASH LOAN FUNCTION
  // =========================================================================

  /**
   * Flash loan tokens from the pool
   * @param tokenA - First token address
   * @param tokenB - Second token address
   * @param amountA - Amount of first token to borrow
   * @param amountB - Amount of second token to borrow
   * @param to - Contract to receive the loan callback
   */
  flashLoan(
    tokenA: Address,
    tokenB: Address,
    amountA: u256,
    amountB: u256,
    to: Address
  ): void {
    const args = new Args()
      .add(tokenA)
      .add(tokenB)
      .add(amountA)
      .add(amountB)
      .add(to);
    call(this._origin, "flashLoan", args, 0);
  }

  // =========================================================================
  // ADMIN FUNCTIONS
  // =========================================================================

  /**
   * Set protocol pause status
   * @param paused - True to pause, false to unpause
   */
  setPaused(paused: bool): void {
    const args = new Args().add(paused);
    call(this._origin, "setPaused", args, 0);
  }

  /**
   * Set fee for a specific pool
   * @param tokenA - First token address
   * @param tokenB - Second token address
   * @param newFee - New fee in basis points
   */
  setPoolFee(tokenA: Address, tokenB: Address, newFee: u64): void {
    const args = new Args()
      .add(tokenA)
      .add(tokenB)
      .add(newFee);
    call(this._origin, "setPoolFee", args, 0);
  }

  /**
   * Grant a role to an address
   * @param role - Role identifier
   * @param account - Account to grant role to
   */
  grantRole(role: u64, account: Address): void {
    const args = new Args()
      .add(role)
      .add(account);
    call(this._origin, "grantRole", args, 0);
  }

  /**
   * Revoke a role from an address
   * @param role - Role identifier
   * @param account - Account to revoke role from
   */
  revokeRole(role: u64, account: Address): void {
    const args = new Args()
      .add(role)
      .add(account);
    call(this._origin, "revokeRole", args, 0);
  }

  /**
   * Set WMAS (Wrapped MAS) token address
   * @param wmasAddress - Address of WMAS contract
   */
  setWMASAddress(wmasAddress: string): void {
    const args = new Args().add(wmasAddress);
    call(this._origin, "setWMASAddress", args, 0);
  }

  /**
   * Receive MAS coins (allow contract to receive MAS)
   */
  receiveCoins(): void {
    const args = new Args();
    call(this._origin, "receiveCoins", args, 0);
  }

  // =========================================================================
  // DEBUG & TESTING FUNCTIONS
  // =========================================================================

  /**
   * Set pool reserves for testing
   * @param tokenA - First token address
   * @param tokenB - Second token address
   * @param newReserveA - New reserve for token A
   * @param newReserveB - New reserve for token B
   */
  setPoolReserves(
    tokenA: Address,
    tokenB: Address,
    newReserveA: u256,
    newReserveB: u256
  ): void {
    const args = new Args()
      .add(tokenA)
      .add(tokenB)
      .add(newReserveA)
      .add(newReserveB);
    call(this._origin, "setPoolReserves", args, 0);
  }

  /**
   * Simulate price change by swapping
   * @param tokenIn - Input token address
   * @param tokenOut - Output token address
   * @param amountIn - Amount to swap
   */
  simulatePriceChange(
    tokenIn: Address,
    tokenOut: Address,
    amountIn: u256
  ): void {
    const args = new Args()
      .add(tokenIn)
      .add(tokenOut)
      .add(amountIn);
    call(this._origin, "simulatePriceChange", args, 0);
  }

  // =========================================================================
  // READ FUNCTIONS (Return values)
  // =========================================================================

  /**
   * Read pool information
   * @param tokenA - First token address
   * @param tokenB - Second token address
   * @return Serialized pool data
   */
  readPool(tokenA: Address, tokenB: Address): StaticArray<u8> {
    const args = new Args()
      .add(tokenA)
      .add(tokenB);
    return call(this._origin, "readPool", args, 0);
  }

  /**
   * Read user's LP token balance
   * @param tokenA - First token address
   * @param tokenB - Second token address
   * @param user - User address
   * @return LP balance as string bytes
   */
  readLPBalance(tokenA: Address, tokenB: Address, user: Address): StaticArray<u8> {
    const args = new Args()
      .add(tokenA)
      .add(tokenB)
      .add(user);
    return call(this._origin, "readLPBalance", args, 0);
  }

  /**
   * Read pool total liquidity (total LP supply)
   * @param tokenA - First token address
   * @param tokenB - Second token address
   * @return Total supply as string bytes
   */
  readPoolTotalLiquidity(tokenA: Address, tokenB: Address): StaticArray<u8> {
    const args = new Args()
      .add(tokenA)
      .add(tokenB);
    return call(this._origin, "readPoolTotalLiquidity", args, 0);
  }

  /**
   * Read pool key
   * @param tokenA - First token address
   * @param tokenB - Second token address
   * @return Pool key string bytes
   */
  readPoolKey(tokenA: Address, tokenB: Address): StaticArray<u8> {
    const args = new Args()
      .add(tokenA)
      .add(tokenB);
    return call(this._origin, "readPoolKey", args, 0);
  }

  /**
   * Read total number of pools
   * @return Pool count as string bytes
   */
  readPoolCount(): StaticArray<u8> {
    return call(this._origin, "readPoolCount", new Args(), 0);
  }

  /**
   * Read total trading volume
   * @return Total volume as string bytes
   */
  readTotalVolume(): StaticArray<u8> {
    return call(this._origin, "readTotalVolume", new Args(), 0);
  }

  /**
   * Read protocol fee rate
   * @return Fee rate as string bytes
   */
  readProtocolFeeRate(): StaticArray<u8> {
    return call(this._origin, "readProtocolFeeRate", new Args(), 0);
  }

  /**
   * Read initialization status
   * @return 'true' or 'false' as string bytes
   */
  readInitialized(): StaticArray<u8> {
    return call(this._origin, "readInitialized", new Args(), 0);
  }

  /**
   * Quote exact input swap using token addresses
   * @param tokenIn - Input token address
   * @param tokenOut - Output token address
   * @param amountIn - Input amount
   * @return Serialized: [amountOut: u256, fee: u64]
   */
  readQuoteSwapExactInput(
    tokenIn: Address,
    tokenOut: Address,
    amountIn: u256
  ): StaticArray<u8> {
    const args = new Args()
      .add(tokenIn)
      .add(tokenOut)
      .add(amountIn);
    return call(this._origin, "readQuoteSwapExactInput", args, 0);
  }

  /**
   * Calculate amount out (low-level)
   * @param amountIn - Input amount
   * @param reserveIn - Input reserve
   * @param reserveOut - Output reserve
   * @param fee - Fee in basis points
   * @return Amount out as string bytes
   */
  readGetAmountOut(
    amountIn: u256,
    reserveIn: u256,
    reserveOut: u256,
    fee: u64
  ): StaticArray<u8> {
    const args = new Args()
      .add(amountIn)
      .add(reserveIn)
      .add(reserveOut)
      .add(fee);
    return call(this._origin, "readGetAmountOut", args, 0);
  }

  /**
   * Calculate amount in (low-level)
   * @param amountOut - Desired output amount
   * @param reserveIn - Input reserve
   * @param reserveOut - Output reserve
   * @param fee - Fee in basis points
   * @return Amount in as string bytes
   */
  readGetAmountIn(
    amountOut: u256,
    reserveIn: u256,
    reserveOut: u256,
    fee: u64
  ): StaticArray<u8> {
    const args = new Args()
      .add(amountOut)
      .add(reserveIn)
      .add(reserveOut)
      .add(fee);
    return call(this._origin, "readGetAmountIn", args, 0);
  }

  /**
   * Calculate safe square root
   * @param x - Value to sqrt
   * @param y - Y value for sqrt calculation
   * @return Square root as string bytes
   */
  readSafeSqrt(x: u256, y: u256): StaticArray<u8> {
    const args = new Args()
      .add(x)
      .add(y);
    return call(this._origin, "readSafeSqrt", args, 0);
  }

  /**
   * Read flash loan statistics
   * @return Flash loan stats as bytes
   */
  readFlashLoanStats(): StaticArray<u8> {
    return call(this._origin, "readFlashLoanStats", new Args(), 0);
  }

  /**
   * Test utility for u256 bytes
   * @return U256 as bytes
   */
  readU256Bytes(): StaticArray<u8> {
    return call(this._origin, "readU256Bytes", new Args(), 0);
  }
}
