import { Args, Mas, bytesToStr, OperationStatus } from "@massalabs/massa-web3";
import { callContract, readContract } from "./contract-helpers.js";
import { showError, showSuccess } from "./ui.js";
import { getTokenByAddress } from "./services/token-service.js";
import { toU256 } from "./utils.js";
import { getProvider } from "./wallet.js";
import { DEPLOYED_CONTRACTS } from "./contracts-config.js";

const CONTRACTS = {
  AMM: DEPLOYED_CONTRACTS.AMM,
}

let provider = null;

// Helper function to convert bigint to number safely
function bigintToNumber(value) {
  if (typeof value === 'bigint') {
    return Number(value);
  }
  return value;
}

// AMM Contract Functions
export const AMMContract = {
  // Create a new liquidity pool
  async createPool(tokenA, tokenB, amountA, amountB, deadline) {
    try {
      console.log("Creating pool:", tokenA, tokenB, amountA, amountB, deadline);

      provider = await getProvider()
      const tokenAcontract = await getTokenByAddress(tokenA);
      const tokenBcontract = await getTokenByAddress(tokenB);

      const decimalsA = await tokenAcontract.decimals();
      const decimalsB = await tokenBcontract.decimals();

      // Convert amounts to u256 (BigInt with decimals)
      const amountA256 = toU256(amountA, Number(decimalsA));
      const amountB256 = toU256(amountB, Number(decimalsB));

      console.log("Amounts in u256:", amountA256.toString(), amountB256.toString());

      // Check balances
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
      const opA = await tokenAcontract.increaseAllowance(
        CONTRACTS.AMM,
        amountA256
      );

      const statusA = await opA.waitSpeculativeExecution();
      if (statusA !== OperationStatus.SpeculativeSuccess) {
        throw new Error(`Token A approval failed with status: ${statusA}`);
      }

      // Approve Token B
      const opB = await tokenBcontract.increaseAllowance(
        CONTRACTS.AMM,
        amountB256
      );

      const statusB = await opB.waitSpeculativeExecution();
      if (statusB !== OperationStatus.SpeculativeSuccess) {
        throw new Error(`Token B approval failed with status: ${statusB}`);
      }

      console.log("creating pool with ", {
        amountA,
        amountB
      })

      // Call createPool with u64 amounts (raw values without decimals)
      const args = new Args()
        .addString(tokenA)
        .addString(tokenB)
        .addU64(BigInt(amountA))  // Raw amount
        .addU64(BigInt(amountB))  // Raw amount
        .addU64(BigInt(deadline));

      console.log("Calling createPool with args:", args.serialize());

      const operation = await callContract(CONTRACTS.AMM, "createPool", args.serialize());

      showSuccess("Pool created successfully!");
      return operation;
    } catch (error) {
      showError(`Failed to create pool: ${error.message}`);
      throw error;
    }
  },

  // Add liquidity to existing pool
  async addLiquidity(tokenA, tokenB, amountADesired, amountBDesired, amountAMin, amountBMin, deadline) {
    try {
      const tokenAcontract = await getTokenByAddress(tokenA);
      const tokenBcontract = await getTokenByAddress(tokenB);

      const decimalsA = await tokenAcontract.decimals();
      const decimalsB = await tokenBcontract.decimals();

      // Convert amounts to u256
      const amountADesired256 = toU256(amountADesired, Number(decimalsA));
      const amountBDesired256 = toU256(amountBDesired, Number(decimalsB));
      const amountAMin256 = toU256(amountAMin, Number(decimalsA));
      const amountBMin256 = toU256(amountBMin, Number(decimalsB));

      const args = new Args()
        .addString(tokenA)
        .addString(tokenB)
        .addU64(BigInt(amountADesired))  // Raw amount
        .addU64(BigInt(amountBDesired))  // Raw amount
        .addU64(BigInt(amountAMin))      // Raw amount
        .addU64(BigInt(amountBMin))      // Raw amount
        .addU64(BigInt(deadline))
        .serialize();

      const operation = await callContract(CONTRACTS.AMM, "addLiquidity", args);

      showSuccess("Liquidity added successfully!");
      return operation;
    } catch (error) {
      showError(`Failed to add liquidity: ${error.message}`);
      throw error;
    }
  },

  // Remove liquidity from pool
  async removeLiquidity(tokenA, tokenB, liquidity, amountAMin, amountBMin, deadline) {
    try {
      const tokenAcontract = await getTokenByAddress(tokenA);
      const tokenBcontract = await getTokenByAddress(tokenB);

      const decimalsA = await tokenAcontract.decimals();
      const decimalsB = await tokenBcontract.decimals();

      // Convert amounts to u256
      const liquidity256 = toU256(liquidity, 18); // LP tokens typically have 18 decimals
      const amountAMin256 = toU256(amountAMin, Number(decimalsA));
      const amountBMin256 = toU256(amountBMin, Number(decimalsB));

      const args = new Args()
        .addString(tokenA)
        .addString(tokenB)
        .addU256(liquidity256)    // ✅ Changed to u256
        .addU256(amountAMin256)   // ✅ Changed to u256
        .addU256(amountBMin256)   // ✅ Changed to u256
        .addU64(BigInt(deadline))
        .serialize();

      const operation = await callContract(CONTRACTS.AMM, "removeLiquidity", args);

      showSuccess("Liquidity removed successfully!");
      return operation;
    } catch (error) {
      showError(`Failed to remove liquidity: ${error.message}`);
      throw error;
    }
  },

  // Swap tokens
  async swap(tokenIn, tokenOut, amountIn, amountOutMin, deadline) {
    try {
      const tokenInContract = await getTokenByAddress(tokenIn);
      const tokenOutContract = await getTokenByAddress(tokenOut);

      const decimalsIn = await tokenInContract.decimals();
      const decimalsOut = await tokenOutContract.decimals();

      // Contract expects raw u64 amounts (not u256)
      // amountIn and amountOutMin should already be in raw units
      const amountInRaw = BigInt(Math.floor(amountIn));
      const amountOutMinRaw = BigInt(Math.floor(amountOutMin));

      console.log("Swap args:", {
        tokenIn,
        tokenOut,
        amountInRaw: amountInRaw.toString(),
        amountOutMinRaw: amountOutMinRaw.toString(),
        deadline
      });

      const args = new Args()
        .addString(tokenIn)
        .addString(tokenOut)
        .addU64(amountInRaw)
        .addU64(amountOutMinRaw)
        .addU64(BigInt(deadline))
        .serialize();

      const operation = await callContract(CONTRACTS.AMM, "swap", args);

      showSuccess("Swap completed successfully!");
      return operation;
    } catch (error) {
      showError(`Failed to swap tokens: ${error.message}`);
      throw error;
    }
  },

  // Get pool information
  async getPool(tokenA, tokenB) {
    try {
      const args = new Args()
          .addString(tokenA)
          .addString(tokenB)
          .serialize()

        
      const result = await readContract(CONTRACTS.AMM, "readPool", args)
      
      return bytesToStr(result)
    } catch (error) {
      console.error("Failed to get pool info:", error)
      return null
    }
  },



  // Get amount out for swap
  async getAmountOut(amountIn, reserveIn, reserveOut, fee) {
    try {
      console.log("getAmountOut called with:", {
        amountIn: amountIn.toString(),
        reserveIn: reserveIn.toString(),
        reserveOut: reserveOut.toString(),
        fee: fee.toString()
      });

      const args = new Args()
            .addU64(amountIn)
            .addU64(reserveIn)
            .addU64(reserveOut)
            .addU64(fee)

      console.log("Calling readGetAmountOut...");
      const result = await readContract(CONTRACTS.AMM, "readGetAmountOut", args.serialize());

      console.log("Raw result from contract:", result);
      const amountOutStr = bytesToStr(result);
      console.log("Result as string:", amountOutStr);

      if (!amountOutStr || amountOutStr === "" || amountOutStr === "0") {
        console.warn("getAmountOut returned empty or zero");
        return 0n;
      }

      const amountOut = BigInt(amountOutStr);
      console.log("amount out is ", amountOut.toString())
      return amountOut
    } catch (error) {
      console.error("Failed to get amount out:", error)
      console.error("Error details:", error.message, error.stack);
      return 0n
    }
  },

  async getAmountIn(amountOut, reserveIn, reserveOut, fee) {
    try {
      const args = new Args()
            .addU64(amountOut)
            .addU64(reserveIn)
            .addU64(reserveOut)
            .addU64(fee)
      const result = await readContract(CONTRACTS.AMM, "readGetAmountIn", args.serialize())
      const amountInStr = bytesToStr(result);
      const amountIn = BigInt(amountInStr);
      console.log("amount in is ", amountIn)
      return amountIn
    } catch (error) {
      console.error("Failed to get amount in:", error)
      return 0n
    }
  },

  async safeSqrt(x, y) {
    try {
      const args = new Args()
            .addU64(x)
            .addU64(y)
      const result = await readContract(CONTRACTS.AMM, "readSafeSqrt", args.serialize())
      const sqrtStr = bytesToStr(result);
      const sqrtResult = BigInt(sqrtStr);
      return sqrtResult
    } catch (error) {
      console.error("Failed to calculate safe sqrt:", error)
      return 0n
    }
  },

  async sqrt(x) {
    try {
      const args = new Args()
            .addU64(x)
      const result = await readContract(CONTRACTS.AMM, "readSqrt", args.serialize())
      const sqrtStr = bytesToStr(result);
      const sqrtResult = BigInt(sqrtStr);
      return sqrtResult
    } catch (error) {
      console.error("Failed to calculate sqrt:", error)
      return 0n
    }
  },

  async getPools() {

      if (!provider) {
          throw new Error("Provider not initialized");
      }
      const args = new Args()
      const pools =  await readContract(CONTRACTS.AMM, "readPoolList", args.serialize())
      

      return pools;
  },

  async getPoolCount() {

      if (!provider) {
          throw new Error("Provider not initialized");
      }
      const args = new Args()
      const poolCount =  await readContract(CONTRACTS.AMM, "readPoolCount", args.serialize())
      console.log("getPoolCount:", poolCount);

      return poolCount;
  },

  async getTotalVolume() {

      if (!provider) {
          throw new Error("Provider not initialized");
      }
      const args = new Args()
      const volume =  await readContract(CONTRACTS.AMM, "readTotalVolume", args.serialize())
      

      return volume;
  },

  async getProtocolFeeRate() {

      if (!provider) {
          throw new Error("Provider not initialized");
      }
      const args = new Args()

      const readProtocolFeeRate =  await readContract(CONTRACTS.AMM, "readProtocolFeeRate", args.serialize())
      
      return readProtocolFeeRate;
  },

}

