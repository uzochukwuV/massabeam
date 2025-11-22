/**
 * Grid Orders Smart Contract Helper
 *
 * Frontend wrapper for grid_orders_autonomous.ts contract
 * Handles multi-level grid trading with autonomous bot execution
 *
 * Features:
 * - Multi-level grid orders (1-100 levels)
 * - Per-level execution tracking
 * - Buy and sell grid support
 * - Autonomous bot management
 * - Full analytics and monitoring
 */

import { Args } from "@massalabs/massa-web3";
import { getProvider, toU256, showSuccess, showError, callContract, readContract, DEPLOYED_CONTRACTS } from "./main.js";
import { getTokenByAddress } from "./token-service.js";

// ============================================================================
// CONSTANTS
// ============================================================================

// Order Types
export const GRID_ORDER_TYPE = {
  BUY_GRID: 0,   // Grid below entry price
  SELL_GRID: 1,  // Grid above entry price
};

export const GRID_ORDER_TYPE_NAMES = {
  0: 'Buy Grid',
  1: 'Sell Grid',
};

// Order Status
export const GRID_ORDER_STATUS = {
  ACTIVE: 0,
  COMPLETED: 1,
  CANCELLED: 2,
};

export const GRID_ORDER_STATUS_NAMES = {
  0: 'Active',
  1: 'Completed',
  2: 'Cancelled',
};

export const GRID_ORDER_STATUS_COLORS = {
  0: 'success',   // Active - green
  1: 'info',      // Completed - blue
  2: 'error',     // Cancelled - red
};

// Contract address
const GRID_ORDERS_ADDRESS = () => {
  const addr = DEPLOYED_CONTRACTS.GRID_ORDERS;
  if (!addr) {
    throw new Error('Grid Orders contract not deployed. Please deploy grid_orders_autonomous.ts first.');
  }
  return addr;
};

// ============================================================================
// GRID ORDERS CONTRACT HELPER
// ============================================================================

