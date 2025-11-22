/**
 * Recurring Orders Contract Wrapper
 *
 * Complete interface for interacting with the recurring_orders.ts contract
 *
 * Features:
 * - Buy on Price Increase (DCA-style accumulation)
 * - Sell on Price Decrease (take profits / stop loss)
 * - Grid Trading (multiple buy/sell levels)
 * - DCA (Dollar Cost Averaging at intervals)
 * - Order management (pause, resume, cancel)
 * - Autonomous bot execution
 */

import { Args, bytesToStr } from "@massalabs/massa-web3";
import { getProvider, toU256, showSuccess, showError, callContract, readContract, DEPLOYED_CONTRACTS } from "./main.js";
import { getTokenByAddress } from "./token-service.js";

// ============================================================================
// CONSTANTS
// ============================================================================

// Order Types (must match contract)
export const ORDER_TYPE = {
  BUY_ON_INCREASE: 0,  // Buy when price goes up by %
  SELL_ON_DECREASE: 1, // Sell when price goes down by %
  GRID: 2,             // Grid trading (buy/sell at multiple levels)
  DCA: 3,              // Dollar cost averaging at intervals
};

export const ORDER_TYPE_NAMES = {
  0: 'Buy on Increase',
  1: 'Sell on Decrease',
  2: 'Grid Trading',
  3: 'DCA',
};

// Order Status (must match contract)
export const ORDER_STATUS = {
  ACTIVE: 0,
  COMPLETED: 1,
  PAUSED: 2,
  CANCELLED: 3,
};

export const ORDER_STATUS_NAMES = {
  0: 'Active',
  1: 'Completed',
  2: 'Paused',
  3: 'Cancelled',
};

export const ORDER_STATUS_COLORS = {
  0: 'success',   // Active - green
  1: 'info',      // Completed - blue
  2: 'warning',   // Paused - yellow
  3: 'error',     // Cancelled - red
};

// Execution Modes
export const EXECUTION_MODE = {
  TRIGGERED: 0,  // Execute when price % change triggered
  INTERVAL: 1,   // Execute every N seconds regardless
};

// Contract address
const RECURRING_ORDERS_ADDRESS = () => {
  const addr = DEPLOYED_CONTRACTS.RECURRING_ORDERS;
  if (!addr) {
    throw new Error('Recurring Orders contract not deployed. Please deploy recurring_orders.ts first.');
  }
  return addr;
};

// ============================================================================
// RECURRING ORDERS CONTRACT
// ============================================================================

