/**
 * MassaBeam AMM Contract Interaction Script
 *
 * Complete interface for interacting with the MassaBeam constant product AMM
 *
 * Contract Features Analyzed from assembly/contracts/main.ts:
 * - Constant product AMM (x*y=k) with fee-aware trading
 * - Pool creation and liquidity management
 * - Token swaps with slippage protection
 * - Price quote calculations (exact input & output)
 * - TWAP oracle price tracking
 * - Dynamic fee management
 * - Role-based access control
 * - Reentrancy protection
 * - Comprehensive statistics and analytics
 */

import { Args, bytesToStr, MRC20 } from "@massalabs/massa-web3";
import {
  Account,
  SmartContract,
  JsonRpcProvider,
} from '@massalabs/massa-web3';
import {DAI, USDC, WETH, USDT, WBTC, WETH_B} from "@dusalabs/sdk"
export const DEPLOYED_CONTRACTS = {
  // Token Addresses
  TOKENS: {
    USDT: "AS12M4KwP2fRrrkb2oY47hhZqcNRC4sbZ8uPfqKNoR3f3b5eqy2yo",
    USDC: "AS12fCBhCRMzqDuCH9fY25Gtu1wNJyxgF1YHuZEW91UBrg2EgjeSB",
    BEAM: "AS1oAHhbH7mMmPDoZJsSx8dnWzNgW2F8ugVBXpso3bTSTJFU6TUk",
  },

  // Protocol Contracts
  AMM: "AS123iK1bQATxAVw2WE5vojCLFnU4ESuTanHsGkyUnpn8xqF6Yfnk",
  DCA: "AS12Z8eKEdKv6mJiBFrh53gWFLY3K5LnKnxuFymCCXEBpk3rMD7Ua",
  ENGINE: "AS1QXNZ6MB9GV3zmtSLgEKFAXs3Sxcp4qnCtupLXku942QgxBn4P",
  LIMIT_ORDERS: null, // TODO: Deploy limit_orders_autonomous.ts contract
  RECURRING_ORDERS: null, // TODO: Deploy recurring_orders.ts contract

  // Deployment Info
  DEPLOYER: "AU12G4TFGs7EFxAd98sDyW2qni8LMwy6QPoNuDao2DmF3NdCun7ma",
  DEPLOYED_AT: "2025-10-09T16:53:57.408Z",
};

// Token Metadata
export const TOKEN_METADATA = {
  USDT: { name: "BeamUSDT", symbol: "USDT", decimals: 8, address: DEPLOYED_CONTRACTS.TOKENS.USDT },
  USDC: { name: "BeamUSDC", symbol: "USDC", decimals: 8, address: DEPLOYED_CONTRACTS.TOKENS.USDC },
  BEAM: { name: "BeamCoin", symbol: "BEAM", decimals: 8, address: DEPLOYED_CONTRACTS.TOKENS.BEAM },
};




import { OperationStatus, Mas,formatReadOnlyCallResponse } from "@massalabs/massa-web3";



import { getWallets, WalletName } from "@massalabs/wallet-provider";

const tokenList = [DAI[0], USDC[0], WETH[0], USDT[0], WBTC[0], WETH_B[0] ]

function getTokenAddress(params) {
    return tokenList.find(token => token.address === params);
}



let provider = null;
let isConnected = false;
let userAddress = null;

// Initialize wallet provider
export async function initProvider() {
  try {
    const walletList = await getWallets();
    const wallet = walletList.find((provider) => provider.name() === WalletName.MassaWallet);

    if (!wallet) {
      throw new Error(
        "Massa Wallet not detected. Please install the Massa wallet and configure it for the Buildnet network",
      );
    }

    const accounts = await wallet.accounts();
    if (accounts.length === 0) {
      throw new Error("No accounts found. Please create an account in your Massa wallet");
    }

    provider = accounts[0];
    
    isConnected = true;
    userAddress = provider.address;

    // Update UI
    updateWalletUI();

    return provider;
  } catch (error) {
    showError(error.message);
    return null;
  }
}

// Update wallet UI
function updateWalletUI() {
  const walletBtn = document.getElementById("walletBtn");
  const walletText = walletBtn?.querySelector(".wallet-text");

  if (isConnected && userAddress) {
    walletBtn?.classList.add("connected");
    if (walletText) {
      walletText.textContent = `${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`;
    }
  } else {
    walletBtn?.classList.remove("connected");
    if (walletText) {
      walletText.textContent = "Connect Wallet";
    }
  }
}

export function getProvider() {
  return provider;
}

export function isWalletConnected() {
  return isConnected;
}

export function getUserAddress() {
  return userAddress;
}

export { initProvider as connectWallet };


/**
 * Convert a human-readable token amount to u256 (BigInt) for contract calls
 * @param {string|number} amount - Human readable amount (e.g., "100.5")
 * @param {number} decimals - Token decimals (e.g., 8 or 18)
 * @returns {bigint} - Amount in smallest unit as BigInt
 */
export function toU256(amount, decimals = 8) {
  if (!amount || amount === 0) return 0n;
  const multiplier = BigInt(10 ** decimals);
  const amountStr = String(amount);

  // Handle decimal numbers
  if (amountStr.includes('.')) {
    const [whole, decimal] = amountStr.split('.');
    const decimalPart = decimal.padEnd(decimals, '0').slice(0, decimals);
    return BigInt(whole) * multiplier + BigInt(decimalPart);
  }

  return BigInt(amount) * multiplier;
}

// Show/hide loading overlay
export function showLoading(show) {
  const loadingOverlay = document.getElementById("loadingOverlay");
  if (loadingOverlay) {
    if (show) {
      loadingOverlay.classList.remove("hidden");
    } else {
      loadingOverlay.classList.add("hidden");
    }
  }
  AppState.isLoading = show;
}

