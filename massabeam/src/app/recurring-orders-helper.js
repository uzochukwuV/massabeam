/**
 * Recurring Orders Smart Contract Helper
 *
 * Frontend wrapper for recurring_orders_focused.ts contract
 * Handles DCA and trigger-based recurring order execution
 *
 * Features:
 * - Interval-based execution (DCA - Dollar Cost Averaging)
 * - Trigger-based execution (price changes)
 * - Pause/Resume/Cancel orders
 * - Autonomous bot management
 * - Full analytics and monitoring
 */

import { Args } from "@massalabs/massa-web3";
import { getProvider, toU256, showSuccess, showError, callContract, readContract, DEPLOYED_CONTRACTS } from "./main.js";
import { getTokenByAddress } from "./token-service.js";

// ============================================================================
// CONSTANTS
// ============================================================================

// Execution Modes
export const EXECUTION_MODE = {
  INTERVAL: 0,  // Time-based (DCA)
  TRIGGER: 1,   // Price-based
};

export const EXECUTION_MODE_NAMES = {
  0: 'Interval (DCA)',
  1: 'Trigger-Based',
};

// Order Types
export const ORDER_TYPE = {
  RECURRING_BUY: 0,
  RECURRING_SELL: 1,
};

export const ORDER_TYPE_NAMES = {
  0: 'Recurring Buy',
  1: 'Recurring Sell',
};

// Order Status
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

// Contract address
const RECURRING_ORDERS_ADDRESS = () => {
  const addr = DEPLOYED_CONTRACTS.RECURRING_ORDERS;
  if (!addr) {
    throw new Error('Recurring Orders contract not deployed. Please deploy recurring_orders_focused.ts first.');
  }
  return addr;
};

// ============================================================================
// RECURRING ORDERS CONTRACT HELPER
// ============================================================================

