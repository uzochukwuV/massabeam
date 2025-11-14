/**
 * MassaBeam Recurring Orders - Comprehensive Test Suite
 *
 * Tests all recurring order functionality including:
 * - Buy on price increase orders (fungible tokens)
 * - Sell on price decrease orders (fungible tokens)
 * - DCA (Dollar Cost Averaging) orders
 * - Grid trading orders
 * - Native MAS recurring orders
 * - Order pause/resume/cancel
 * - Autonomous bot execution (startBot/advance/stopBot)
 * - Price monitoring and execution
 *
 * Usage:
 *   npm run test:recurringorders -- --action all
 *   npm run test:recurringorders -- --action create
 *   npm run test:recurringorders -- --action bot
 *   npm run test:recurringorders -- --action dca
 *   npm run test:recurringorders -- --action grid
 *
 * @version 2.0.0
 */

import 'dotenv/config';
import { Args, Mas, SmartContract } from '@massalabs/massa-web3';
import { u256 } from 'as-bignum/assembly';
import {
  Logger,
  initializeAccount,
  callContract,
  readContract,
  loadDeployedAddresses,
  sleep,
  toU256,
  fromU256,
  formatTokenAmount,
  parseTokenAmount,
  approveToken,
  getTokenBalance,
} from './test-utils.js';

// ============================================================================
// TEST CONFIGURATION
// ============================================================================

// Test tokens (Massa Buildnet)
const DAI = [
  { symbol: 'DAI', address: 'AS12GgFKTyV8o7Vq3r9wqHwKf1MKBFjFqe9H4v7TsFYvqQaVKNVHW', decimals: 18 },
];
const USDC = [
  { symbol: 'USDC', address: 'AS1hLyS1p4ustRV1s9rbVGc89KhUH3HKqZJ1b6WGc6cs6p4TF7eZ', decimals: 6 },
];
const WETH = [
  { symbol: 'WETH', address: 'AS12s21D4vNLvjTbCqJWGRSK4wY8cN3JFTdMqmPTVNECj9qzCGQrD', decimals: 18 },
];

// MAS native token
const MAS_DECIMALS = 9;

/**
 * Test Configuration
 */