// Error handling utility
export function showError(message) {
  const errorElement = document.getElementById("errorMessage");
  if (errorElement) {
    errorElement.textContent = message;
    errorElement.classList.add("visible");
    setTimeout(() => {
      errorElement.classList.remove("visible");
    }, 5000);
  }
  console.error("Contract Error:", message);
}

// Success notification utility
export function showSuccess(message) {
  // Create a success notification similar to error
  const successElement = document.createElement("div");
  successElement.className = "success-message visible";
  successElement.textContent = message;
  successElement.style.cssText = `
        position: fixed;
        top: 24px;
        right: 24px;
        background: var(--success-green);
        color: white;
        padding: 16px 24px;
        border-radius: 12px;
        box-shadow: var(--shadow-lg);
        z-index: 1070;
        max-width: 400px;
        font-weight: 500;
    `;
  document.body.appendChild(successElement);

  setTimeout(() => {
    successElement.remove();
  }, 3000);
}

// Generic contract call wrapper
export async function callContract(contractAddress, functionName, args) {
  const provider = getProvider();
  if (!provider) {
    throw new Error("Wallet not connected");
  }

  try {
    const operation = await provider.callSC({
      target: contractAddress,
      func: functionName,
      parameter: args
    });

    const status = await operation.waitSpeculativeExecution();
    if (status !== OperationStatus.SpeculativeSuccess) {
      throw new Error(`Transaction failed with status: ${status}`);
    }

    return operation;
  } catch (error) {
    console.error(`Contract call failed: ${functionName}`, error);
    throw error;
  }
}

// Generic contract read wrapper
export async function readContract(contractAddress, functionName, args) {
  const provider = getProvider();
  if (!provider) {
    throw new Error("Wallet not connected");
  }

  try {
    const result = await provider.readSC({
      target: contractAddress,
      func: functionName,
      parameter: args,
      maxGas: 1_000_000_000n,
      coins: Mas.fromString("0.1"), 
    });
    console.log("Contract read result:", result);
    return result.value;
  } catch (error) {
    console.error(`Contract read failed: ${functionName}`, error);
    throw error;
  }
}


const CONTRACTS = {
  AMM: DEPLOYED_CONTRACTS.AMM,
  LIMIT_ORDERS: DEPLOYED_CONTRACTS.LIMIT_ORDERS || 'AS12WizgAiQq1HgsQsRTaq7EU2VayUJpbGXVF5LgBccZd7Xi64YdT', // TODO: Add deployed address
};


function getTokenByAddress(params) {
    
    const token = tokenList.find(token => token.address === params);

    console.log( token);
    return  new MRC20(provider, token.address);
}



// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Convert to BigInt safely
 */
function toBI(value) {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(value);
  return BigInt(value || 0);
}

// ============================================================================
// POOL MANAGEMENT OPERATIONS
// ============================================================================

/**
 * MassaBeam AMM Contract Functions
 *
 * Core AMM operations from main.ts contract
 */