export async function getProtocolStats() {
    provider = await getProvider()

    const tvl = await AMMContract.getTotalVolume()
    const poolCount = await AMMContract.getPoolCount()
    const readProtocolFeeRate = await AMMContract.getProtocolFeeRate()


    return {
        tvl: Number(bytesToStr(tvl)),
        poolCount: Number(bytesToStr(poolCount)),
        readProtocolFeeRate: Number(bytesToStr(readProtocolFeeRate))
    }
}

// ============================================================================
// ADVANCED FEATURES (DCA, Limit Orders, Yield Farming, TWAP)
// ============================================================================

export const AdvancedFeatures = {
  // ============================================================================
  // DCA (Dollar-Cost Averaging) Functions
  // ============================================================================

  /**
   * Create a DCA strategy
   * @param {string} tokenIn - Address of token to sell
   * @param {string} tokenOut - Address of token to buy
   * @param {string} amountPerPeriod - Amount to invest per period (raw amount)
   * @param {number} intervalSeconds - Seconds between each purchase
   * @param {number} totalPeriods - Total number of periods to execute
   * @param {Object} options - Optional parameters (minPriceThreshold, maxPriceThreshold, stopLoss, takeProfit, maxSlippage)
   */
  async createDCA(tokenIn, tokenOut, amountPerPeriod, intervalSeconds, totalPeriods, options = {}) {
    try {
      console.log("Creating DCA strategy:", { tokenIn, tokenOut, amountPerPeriod, intervalSeconds, totalPeriods, options });

      provider = await getProvider();
      const tokenInContract = await getTokenByAddress(tokenIn);
      const decimalsIn = await tokenInContract.decimals();

      // Convert amount to u256 for approval
      const totalAmount256 = toU256((BigInt(amountPerPeriod) * BigInt(totalPeriods)).toString(), Number(decimalsIn));

      // Approve total amount
      const opApprove = await tokenInContract.increaseAllowance(CONTRACTS.AMM, totalAmount256);
      const statusApprove = await opApprove.waitSpeculativeExecution();
      if (statusApprove !== OperationStatus.SpeculativeSuccess) {
        throw new Error(`Token approval failed with status: ${statusApprove}`);
      }

      // Build DCA args
      const args = new Args()
        .addString(tokenIn)
        .addString(tokenOut)
        .addU64(BigInt(amountPerPeriod))
        .addU64(BigInt(intervalSeconds))
        .addU64(BigInt(totalPeriods))
        .addU64(BigInt(options.minPriceThreshold || 0))
        .addU64(BigInt(options.maxPriceThreshold || 0))
        .addU64(BigInt(options.stopLoss || 0))
        .addU64(BigInt(options.takeProfit || 0))
        .addU64(BigInt(options.maxSlippage || 100)); // Default 1% slippage

      const operation = await callContract(CONTRACTS.AMM, "createDCA", args.serialize());

      showSuccess("DCA strategy created successfully!");
      return operation;
    } catch (error) {
      showError(`Failed to create DCA strategy: ${error.message}`);
      throw error;
    }
  },

  /**
   * Cancel a DCA strategy
   * @param {number} strategyId - ID of the strategy to cancel
   */
  async cancelDCA(strategyId) {
    try {
      const args = new Args().addU64(BigInt(strategyId));
      const operation = await callContract(CONTRACTS.AMM, "cancelDCA", args.serialize());
      showSuccess("DCA strategy cancelled!");
      return operation;
    } catch (error) {
      showError(`Failed to cancel DCA: ${error.message}`);
      throw error;
    }
  },

  /**
   * Get DCA strategy details
   * @param {number} strategyId - ID of the strategy
   */
  async getDCA(strategyId) {
    try {
      const args = new Args().addU64(BigInt(strategyId));
      const result = await readContract(CONTRACTS.AMM, "getDCA", args.serialize());

      // Deserialize the result
      const data = new Args(result);
      return {
        id: data.nextU64(),
        user: data.nextString(),
        tokenIn: data.nextString(),
        tokenOut: data.nextString(),
        amountPerPeriod: data.nextU64(),
        intervalSeconds: data.nextU64(),
        totalPeriods: data.nextU64(),
        currentPeriod: data.nextU64(),
        lastExecution: data.nextU64(),
        isActive: data.nextBool(),
        minPriceThreshold: data.nextU64(),
        maxPriceThreshold: data.nextU64(),
        stopLoss: data.nextU64(),
        takeProfit: data.nextU64(),
        accumulatedTokens: data.nextU64(),
        totalSpent: data.nextU64(),
        averagePrice: data.nextU64(),
        maxSlippage: data.nextU64(),
        useTWAP: data.nextBool()
      };
    } catch (error) {
      console.error("Failed to get DCA strategy:", error);
      return null;
    }
  },

  /**
   * Get user's DCA strategies
   * @param {string} userAddress - User's wallet address
   */
  async getUserDCAs(userAddress) {
    try {
      const args = new Args().addString(userAddress);
      const result = await readContract(CONTRACTS.AMM, "getUserDCAs", args.serialize());

      const data = new Args(result);
      const ids = data.nextFixedSizeArray();
      return ids || [];
    } catch (error) {
      console.error("Failed to get user DCAs:", error);
      return [];
    }
  },

  // ============================================================================
  // Limit Order Functions
  // ============================================================================

  /**
   * Create a limit order
   * @param {string} tokenIn - Address of token to sell
   * @param {string} tokenOut - Address of token to buy
   * @param {string} amountIn - Amount to sell (raw amount)
   * @param {string} targetPrice - Target price (18 decimals)
   * @param {string} minAmountOut - Minimum amount to receive
   * @param {number} expiry - Order expiration timestamp
   * @param {boolean} partialFillAllowed - Allow partial fills
   */
  async createLimitOrder(tokenIn, tokenOut, amountIn, targetPrice, minAmountOut, expiry, partialFillAllowed = false) {
    try {
      console.log("Creating limit order:", { tokenIn, tokenOut, amountIn, targetPrice, minAmountOut, expiry });

      provider = await getProvider();
      const tokenInContract = await getTokenByAddress(tokenIn);
      const decimalsIn = await tokenInContract.decimals();

      // Convert amount to u256 for approval
      const amountIn256 = toU256(amountIn, Number(decimalsIn));

      // Approve token
      const opApprove = await tokenInContract.increaseAllowance(CONTRACTS.AMM, amountIn256);
      const statusApprove = await opApprove.waitSpeculativeExecution();
      if (statusApprove !== OperationStatus.SpeculativeSuccess) {
        throw new Error(`Token approval failed with status: ${statusApprove}`);
      }

      // Build limit order args
      const args = new Args()
        .addString(tokenIn)
        .addString(tokenOut)
        .addU64(BigInt(amountIn))
        .addU64(BigInt(targetPrice))
        .addU64(BigInt(minAmountOut))
        .addU64(BigInt(expiry))
        .addBool(partialFillAllowed);

      const operation = await callContract(CONTRACTS.AMM, "createLimitOrder", args.serialize());

      showSuccess("Limit order created successfully!");
      return operation;
    } catch (error) {
      showError(`Failed to create limit order: ${error.message}`);
      throw error;
    }
  },

  /**
   * Cancel a limit order
   * @param {number} orderId - ID of the order to cancel
   */
  async cancelLimitOrder(orderId) {
    try {
      const args = new Args().addU64(BigInt(orderId));
      const operation = await callContract(CONTRACTS.AMM, "cancelLimitOrder", args.serialize());
      showSuccess("Limit order cancelled!");
      return operation;
    } catch (error) {
      showError(`Failed to cancel limit order: ${error.message}`);
      throw error;
    }
  },

  /**
   * Get limit order details
   * @param {number} orderId - ID of the order
   */
  async getLimitOrder(orderId) {
    try {
      const args = new Args().addU64(BigInt(orderId));
      const result = await readContract(CONTRACTS.AMM, "getLimitOrder", args.serialize());

      const data = new Args(result);
      return {
        id: data.nextU64(),
        user: data.nextString(),
        tokenIn: data.nextString(),
        tokenOut: data.nextString(),
        amountIn: data.nextU64(),
        targetPrice: data.nextU64(),
        minAmountOut: data.nextU64(),
        expiry: data.nextU64(),
        isActive: data.nextBool(),
        filledAmount: data.nextU64(),
        partialFillAllowed: data.nextBool(),
        createdAt: data.nextU64(),
        minBlockDelay: data.nextU64(),
        maxPriceImpact: data.nextU64(),
        useTWAP: data.nextBool()
      };
    } catch (error) {
      console.error("Failed to get limit order:", error);
      return null;
    }
  },

  /**
   * Get user's limit orders
   * @param {string} userAddress - User's wallet address
   */
  async getUserOrders(userAddress) {
    try {
      const args = new Args().addString(userAddress);
      const result = await readContract(CONTRACTS.AMM, "getUserOrders", args.serialize());

      const data = new Args(result);
      const ids = data.nextFixedSizeArray();
      return ids || [];
    } catch (error) {
      console.error("Failed to get user orders:", error);
      return [];
    }
  },

  // ============================================================================
  // TWAP Price Oracle Functions
  // ============================================================================

  /**
   * Get TWAP (Time-Weighted Average Price)
   * @param {string} tokenA - First token address
   * @param {string} tokenB - Second token address
   */
  async getTWAPPrice(tokenA, tokenB) {
    try {
      const args = new Args()
        .addString(tokenA)
        .addString(tokenB);

      const result = await readContract(CONTRACTS.AMM, "readGetTWAPPrice", args.serialize());
      const priceStr = bytesToStr(result);
      return BigInt(priceStr);
    } catch (error) {
      console.error("Failed to get TWAP price:", error);
      return 0n;
    }
  },

  /**
   * Update TWAP accumulator (keeper function)
   * @param {string} tokenA - First token address
   * @param {string} tokenB - Second token address
   */
  async updateTWAP(tokenA, tokenB) {
    try {
      const args = new Args()
        .addString(tokenA)
        .addString(tokenB);

      const operation = await callContract(CONTRACTS.AMM, "updateTWAP", args.serialize());
      return operation;
    } catch (error) {
      console.error("Failed to update TWAP:", error);
      throw error;
    }
  },

  // ============================================================================
  // Yield Farming Functions
  // ============================================================================

  /**
   * Get yield pool details
   * @param {number} poolId - ID of the yield pool
   */
  async getYieldPool(poolId) {
    try {
      const args = new Args().addU64(BigInt(poolId));
      const result = await readContract(CONTRACTS.AMM, "getYieldPool", args.serialize());

      const data = new Args(result);
      return {
        id: data.nextU64(),
        tokenA: data.nextString(),
        tokenB: data.nextString(),
        rewardToken: data.nextString(),
        totalStaked: data.nextU64(),
        rewardRate: data.nextU64(),
        lastUpdateTime: data.nextU64(),
        rewardPerTokenStored: data.nextU64(),
        isActive: data.nextBool(),
        performanceFee: data.nextU64(),
        lockupPeriod: data.nextU64(),
        maxLeverage: data.nextU64(),
        totalBorrowed: data.nextU64(),
        insuranceFund: data.nextU64()
      };
    } catch (error) {
      console.error("Failed to get yield pool:", error);
      return null;
    }
  },

  /**
   * Stake tokens in yield pool
   * @param {number} poolId - ID of the yield pool
   * @param {string} amountA - Amount of token A to stake
   * @param {string} amountB - Amount of token B to stake
   */
  async stakeInYieldPool(poolId, amountA, amountB) {
    try {
      const args = new Args()
        .addU64(BigInt(poolId))
        .addU64(BigInt(amountA))
        .addU64(BigInt(amountB));

      const operation = await callContract(CONTRACTS.AMM, "stakeInYieldPool", args.serialize());
      showSuccess("Tokens staked successfully!");
      return operation;
    } catch (error) {
      showError(`Failed to stake: ${error.message}`);
      throw error;
    }
  },

  /**
   * Unstake tokens from yield pool
   * @param {number} poolId - ID of the yield pool
   * @param {string} lpAmount - Amount of LP tokens to unstake
   */
  async unstakeFromYieldPool(poolId, lpAmount) {
    try {
      const args = new Args()
        .addU64(BigInt(poolId))
        .addU64(BigInt(lpAmount));

      const operation = await callContract(CONTRACTS.AMM, "unstakeFromYieldPool", args.serialize());
      showSuccess("Tokens unstaked successfully!");
      return operation;
    } catch (error) {
      showError(`Failed to unstake: ${error.message}`);
      throw error;
    }
  },

  /**
   * Claim yield rewards
   * @param {number} poolId - ID of the yield pool
   */
  async claimYieldRewards(poolId) {
    try {
      const args = new Args().addU64(BigInt(poolId));

      const operation = await callContract(CONTRACTS.AMM, "claimYieldRewards", args.serialize());
      showSuccess("Rewards claimed successfully!");
      return operation;
    } catch (error) {
      showError(`Failed to claim rewards: ${error.message}`);
      throw error;
    }
  },

  /**
   * Get user's stake in a yield pool
   * @param {string} userAddress - User's wallet address
   * @param {number} poolId - ID of the yield pool
   */
  async getUserStake(userAddress, poolId) {
    try {
      const args = new Args()
        .addString(userAddress)
        .addU64(BigInt(poolId));

      const result = await readContract(CONTRACTS.AMM, "getUserStake", args.serialize());

      const data = new Args(result);
      return {
        user: data.nextString(),
        poolId: data.nextU64(),
        amount: data.nextU64(),
        rewardDebt: data.nextU64(),
        stakedAt: data.nextU64(),
        lastClaimTime: data.nextU64()
      };
    } catch (error) {
      console.error("Failed to get user stake:", error);
      return null;
    }
  },

  /**
   * Get pending rewards for a user in a yield pool
   * @param {string} userAddress - User's wallet address
   * @param {number} poolId - ID of the yield pool
   */
  async getPendingRewards(userAddress, poolId) {
    try {
      const args = new Args()
        .addString(userAddress)
        .addU64(BigInt(poolId));

      const result = await readContract(CONTRACTS.AMM, "getPendingRewards", args.serialize());
      const rewardsStr = bytesToStr(result);
      return BigInt(rewardsStr);
    } catch (error) {
      console.error("Failed to get pending rewards:", error);
      return 0n;
    }
  }
};