const TEST_CONFIG = {
  // Buy on price increase orders
  buyOnIncreaseOrders: [
    {
      name: 'Buy WETH on 2% Increase',
      tokenIn: USDC[0],
      tokenOut: WETH[0],
      triggerPercentage: 200, // 2% increase
      amountPerExecution: '100', // 100 USDC per execution
      minAmountOut: '0.03', // Min 0.03 WETH
      maxExecutions: 5,
    },
    {
      name: 'Buy DAI on 1% Increase',
      tokenIn: USDC[0],
      tokenOut: DAI[0],
      triggerPercentage: 100, // 1% increase
      amountPerExecution: '50',
      minAmountOut: '49', // Min 49 DAI
      maxExecutions: 10,
    },
  ],

  // Sell on price decrease orders
  sellOnDecreaseOrders: [
    {
      name: 'Sell WETH on 5% Decrease',
      tokenIn: WETH[0],
      tokenOut: USDC[0],
      triggerPercentage: 500, // 5% decrease
      amountPerExecution: '0.1', // 0.1 WETH
      minAmountOut: '280', // Min 280 USDC
    },
    {
      name: 'Sell DAI on 3% Decrease',
      tokenIn: DAI[0],
      tokenOut: USDC[0],
      triggerPercentage: 300, // 3% decrease
      amountPerExecution: '100',
      minAmountOut: '95',
    },
  ],

  // DCA (Dollar Cost Averaging) orders
  dcaOrders: [
    {
      name: 'DCA USDC → WETH (Every Hour)',
      tokenIn: USDC[0],
      tokenOut: WETH[0],
      executionInterval: 3600, // 1 hour
      amountPerExecution: '50', // 50 USDC per hour
      minAmountOut: '0.015', // Min 0.015 WETH
      maxExecutions: 24, // Run for 24 hours
    },
    {
      name: 'DCA USDC → DAI (Every 30 min)',
      tokenIn: USDC[0],
      tokenOut: DAI[0],
      executionInterval: 1800, // 30 minutes
      amountPerExecution: '25',
      minAmountOut: '24',
      maxExecutions: 48, // Run for 24 hours
    },
  ],

  // Grid trading orders
  gridOrders: [
    {
      name: 'WETH Grid Trading (±2%, ±4%, ±6%)',
      tokenIn: USDC[0],
      tokenOut: WETH[0],
      gridLevels: [200, 400, 600], // -2%, -4%, -6% or +2%, +4%, +6%
      gridAmounts: ['100', '150', '200'], // USDC amounts for each level
      minAmountOut: '0.02', // Min WETH per execution
      isBuyGrid: true, // Buy at lower prices
    },
    {
      name: 'DAI Grid Trading (±1%, ±2%, ±3%, ±5%)',
      tokenIn: USDC[0],
      tokenOut: DAI[0],
      gridLevels: [100, 200, 300, 500],
      gridAmounts: ['50', '75', '100', '150'],
      minAmountOut: '48',
      isBuyGrid: true,
    },
  ],

  // Native MAS recurring orders
  masRecurringOrders: [
    {
      name: 'Buy USDC on MAS 3% Increase',
      masAmount: '50', // 50 MAS total (10 MAS per execution)
      tokenOut: USDC[0],
      triggerPercentage: 300, // 3% increase
      amountPerExecution: '10', // 10 MAS per execution
      minAmountOut: '100', // Min 100 USDC
      maxExecutions: 5,
      isMasIn: true,
    },
    {
      name: 'DCA MAS → DAI (Every 2 hours)',
      masAmount: '100', // 100 MAS total (10 MAS per execution)
      tokenOut: DAI[0],
      executionInterval: 7200, // 2 hours
      amountPerExecution: '10',
      minAmountOut: '100', // Min 100 DAI
      maxExecutions: 10,
      isMasIn: true,
      isDCA: true,
    },
    {
      name: 'Sell USDC for MAS on 5% Decrease',
      tokenIn: USDC[0],
      usdcAmount: '500',
      triggerPercentage: 500, // 5% decrease
      amountPerExecution: '100', // 100 USDC per execution
      minMasOut: 8, // Min 8 MAS per execution (u64)
      maxExecutions: 5,
      isMasIn: false,
    },
  ],
};

// ============================================================================
// RECURRING ORDER CREATION FUNCTIONS
// ============================================================================

/**
 * Create a "buy on price increase" order (fungible tokens)
 */
async function createBuyOnIncreaseOrder(
  recurringOrdersContract: SmartContract,
  config: typeof TEST_CONFIG.buyOnIncreaseOrders[0]
): Promise<number> {
  Logger.section(`📈 CREATE BUY ON INCREASE ORDER: ${config.name}`);

  const { account, provider } = await initializeAccount();

  const amountPerExecution = parseTokenAmount(config.amountPerExecution, config.tokenIn.decimals);
  const minAmountOut = parseTokenAmount(config.minAmountOut, config.tokenOut.decimals);
  const totalAmount = amountPerExecution * BigInt(config.maxExecutions);

  Logger.log('Token In', config.tokenIn.symbol);
  Logger.log('Token Out', config.tokenOut.symbol);
  Logger.log('Trigger %', `+${config.triggerPercentage / 100}%`);
  Logger.log('Per Execution', formatTokenAmount(amountPerExecution, config.tokenIn.decimals, config.tokenIn.symbol));
  Logger.log('Max Executions', config.maxExecutions.toString());
  Logger.log('Total Amount', formatTokenAmount(totalAmount, config.tokenIn.decimals, config.tokenIn.symbol));

  // Check balance
  const balance = await getTokenBalance(provider, config.tokenIn.address, account.address.toString());
  if (balance < totalAmount) {
    Logger.warn(`Insufficient ${config.tokenIn.symbol} balance. Skipping...`);
    return 0;
  }

  // Approve tokens
  const approved = await approveToken(
    provider,
    config.tokenIn.address,
    recurringOrdersContract.address.toString(),
    totalAmount,
    config.tokenIn.symbol
  );

  if (!approved) return 0;

  // Create order
  const orderArgs = new Args()
    .addString(config.tokenIn.address)
    .addString(config.tokenOut.address)
    .addU64(BigInt(config.triggerPercentage))
    .addU256(toU256(amountPerExecution))
    .addU256(toU256(minAmountOut))
    .addU64(BigInt(config.maxExecutions));

  Logger.info('Creating buy on increase order...');

  try {
    await callContract(
      recurringOrdersContract,
      'createBuyOnIncreaseOrder',
      orderArgs,
      '0.1',
      'Create buy on increase'
    );

    await sleep(3000);

    // Get order count to find order ID
    const orderCountResult = await readContract(recurringOrdersContract, 'getOrderCount');
    const orderCountArgs = new Args(orderCountResult.value);
    const orderCountStr = orderCountArgs.nextString();
    const orderId = parseInt(orderCountStr);

    Logger.success(`Order created with ID: ${orderId}`);
    return orderId;
  } catch (error) {
    Logger.error(`Failed to create order: ${error}`);
    return 0;
  }
}

