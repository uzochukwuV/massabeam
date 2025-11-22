/**
 * Limit Orders Contract Wrapper
 *
 * Complete interface for interacting with the limit_orders_autonomous.ts contract
 *
 * Features:
 * - Create limit orders with price targets
 * - Autonomous bot execution
 * - Order management (cancel)
 * - Partial fill support
 * - MEV protection with execution delays
 * - Comprehensive analytics and monitoring
 */

import { Args, bytesToStr } from "@massalabs/massa-web3";
import { getProvider, toU256, showSuccess, showError, callContract, readContract, DEPLOYED_CONTRACTS } from "./main.js";
import { getTokenByAddress } from "./token-service.js";

// ============================================================================
// CONSTANTS
// ============================================================================

// Order Status (must match contract)
export const ORDER_STATUS = {
  ACTIVE: 0,
  FILLED: 1,
  CANCELLED: 2,
  EXPIRED: 3,
};

export const ORDER_STATUS_NAMES = {
  0: 'Active',
  1: 'Filled',
  2: 'Cancelled',
  3: 'Expired',
};

export const ORDER_STATUS_COLORS = {
  0: 'success',   // Active - green
  1: 'info',      // Filled - blue
  2: 'error',     // Cancelled - red
  3: 'warning',   // Expired - yellow
};

// Contract address
const LIMIT_ORDERS_ADDRESS = () => {
  const addr = DEPLOYED_CONTRACTS.LIMIT_ORDERS;
  if (!addr) {
    throw new Error('Limit Orders contract not deployed. Please deploy limit_orders_autonomous.ts first.');
  }
  return addr;
};

// ============================================================================
// LIMIT ORDERS CONTRACT
// ============================================================================