export const GridOrdersHelper = {
  /**
   * Create a multi-level grid order
   *
   * Example: Create a 3-level buy grid at 2000 USDC with levels at -5%, -10%, -15%
   *
   * @param {string} tokenIn - Token to spend
   * @param {string} tokenOut - Token to receive
   * @param {number} entryPrice - Entry price as u256
   * @param {number[]} gridLevelsBasisPoints - Price levels as basis points (500 = 5% difference)
   * @param {number[]} gridAmounts - Amount to trade at each level
   * @param {number} duration - How long order lasts (seconds)
   * @param {number} orderType - 0=BUY_GRID, 1=SELL_GRID
   * @param {number} decimals - Token decimals (default: 18)
   * @returns {Promise<Object>} Transaction result
   */
  async createGridOrder(
    tokenIn,
    tokenOut,
    entryPrice,
    gridLevelsBasisPoints,
    gridAmounts,
    duration,
    orderType = GRID_ORDER_TYPE.BUY_GRID,
    decimals = 18
  ) {
    try {
      if (!gridLevelsBasisPoints || gridLevelsBasisPoints.length === 0) {
        throw new Error('Grid levels cannot be empty');
      }

      if (gridLevelsBasisPoints.length !== gridAmounts.length) {
        throw new Error('Grid levels and amounts must have the same length');
      }

      if (gridLevelsBasisPoints.length > 100) {
        throw new Error('Maximum 100 grid levels allowed');
      }

      console.log('Creating grid order:', {
        tokenIn,
        tokenOut,
        entryPrice: entryPrice.toString(),
        gridLevels: gridLevelsBasisPoints,
        gridAmounts,
        duration,
        orderType,
      });

      const tokenInContract = await getTokenByAddress(tokenIn);

      // Convert amounts and entry price
      const entryPrice256 = toU256(entryPrice, decimals);
      const amounts256 = gridAmounts.map(amount => toU256(amount, decimals));

      // Calculate total approval amount (sum of all grid amounts)
      const totalAmount = gridAmounts.reduce((sum, amount) => sum + BigInt(amount), BigInt(0));

      // Approve tokens
      await tokenInContract.increaseAllowance(
        GRID_ORDERS_ADDRESS(),
        toU256(totalAmount, decimals)
      );

      // Build args
      const args = new Args()
        .addString(tokenIn)
        .addString(tokenOut)
        .addU256(entryPrice256)
        .addU64(BigInt(duration))
        .addU8(orderType);

      // Add grid levels (as u64 basis points)
      args.addU8(gridLevelsBasisPoints.length); // number of levels
      for (const level of gridLevelsBasisPoints) {
        args.addU64(BigInt(level));
      }

      // Add grid amounts (as u256)
      args.addU8(gridAmounts.length); // number of amounts
      for (const amount of amounts256) {
        args.addU256(amount);
      }

      const result = await callContract(
        GRID_ORDERS_ADDRESS(),
        'createGridOrder',
        args.serialize()
      );

      showSuccess('Grid order created successfully!');
      return result;
    } catch (error) {
      showError('Failed to create grid order: ' + error.message);
      console.error('Create grid order error:', error);
      throw error;
    }
  },

  /**
   * Get grid order details including execution status
   *
   * @param {number} orderId - Order ID
   * @returns {Promise<Object>} Order details with grid levels and execution status
   */
  async getOrderDetails(orderId) {
    try {
      const args = new Args().addU64(BigInt(orderId));
      const result = await readContract(
        GRID_ORDERS_ADDRESS(),
        'readGridOrder',
        args.serialize()
      );

      if (!result || result.length === 0) return null;

      const orderArgs = new Args(result);

      // Read basic order info
      const orderData = {
        id: Number(orderArgs.nextU64().unwrap()),
        user: orderArgs.nextString().unwrap(),
        orderType: Number(orderArgs.nextU8().unwrap()),
        status: Number(orderArgs.nextU8().unwrap()),
        tokenIn: orderArgs.nextString().unwrap(),
        tokenOut: orderArgs.nextString().unwrap(),
        entryPrice: orderArgs.nextU256().unwrap().toString(),
        createdAt: Number(orderArgs.nextU64().unwrap()),
        expiryAt: Number(orderArgs.nextU64().unwrap()),
        gridLevels: [],
        gridAmounts: [],
        gridExecuted: [],
      };

      // Read grid levels
      const levelCount = Number(orderArgs.nextU8().unwrap());
      for (let i = 0; i < levelCount; i++) {
        orderData.gridLevels.push(Number(orderArgs.nextU64().unwrap()));
      }

      // Read grid amounts
      const amountCount = Number(orderArgs.nextU8().unwrap());
      for (let i = 0; i < amountCount; i++) {
        orderData.gridAmounts.push(orderArgs.nextU256().unwrap().toString());
      }

      // Read execution status for each level
      const executedCount = Number(orderArgs.nextU8().unwrap());
      for (let i = 0; i < executedCount; i++) {
        orderData.gridExecuted.push(orderArgs.nextBool().unwrap());
      }

      return orderData;
    } catch (error) {
      console.error('Get order details error:', error);
      return null;
    }
  },

  /**
   * Get execution status for a specific grid level
   *
   * @param {number} orderId - Order ID
   * @param {number} levelIndex - Grid level index (0-based)
   * @returns {Promise<Object>} Level execution details
   */
  async getGridLevelStatus(orderId, levelIndex) {
    try {
      const orderDetails = await this.getOrderDetails(orderId);
      if (!orderDetails) {
        throw new Error(`Order ${orderId} not found`);
      }

      if (levelIndex >= orderDetails.gridLevels.length) {
        throw new Error(`Level index ${levelIndex} out of bounds`);
      }

      return {
        orderId,
        levelIndex,
        basisPoints: orderDetails.gridLevels[levelIndex],
        amount: orderDetails.gridAmounts[levelIndex],
        executed: orderDetails.gridExecuted[levelIndex],
      };
    } catch (error) {
      console.error('Get grid level status error:', error);
      return null;
    }
  },

  /**
   * Cancel a grid order and refund remaining amounts
   *
   * @param {number} orderId - Order ID to cancel
   * @returns {Promise<boolean>} Success status
   */
  async cancelOrder(orderId) {
    try {
      const args = new Args().addU64(BigInt(orderId));
      await callContract(GRID_ORDERS_ADDRESS(), 'cancelGridOrder', args.serialize());
      showSuccess(`Grid order ${orderId} cancelled and refunded!`);
      return true;
    } catch (error) {
      showError('Failed to cancel grid order: ' + error.message);
      console.error('Cancel grid order error:', error);
      throw error;
    }
  },

  /**
   * Get all active grid orders
   *
   * @returns {Promise<number[]>} Array of active order IDs
   */
  async getActiveOrders() {
    try {
      const args = new Args();
      const result = await readContract(
        GRID_ORDERS_ADDRESS(),
        'getActiveGridOrders',
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
   * Get grid orders by status
   *
   * @param {number} status - Order status (0=ACTIVE, 1=COMPLETED, 2=CANCELLED)
   * @returns {Promise<number[]>} Array of order IDs
   */
  async getOrdersByStatus(status) {
    try {
      const args = new Args().addU8(status);
      const result = await readContract(
        GRID_ORDERS_ADDRESS(),
        'getGridOrdersByStatus',
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
   * Get grid orders by type
   *
   * @param {number} orderType - 0=BUY_GRID, 1=SELL_GRID
   * @returns {Promise<number[]>} Array of order IDs
   */
  async getOrdersByType(orderType) {
    try {
      const args = new Args().addU8(orderType);
      const result = await readContract(
        GRID_ORDERS_ADDRESS(),
        'getGridOrdersByType',
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
   * Get grid orders expiring within time window
   *
   * @param {number} timeWindow - Seconds until expiry
   * @returns {Promise<number[]>} Array of expiring order IDs
   */
  async getExpiringOrders(timeWindow) {
    try {
      const args = new Args().addU64(BigInt(timeWindow));
      const result = await readContract(
        GRID_ORDERS_ADDRESS(),
        'getExpiringGridOrders',
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
   * Get platform-wide grid trading statistics
   *
   * @returns {Promise<Object>} Platform statistics
   */
  async getPlatformStatistics() {
    try {
      const args = new Args();
      const result = await readContract(
        GRID_ORDERS_ADDRESS(),
        'getGridPlatformStatistics',
        args.serialize()
      );

      const resultArgs = new Args(result);
      return {
        totalOrders: Number(resultArgs.nextU64().unwrap()),
        activeOrders: Number(resultArgs.nextU64().unwrap()),
        completedOrders: Number(resultArgs.nextU64().unwrap()),
        cancelledOrders: Number(resultArgs.nextU64().unwrap()),
        totalLevels: Number(resultArgs.nextU64().unwrap()),
        totalExecuted: Number(resultArgs.nextU64().unwrap()),
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
        cancelledOrders: 0,
        totalLevels: 0,
        totalExecuted: 0,
        botEnabled: false,
        botCycleCounter: 0,
        botTotalExecuted: 0,
      };
    }
  },

  /**
   * Start autonomous grid trading bot
   *
   * @param {number} maxIterations - Maximum bot cycles to run
   * @returns {Promise<Object>} Transaction result
   */
  async startBot(maxIterations = 1000) {
    try {
      const args = new Args().addU64(BigInt(maxIterations));
      const result = await callContract(
        GRID_ORDERS_ADDRESS(),
        'startGridBot',
        args.serialize()
      );

      showSuccess('Grid bot started successfully!');
      return result;
    } catch (error) {
      showError('Failed to start grid bot: ' + error.message);
      console.error('Start grid bot error:', error);
      throw error;
    }
  },

  /**
   * Stop autonomous grid trading bot
   *
   * @returns {Promise<Object>} Transaction result
   */
  async stopBot() {
    try {
      const args = new Args();
      const result = await callContract(
        GRID_ORDERS_ADDRESS(),
        'stopGridBot',
        args.serialize()
      );

      showSuccess('Grid bot stopped successfully!');
      return result;
    } catch (error) {
      showError('Failed to stop grid bot: ' + error.message);
      console.error('Stop grid bot error:', error);
      throw error;
    }
  },

  /**
   * Get grid bot status
   *
   * @returns {Promise<Object>} Bot status and statistics
   */
  async getBotStatus() {
    try {
      const args = new Args();
      const result = await readContract(
        GRID_ORDERS_ADDRESS(),
        'readGridBotStatus',
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
      console.error('Get grid bot status error:', error);
      return {
        enabled: false,
        cycleCounter: 0,
        maxIterations: 0,
        totalExecuted: 0,
      };
    }
  },

  /**
   * Helper: Calculate price at grid level
   * Useful for UI preview before creating order
   *
   * @param {number} entryPrice - Entry price
   * @param {number} basisPoints - Level basis points (500 = 5%)
   * @param {boolean} isBuyGrid - True for buy grid, false for sell grid
   * @returns {number} Calculated price at level
   */
  calculateLevelPrice(entryPrice, basisPoints, isBuyGrid = true) {
    const entryBig = BigInt(Math.floor(entryPrice * 1e18));
    const basisBig = BigInt(basisPoints);
    const divisorBig = BigInt(10000);

    if (isBuyGrid) {
      // Buy grid: price decreases
      const multiplier = divisorBig - basisBig;
      return Number((entryBig * multiplier) / divisorBig) / 1e18;
    } else {
      // Sell grid: price increases
      const multiplier = divisorBig + basisBig;
      return Number((entryBig * multiplier) / divisorBig) / 1e18;
    }
  },

  /**
   * Helper: Generate symmetric grid levels
   * Creates equal percentage intervals above/below entry price
   *
   * @param {number} numLevels - Number of levels
   * @param {number} percentageSpacing - Percentage between levels (e.g., 5 for 5%)
   * @returns {number[]} Array of basis points for grid levels
   */
  generateSymmetricGrid(numLevels, percentageSpacing) {
    const basisPoints = percentageSpacing * 100;
    const levels = [];
    for (let i = 1; i <= numLevels; i++) {
      levels.push(basisPoints * i);
    }
    return levels;
  },

  /**
   * Helper: Generate exponential grid levels
   * Creates increasing percentage intervals (useful for larger grids)
   *
   * @param {number} numLevels - Number of levels
   * @param {number} basePercentage - Base percentage for first level (e.g., 1 for 1%)
   * @param {number} multiplier - Multiplication factor for each level (e.g., 1.5)
   * @returns {number[]} Array of basis points for grid levels
   */
  generateExponentialGrid(numLevels, basePercentage, multiplier = 1.5) {
    const levels = [];
    let current = basePercentage * 100;
    for (let i = 0; i < numLevels; i++) {
      levels.push(Math.floor(current));
      current *= multiplier;
    }
    return levels;
  },
};

export default GridOrdersHelper;