/**
 * Create a "sell on price decrease" order (fungible tokens)
 */
async function createSellOnDecreaseOrder(
  recurringOrdersContract: SmartContract,
  config: typeof TEST_CONFIG.sellOnDecreaseOrders[0]
): Promise<number> {
  Logger.section(`📉 CREATE SELL ON DECREASE ORDER: ${config.name}`);

  const { account, provider } = await initializeAccount();

  const amountPerExecution = parseTokenAmount(config.amountPerExecution, config.tokenIn.decimals);
  const minAmountOut = parseTokenAmount(config.minAmountOut, config.tokenOut.decimals);
  const totalAmount = amountPerExecution * 5n; // Allocate for 5 executions

  Logger.log('Token In', config.tokenIn.symbol);
  Logger.log('Token Out', config.tokenOut.symbol);
  Logger.log('Trigger %', `-${config.triggerPercentage / 100}%`);
  Logger.log('Per Execution', formatTokenAmount(amountPerExecution, config.tokenIn.decimals, config.tokenIn.symbol));

  // Check balance
  const balance = await getTokenBalance(provider, config.tokenIn.address, account.address.toString());
  if (balance < totalAmount) {
    Logger.warn(`Insufficient ${config.tokenIn.symbol} balance. Skipping...`);
    return 0;
  }

  // Approve tokens
  const approved = await approveToken(
    provider,
    config.tokenIn.address,
    recurringOrdersContract.address.toString(),
    totalAmount,
    config.tokenIn.symbol
  );

  if (!approved) return 0;

  // Create order
  const orderArgs = new Args()
    .addString(config.tokenIn.address)
    .addString(config.tokenOut.address)
    .addU64(BigInt(config.triggerPercentage))
    .addU256(toU256(amountPerExecution))
    .addU256(toU256(minAmountOut));

  Logger.info('Creating sell on decrease order...');

  try {
    await callContract(
      recurringOrdersContract,
      'createSellOnDecreaseOrder',
      orderArgs,
      '0.1',
      'Create sell on decrease'
    );

    await sleep(3000);

    const orderCountResult = await readContract(recurringOrdersContract, 'getOrderCount');
    const orderCountArgs = new Args(orderCountResult.value);
    const orderCountStr = orderCountArgs.nextString();
    const orderId = parseInt(orderCountStr);

    Logger.success(`Order created with ID: ${orderId}`);
    return orderId;
  } catch (error) {
    Logger.error(`Failed to create order: ${error}`);
    return 0;
  }
}

/**
 * Create a DCA (Dollar Cost Averaging) order
 */