export const AMMContract = {
  /**
   * Create a new liquidity pool with initial liquidity
   *
   * From contract: createPool(tokenA: Address, tokenB: Address, amountA: u64, amountB: u64, deadline: u64)
   *
   * @param {string} tokenA - Address of first token
   * @param {string} tokenB - Address of second token
   * @param {string|number} amountA - Amount of token A (raw units)
   * @param {string|number} amountB - Amount of token B (raw units)
   * @param {number} deadline - Deadline in seconds from now
   * @returns {Promise} Operation result
   *
   * Process:
   * 1. Validates token pair (not identical, valid addresses)
   * 2. Checks user balances
   * 3. Approves tokens via IERC20.increaseAllowance()
   * 4. Calls contract createPool
   * 5. Calculates liquidity: sqrt(amountA * amountB)
   * 6. Locks MIN_LIQUIDITY (1000) permanently, rest goes to user
   *
   * Constants from contract:
   * - DEFAULT_FEE_RATE: 3000 (0.3%)
   * - MIN_LIQUIDITY: 1000 (prevents division by zero)
   *
   * @example
   * await AMMContract.createPool(
   *   'AU1234567890...',  // DAI
   *   'AU0987654321...',  // USDC
   *   '1000000000000000000',  // 1 DAI (18 decimals)
   *   '1000000',  // 1 USDC (6 decimals)
   *   300  // 5 minutes
   * );
   */
  async createPool(tokenA, tokenB, amountA, amountB, deadline) {
    try {
      console.log("Creating pool:", { tokenA, tokenB, amountA, amountB, deadline });

      provider = await getProvider();
      const tokenAcontract = await getTokenByAddress(tokenA);
      const tokenBcontract = await getTokenByAddress(tokenB);

      const decimalsA = await tokenAcontract.decimals();
      const decimalsB = await tokenBcontract.decimals();

      // Convert amounts to u256 for approval
      const amountA256 = toU256(amountA, Number(decimalsA));
      const amountB256 = toU256(amountB, Number(decimalsB));

      console.log("Converted to u256:", amountA256.toString(), amountB256.toString());

      // Check balances before proceeding
      const balanceA = await tokenAcontract.balanceOf(provider.address);
      if (balanceA < amountA256) {
        const symbol = await tokenAcontract.symbol();
        showError(`Insufficient ${symbol} balance`);
        throw new Error(`Insufficient ${symbol} balance`);
      }

      const balanceB = await tokenBcontract.balanceOf(provider.address);
      if (balanceB < amountB256) {
        const symbol = await tokenBcontract.symbol();
        showError(`Insufficient ${symbol} balance`);
        throw new Error(`Insufficient ${symbol} balance`);
      }

      // Approve Token A
      console.log("Approving Token A...");
      const opA = await tokenAcontract.increaseAllowance(
        CONTRACTS.AMM,
        amountA256
      );
      const statusA = await opA.waitSpeculativeExecution();
      if (statusA !== OperationStatus.SpeculativeSuccess) {
        throw new Error(`Token A approval failed with status: ${statusA}`);
      }

      // Approve Token B
      console.log("Approving Token B...");
      const opB = await tokenBcontract.increaseAllowance(
        CONTRACTS.AMM,
        amountB256
      );
      const statusB = await opB.waitSpeculativeExecution();
      if (statusB !== OperationStatus.SpeculativeSuccess) {
        throw new Error(`Token B approval failed with status: ${statusB}`);
      }

      console.log("Approvals successful, calling createPool...");

      // Call createPool with u64 amounts (raw)
      const args = new Args()
        .addString(tokenA)
        .addString(tokenB)
        .addU64(toBI(amountA))
        .addU64(toBI(amountB))
        .addU64(toBI(deadline));

      const operation = await callContract(CONTRACTS.AMM, "createPool", args.serialize());

      showSuccess("Pool created successfully!");
      return operation;
    } catch (error) {
      showError(`Failed to create pool: ${error.message}`);
      throw error;
    }
  },

  /**
   * Add liquidity to existing pool
   *
   * From contract: addLiquidity(tokenA, tokenB, amountADesired, amountBDesired, amountAMin, amountBMin, deadline)
   *
   * @param {string} tokenA - Address of first token
   * @param {string} tokenB - Address of second token
   * @param {string|number} amountADesired - Desired amount of token A
   * @param {string|number} amountBDesired - Desired amount of token B
   * @param {string|number} amountAMin - Minimum amount of token A (slippage)
   * @param {string|number} amountBMin - Minimum amount of token B (slippage)
   * @param {number} deadline - Deadline in seconds from now
   * @returns {Promise} Operation result
   *
   * Process:
   * 1. Gets pool reserves
   * 2. Calculates optimal amounts based on current ratio
   * 3. Validates slippage protection
   * 4. Transfers tokens from user
   * 5. Calculates liquidity: (amount * totalSupply) / reserve
   * 6. Mints LP tokens to user
   * 7. Updates cumulative prices for TWAP
   */
  async addLiquidity(tokenA, tokenB, amountADesired, amountBDesired, amountAMin, amountBMin, deadline) {
    try {
      console.log("Adding liquidity:", { tokenA, tokenB, amountADesired, amountBDesired });

      provider = await getProvider();
      const tokenAcontract = await getTokenByAddress(tokenA);
      const tokenBcontract = await getTokenByAddress(tokenB);

      const decimalsA = await tokenAcontract.decimals();
      const decimalsB = await tokenBcontract.decimals();

      const amountA256 = toU256(amountADesired, Number(decimalsA));
      const amountB256 = toU256(amountBDesired, Number(decimalsB));

      // Approve both tokens
      console.log("Approving tokens...");
      const opA = await tokenAcontract.increaseAllowance(CONTRACTS.AMM, amountA256);
      await opA.waitSpeculativeExecution();

      const opB = await tokenBcontract.increaseAllowance(CONTRACTS.AMM, amountB256);
      await opB.waitSpeculativeExecution();

      const args = new Args()
        .addString(tokenA)
        .addString(tokenB)
        .addU64(toBI(amountADesired))
        .addU64(toBI(amountBDesired))
        .addU64(toBI(amountAMin))
        .addU64(toBI(amountBMin))
        .addU64(toBI(deadline));

      const operation = await callContract(CONTRACTS.AMM, "addLiquidity", args.serialize());

      showSuccess("Liquidity added successfully!");
      return operation;
    } catch (error) {
      showError(`Failed to add liquidity: ${error.message}`);
      throw error;
    }
  },

  /**
   * Remove liquidity from pool
   *
   * From contract: removeLiquidity(tokenA, tokenB, liquidity, amountAMin, amountBMin, deadline)
   *
   * @param {string} tokenA - Address of first token
   * @param {string} tokenB - Address of second token
   * @param {string|number} liquidity - LP tokens to burn
   * @param {string|number} amountAMin - Minimum token A to receive
   * @param {string|number} amountBMin - Minimum token B to receive
   * @param {number} deadline - Deadline in seconds from now
   * @returns {Promise} Operation result
   *
   * Process:
   * 1. Validates user LP balance
   * 2. Calculates amounts: (liquidity / totalSupply) * reserve
   * 3. Validates slippage protection
   * 4. Burns LP tokens
   * 5. Transfers underlying tokens to user
   * 6. Updates pool reserves and cumulative prices
   */
  async removeLiquidity(tokenA, tokenB, liquidity, amountAMin, amountBMin, deadline) {
    try {
      console.log("Removing liquidity:", { tokenA, tokenB, liquidity });

      provider = await getProvider();

      const args = new Args()
        .addString(tokenA)
        .addString(tokenB)
        .addU64(toBI(liquidity))
        .addU64(toBI(amountAMin))
        .addU64(toBI(amountBMin))
        .addU64(toBI(deadline));

      const operation = await callContract(CONTRACTS.AMM, "removeLiquidity", args.serialize());

      showSuccess("Liquidity removed successfully!");
      return operation;
    } catch (error) {
      showError(`Failed to remove liquidity: ${error.message}`);
      throw error;
    }
  },

  // ============================================================================
  // SWAP OPERATIONS
  // ============================================================================

  /**
   * Execute token swap
   *
   * From contract: swap(tokenIn, tokenOut, amountIn, amountOutMin, deadline)
   *
   * @param {string} tokenIn - Address of token to sell
   * @param {string} tokenOut - Address of token to buy
   * @param {string|number} amountIn - Amount of input token
   * @param {string|number} amountOutMin - Minimum output (slippage protection)
   * @param {number} deadline - Deadline in seconds from now
   * @returns {Promise} Operation result
   *
   * Formula (constant product with fee):
   * amountOut = (amountIn * (10000 - fee) * reserveOut) / (reserveIn * 10000 + amountIn * (10000 - fee))
   *
   * Process:
   * 1. Gets pool and validates it exists
   * 2. Determines token order in pool
   * 3. Calculates output using formula
   * 4. Validates minimum output (slippage protection)
   * 5. Transfers input token from user
   * 6. Transfers output token to user
   * 7. Updates pool reserves
   * 8. Validates K invariant: newK >= oldK
   * 9. Updates cumulative prices for TWAP
   * 10. Updates statistics (volume, fees)
   */
  async swap(tokenIn, tokenOut, amountIn, amountOutMin, deadline) {
    try {
      console.log("Executing swap:", { tokenIn, tokenOut, amountIn, amountOutMin });

      provider = await getProvider();
      const tokenInContract = await getTokenByAddress(tokenIn);

      const decimalsIn = await tokenInContract.decimals();
      const amountIn256 = toU256(amountIn, Number(decimalsIn));

      // Approve input token
      console.log("Approving input token...");
      const opApprove = await tokenInContract.increaseAllowance(CONTRACTS.AMM, amountIn256);
      const statusApprove = await opApprove.waitSpeculativeExecution();
      if (statusApprove !== OperationStatus.SpeculativeSuccess) {
        throw new Error(`Token approval failed with status: ${statusApprove}`);
      }

      const args = new Args()
        .addString(tokenIn)
        .addString(tokenOut)
        .addU64(toBI(amountIn))
        .addU64(toBI(amountOutMin))
        .addU64(toBI(deadline));

      const operation = await callContract(CONTRACTS.AMM, "swap", args.serialize());

      showSuccess("Swap completed successfully!");
      return operation;
    } catch (error) {
      showError(`Failed to swap tokens: ${error.message}`);
      throw error;
    }
  },

  // ============================================================================
  // PRICE QUOTES & CALCULATIONS
  // ============================================================================

  /**
   * Get pool information
   *
   * From contract: readPool(tokenA, tokenB) -> Pool
   *
   * @param {string} tokenA - Address of first token
   * @param {string} tokenB - Address of second token
   * @returns {Promise<string>} Serialized pool data
   *
   * Pool structure returned:
   * - tokenA, tokenB: Token addresses
   * - reserveA, reserveB: Current liquidity reserves (u64)
   * - totalSupply: Total LP token supply (u64)
   * - fee: Pool fee in basis points (u64) - default 3000 (0.3%)
   * - lastUpdateTime: Timestamp of last operation (u64)
   * - isActive: Pool active status (bool)
   * - cumulativePriceA, cumulativePriceB: TWAP accumulators (u64)
   * - blockTimestampLast: Last price update time (u64)
   */
  async getPool(tokenA, tokenB) {
    try {
      const args = new Args()
        .addString(tokenA)
        .addString(tokenB)
        .serialize();

      const result = await await readContract(CONTRACTS.AMM, "readPool", args);
     
      const result2 = await readContract(CONTRACTS.AMM, "readPoolTotalLiquidity", args);
      console.log("Raw pool data:", bytesToStr(result2));
      console.log(result)
      const poolInfo = new Args(result)
      const tokenAMain = poolInfo.nextString()
      const tokenBMain = poolInfo.nextString()

      

        const reserveA = poolInfo.nextU64()
        const reserveB = poolInfo.nextU64()
        const totalSupply = poolInfo.nextU64()
        const fee = poolInfo.nextU64()
        const lastUpdateTime = poolInfo.nextU64()
        const isActive = poolInfo.nextBool()
        const cumulativePriceA = poolInfo.nextU64()
        const cumulativePriceB = poolInfo.nextU64()
        const blockTimestampLast = poolInfo.nextU64()

      const poolData = {
        tokenA: tokenAMain,
        tokenB: tokenBMain,

        reserveA: Number(reserveA.toString()),
        reserveB: Number(reserveB.toString()),
        totalSupply: Number(totalSupply.toString()),
        fee: Number(fee.toString()),
        lastUpdateTime: lastUpdateTime.toString(),
        isActive,
        cumulativePriceA: cumulativePriceA.toString(),
        cumulativePriceB: cumulativePriceB.toString(),
        blockTimestampLast: blockTimestampLast.toString(),
      };
      console.log("Parsed pool data:", poolData);
      return poolData;
    } catch (error) {
      console.error("Failed to get pool:", error);
      return null;
    }
  },

  /**
   * Calculate exact output for exact input swap
   *
   * From contract: getAmountOut(amountIn, reserveIn, reserveOut, fee) -> u64
   *
   * @param {string|number} amountIn - Input token amount
   * @param {string|number} reserveIn - Pool reserve of input token
   * @param {string|number} reserveOut - Pool reserve of output token
   * @param {string|number} fee - Pool fee in basis points (3000 = 0.3%)
   * @returns {Promise<BigInt>} Output amount
   *
   * Formula:
   * amountOut = (amountIn * (10000 - fee) * reserveOut) / (reserveIn * 10000 + amountIn * (10000 - fee))
   *
   * Uses f64 for precision, includes fee deduction
   */
  async getAmountOut(amountIn, reserveIn, reserveOut, fee) {
    try {
      console.log("Calculating amount out:", { amountIn, reserveIn, reserveOut, fee });

      const args = new Args()
        .addU64(toBI(amountIn == "1" ? "100000000" : amountIn))
        .addU64(toBI(reserveIn))
        .addU64(toBI(reserveOut))
        .addU64(toBI(fee));

      const result = await readContract(CONTRACTS.AMM, "readGetAmountOut", args.serialize());
      const amountOutStr = bytesToStr(result);

      if (!amountOutStr || amountOutStr === "" || amountOutStr === "0") {
        console.warn("getAmountOut returned empty or zero");
        return 0n;
      }

      const amountOut = toBI(amountOutStr);
      console.log("Amount out:", amountOut.toString());
      return amountOut;
    } catch (error) {
      console.error("Failed to calculate amount out:", error);
      return 0n;
    }
  },

  /**
   * Calculate exact input for exact output swap
   *
   * From contract: getAmountIn(amountOut, reserveIn, reserveOut, fee) -> u64
   *
   * @param {string|number} amountOut - Desired output amount
   * @param {string|number} reserveIn - Pool reserve of input token
   * @param {string|number} reserveOut - Pool reserve of output token
   * @param {string|number} fee - Pool fee in basis points
   * @returns {Promise<BigInt>} Required input amount
   *
   * Formula (inverse of getAmountOut):
   * amountIn = (reserveIn * amountOut * 10000) / ((reserveOut - amountOut) * (10000 - fee)) + 1
   *
   * The +1 ensures rounding up to be safe
   */
  async getAmountIn(amountOut, reserveIn, reserveOut, fee) {
    try {
      const args = new Args()
        .addU64(toBI(amountOut))
        .addU64(toBI(reserveIn))
        .addU64(toBI(reserveOut))
        .addU64(toBI(fee));

      const result = await readContract(CONTRACTS.AMM, "readGetAmountIn", args.serialize());
      const amountInStr = bytesToStr(result);
      const amountIn = toBI(amountInStr);

      console.log("Amount in required:", amountIn.toString());
      return amountIn;
    } catch (error) {
      console.error("Failed to calculate amount in:", error);
      return 0n;
    }
  },

  /**
   * Calculate liquidity (geometric mean)
   *
   * From contract: safeSqrt(x, y) -> u64
   *
   * @param {string|number} x - Amount of first token
   * @param {string|number} y - Amount of second token
   * @returns {Promise<BigInt>} Liquidity (sqrt(x * y))
   *
   * Uses Newton's method for square root calculation
   * Result is geometric mean used for LP token minting
   */
  async safeSqrt(x, y) {
    try {
      const args = new Args()
        .addU64(toBI(x))
        .addU64(toBI(y));

      const result = await readContract(CONTRACTS.AMM, "readSafeSqrt", args.serialize());
      const sqrtStr = bytesToStr(result);
      const sqrtResult = toBI(sqrtStr);

      console.log("Safe sqrt result:", sqrtResult.toString());
      return sqrtResult;
    } catch (error) {
      console.error("Failed to calculate safe sqrt:", error);
      return 0n;
    }
  },

  // ============================================================================
  // ANALYTICS & STATISTICS
  // ============================================================================

  /**
   * Get LP token balance for user
   *
   * From contract: readLPBalance(tokenA, tokenB, user) -> u64
   *
   * @param {string} tokenA - Address of first token
   * @param {string} tokenB - Address of second token
   * @param {string} userAddress - User wallet address
   * @returns {Promise<string>} User's LP token balance
   */
  async getLPBalance(tokenA, tokenB, userAddress) {
    try {
      const args = new Args()
        .addString(tokenA)
        .addString(tokenB)
        .addString(userAddress)
        .serialize();

      const result = await readContract(CONTRACTS.AMM, "readLPBalance", args);
      const balance = bytesToStr(result);

      return balance;
    } catch (error) {
      console.error("Failed to get LP balance:", error);
      return "0";
    }
  },

  /**
   * Get total liquidity supply in pool
   *
   * From contract: readPoolTotalLiquidity(tokenA, tokenB) -> u64
   *
   * @param {string} tokenA - Address of first token
   * @param {string} tokenB - Address of second token
   * @returns {Promise<string>} Total LP token supply
   */
  async getPoolTotalLiquidity(tokenA, tokenB) {
    try {
      const args = new Args()
        .addString(tokenA)
        .addString(tokenB)
        .serialize();

      const result = await readContract(CONTRACTS.AMM, "readPoolTotalLiquidity", args);
      const totalLiquidity = bytesToStr(result);

      return totalLiquidity;
    } catch (error) {
      console.error("Failed to get pool total liquidity:", error);
      return "0";
    }
  },

  /**
   * Get pool key (token pair identifier)
   *
   * From contract: readPoolKey(tokenA, tokenB) -> string
   *
   * @param {string} tokenA - Address of first token
   * @param {string} tokenB - Address of second token
   * @returns {Promise<string>} Pool key (sorted token pair)
   *
   * Keys are generated by sorting token addresses:
   * poolKey = min(tokenA, tokenB) + ':' + max(tokenA, tokenB)
   */
  async getPoolKey(tokenA, tokenB) {
    try {
      const args = new Args()
        .addString(tokenA)
        .addString(tokenB)
        .serialize();

      const result = await readContract(CONTRACTS.AMM, "readPoolKey", args);
      const poolKey = bytesToStr(result);

      return poolKey;
    } catch (error) {
      console.error("Failed to get pool key:", error);
      return null;
    }
  },

  /**
   * Get total number of pools
   *
   * From contract: readPoolCount() -> u64
   *
   * @returns {Promise<number>} Total pool count
   */
  async getPoolCount() {
    try {
      if (!provider) {
        provider = await getProvider();
      }

      const args = new Args();
      const poolCount = await readContract(CONTRACTS.AMM, "readPoolCount", args.serialize());
      const count = Number(bytesToStr(poolCount));

      console.log("Pool count:", count);
      return count;
    } catch (error) {
      console.error("Failed to get pool count:", error);
      return 0;
    }
  },

  /**
   * Get total trading volume
   *
   * From contract: readTotalVolume() -> u64
   *
   * @returns {Promise<number>} Total volume in raw units
   *
   * Tracks cumulative trading volume across all swaps
   */
  async getTotalVolume() {
    try {
      if (!provider) {
        provider = await getProvider();
      }

      const args = new Args();
      const volume = await readContract(CONTRACTS.AMM, "readTotalVolume", args.serialize());
      const totalVolume = Number(bytesToStr(volume));

      return totalVolume;
    } catch (error) {
      console.error("Failed to get total volume:", error);
      return 0;
    }
  },

  /**
   * Get protocol fee rate
   *
   * From contract: readProtocolFeeRate() -> u64
   *
   * @returns {Promise<number>} Fee rate in basis points
   *
   * Returns the current protocol fee rate (e.g., 3000 = 0.3%)
   */
  async getProtocolFeeRate() {
    try {
      if (!provider) {
        provider = await getProvider();
      }

      const args = new Args();
      const feeRate = await readContract(CONTRACTS.AMM, "readProtocolFeeRate", args.serialize());
      const rate = Number(bytesToStr(feeRate));

      return rate;
    } catch (error) {
      console.error("Failed to get protocol fee rate:", error);
      return 0;
    }
  },

  /**
   * Check if contract is initialized
   *
   * From contract: readInitialized() -> string
   *
   * @returns {Promise<boolean>} Initialization status
   */
  async getInitialized() {
    try {
      if (!provider) {
        provider = await getProvider();
      }

      const args = new Args();
      const initialized = await readContract(CONTRACTS.AMM, "readInitialized", args.serialize());
      const status = bytesToStr(initialized);

      return status === "true";
    } catch (error) {
      console.error("Failed to get initialized status:", error);
      return false;
    }
  },

  // ============================================================================
  // ADMIN FUNCTIONS (Role-based Access Control)
  // ============================================================================

  /**
   * Pause/unpause contract
   *
   * From contract: setPaused(paused: bool)
   *
   * Requires: PAUSER_ROLE
   *
   * @param {boolean} shouldPause - True to pause, false to unpause
   * @returns {Promise} Operation result
   *
   * When paused: createPool, addLiquidity, removeLiquidity, swap all blocked
   */
  async setPaused(shouldPause) {
    try {
      const args = new Args()
        .addBool(shouldPause);

      const operation = await callContract(CONTRACTS.AMM, "setPaused", args.serialize());

      showSuccess(`Contract ${shouldPause ? 'paused' : 'unpaused'} successfully!`);
      return operation;
    } catch (error) {
      showError(`Failed to ${shouldPause ? 'pause' : 'unpause'} contract: ${error.message}`);
      throw error;
    }
  },

  /**
   * Update pool fee
   *
   * From contract: setPoolFee(tokenA, tokenB, newFee: u64)
   *
   * Requires: FEE_SETTER_ROLE
   *
   * @param {string} tokenA - Address of first token
   * @param {string} tokenB - Address of second token
   * @param {number} newFee - New fee in basis points (3000 = 0.3%)
   * @returns {Promise} Operation result
   *
   * Valid range: MIN_FEE_RATE (1) to MAX_FEE_RATE (10000)
   */
  async setPoolFee(tokenA, tokenB, newFee) {
    try {
      const args = new Args()
        .addString(tokenA)
        .addString(tokenB)
        .addU64(toBI(newFee));

      const operation = await callContract(CONTRACTS.AMM, "setPoolFee", args.serialize());

      showSuccess(`Pool fee updated to ${(newFee / 100).toFixed(2)}% successfully!`);
      return operation;
    } catch (error) {
      showError(`Failed to update pool fee: ${error.message}`);
      throw error;
    }
  },

  /**
   * Grant role to account
   *
   * From contract: grantRole(role: string, account: Address)
   *
   * Requires: ADMIN_ROLE
   *
   * @param {string} role - Role name ('admin', 'pauser', 'fee_setter')
   * @param {string} accountAddress - Account to grant role to
   * @returns {Promise} Operation result
   */
  async grantRole(role, accountAddress) {
    try {
      const args = new Args()
        .addString(role)
        .addString(accountAddress);

      const operation = await callContract(CONTRACTS.AMM, "grantRole", args.serialize());

      showSuccess(`Role '${role}' granted successfully!`);
      return operation;
    } catch (error) {
      showError(`Failed to grant role: ${error.message}`);
      throw error;
    }
  },

  /**
   * Revoke role from account
   *
   * From contract: revokeRole(role: string, account: Address)
   *
   * Requires: ADMIN_ROLE
   *
   * @param {string} role - Role name to revoke
   * @param {string} accountAddress - Account to revoke role from
   * @returns {Promise} Operation result
   */
  async revokeRole(role, accountAddress) {
    try {
      const args = new Args()
        .addString(role)
        .addString(accountAddress);

      const operation = await callContract(CONTRACTS.AMM, "revokeRole", args.serialize());

      showSuccess(`Role '${role}' revoked successfully!`);
      return operation;
    } catch (error) {
      showError(`Failed to revoke role: ${error.message}`);
      throw error;
    }
  },
};

