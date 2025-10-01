import { Args,bytesToF64, U128 } from "@massalabs/massa-web3";
import { callContract, readContract } from "./contract-helpers.js";
import { showError, showSuccess } from "./ui.js";
import { toU256 } from "./utils.js";
import { getTokenByAddress } from "./services/token-service.js";
import { DEPLOYED_CONTRACTS } from "./contracts-config.js";

const CONTRACTS = {
  ADVANCED: DEPLOYED_CONTRACTS.DCA,
}

// Advanced Features Contract Functions
export const AdvancedContract = {
  // Create limit order
  async createLimitOrder(tokenIn, tokenOut, amountIn, minAmountOut, expiry, orderType, partialFill, slippageTolerance) {
    try {
       const args = new Args()
                .addString(tokenIn)
                .addString(tokenOut)
                .addU64(amountIn)
                .addU64(minAmountOut)
                .addU64(expiry)
                .addString(orderType)
                .addBool(partialFill)
                .addU64(slippageTolerance)
                .serialize();
            const operation = await callContract(CONTRACTS.ADVANCED, "createLimitOrder", [], 0, args);
            showSuccess("Limit order created successfully!")
      return operation
    } catch (error) {
      showError(`Failed to create limit order: ${error.message}`)
      throw error
    }
  },

  // Cancel limit order
  async cancelOrder(orderId) {
    try {
      const args = new Args()
                .addU64(orderId)
                .serialize();
            const operation = await callContract(CONTRACTS.ADVANCED, "cancelOrder", [], 0, args);
            return operation
    } catch (error) {
      showError(`Failed to cancel order: ${error.message}`)
      throw error
    }
  },

  // Get limit order
  async getLimitOrder(orderId) {
    try {
     const args = new Args()
                .addU64(orderId)
                .serialize();
            const result = await readContract(CONTRACTS.ADVANCED, "getLimitOrder", args);
            return result
    } catch (error) {
      console.error("Failed to get limit order:", error)
      return null
    }
  },

  // Get user orders
  async getUserOrders(userAddress) {
    try {
       const args = new Args()
                .addString(userAddress)
                .serialize();
            const result = await readContract(CONTRACTS.ADVANCED, "getUserOrders", args);
             return result
    } catch (error) {
      console.error("Failed to get user orders:", error)
      return []
    }
  },

  // Create DCA strategy
  async createDCAStrategy(
    tokenIn,
    tokenOut,
    amountPerPeriod,
    intervalPeriods,
    totalPeriods,
    minAmountOut,
    maxSlippage,
    stopLoss,
    takeProfit,
  ) {
    try {
       const args = new Args()
                .addString(tokenIn)
                .addString(tokenOut)
                .addU64(amountPerPeriod)
                .addU64(intervalPeriods)
                .addU64(totalPeriods)
                .addU64(minAmountOut)
                .addU64(maxSlippage)
                .addU64(stopLoss)
                .addU64(takeProfit)
                .serialize();
            const operation = await callContract(CONTRACTS.ADVANCED, "createDCAStrategy", [], 0, args);
            showSuccess("DCA strategy created successfully!")
      return operation
    } catch (error) {
      showError(`Failed to create DCA strategy: ${error.message}`)
      throw error
    }
  },

  // Get DCA strategy
  async getDCAStrategy(strategyId) {
    try {
     const args = new Args()
                .addU64(strategyId)
                .serialize();
            const result = await readContract(CONTRACTS.ADVANCED, "getDCAStrategy", args);
            return result
    } catch (error) {
      console.error("Failed to get DCA strategy:", error)
      return null
    }
  },

  // Get user DCA strategies
  async getUserDCAs(userAddress) {
    try {
      const args = new Args()
                .addString(userAddress)
                .serialize();
            const result = await readContract(CONTRACTS.ADVANCED, "getUserDCAs", args);
            return result
    } catch (error) {
      console.error("Failed to get user DCAs:", error)
      return []
    }
  },

  // Create yield pool
  async createYieldPool(tokenA, tokenB, rewardToken, rewardRate, performanceFee, lockupPeriod, maxLeverage) {
    try {
      const args = new Args()
                .addString(tokenA)
                .addString(tokenB)
                .addString(rewardToken)
                .addU64(rewardRate)
                .addU64(performanceFee)
                .addU64(lockupPeriod)
                .addU64(maxLeverage)
                .serialize();
            const operation = await callContract(CONTRACTS.ADVANCED, "createYieldPool", [], 0, args);
            showSuccess("Yield pool created successfully!")
      return operation
    } catch (error) {
      showError(`Failed to create yield pool: ${error.message}`)
      throw error
    }
  },

  // Stake in yield pool
  async stakeInYieldPool(poolId, amountA, amountB) {
    try {
       const args = new Args()
                .addU64(poolId)
                .addU64(amountA)
                .addU64(amountB)
                .serialize();
            const operation = await callContract(CONTRACTS.ADVANCED, "stakeInYieldPool", [], 0, args);
            showSuccess("Staked in yield pool successfully!")
      return operation
    } catch (error) {
      showError(`Failed to stake in yield pool: ${error.message}`)
      throw error
    }
  },

  // Create leveraged position
  async createLeveragedPosition(poolId, collateralAmount, leverage) {
    try {
      const args = new Args()
                .addU64(poolId)
                .addU64(collateralAmount)
                .addU64(leverage)
                .serialize();
            const operation = await callContract(CONTRACTS.ADVANCED, "createLeveragedPosition", [], 0, args);
            showSuccess("Leveraged position created successfully!")
      return operation
    } catch (error) {
      showError(`Failed to create leveraged position: ${error.message}`)
      throw error
    }
  },

  // Get yield pool
  async getYieldPool(poolId) {
    try {
      const args = new Args()
                .addU64(poolId)
                .serialize();
            const result = await readContract(CONTRACTS.ADVANCED, "getYieldPool", args);
            return result
    } catch (error) {
      console.error("Failed to get yield pool:", error)
      return null
    }
  },

  // Get leveraged position
  async getLeveragedPosition(positionId) {
    try {
      const args = new Args()
                .addU64(positionId)
                .serialize();
            const result = await readContract(CONTRACTS.ADVANCED, "getLeveragedPosition", args);
            return result
    } catch (error) {
      console.error("Failed to get leveraged position:", error)
      return null
    }
  },

  // Get user positions
  async getUserPositions(userAddress) {
    try {
   const args = new Args()
                .addString(userAddress)
                .serialize();
            const result = await readContract(CONTRACTS.ADVANCED, "getUserPositions", args);
            return result
    } catch (error) {
      console.error("Failed to get user positions:", error)
      return []
    }
  },

  // Get current gas price
  async getCurrentGasPrice() {
    try {
      const args = new Args()
      .serialize()
      const result = await readContract(CONTRACTS.ADVANCED, "getCurrentGasPrice", args)
      console.log(result.info)
      console.log(Uint8Array.from(result))
      return U128.fromBuffer(result, 1) || 1000
    } catch (error) {
      console.error("Failed to get gas price:", error)
      return 1000
    }
  },
}