export const RecurringOrdersHelper = {
  /**
   * Create an interval-based (DCA) recurring order
   *
   * Example: Buy 100 USDC worth of ETH every week for 1 year
   *
   * @param {string} tokenIn - Token to spend
   * @param {string} tokenOut - Token to receive
   * @param {number} amountPerExecution - Amount per execution
   * @param {number} minAmountOut - Minimum output (slippage)
   * @param {number} executionInterval - Seconds between executions (e.g., 604800 = 1 week)
   * @param {number} maxExecutions - Max times to execute
   * @param {number} duration - How long order lasts (seconds)
   * @param {number} decimals - Token decimals (default: 18)
   * @returns {Promise<Object>} Transaction result
   */
  async createDCAOrder(
    tokenIn,
    tokenOut,
    amountPerExecution,
    minAmountOut,
    executionInterval,
    maxExecutions,
    duration,
    decimals = 18
  ) {
    try {
      console.log('Creating DCA order:', {
        tokenIn,
        tokenOut,
        amountPerExecution,
        minAmountOut,
        executionInterval,
        maxExecutions,
        duration,
      });

      const tokenInContract = await getTokenByAddress(tokenIn);

      // Convert amounts to u256
      const amount256 = toU256(amountPerExecution, decimals);
      const minOut256 = toU256(minAmountOut, decimals);

      // Calculate total approval amount
      const totalAmount = BigInt(amountPerExecution) * BigInt(maxExecutions);

      // Approve tokens
      await tokenInContract.increaseAllowance(
        RECURRING_ORDERS_ADDRESS(),
        toU256(totalAmount, decimals)
      );

      // Call contract
      const args = new Args()
        .addString(tokenIn)
        .addString(tokenOut)
        .addU256(amount256)
        .addU256(minOut256)
        .addU8(ORDER_TYPE.RECURRING_BUY)
        .addU8(EXECUTION_MODE.INTERVAL)
        .addU64(BigInt(executionInterval))
        .addU64(BigInt(0)) // triggerPercentage (not used for INTERVAL)
        .addU64(BigInt(maxExecutions))
        .addU64(BigInt(duration));

      const result = await callContract(
        RECURRING_ORDERS_ADDRESS(),
        'createRecurringOrder',
        args.serialize()
      );

      showSuccess('DCA order created successfully!');
      return result;
    } catch (error) {
      showError('Failed to create DCA order: ' + error.message);
      console.error('Create DCA order error:', error);
      throw error;
    }
  },

  /**
   * Create a trigger-based recurring order
   *
   * Example: Buy ETH whenever price drops 5% from current level
   *
   * @param {string} tokenIn - Token to spend
   * @param {string} tokenOut - Token to receive
   * @param {number} amountPerExecution - Amount per execution
   * @param {number} minAmountOut - Minimum output (slippage)
   * @param {number} triggerPercentage - Price change % to trigger (basis points: 500 = 5%)
   * @param {number} maxExecutions - Max times to execute
   * @param {number} duration - How long order lasts (seconds)
   * @param {number} orderType - 0=BUY, 1=SELL
   * @param {number} decimals - Token decimals (default: 18)
   * @returns {Promise<Object>} Transaction result
   */
  async createTriggerOrder(
    tokenIn,
    tokenOut,
    amountPerExecution,
    minAmountOut,
    triggerPercentage,
    maxExecutions,
    duration,
    orderType = ORDER_TYPE.RECURRING_BUY,
    decimals = 18
  ) {
    try {
      console.log('Creating trigger-based order:', {
        tokenIn,
        tokenOut,
        amountPerExecution,
        minAmountOut,
        triggerPercentage,
        maxExecutions,
        duration,
        orderType,
      });

      const tokenInContract = await getTokenByAddress(tokenIn);

      // Convert amounts
      const amount256 = toU256(amountPerExecution, decimals);
      const minOut256 = toU256(minAmountOut, decimals);

      // Calculate total approval
      const totalAmount = BigInt(amountPerExecution) * BigInt(maxExecutions);

      // Approve tokens
      await tokenInContract.increaseAllowance(
        RECURRING_ORDERS_ADDRESS(),
        toU256(totalAmount, decimals)
      );

      // Call contract
      const args = new Args()
        .addString(tokenIn)
        .addString(tokenOut)
        .addU256(amount256)
        .addU256(minOut256)
        .addU8(orderType)
        .addU8(EXECUTION_MODE.TRIGGER)
        .addU64(BigInt(0)) // executionInterval (not used for TRIGGER)
        .addU64(BigInt(triggerPercentage))
        .addU64(BigInt(maxExecutions))
        .addU64(BigInt(duration));

      const result = await callContract(
        RECURRING_ORDERS_ADDRESS(),
        'createRecurringOrder',
        args.serialize()
      );

      showSuccess('Trigger-based order created successfully!');
      return result;
    } catch (error) {
      showError('Failed to create trigger order: ' + error.message);
      console.error('Create trigger order error:', error);
      throw error;
    }
  },

  /**
   * Get recurring order details
   *
   * @param {number} orderId - Order ID
   * @returns {Promise<Object>} Order details
   */
  async getOrderDetails(orderId) {
    try {
      const args = new Args().addU64(BigInt(orderId));
      const result = await readContract(
        RECURRING_ORDERS_ADDRESS(),
        'readRecurringOrder',
        args.serialize()
      );

      if (!result || result.length === 0) return null;

      const orderArgs = new Args(result);
      return {
        id: Number(orderArgs.nextU64().unwrap()),
        user: orderArgs.nextString().unwrap(),
        orderType: Number(orderArgs.nextU8().unwrap()),
        executionMode: Number(orderArgs.nextU8().unwrap()),
        status: Number(orderArgs.nextU8().unwrap()),
        tokenIn: orderArgs.nextString().unwrap(),
        tokenOut: orderArgs.nextString().unwrap(),
        amountPerExecution: orderArgs.nextU256().unwrap().toString(),
        minAmountOut: orderArgs.nextU256().unwrap().toString(),
        executionInterval: Number(orderArgs.nextU64().unwrap()),
        triggerPercentage: Number(orderArgs.nextU64().unwrap()),
        maxExecutions: Number(orderArgs.nextU64().unwrap()),
        executionCount: Number(orderArgs.nextU64().unwrap()),
        createdAt: Number(orderArgs.nextU64().unwrap()),
        lastExecutedTime: Number(orderArgs.nextU64().unwrap()),
        expiryAt: Number(orderArgs.nextU64().unwrap()),
        entryPrice: orderArgs.nextU256().unwrap().toString(),
        referencePrice: orderArgs.nextU256().unwrap().toString(),
      };
    } catch (error) {
      console.error('Get order details error:', error);
      return null;
    }
  },

  /**
   * Pause a recurring order
   *
   * @param {number} orderId - Order ID to pause
   * @returns {Promise<boolean>} Success status
   */
  async pauseOrder(orderId) {
    try {
      const args = new Args().addU64(BigInt(orderId));
      await callContract(RECURRING_ORDERS_ADDRESS(), 'pauseOrder', args.serialize());
      showSuccess(`Order ${orderId} paused successfully!`);
      return true;
    } catch (error) {
      showError('Failed to pause order: ' + error.message);
      console.error('Pause order error:', error);
      throw error;
    }
  },

  /**
   * Resume a paused recurring order
   *
   * @param {number} orderId - Order ID to resume
   * @returns {Promise<boolean>} Success status
   */
  async resumeOrder(orderId) {
    try {
      const args = new Args().addU64(BigInt(orderId));
      await callContract(RECURRING_ORDERS_ADDRESS(), 'resumeOrder', args.serialize());
      showSuccess(`Order ${orderId} resumed successfully!`);
      return true;
    } catch (error) {
      showError('Failed to resume order: ' + error.message);
      console.error('Resume order error:', error);
      throw error;
    }
  },

  /**
   * Cancel a recurring order and refund remaining amount
   *
   * @param {number} orderId - Order ID to cancel
   * @returns {Promise<boolean>} Success status
   */
  async cancelOrder(orderId) {
    try {
      const args = new Args().addU64(BigInt(orderId));
      await callContract(RECURRING_ORDERS_ADDRESS(), 'cancelOrder', args.serialize());
      showSuccess(`Order ${orderId} cancelled and refunded!`);
      return true;
    } catch (error) {
      showError('Failed to cancel order: ' + error.message);
      console.error('Cancel order error:', error);
      throw error;
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
      const result = await readContract(
        RECURRING_ORDERS_ADDRESS(),
        'getActiveOrders',
        args.serialize()
      );

      if (!result || result.length === 0) return [];

      const resultArgs = new Args(result);
      const count = Number(resultArgs.nextU64().unwrap());
      const orderIds = [];
      for (let i = 0; i < count; i++) {
        orderIds.push(Number(resultArgs.nextU64().unwrap()));
      }
      return orderIds;
    } catch (error) {
      console.error('Get active orders error:', error);
      return [];
    }
  },

  /**
   * Get orders by status
   *
   * @param {number} status - Order status (0=ACTIVE, 1=COMPLETED, 2=PAUSED, 3=CANCELLED)
   * @returns {Promise<number[]>} Array of order IDs
   */
  async getOrdersByStatus(status) {
    try {
      const args = new Args().addU8(status);
      const result = await readContract(
        RECURRING_ORDERS_ADDRESS(),
        'getOrdersByStatus',
        args.serialize()
      );

      if (!result || result.length === 0) return [];

      const resultArgs = new Args(result);
      const count = Number(resultArgs.nextU64().unwrap());
      const orderIds = [];
      for (let i = 0; i < count; i++) {
        orderIds.push(Number(resultArgs.nextU64().unwrap()));
      }
      return orderIds;
    } catch (error) {
      console.error('Get orders by status error:', error);
      return [];
    }
  },

  /**
   * Get orders by type
   *
   * @param {number} orderType - 0=BUY, 1=SELL
   * @returns {Promise<number[]>} Array of order IDs
   */
  async getOrdersByType(orderType) {
    try {
      const args = new Args().addU8(orderType);
      const result = await readContract(
        RECURRING_ORDERS_ADDRESS(),
        'getOrdersByType',
        args.serialize()
      );

      if (!result || result.length === 0) return [];

      const resultArgs = new Args(result);
      const count = Number(resultArgs.nextU64().unwrap());
      const orderIds = [];
      for (let i = 0; i < count; i++) {
        orderIds.push(Number(resultArgs.nextU64().unwrap()));
      }
      return orderIds;
    } catch (error) {
      console.error('Get orders by type error:', error);
      return [];
    }
  },

  /**
   * Get orders by execution mode
   *
   * @param {number} mode - 0=INTERVAL, 1=TRIGGER
   * @returns {Promise<number[]>} Array of order IDs
   */
  async getOrdersByMode(mode) {
    try {
      const args = new Args().addU8(mode);
      const result = await readContract(
        RECURRING_ORDERS_ADDRESS(),
        'getOrdersByMode',
        args.serialize()
      );

      if (!result || result.length === 0) return [];

      const resultArgs = new Args(result);
      const count = Number(resultArgs.nextU64().unwrap());
      const orderIds = [];
      for (let i = 0; i < count; i++) {
        orderIds.push(Number(resultArgs.nextU64().unwrap()));
      }
      return orderIds;
    } catch (error) {
      console.error('Get orders by mode error:', error);
      return [];
    }
  },

  /**
   * Get orders expiring within time window
   *
   * @param {number} timeWindow - Seconds until expiry
   * @returns {Promise<number[]>} Array of expiring order IDs
   */
  async getExpiringOrders(timeWindow) {
    try {
      const args = new Args().addU64(BigInt(timeWindow));
      const result = await readContract(
        RECURRING_ORDERS_ADDRESS(),
        'getExpiringOrders',
        args.serialize()
      );

      if (!result || result.length === 0) return [];

      const resultArgs = new Args(result);
      const count = Number(resultArgs.nextU64().unwrap());
      const orderIds = [];
      for (let i = 0; i < count; i++) {
        orderIds.push(Number(resultArgs.nextU64().unwrap()));
      }
      return orderIds;
    } catch (error) {
      console.error('Get expiring orders error:', error);
      return [];
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
      const result = await readContract(
        RECURRING_ORDERS_ADDRESS(),
        'getPlatformStatistics',
        args.serialize()
      );

      const resultArgs = new Args(result);
      return {
        totalOrders: Number(resultArgs.nextU64().unwrap()),
        activeOrders: Number(resultArgs.nextU64().unwrap()),
        completedOrders: Number(resultArgs.nextU64().unwrap()),
        pausedOrders: Number(resultArgs.nextU64().unwrap()),
        cancelledOrders: Number(resultArgs.nextU64().unwrap()),
        totalExecutions: Number(resultArgs.nextU64().unwrap()),
        botEnabled: resultArgs.nextBool().unwrap(),
        botCycleCounter: Number(resultArgs.nextU64().unwrap()),
        botTotalExecuted: Number(resultArgs.nextU64().unwrap()),
      };
    } catch (error) {
      console.error('Get platform statistics error:', error);
      return {
        totalOrders: 0,
        activeOrders: 0,
        completedOrders: 0,
        pausedOrders: 0,
        cancelledOrders: 0,
        totalExecutions: 0,
        botEnabled: false,
        botCycleCounter: 0,
        botTotalExecuted: 0,
      };
    }
  },

  /**
   * Start autonomous bot
   *
   * @param {number} maxIterations - Maximum bot cycles to run
   * @returns {Promise<Object>} Transaction result
   */
  async startBot(maxIterations = 1000) {
    try {
      const args = new Args().addU64(BigInt(maxIterations));
      const result = await callContract(
        RECURRING_ORDERS_ADDRESS(),
        'startBot',
        args.serialize()
      );

      showSuccess('Bot started successfully!');
      return result;
    } catch (error) {
      showError('Failed to start bot: ' + error.message);
      console.error('Start bot error:', error);
      throw error;
    }
  },

  /**
   * Stop autonomous bot
   *
   * @returns {Promise<Object>} Transaction result
   */
  async stopBot() {
    try {
      const args = new Args();
      const result = await callContract(
        RECURRING_ORDERS_ADDRESS(),
        'stopBot',
        args.serialize()
      );

      showSuccess('Bot stopped successfully!');
      return result;
    } catch (error) {
      showError('Failed to stop bot: ' + error.message);
      console.error('Stop bot error:', error);
      throw error;
    }
  },

  /**
   * Get bot status
   *
   * @returns {Promise<Object>} Bot status
   */
  async getBotStatus() {
    try {
      const args = new Args();
      const result = await readContract(
        RECURRING_ORDERS_ADDRESS(),
        'readBotStatus',
        args.serialize()
      );

      const resultArgs = new Args(result);
      return {
        enabled: resultArgs.nextBool().unwrap(),
        cycleCounter: Number(resultArgs.nextU64().unwrap()),
        maxIterations: Number(resultArgs.nextU64().unwrap()),
        totalExecuted: Number(resultArgs.nextU64().unwrap()),
      };
    } catch (error) {
      console.error('Get bot status error:', error);
      return {
        enabled: false,
        cycleCounter: 0,
        maxIterations: 0,
        totalExecuted: 0,
      };
    }
  },
};

export default RecurringOrdersHelper;