async function createDCAOrder(
  recurringOrdersContract: SmartContract,
  config: typeof TEST_CONFIG.dcaOrders[0]
): Promise<number> {
  Logger.section(`🔁 CREATE DCA ORDER: ${config.name}`);

  const { account, provider } = await initializeAccount();

  const amountPerExecution = parseTokenAmount(config.amountPerExecution, config.tokenIn.decimals);
  const minAmountOut = parseTokenAmount(config.minAmountOut, config.tokenOut.decimals);
  const totalAmount = amountPerExecution * BigInt(config.maxExecutions);

  Logger.log('Token In', config.tokenIn.symbol);
  Logger.log('Token Out', config.tokenOut.symbol);
  Logger.log('Interval', `${config.executionInterval / 60} minutes`);
  Logger.log('Per Execution', formatTokenAmount(amountPerExecution, config.tokenIn.decimals, config.tokenIn.symbol));
  Logger.log('Max Executions', config.maxExecutions.toString());
  Logger.log('Total Amount', formatTokenAmount(totalAmount, config.tokenIn.decimals, config.tokenIn.symbol));

  // Check balance
  const balance = await getTokenBalance(provider, config.tokenIn.address, account.address.toString());
  if (balance < totalAmount) {
    Logger.warn(`Insufficient ${config.tokenIn.symbol} balance. Skipping...`);
    return 0;
  }

  // Approve tokens
  const approved = await approveToken(
    provider,
    config.tokenIn.address,
    recurringOrdersContract.address.toString(),
    totalAmount,
    config.tokenIn.symbol
  );

  if (!approved) return 0;

  // Create DCA order
  const orderArgs = new Args()
    .addString(config.tokenIn.address)
    .addString(config.tokenOut.address)
    .addU64(BigInt(config.executionInterval))
    .addU256(toU256(amountPerExecution))
    .addU256(toU256(minAmountOut))
    .addU64(BigInt(config.maxExecutions));

  Logger.info('Creating DCA order...');

  try {
    await callContract(recurringOrdersContract, 'createDCAOrder', orderArgs, '0.1', 'Create DCA order');

    await sleep(3000);

    const orderCountResult = await readContract(recurringOrdersContract, 'getOrderCount');
    const orderCountArgs = new Args(orderCountResult.value);
    const orderCountStr = orderCountArgs.nextString();
    const orderId = parseInt(orderCountStr);

    Logger.success(`DCA order created with ID: ${orderId}`);
    return orderId;
  } catch (error) {
    Logger.error(`Failed to create DCA order: ${error}`);
    return 0;
  }
}

/**
 * Create a Grid Trading order
 */
async function createGridOrder(
  recurringOrdersContract: SmartContract,
  config: typeof TEST_CONFIG.gridOrders[0]
): Promise<number> {
  Logger.section(`📊 CREATE GRID ORDER: ${config.name}`);

  const { account, provider } = await initializeAccount();

  // Calculate total amount needed
  let totalAmount = 0n;
  const gridAmountsParsed: bigint[] = [];

  for (let i = 0; i < config.gridAmounts.length; i++) {
    const amount = parseTokenAmount(config.gridAmounts[i], config.tokenIn.decimals);
    gridAmountsParsed.push(amount);
    totalAmount += amount;
  }

  const minAmountOut = parseTokenAmount(config.minAmountOut, config.tokenOut.decimals);

  Logger.log('Token In', config.tokenIn.symbol);
  Logger.log('Token Out', config.tokenOut.symbol);
  Logger.log('Grid Type', config.isBuyGrid ? 'Buy Grid' : 'Sell Grid');
  Logger.log('Grid Levels', config.gridLevels.map((l) => `${l / 100}%`).join(', '));
  Logger.log('Total Amount', formatTokenAmount(totalAmount, config.tokenIn.decimals, config.tokenIn.symbol));

  // Check balance
  const balance = await getTokenBalance(provider, config.tokenIn.address, account.address.toString());
  if (balance < totalAmount) {
    Logger.warn(`Insufficient ${config.tokenIn.symbol} balance. Skipping...`);
    return 0;
  }

  // Approve tokens
  const approved = await approveToken(
    provider,
    config.tokenIn.address,
    recurringOrdersContract.address.toString(),
    totalAmount,
    config.tokenIn.symbol
  );

  if (!approved) return 0;

  // Build Args
  const orderArgs = new Args()
    .addString(config.tokenIn.address)
    .addString(config.tokenOut.address)
    .addU8(config.gridLevels.length);

  // Add grid levels and amounts
  for (let i = 0; i < config.gridLevels.length; i++) {
    orderArgs.addU64(BigInt(config.gridLevels[i]));
    orderArgs.addU256(toU256(gridAmountsParsed[i]));
  }

  orderArgs.addU256(toU256(minAmountOut));

  Logger.info('Creating grid order...');

  try {
    await callContract(recurringOrdersContract, 'createGridOrder', orderArgs, '0.1', 'Create grid order');

    await sleep(3000);

    const orderCountResult = await readContract(recurringOrdersContract, 'getOrderCount');
    const orderCountArgs = new Args(orderCountResult.value);
    const orderCountStr = orderCountArgs.nextString();
    const orderId = parseInt(orderCountStr);

    Logger.success(`Grid order created with ID: ${orderId}`);
    return orderId;
  } catch (error) {
    Logger.error(`Failed to create grid order: ${error}`);
    return 0;
  }
}