// ============================================================================
// PROTOCOL STATISTICS
// ============================================================================

/**
 * Get comprehensive protocol statistics
 *
 * @returns {Promise<Object>} Statistics object with TVL, pool count, fee rate, timestamp
 *
 * @example
 * const stats = await getProtocolStats();
 * console.log(`
 *   Total Value Locked: ${stats.tvl}
 *   Pool Count: ${stats.poolCount}
 *   Fee Rate: ${(stats.protocolFeeRate / 100).toFixed(2)}%
 *   Initialized: ${stats.isInitialized}
 * `);
 */
export async function getProtocolStats() {
  try {
    provider = await getProvider();

    const [tvl, poolCount, feeRate, initialized] = await Promise.all([
      AMMContract.getTotalVolume(),
      AMMContract.getPoolCount(),
      AMMContract.getProtocolFeeRate(),
      AMMContract.getInitialized(),
    ]);

    return {
      tvl: tvl,
      poolCount: poolCount,
      protocolFeeRate: feeRate,
      isInitialized: initialized,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error("Failed to get protocol stats:", error);
    return null;
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get current exchange rate between two tokens
 *
 * @param {string} tokenA - First token address
 * @param {string} tokenB - Second token address
 * @param {string|number} amountA - Amount of token A (default: 1 with 8 decimals for Massa u64)
 * @returns {Promise<Object|null>} Exchange rate info or null if pool doesn't exist
 *
 * @example
 * const rate = await getExchangeRate('AU1...', 'AU2...', '100000000'); // 1 token with 8 decimals
 * console.log(`1 TokenA = ${rate.rate} TokenB`);
 */
export async function getExchangeRate(tokenA, tokenB, amountA = '100000000') {
  try {
    const pool = await AMMContract.getPool(tokenA, tokenB);
    if (!pool) {
      throw new Error('Pool not found');
    }

    // Parse pool data (already parsed correctly in getPool)
    const poolData = typeof pool === 'string' ? JSON.parse(pool) : pool;

    const amountOut = await AMMContract.getAmountOut(
      amountA,
      poolData.reserveA,
      poolData.reserveB,
      poolData.fee || 3000
    );

    return {
      tokenA,
      tokenB,
      amountA: amountA.toString(),
      amountB: amountOut.toString(),
      rate: (Number(amountOut) / Number(amountA)).toString(),
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error("Failed to get exchange rate:", error);
    return null;
  }
}

/**
 * Estimate slippage for a swap
 *
 * @param {string} tokenIn - Token to sell
   * @param {string} tokenOut - Token to buy
   * @param {string|number} amountIn - Amount to sell (in smallest unit, 8 decimals)
   * @returns {Promise<Object|null>} Slippage estimate or null
   *
   * @example
   * const slippage = await estimateSlippage('AU1...', 'AU2...', '100000000'); // 1 token with 8 decimals
   * console.log(`Price impact: ${slippage.priceImpact}%`);
   */
export async function estimateSlippage(tokenIn, tokenOut, amountIn) {
  try {
    const pool = await AMMContract.getPool(tokenIn, tokenOut);
    if (!pool) {
      throw new Error('Pool not found');
    }

    const poolData = typeof pool === 'string' ? JSON.parse(pool) : pool;

    // Get base price for 1 token (8 decimals = 100000000)
    const oneToken = '100000000';
    const basePrice = await AMMContract.getAmountOut(
      oneToken,
      poolData.reserveA,
      poolData.reserveB,
      poolData.fee || 3000
    );

    const actualOutput = await AMMContract.getAmountOut(
      amountIn,
      poolData.reserveA,
      poolData.reserveB,
      poolData.fee || 3000
    );

    // Calculate expected output based on base price
    const expectedOutput = (toBI(amountIn) * toBI(basePrice)) / toBI(oneToken);
    const priceImpact = ((Number(expectedOutput) - Number(actualOutput)) / Number(expectedOutput)) * 100;

    return {
      basePrice: basePrice.toString(),
      expectedOutput: expectedOutput.toString(),
      actualOutput: actualOutput.toString(),
      priceImpact: priceImpact.toFixed(2),
      slippagePercentage: priceImpact.toFixed(2),
    };
  } catch (error) {
    console.error("Failed to estimate slippage:", error);
    return null;
  }
}

// ============================================================================
// LIMIT ORDERS CONTRACT
// ============================================================================

/**
 * Limit Orders Contract Integration
 *
 * Provides time-based and price-based order execution with:
 * - Autonomous execution when conditions are met
 * - MEV protection with configurable delays
 * - Partial fill support
 * - Order lifecycle management (active, filled, cancelled, expired)
 */
export const LimitOrdersContract = {
  /**
   * Create a new limit order
   *
   * @param {string} tokenIn - Token to sell
   * @param {string} tokenOut - Token to buy
   * @param {string|number} amountIn - Amount to sell (8 decimals)
   * @param {string|number} minAmountOut - Minimum output (8 decimals)
   * @param {string|number} limitPrice - Target price (18 decimals)
   * @param {number} expiryTime - Unix timestamp in milliseconds
   * @param {number} maxSlippage - Slippage tolerance in basis points (default 100 = 1%)
   * @param {boolean} partialFill - Allow partial fills (default false)
   * @returns {Promise<number>} Order ID
   */
  async createOrder(tokenIn, tokenOut, amountIn, minAmountOut, limitPrice, expiryTime, maxSlippage = 100, partialFill = false) {
    try {
      console.log("Creating limit order:", {
        tokenIn,
        tokenOut,
        amountIn,
        minAmountOut,
        limitPrice,
        expiryTime,
        maxSlippage,
        partialFill
      });

      provider = await getProvider();
      const tokenInContract = await getTokenByAddress(tokenIn);

      await tokenInContract.increaseAllowance(CONTRACTS.LIMIT_ORDERS, toBI(amountIn));



      const args = new Args()
        .addString(tokenIn)
        .addString(tokenOut)
        .addU64(toBI(amountIn))
        .addU64(toBI(minAmountOut))
        .addU64(toBI(limitPrice))
        .addU64(BigInt(expiryTime))
        .addU64(BigInt(maxSlippage))
        .addBool(partialFill);

      const result = await callContract(CONTRACTS.LIMIT_ORDERS, 'createLimitOrder', args.serialize());

      // Parse order ID from result
      const orderIdStr = bytesToStr(result);
      const orderId = parseInt(orderIdStr);

      console.log("Order created with ID:", orderId);
      showSuccess(`Order created successfully! ID: ${orderId}`);

      return orderId;
    } catch (error) {
      console.error("Failed to create limit order:", error);
      showError(`Failed to create order: ${error.message}`);
      throw error;
    }
  },

  /**
   * Cancel an active order
   *
   * @param {number} orderId - ID of order to cancel
   * @returns {Promise<boolean>} Success
   */
  async cancelOrder(orderId) {
    try {
      console.log("Cancelling order:", orderId);

      const args = new Args().addU64(BigInt(orderId));
      await callContract(CONTRACTS.LIMIT_ORDERS, 'cancelOrder', args.serialize());

      showSuccess(`Order ${orderId} cancelled successfully!`);
      return true;
    } catch (error) {
      console.error("Failed to cancel order:", error);
      showError(`Failed to cancel order: ${error.message}`);
      throw error;
    }
  },

  /**
   * Execute a limit order (keeper function)
   *
   * @param {number} orderId - Order to execute
   * @param {string|number} currentPrice - Current price (18 decimals)
   * @returns {Promise<boolean>} Success
   */
  async executeOrder(orderId, currentPrice) {
    try {
      console.log("Executing order:", { orderId, currentPrice });

      const args = new Args()
        .addU64(BigInt(orderId))
        .addU64(toBI(currentPrice));

      await callContract(CONTRACTS.LIMIT_ORDERS, 'executeLimitOrder', args.serialize());

      showSuccess(`Order ${orderId} executed successfully!`);
      return true;
    } catch (error) {
      console.error("Failed to execute order:", error);
      showError(`Failed to execute order: ${error.message}`);
      throw error;
    }
  },

  /**
   * Get order details
   *
   * @param {number} orderId - Order ID
   * @returns {Promise<Object|null>} Order details
   */
  async getOrderDetails(orderId) {
    try {
      const args = new Args().addU64(BigInt(orderId));
      const result = await readContract(CONTRACTS.LIMIT_ORDERS, 'readOrder', args.serialize());

      if (!result || result.length === 0) {
        return null;
      }

      // Parse order data
      const orderArgs = new Args(result);

      const order = {
        id: Number(orderArgs.nextU64().unwrap()),
        user: orderArgs.nextString().unwrap(),
        tokenIn: orderArgs.nextString().unwrap(),
        tokenOut: orderArgs.nextString().unwrap(),
        amountIn: Number(orderArgs.nextU64().unwrap()),
        minAmountOut: Number(orderArgs.nextU64().unwrap()),
        limitPrice: Number(orderArgs.nextU64().unwrap()),
        expiryTime: Number(orderArgs.nextU64().unwrap()),
        createdTime: Number(orderArgs.nextU64().unwrap()),
        status: orderArgs.nextU8().unwrap(),
        executedAmount: Number(orderArgs.nextU64().unwrap()),
        remainingAmount: Number(orderArgs.nextU64().unwrap()),
        maxSlippage: Number(orderArgs.nextU64().unwrap()),
        partialFillAllowed: orderArgs.nextBool().unwrap(),
        useTWAP: orderArgs.nextBool().unwrap(),
        minExecutionDelay: Number(orderArgs.nextU64().unwrap()),
        maxPriceImpact: Number(orderArgs.nextU64().unwrap()),
        executionWindow: Number(orderArgs.nextU64().unwrap())
      };

      console.log("Order details:", order);
      return order;
    } catch (error) {
      console.error("Failed to get order details:", error);
      return null;
    }
  },

  /**
   * Get all orders for a user
   *
   * @param {string} userAddress - User address
   * @returns {Promise<number[]>} Array of order IDs
   */
  async getUserOrders(userAddress) {
    try {
      const args = new Args().addString(userAddress);
      const result = await readContract(CONTRACTS.LIMIT_ORDERS, 'getUserOrders', args.serialize());

      if (!result || result.length === 0) {
        return [];
      }

      // Parse array of order IDs
      const orderArgs = new Args(result);
      const orderIds = orderArgs.nextFixedSizeArray().unwrapOrDefault();

      console.log("User orders:", orderIds);
      return orderIds.map(id => Number(id));
    } catch (error) {
      console.error("Failed to get user orders:", error);
      return [];
    }
  },

  /**
   * Check if order is eligible for execution
   *
   * @param {number} orderId - Order ID
   * @returns {Promise<boolean>} Eligibility
   */
  async isOrderEligible(orderId) {
    try {
      const args = new Args().addU64(BigInt(orderId));
      const result = await readContract(CONTRACTS.LIMIT_ORDERS, 'isOrderEligible', args.serialize());

      const resultArgs = new Args(result);
      const eligible = resultArgs.nextBool().unwrap();

      return eligible;
    } catch (error) {
      console.error("Failed to check order eligibility:", error);
      return false;
    }
  },

  /**
   * Get total order count
   *
   * @returns {Promise<number>} Total orders
   */
  async getOrderCount() {
    try {
      const result = await readContract(CONTRACTS.LIMIT_ORDERS, 'readOrderCount');
      const countStr = bytesToStr(result);
      return parseInt(countStr) || 0;
    } catch (error) {
      console.error("Failed to get order count:", error);
      return 0;
    }
  }
};

// Order status constants
export const ORDER_STATUS = {
  ACTIVE: 0,
  FILLED: 1,
  CANCELLED: 2,
  EXPIRED: 3
};

export const ORDER_STATUS_NAMES = ['Active', 'Filled', 'Cancelled', 'Expired'];
export const ORDER_STATUS_COLORS = ['blue', 'green', 'gray', 'red'];

export default AMMContract;