export const RecurringOrdersContract = {
  /**
   * Create a "Buy on Price Increase" order
   *
   * Example: Buy $100 of USDC whenever WMAS price increases 2%
   *
   * @param {string} tokenIn - Token to sell (e.g., WMAS)
   * @param {string} tokenOut - Token to buy (e.g., USDC)
   * @param {number} triggerPercentage - Percentage increase to trigger (basis points: 200 = 2%)
   * @param {string|number} amountPerExecution - Amount to trade per execution
   * @param {string|number} minAmountOut - Minimum output (slippage protection)
   * @param {number} maxExecutions - Max times to execute (0 = unlimited)
   * @param {number} decimals - Token decimals (default: 8)
   * @returns {Promise<number>} Order ID
   */
  async createBuyOnIncrease(tokenIn, tokenOut, triggerPercentage, amountPerExecution, minAmountOut, maxExecutions = 0, decimals = 8) {
    try {
      console.log("Creating Buy on Increase order:", {
        tokenIn,
        tokenOut,
        triggerPercentage,
        amountPerExecution,
        minAmountOut,
        maxExecutions
      });

      const provider = await getProvider();
      const tokenInContract = await getTokenByAddress(tokenIn);

      // Convert amounts to u256
      const amountIn256 = toU256(amountPerExecution, decimals);
      const minOut256 = toU256(minAmountOut, decimals);

      // Approve tokens (total amount = amountPerExecution * maxExecutions)
      const totalAmount = maxExecutions > 0
        ? BigInt(amountPerExecution) * BigInt(maxExecutions)
        : BigInt(amountPerExecution) * 10n; // Default 10 executions if unlimited

      await tokenInContract.increaseAllowance(RECURRING_ORDERS_ADDRESS(), toU256(totalAmount, decimals));

      // Call contract
      const args = new Args()
        .addString(tokenIn)
        .addString(tokenOut)
        .addU64(BigInt(triggerPercentage))
        .addU256(amountIn256)
        .addU256(minOut256)
        .addU64(BigInt(maxExecutions));

      const result = await callContract(RECURRING_ORDERS_ADDRESS(), 'createBuyOnIncreaseOrder', args.serialize());

      showSuccess('Buy on Increase order created successfully!');
      return result;
    } catch (error) {
      showError('Failed to create order: ' + error.message);
      console.error("Create Buy on Increase order error:", error);
      throw error;
    }
  },

  /**
   * Create DCA order
   */
  async createDCA(tokenIn, tokenOut, executionInterval, amountPerExecution, minAmountOut, maxExecutions, decimals = 8) {
    try {
      const provider = await getProvider();
      const tokenInContract = await getTokenByAddress(tokenIn);

      const amountIn256 = toU256(amountPerExecution, decimals);
      const minOut256 = toU256(minAmountOut, decimals);
      const totalAmount = BigInt(amountPerExecution) * BigInt(maxExecutions);

      await tokenInContract.increaseAllowance(RECURRING_ORDERS_ADDRESS(), toU256(totalAmount, decimals));

      const args = new Args()
        .addString(tokenIn)
        .addString(tokenOut)
        .addU64(BigInt(executionInterval))
        .addU256(amountIn256)
        .addU256(minOut256)
        .addU64(BigInt(maxExecutions));

      const result = await callContract(RECURRING_ORDERS_ADDRESS(), 'createDCAOrder', args.serialize());
      showSuccess('DCA order created successfully!');
      return result;
    } catch (error) {
      showError('Failed to create DCA order: ' + error.message);
      throw error;
    }
  },

  /**
   * Get order details
   */
  async getOrderDetails(orderId) {
    try {
      const args = new Args().addU64(BigInt(orderId));
      const result = await readContract(RECURRING_ORDERS_ADDRESS(), 'getOrderDetails', args.serialize());

      if (!result || result.length === 0) return null;

      const orderArgs = new Args(result);
      return {
        id: Number(orderArgs.nextU64().unwrap()),
        user: orderArgs.nextString().unwrap(),
        orderType: orderArgs.nextU8().unwrap(),
        executionMode: orderArgs.nextU8().unwrap(),
        status: orderArgs.nextU8().unwrap(),
        tokenIn: orderArgs.nextString().unwrap(),
        tokenOut: orderArgs.nextString().unwrap(),
        entryPrice: orderArgs.nextU256().unwrap(),
        triggerPercentage: Number(orderArgs.nextU64().unwrap()),
        maxExecutions: Number(orderArgs.nextU64().unwrap()),
        executionCount: Number(orderArgs.nextU64().unwrap()),
        amountPerExecution: orderArgs.nextU256().unwrap(),
        minAmountOut: orderArgs.nextU256().unwrap(),
        executionInterval: Number(orderArgs.nextU64().unwrap()),
        lastExecutedTime: Number(orderArgs.nextU64().unwrap()),
        createdTime: Number(orderArgs.nextU64().unwrap()),
        expiryTime: Number(orderArgs.nextU64().unwrap()),
      };
    } catch (error) {
      console.error("Get order details error:", error);
      return null;
    }
  },

  /**
   * Get user orders
   */
  async getUserOrders(userAddress) {
    try {
      const args = new Args().addString(userAddress);
      const result = await readContract(RECURRING_ORDERS_ADDRESS(), 'getUserOrders', args.serialize());
      const resultArgs = new Args(result);
      const count = Number(resultArgs.nextU64().unwrap());
      const orderIds = [];
      for (let i = 0; i < count; i++) {
        orderIds.push(Number(resultArgs.nextU64().unwrap()));
      }
      return orderIds;
    } catch (error) {
      console.error("Get user orders error:", error);
      return [];
    }
  },

  /**
   * Cancel order
   */
  async cancelOrder(orderId) {
    try {
      const args = new Args().addU64(BigInt(orderId));
      await callContract(RECURRING_ORDERS_ADDRESS(), 'cancelRecurringOrder', args.serialize());
      showSuccess('Order ' + orderId + ' cancelled successfully!');
      return true;
    } catch (error) {
      showError('Failed to cancel order: ' + error.message);
      throw error;
    }
  },

  /**
   * Pause order
   */
  async pauseOrder(orderId) {
    try {
      const args = new Args().addU64(BigInt(orderId));
      await callContract(RECURRING_ORDERS_ADDRESS(), 'pauseRecurringOrder', args.serialize());
      showSuccess('Order ' + orderId + ' paused successfully!');
      return true;
    } catch (error) {
      showError('Failed to pause order: ' + error.message);
      throw error;
    }
  },

  /**
   * Resume order
   */
  async resumeOrder(orderId) {
    try {
      const args = new Args().addU64(BigInt(orderId));
      await callContract(RECURRING_ORDERS_ADDRESS(), 'resumeRecurringOrder', args.serialize());
      showSuccess('Order ' + orderId + ' resumed successfully!');
      return true;
    } catch (error) {
      showError('Failed to resume order: ' + error.message);
      throw error;
    }
  },

  // ============================================================================
  // NEW READ FUNCTIONS - Analytics & Monitoring
  // ============================================================================

  /**
   * Get all recurring orders for a user
   *
   * @param {string} userAddress - User wallet address
   * @returns {Promise<number[]>} Array of order IDs
   */
  async getUserRecurringOrders(userAddress) {
    try {
      const args = new Args().addString(userAddress);
      const result = await readContract(RECURRING_ORDERS_ADDRESS(), 'getUserRecurringOrders', args.serialize());

      if (!result || result.length === 0) return [];

      const resultArgs = new Args(result);
      const count = Number(resultArgs.nextU64().unwrap());
      const orderIds = [];
      for (let i = 0; i < count; i++) {
        orderIds.push(Number(resultArgs.nextU64().unwrap()));
      }
      return orderIds;
    } catch (error) {
      console.error("Get user recurring orders error:", error);
      return [];
    }
  },

  /**
   * Get all active recurring orders
   *
   * @returns {Promise<number[]>} Array of active order IDs
   */
  async getActiveRecurringOrders() {
    try {
      const args = new Args();
      const result = await readContract(RECURRING_ORDERS_ADDRESS(), 'getActiveRecurringOrders', args.serialize());

      if (!result || result.length === 0) return [];

      const resultArgs = new Args(result);
      const count = Number(resultArgs.nextU64().unwrap());
      const orderIds = [];
      for (let i = 0; i < count; i++) {
        orderIds.push(Number(resultArgs.nextU64().unwrap()));
      }
      return orderIds;
    } catch (error) {
      console.error("Get active recurring orders error:", error);
      return [];
    }
  },

  /**
   * Get recurring orders by status
   *
   * @param {number} status - Order status (0=Active, 1=Completed, 2=Paused, 3=Cancelled)
   * @returns {Promise<number[]>} Array of order IDs with specified status
   */
  async getRecurringOrdersByStatus(status) {
    try {
      const args = new Args().addU8(status);
      const result = await readContract(RECURRING_ORDERS_ADDRESS(), 'getRecurringOrdersByStatus', args.serialize());

      if (!result || result.length === 0) return [];

      const resultArgs = new Args(result);
      const count = Number(resultArgs.nextU64().unwrap());
      const orderIds = [];
      for (let i = 0; i < count; i++) {
        orderIds.push(Number(resultArgs.nextU64().unwrap()));
      }
      return orderIds;
    } catch (error) {
      console.error("Get recurring orders by status error:", error);
      return [];
    }
  },

  /**
   * Get recurring orders by type
   *
   * @param {number} orderType - Order type (0=BuyOnIncrease, 1=SellOnDecrease, 2=Grid, 3=DCA)
   * @returns {Promise<number[]>} Array of order IDs with specified type
   */
  async getRecurringOrdersByType(orderType) {
    try {
      const args = new Args().addU8(orderType);
      const result = await readContract(RECURRING_ORDERS_ADDRESS(), 'getRecurringOrdersByType', args.serialize());

      if (!result || result.length === 0) return [];

      const resultArgs = new Args(result);
      const count = Number(resultArgs.nextU64().unwrap());
      const orderIds = [];
      for (let i = 0; i < count; i++) {
        orderIds.push(Number(resultArgs.nextU64().unwrap()));
      }
      return orderIds;
    } catch (error) {
      console.error("Get recurring orders by type error:", error);
      return [];
    }
  },

  /**
   * Check if recurring order is eligible for execution
   *
   * @param {number} orderId - Order ID
   * @returns {Promise<{eligible: boolean, reason: string}>} Eligibility status with reason
   */
  async isRecurringOrderEligible(orderId) {
    try {
      const args = new Args().addU64(BigInt(orderId));
      const result = await readContract(RECURRING_ORDERS_ADDRESS(), 'isRecurringOrderEligible', args.serialize());

      const resultArgs = new Args(result);
      const eligible = resultArgs.nextBool().unwrap();
      const reason = resultArgs.nextString().unwrap();

      return { eligible, reason };
    } catch (error) {
      console.error("Check recurring order eligibility error:", error);
      return { eligible: false, reason: 'Error checking eligibility' };
    }
  },

  /**
   * Get recurring order details (alias for getOrderDetails)
   *
   * @param {number} orderId - Order ID
   * @returns {Promise<Object|null>} Order details
   */
  async getRecurringOrderDetails(orderId) {
    return this.getOrderDetails(orderId);
  },

  /**
   * Get recurring orders expiring within a time window
   *
   * @param {number} timeWindow - Time window in seconds (e.g., 3600 = 1 hour)
   * @returns {Promise<number[]>} Array of order IDs expiring soon
   */
  async getExpiringOrders(timeWindow) {
    try {
      const args = new Args().addU64(BigInt(timeWindow));
      const result = await readContract(RECURRING_ORDERS_ADDRESS(), 'getExpiringOrders', args.serialize());

      if (!result || result.length === 0) return [];

      const resultArgs = new Args(result);
      const count = Number(resultArgs.nextU64().unwrap());
      const orderIds = [];
      for (let i = 0; i < count; i++) {
        orderIds.push(Number(resultArgs.nextU64().unwrap()));
      }
      return orderIds;
    } catch (error) {
      console.error("Get expiring orders error:", error);
      return [];
    }
  },

  /**
   * Get user performance summary
   *
   * @param {string} userAddress - User wallet address
   * @returns {Promise<Object>} User performance statistics
   */
  async getUserPerformanceSummary(userAddress) {
    try {
      const args = new Args().addString(userAddress);
      const result = await readContract(RECURRING_ORDERS_ADDRESS(), 'getUserPerformanceSummary', args.serialize());

      const resultArgs = new Args(result);
      return {
        totalOrders: Number(resultArgs.nextU64().unwrap()),
        activeOrders: Number(resultArgs.nextU64().unwrap()),
        totalExecutions: Number(resultArgs.nextU64().unwrap()),
        successRate: Number(resultArgs.nextU64().unwrap()), // In basis points
      };
    } catch (error) {
      console.error("Get user performance summary error:", error);
      return {
        totalOrders: 0,
        activeOrders: 0,
        totalExecutions: 0,
        successRate: 0,
      };
    }
  },

  /**
   * Get platform statistics
   *
   * @returns {Promise<Object>} Platform-wide statistics
   */
  async getPlatformStatistics() {
    try {
      const args = new Args();
      const result = await readContract(RECURRING_ORDERS_ADDRESS(), 'getPlatformStatistics', args.serialize());

      const resultArgs = new Args(result);
      return {
        totalOrders: Number(resultArgs.nextU64().unwrap()),
        activeOrders: Number(resultArgs.nextU64().unwrap()),
        completedOrders: Number(resultArgs.nextU64().unwrap()),
        pausedOrders: Number(resultArgs.nextU64().unwrap()),
        cancelledOrders: Number(resultArgs.nextU64().unwrap()),
        totalExecutions: Number(resultArgs.nextU64().unwrap()),
        botEnabled: resultArgs.nextBool().unwrap(),
      };
    } catch (error) {
      console.error("Get platform statistics error:", error);
      return {
        totalOrders: 0,
        activeOrders: 0,
        completedOrders: 0,
        pausedOrders: 0,
        cancelledOrders: 0,
        totalExecutions: 0,
        botEnabled: false,
      };
    }
  },
};

export default RecurringOrdersContract;