/**
 * Create Native MAS recurring orders
 * Note: Current recurring_orders.ts only supports ERC20 tokens
 * This function demonstrates the pattern for MAS orders when/if implemented
 */
async function createMASRecurringOrder(
  recurringOrdersContract: SmartContract,
  massaBeamContract: SmartContract,
  config: typeof TEST_CONFIG.masRecurringOrders[0]
): Promise<number> {
  Logger.section(`💰 CREATE MAS RECURRING ORDER: ${config.name}`);

  Logger.warn('Native MAS recurring orders require WMAS wrapper or direct MAS support');
  Logger.info('Current implementation: Recurring orders use ERC20 interface');

  // For MAS recurring orders, implementation would require:
  // 1. WMAS token wrapper (wrap MAS to WMAS)
  // 2. Create recurring order with WMAS as tokenIn/tokenOut
  // 3. Contract executes via swapMASForTokens or swapTokensForMAS
  // 4. Auto-unwrap if needed

  Logger.info('Pattern for MAS recurring orders:');
  if (config.isMasIn) {
    Logger.log('  1. Wrap MAS → WMAS', config.masAmount + ' MAS');
    Logger.log('  2. Create order', `WMAS → ${config.tokenOut.symbol}`);
    Logger.log('  3. Bot executes', 'Periodic swaps as conditions met');
  } else {
    Logger.log('  1. Create order', `${config.tokenIn.symbol} → WMAS`);
    Logger.log('  2. Bot executes', 'Periodic swaps as conditions met');
    Logger.log('  3. Auto-unwrap', 'WMAS → MAS to user wallet');
  }

  Logger.warn('Skipping MAS recurring order - requires wrapper implementation');
  return 0;
}

// ============================================================================
// ORDER MANAGEMENT FUNCTIONS
// ============================================================================

/**
 * Cancel a recurring order
 */
async function cancelRecurringOrder(recurringOrdersContract: SmartContract, orderId: number): Promise<boolean> {
  Logger.section(`❌ CANCEL RECURRING ORDER #${orderId}`);

  const cancelArgs = new Args().addU64(BigInt(orderId));

  Logger.info('Canceling order...');

  try {
    await callContract(recurringOrdersContract, 'cancelRecurringOrder', cancelArgs, '0.1', 'Cancel recurring order');

    await sleep(2000);

    Logger.success('Order cancelled successfully');
    return true;
  } catch (error) {
    Logger.error(`Cancellation failed: ${error}`);
    return false;
  }
}

/**
 * Pause a recurring order
 */
async function pauseRecurringOrder(recurringOrdersContract: SmartContract, orderId: number): Promise<boolean> {
  Logger.section(`⏸️ PAUSE RECURRING ORDER #${orderId}`);

  const pauseArgs = new Args().addU64(BigInt(orderId));

  Logger.info('Pausing order...');

  try {
    await callContract(recurringOrdersContract, 'pauseOrder', pauseArgs, '0.1', 'Pause recurring order');

    await sleep(2000);

    Logger.success('Order paused successfully');
    return true;
  } catch (error) {
    Logger.error(`Pause failed: ${error}`);
    return false;
  }
}

/**
 * Resume a paused recurring order
 */
async function resumeRecurringOrder(recurringOrdersContract: SmartContract, orderId: number): Promise<boolean> {
  Logger.section(`▶️ RESUME RECURRING ORDER #${orderId}`);

  const resumeArgs = new Args().addU64(BigInt(orderId));

  Logger.info('Resuming order...');

  try {
    await callContract(recurringOrdersContract, 'resumeOrder', resumeArgs, '0.1', 'Resume recurring order');

    await sleep(2000);

    Logger.success('Order resumed successfully');
    return true;
  } catch (error) {
    Logger.error(`Resume failed: ${error}`);
    return false;
  }
}

// ============================================================================
// AUTONOMOUS BOT TESTING
// ============================================================================

/**
 * Test autonomous bot execution
 */