export const LimitOrdersContract = {
  /**
   * Create a new limit order
   *
   * @param {string} tokenIn - Token to sell
   * @param {string} tokenOut - Token to buy
   * @param {string|number} amountIn - Amount to sell
   * @param {string|number} minAmountOut - Minimum output (slippage protection)
   * @param {string|number} limitPrice - Target price (u256 format)
   * @param {number} expiryTime - Unix timestamp when order expires
   * @param {number} maxSlippage - Slippage tolerance in basis points (100 = 1%)
   * @param {boolean} partialFill - Allow partial fills
   * @param {number} decimals - Token decimals (default: 8)
   * @returns {Promise<number>} Order ID
   */
  async createOrder(tokenIn, tokenOut, amountIn, minAmountOut, limitPrice, expiryTime, maxSlippage = 100, partialFill = false, decimals = 8) {
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

      const provider = await getProvider();
      const tokenInContract = await getTokenByAddress(tokenIn);

      // Convert amounts to u256
      const amountIn256 = toU256(amountIn, decimals);
      const minOut256 = toU256(minAmountOut, decimals);
      const limitPrice256 = toU256(limitPrice, 18); // Prices are 18 decimals

      // Approve tokens
      await tokenInContract.increaseAllowance(LIMIT_ORDERS_ADDRESS(), amountIn256);

      // Call contract
      const args = new Args()
        .addString(tokenIn)
        .addString(tokenOut)
        .addU256(amountIn256)
        .addU256(minOut256)
        .addU256(limitPrice256)
        .addU64(BigInt(expiryTime))
        .addU64(BigInt(maxSlippage))
        .addBool(partialFill);

      const result = await callContract(LIMIT_ORDERS_ADDRESS(), 'createLimitOrder', args.serialize());

      showSuccess('Limit order created successfully!');
      return result;
    } catch (error) {
      showError('Failed to create limit order: ' + error.message);
      console.error("Create limit order error:", error);
      throw error;
    }
  },

  /**
   * Cancel an active order
   *
   * @param {number} orderId - Order ID to cancel
   * @returns {Promise<boolean>} Success
   */
  async cancelOrder(orderId) {
    try {
      const args = new Args().addU64(BigInt(orderId));
      await callContract(LIMIT_ORDERS_ADDRESS(), 'cancelOrder', args.serialize());
      showSuccess('Order ' + orderId + ' cancelled successfully!');
      return true;
    } catch (error) {
      showError('Failed to cancel order: ' + error.message);
      throw error;
    }
  },

  /**
   * Execute a limit order (bot/keeper function)
   *
   * @param {number} orderId - Order ID to execute
   * @param {string|number} currentPrice - Current market price
   * @returns {Promise<boolean>} Success
   */
  async executeOrder(orderId, currentPrice) {
    try {
      const args = new Args()
        .addU64(BigInt(orderId))
        .addU256(toU256(currentPrice, 18));

      await callContract(LIMIT_ORDERS_ADDRESS(), 'executeLimitOrder', args.serialize());
      showSuccess('Order ' + orderId + ' executed successfully!');
      return true;
    } catch (error) {
      showError('Failed to execute order: ' + error.message);
      throw error;
    }
  },

  // ============================================================================
  // NEW READ FUNCTIONS - Analytics & Monitoring
  // ============================================================================

  /**
   * Get all orders for a user
   *
   * @param {string} userAddress - User wallet address
   * @returns {Promise<number[]>} Array of order IDs
   */
  async getUserOrders(userAddress) {
    try {
      const args = new Args().addString(userAddress);
      const result = await readContract(LIMIT_ORDERS_ADDRESS(), 'getUserOrders', args.serialize());

      if (!result || result.length === 0) return [];

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
   * Check if order is eligible for execution
   *
   * @param {number} orderId - Order ID
   * @returns {Promise<{eligible: boolean, reason: string}>} Eligibility status with reason
   */
  async isOrderEligible(orderId) {
    try {
      const args = new Args().addU64(BigInt(orderId));
      const result = await readContract(LIMIT_ORDERS_ADDRESS(), 'isOrderEligible', args.serialize());

      const resultArgs = new Args(result);
      const eligible = resultArgs.nextBool().unwrap();
      const reason = resultArgs.nextString().unwrap();

      return { eligible, reason };
    } catch (error) {
      console.error("Check order eligibility error:", error);
      return { eligible: false, reason: 'Error checking eligibility' };
    }
  },

  /**
   * Get all active orders
   *
   * @returns {Promise<number[]>} Array of active order IDs
   */
  async getActiveOrders() {
    try {
      const args = new Args();
      const result = await readContract(LIMIT_ORDERS_ADDRESS(), 'getActiveOrders', args.serialize());

      if (!result || result.length === 0) return [];

      const resultArgs = new Args(result);
      const count = Number(resultArgs.nextU64().unwrap());
      const orderIds = [];
      for (let i = 0; i < count; i++) {
        orderIds.push(Number(resultArgs.nextU64().unwrap()));
      }
      return orderIds;
    } catch (error) {
      console.error("Get active orders error:", error);
      return [];
    }
  },

  /**
   * Get orders by status
   *
   * @param {number} status - Order status (0=Active, 1=Filled, 2=Cancelled, 3=Expired)
   * @returns {Promise<number[]>} Array of order IDs with specified status
   */
  async getOrdersByStatus(status) {
    try {
      const args = new Args().addU8(status);
      const result = await readContract(LIMIT_ORDERS_ADDRESS(), 'getOrdersByStatus', args.serialize());

      if (!result || result.length === 0) return [];

      const resultArgs = new Args(result);
      const count = Number(resultArgs.nextU64().unwrap());
      const orderIds = [];
      for (let i = 0; i < count; i++) {
        orderIds.push(Number(resultArgs.nextU64().unwrap()));
      }
      return orderIds;
    } catch (error) {
      console.error("Get orders by status error:", error);
      return [];
    }
  },

  /**
   * Get orders expiring within a time window
   *
   * @param {number} timeWindow - Time window in seconds (e.g., 3600 = 1 hour)
   * @returns {Promise<number[]>} Array of order IDs expiring soon
   */
  async getExpiringLimitOrders(timeWindow) {
    try {
      const args = new Args().addU64(BigInt(timeWindow));
      const result = await readContract(LIMIT_ORDERS_ADDRESS(), 'getExpiringLimitOrders', args.serialize());

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
   * Get user performance metrics
   *
   * @param {string} userAddress - User wallet address
   * @returns {Promise<Object>} User performance statistics
   */
  async getUserPerformance(userAddress) {
    try {
      const args = new Args().addString(userAddress);
      const result = await readContract(LIMIT_ORDERS_ADDRESS(), 'getUserPerformance', args.serialize());

      const resultArgs = new Args(result);
      return {
        totalOrders: Number(resultArgs.nextU64().unwrap()),
        activeOrders: Number(resultArgs.nextU64().unwrap()),
        filledOrders: Number(resultArgs.nextU64().unwrap()),
        cancelledOrders: Number(resultArgs.nextU64().unwrap()),
        expiredOrders: Number(resultArgs.nextU64().unwrap()),
        fillRate: Number(resultArgs.nextU64().unwrap()), // In basis points
      };
    } catch (error) {
      console.error("Get user performance error:", error);
      return {
        totalOrders: 0,
        activeOrders: 0,
        filledOrders: 0,
        cancelledOrders: 0,
        expiredOrders: 0,
        fillRate: 0,
      };
    }
  },

  /**
   * Get platform-wide statistics
   *
   * @returns {Promise<Object>} Platform statistics
   */
  async getPlatformStatistics() {
    try {
      const args = new Args();
      const result = await readContract(LIMIT_ORDERS_ADDRESS(), 'getPlatformStatistics', args.serialize());

      const resultArgs = new Args(result);
      return {
        totalOrders: Number(resultArgs.nextU64().unwrap()),
        activeOrders: Number(resultArgs.nextU64().unwrap()),
        filledOrders: Number(resultArgs.nextU64().unwrap()),
        cancelledOrders: Number(resultArgs.nextU64().unwrap()),
        expiredOrders: Number(resultArgs.nextU64().unwrap()),
        botEnabled: resultArgs.nextBool().unwrap(),
        botExecutionCounter: Number(resultArgs.nextU64().unwrap()),
        totalBotExecuted: Number(resultArgs.nextU64().unwrap()),
      };
    } catch (error) {
      console.error("Get platform statistics error:", error);
      return {
        totalOrders: 0,
        activeOrders: 0,
        filledOrders: 0,
        cancelledOrders: 0,
        expiredOrders: 0,
        botEnabled: false,
        botExecutionCounter: 0,
        totalBotExecuted: 0,
      };
    }
  },

  /**
   * Get orders within a price range
   *
   * @param {string|number} minPrice - Minimum limit price (u256)
   * @param {string|number} maxPrice - Maximum limit price (u256)
   * @returns {Promise<number[]>} Array of order IDs in price range
   */
  async getOrdersByPriceRange(minPrice, maxPrice) {
    try {
      const args = new Args()
        .addU256(toU256(minPrice, 18))
        .addU256(toU256(maxPrice, 18));
      const result = await readContract(LIMIT_ORDERS_ADDRESS(), 'getOrdersByPriceRange', args.serialize());

      if (!result || result.length === 0) return [];

      const resultArgs = new Args(result);
      const count = Number(resultArgs.nextU64().unwrap());
      const orderIds = [];
      for (let i = 0; i < count; i++) {
        orderIds.push(Number(resultArgs.nextU64().unwrap()));
      }
      return orderIds;
    } catch (error) {
      console.error("Get orders by price range error:", error);
      return [];
    }
  },

  /**
   * Get orders for a specific token pair
   *
   * @param {string} tokenIn - Input token address
   * @param {string} tokenOut - Output token address
   * @returns {Promise<number[]>} Array of order IDs for token pair
   */
  async getOrdersByTokenPair(tokenIn, tokenOut) {
    try {
      const args = new Args()
        .addString(tokenIn)
        .addString(tokenOut);
      const result = await readContract(LIMIT_ORDERS_ADDRESS(), 'getOrdersByTokenPair', args.serialize());

      if (!result || result.length === 0) return [];

      const resultArgs = new Args(result);
      const count = Number(resultArgs.nextU64().unwrap());
      const orderIds = [];
      for (let i = 0; i < count; i++) {
        orderIds.push(Number(resultArgs.nextU64().unwrap()));
      }
      return orderIds;
    } catch (error) {
      console.error("Get orders by token pair error:", error);
      return [];
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
      const result = await readContract(LIMIT_ORDERS_ADDRESS(), 'getOrderDetails', args.serialize());

      if (!result || result.length === 0) return null;

      const orderArgs = new Args(result);
      return {
        id: Number(orderArgs.nextU64().unwrap()),
        user: orderArgs.nextString().unwrap(),
        tokenIn: orderArgs.nextString().unwrap(),
        tokenOut: orderArgs.nextString().unwrap(),
        amountIn: orderArgs.nextU256().unwrap(),
        minAmountOut: orderArgs.nextU256().unwrap(),
        limitPrice: orderArgs.nextU256().unwrap(),
        expiryTime: Number(orderArgs.nextU64().unwrap()),
        createdTime: Number(orderArgs.nextU64().unwrap()),
        status: orderArgs.nextU8().unwrap(),
        executedAmount: orderArgs.nextU256().unwrap(),
        remainingAmount: orderArgs.nextU256().unwrap(),
        maxSlippage: Number(orderArgs.nextU64().unwrap()),
        partialFillAllowed: orderArgs.nextBool().unwrap(),
      };
    } catch (error) {
      console.error("Get order details error:", error);
      return null;
    }
  },

  /**
   * Get total order count
   *
   * @returns {Promise<number>} Total number of orders
   */
  async getOrderCount() {
    try {
      const args = new Args();
      const result = await readContract(LIMIT_ORDERS_ADDRESS(), 'getOrderCount', args.serialize());
      const count = Number(bytesToStr(result));
      return count;
    } catch (error) {
      console.error("Get order count error:", error);
      return 0;
    }
  },
};

export default LimitOrdersContract;