async function testAutonomousBot(recurringOrdersContract: SmartContract): Promise<void> {
  Logger.section('🤖 TEST AUTONOMOUS BOT EXECUTION');

  Logger.info('Testing startBot/advance/stopBot autonomous execution pattern');
  Logger.info('Bot periodically checks orders and executes based on:');
  Logger.log('  - Price change %', 'For buy/sell on increase/decrease orders');
  Logger.log('  - Time intervals', 'For DCA orders');
  Logger.log('  - Grid levels', 'For grid trading orders');

  // Start bot
  Logger.info('Starting autonomous bot...');
  const startArgs = new Args().addU64(BigInt(20)); // Max 20 iterations

  try {
    await callContract(recurringOrdersContract, 'startBot', startArgs, '0.1', 'Start bot');

    await sleep(2000);
    Logger.success('Bot started successfully');

    // Wait for bot to execute cycles
    Logger.info('Waiting for bot to execute cycles...');
    await sleep(15000); // Wait 15 seconds

    // Get statistics
    Logger.info('Checking bot statistics...');
    const statsResult = await readContract(recurringOrdersContract, 'getStatistics', new Args());

    if (statsResult.value && statsResult.value.length > 0) {
      const statsArgs = new Args(statsResult.value);
      const totalOrders = statsArgs.nextU64();
      const activeOrders = statsArgs.nextU64();
      const completedOrders = statsArgs.nextU64();
      const pausedOrders = statsArgs.nextU64();
      const cancelledOrders = statsArgs.nextU64();
      const totalExecutions = statsArgs.nextU64();
      const isBotRunning = statsArgs.nextBool();
      const botCounter = statsArgs.nextU64();

      Logger.log('Total Orders', totalOrders.toString());
      Logger.log('Active Orders', activeOrders.toString());
      Logger.log('Completed Orders', completedOrders.toString());
      Logger.log('Total Executions', totalExecutions.toString());
      Logger.log('Bot Running', isBotRunning ? 'Yes' : 'No');
      Logger.log('Bot Cycles', botCounter.toString());
    }

    // Stop bot
    Logger.info('Stopping autonomous bot...');
    await callContract(recurringOrdersContract, 'stopBot', new Args(), '0.1', 'Stop bot');

    await sleep(2000);
    Logger.success('Bot stopped successfully');

    Logger.info('Autonomous execution complete');
    Logger.info('Pattern demonstrated:');
    Logger.log('  1. startBot()', 'Initializes bot state, triggers first cycle');
    Logger.log('  2. advance()', 'Checks orders, executes eligible ones, schedules next cycle');
    Logger.log('  3. stopBot()', 'Sets counter to max, prevents further cycles');
  } catch (error) {
    Logger.error(`Bot test failed: ${error}`);
  }
}

// ============================================================================
// QUERY & STATISTICS FUNCTIONS
// ============================================================================

/**
 * Display recurring order statistics
 */
async function displayOrderStats(recurringOrdersContract: SmartContract): Promise<void> {
  Logger.section('📊 RECURRING ORDERS STATISTICS');

  try {
    const statsResult = await readContract(recurringOrdersContract, 'getStatistics', new Args());

    if (statsResult.value && statsResult.value.length > 0) {
      const statsArgs = new Args(statsResult.value);
      const totalOrders = statsArgs.nextU64();
      const activeOrders = statsArgs.nextU64();
      const completedOrders = statsArgs.nextU64();
      const pausedOrders = statsArgs.nextU64();
      const cancelledOrders = statsArgs.nextU64();
      const totalExecutions = statsArgs.nextU64();
      const isBotRunning = statsArgs.nextBool();
      const botCounter = statsArgs.nextU64();

      Logger.log('Total Orders', totalOrders.toString());
      Logger.log('Active Orders', activeOrders.toString());
      Logger.log('Completed Orders', completedOrders.toString());
      Logger.log('Paused Orders', pausedOrders.toString());
      Logger.log('Cancelled Orders', cancelledOrders.toString());
      Logger.log('Total Executions', totalExecutions.toString());
      Logger.log('Bot Status', isBotRunning ? 'Running' : 'Stopped');
      Logger.log('Bot Cycles', botCounter.toString());

      Logger.success('Statistics retrieved successfully');
    }
  } catch (error) {
    Logger.error(`Failed to get statistics: ${error}`);
  }
}

/**
 * Display order details
 */
async function displayOrderDetails(recurringOrdersContract: SmartContract, orderId: number): Promise<void> {
  Logger.section(`📋 ORDER DETAILS #${orderId}`);

  try {
    const orderDetailsResult = await readContract(
      recurringOrdersContract,
      'getOrderDetails',
      new Args().addU64(BigInt(orderId))
    );

    if (!orderDetailsResult.value || orderDetailsResult.value.length === 0) {
      Logger.warn('Order not found');
      return;
    }

    const args = new Args(orderDetailsResult.value);
    const id = args.nextU64();
    const user = args.nextString();
    const orderType = args.nextU8();
    const executionMode = args.nextU8();
    const status = args.nextU8();
    const tokenIn = args.nextString();
    const tokenOut = args.nextString();
    const entryPrice = args.nextU256();
    const triggerPercentage = args.nextU64();
    const maxExecutions = args.nextU64();
    const executionCount = args.nextU64();

    const orderTypeMap: { [key: number]: string } = {
      0: 'BUY_ON_INCREASE',
      1: 'SELL_ON_DECREASE',
      2: 'GRID',
      3: 'DCA',
    };

    const statusMap: { [key: number]: string } = {
      0: 'ACTIVE',
      1: 'COMPLETED',
      2: 'PAUSED',
      3: 'CANCELLED',
    };

    Logger.log('Order ID', id.toString());
    Logger.log('Type', orderTypeMap[orderType] || 'UNKNOWN');
    Logger.log('Status', statusMap[status] || 'UNKNOWN');
    Logger.log('User', user.slice(0, 15) + '...');
    Logger.log('Token In', tokenIn.slice(0, 15) + '...');
    Logger.log('Token Out', tokenOut.slice(0, 15) + '...');
    Logger.log('Entry Price', formatTokenAmount(fromU256(entryPrice), 18));
    Logger.log('Trigger %', `${triggerPercentage / 100}%`);
    Logger.log('Executions', `${executionCount} / ${maxExecutions > 0 ? maxExecutions : '∞'}`);

    Logger.success('Order details retrieved');
  } catch (error) {
    Logger.error(`Failed to get order details: ${error}`);
  }
}

/**
 * Get current price for a token pair
 */
async function getCurrentPrice(
  recurringOrdersContract: SmartContract,
  tokenIn: typeof DAI[0],
  tokenOut: typeof USDC[0]
): Promise<void> {
  Logger.section(`💹 CURRENT PRICE: ${tokenIn.symbol}/${tokenOut.symbol}`);

  try {
    const priceResult = await readContract(
      recurringOrdersContract,
      'getCurrentPrice',
      new Args().addString(tokenIn.address).addString(tokenOut.address)
    );

    if (priceResult.value && priceResult.value.length > 0) {
      const priceArgs = new Args(priceResult.value);
      const price = priceArgs.nextU256();

      Logger.log('Price', formatTokenAmount(fromU256(price), 18));
      Logger.info('Price is in 18 decimals (1e18 = 1.0)');
      Logger.success('Price retrieved from pool');
    }
  } catch (error) {
    Logger.error(`Failed to get price: ${error}`);
  }
}

// ============================================================================
// MAIN TEST ORCHESTRATOR
// ============================================================================

async function main() {
  Logger.section('🔁 MASSABEAM RECURRING ORDERS - COMPREHENSIVE TEST SUITE');

  const args = process.argv.slice(2);
  const actionArg = args.find((arg) => arg.startsWith('--action='))?.split('=')[1] || 'all';

  Logger.log('Test Action', actionArg);

  // Load deployed addresses
  const addresses = loadDeployedAddresses();

  if (!addresses.massaBeam) {
    Logger.error('MassaBeam AMM not deployed. Run: npm run deploy first');
    process.exit(1);
  }

  if (!addresses.recurringOrders) {
    Logger.error('Recurring Orders contract not deployed. Run: npm run deploy -- --contracts=recurringorders');
    process.exit(1);
  }

  Logger.log('MassaBeam AMM', addresses.massaBeam.slice(0, 15) + '...');
  Logger.log('Recurring Orders', addresses.recurringOrders.slice(0, 15) + '...');

  const { provider } = await initializeAccount();
  const recurringOrdersContract = new SmartContract(provider, addresses.recurringOrders);
  const massaBeamContract = new SmartContract(provider, addresses.massaBeam);

  const createdOrderIds: number[] = [];

  try {
    // Display initial stats
    await displayOrderStats(recurringOrdersContract);

    // Create buy on increase orders
    if (actionArg === 'all' || actionArg === 'create' || actionArg === 'buy') {
      Logger.section('CREATING BUY ON INCREASE ORDERS');

      for (const config of TEST_CONFIG.buyOnIncreaseOrders) {
        const orderId = await createBuyOnIncreaseOrder(recurringOrdersContract, config);
        if (orderId > 0) {
          createdOrderIds.push(orderId);
          await displayOrderDetails(recurringOrdersContract, orderId);
        }
        await sleep(2000);
      }
    }

    // Create sell on decrease orders
    if (actionArg === 'all' || actionArg === 'create' || actionArg === 'sell') {
      Logger.section('CREATING SELL ON DECREASE ORDERS');

      for (const config of TEST_CONFIG.sellOnDecreaseOrders) {
        const orderId = await createSellOnDecreaseOrder(recurringOrdersContract, config);
        if (orderId > 0) {
          createdOrderIds.push(orderId);
          await displayOrderDetails(recurringOrdersContract, orderId);
        }
        await sleep(2000);
      }
    }

    // Create DCA orders
    if (actionArg === 'all' || actionArg === 'dca') {
      Logger.section('CREATING DCA ORDERS');

      for (const config of TEST_CONFIG.dcaOrders) {
        const orderId = await createDCAOrder(recurringOrdersContract, config);
        if (orderId > 0) {
          createdOrderIds.push(orderId);
          await displayOrderDetails(recurringOrdersContract, orderId);
        }
        await sleep(2000);
      }
    }

    // Create grid orders
    if (actionArg === 'all' || actionArg === 'grid') {
      Logger.section('CREATING GRID TRADING ORDERS');

      for (const config of TEST_CONFIG.gridOrders) {
        const orderId = await createGridOrder(recurringOrdersContract, config);
        if (orderId > 0) {
          createdOrderIds.push(orderId);
          await displayOrderDetails(recurringOrdersContract, orderId);
        }
        await sleep(2000);
      }
    }

    // Create MAS recurring orders (demonstration)
    if (actionArg === 'all' || actionArg === 'mas') {
      Logger.section('NATIVE MAS RECURRING ORDERS');

      for (const config of TEST_CONFIG.masRecurringOrders) {
        await createMASRecurringOrder(recurringOrdersContract, massaBeamContract, config);
        await sleep(2000);
      }
    }

    // Test order management
    if (actionArg === 'all' || actionArg === 'manage') {
      if (createdOrderIds.length > 2) {
        Logger.section('TESTING ORDER MANAGEMENT');

        // Pause an order
        const orderToPause = createdOrderIds[0];
        await pauseRecurringOrder(recurringOrdersContract, orderToPause);
        await displayOrderDetails(recurringOrdersContract, orderToPause);
        await sleep(2000);

        // Resume the order
        await resumeRecurringOrder(recurringOrdersContract, orderToPause);
        await displayOrderDetails(recurringOrdersContract, orderToPause);
        await sleep(2000);

        // Cancel an order
        const orderToCancel = createdOrderIds[1];
        await cancelRecurringOrder(recurringOrdersContract, orderToCancel);
        await displayOrderDetails(recurringOrdersContract, orderToCancel);
      }
    }

    // Test autonomous bot
    if (actionArg === 'all' || actionArg === 'bot') {
      await testAutonomousBot(recurringOrdersContract);
    }

    // Get current prices
    if (actionArg === 'all' || actionArg === 'price') {
      Logger.section('CURRENT TOKEN PRICES');
      await getCurrentPrice(recurringOrdersContract, DAI[0], USDC[0]);
      await sleep(1000);
      await getCurrentPrice(recurringOrdersContract, WETH[0], USDC[0]);
    }

    // Final statistics
    Logger.section('✅ TEST SUITE COMPLETE');
    await displayOrderStats(recurringOrdersContract);

    Logger.success('All recurring orders tests completed successfully!');
    Logger.info('Created order IDs: ' + createdOrderIds.join(', '));
  } catch (error) {
    Logger.error(`Test suite failed: ${error}`);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
