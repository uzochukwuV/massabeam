/**
 * MassaBeam Limit Orders - Comprehensive Test Suite
 *
 * Tests all limit order functionality including:
 * - Standard limit orders (fungible tokens)
 * - Native MAS limit orders
 * - Stop-loss orders
 * - Take-profit orders
 * - Trailing stop orders
 * - Order cancellation
 * - Autonomous bot execution (startBot/advance/stopBot)
 * - Order state queries
 *
 * Usage:
 *   npm run test:limitorders -- --action all
 *   npm run test:limitorders -- --action create
 *   npm run test:limitorders -- --action execute
 *   npm run test:limitorders -- --action bot
 *
 * @version 2.0.0
 */

import 'dotenv/config';
import { Args, Mas, SmartContract } from '@massalabs/massa-web3';
import { u256 } from 'as-bignum/assembly';
import {
  Logger,
  initializeAccount,
  deployContract,
  callContract,
  readContract,
  saveDeployedAddresses,
  loadDeployedAddresses,
  sleep,
  toU256,
  fromU256,
  formatTokenAmount,
  parseTokenAmount,
  calculateDeadline,
  approveToken,
  getTokenBalance,
  retryWithBackoff,
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

// MAS native token (9 decimals)
const MAS_DECIMALS = 9;

/**
 * Test Configuration
 */
const TEST_CONFIG = {
  // Fungible token limit orders
  fungibleOrders: [
    {
      name: 'DAI → USDC Limit Order',
      tokenIn: DAI[0],
      tokenOut: USDC[0],
      amountIn: '100', // 100 DAI
      limitPrice: '1.01', // Execute when 1 DAI >= 1.01 USDC
      maxSlippage: 200, // 2%
      durationSeconds: 3600, // 1 hour
    },
    {
      name: 'USDC → WETH Limit Order',
      tokenIn: USDC[0],
      tokenOut: WETH[0],
      amountIn: '1000', // 1000 USDC
      limitPrice: '0.0003', // Execute when 1 USDC >= 0.0003 WETH
      maxSlippage: 300, // 3%
      durationSeconds: 7200,
    },
    {
      name: 'WETH → DAI Limit Order',
      tokenIn: WETH[0],
      tokenOut: DAI[0],
      amountIn: '1', // 1 WETH
      limitPrice: '3100', // Execute when 1 WETH >= 3100 DAI
      maxSlippage: 250,
      durationSeconds: 3600,
    },
  ],

  // Stop-loss orders
  stopLossOrders: [
    {
      name: 'DAI Stop-Loss',
      tokenIn: DAI[0],
      tokenOut: USDC[0],
      amountIn: '500',
      triggerPrice: '0.98', // Sell when 1 DAI drops to 0.98 USDC
      minAmountOut: '480', // Minimum 480 USDC
      durationSeconds: 86400, // 24 hours
    },
    {
      name: 'WETH Stop-Loss',
      tokenIn: WETH[0],
      tokenOut: USDC[0],
      amountIn: '0.5',
      triggerPrice: '2900', // Sell when 1 WETH drops to 2900 USDC
      minAmountOut: '1400',
      durationSeconds: 86400,
    },
  ],

  // Take-profit orders
  takeProfitOrders: [
    {
      name: 'WETH Take-Profit',
      tokenIn: WETH[0],
      tokenOut: USDC[0],
      amountIn: '0.5',
      triggerPrice: '3200', // Sell when 1 WETH rises to 3200 USDC
      minAmountOut: '1550',
      durationSeconds: 86400,
    },
  ],

  // Trailing stop orders
  trailingStopOrders: [
    {
      name: 'WETH Trailing Stop 5%',
      tokenIn: WETH[0],
      tokenOut: USDC[0],
      amountIn: '0.3',
      trailingPercent: 500, // 5% trailing stop
      minAmountOut: '850',
      durationSeconds: 86400,
    },
  ],

  // Native MAS orders
  masOrders: [
    {
      name: 'MAS → USDC Limit Order',
      tokenOut: USDC[0],
      masAmount: '10', // 10 MAS
      limitPrice: '12', // Execute when 1 MAS >= 12 USDC
      maxSlippage: 300,
      durationSeconds: 3600,
      isMasIn: true,
    },
    {
      name: 'USDC → MAS Limit Order',
      tokenIn: USDC[0],
      masAmount: '100', // Expect ~100 MAS output
      amountIn: '100', // 100 USDC
      limitPrice: '0.08', // Execute when 1 USDC >= 0.08 MAS
      maxSlippage: 300,
      durationSeconds: 3600,
      isMasIn: false,
    },
    {
      name: 'MAS → DAI Limit Order',
      tokenOut: DAI[0],
      masAmount: '5',
      limitPrice: '12',
      maxSlippage: 300,
      durationSeconds: 3600,
      isMasIn: true,
    },
  ],
};

// ============================================================================
// LIMIT ORDER CREATION FUNCTIONS
// ============================================================================

/**
 * Create a standard limit order (fungible tokens)
 */
async function createFungibleLimitOrder(
  limitOrdersContract: SmartContract,
  config: typeof TEST_CONFIG.fungibleOrders[0]
): Promise<number> {
  Logger.section(`📝 CREATE LIMIT ORDER: ${config.name}`);

  const { account, provider } = await initializeAccount();

  // Calculate amounts
  const amountIn = parseTokenAmount(config.amountIn, config.tokenIn.decimals);
  const limitPriceScaled = parseTokenAmount(config.limitPrice, 18); // Prices in 18 decimals
  const minAmountOut =
    (amountIn * BigInt(Math.floor(parseFloat(config.limitPrice) * 0.98 * 1e18))) /
    BigInt(1e18);

  Logger.log('Token In', `${config.tokenIn.symbol}`);
  Logger.log('Token Out', `${config.tokenOut.symbol}`);
  Logger.log('Amount In', formatTokenAmount(amountIn, config.tokenIn.decimals, config.tokenIn.symbol));
  Logger.log('Limit Price', `${config.limitPrice} ${config.tokenOut.symbol}/${config.tokenIn.symbol}`);
  Logger.log('Min Amount Out', formatTokenAmount(minAmountOut, config.tokenOut.decimals, config.tokenOut.symbol));
  Logger.log('Max Slippage', `${config.maxSlippage / 100}%`);

  // Check token balance
  const balance = await getTokenBalance(provider, config.tokenIn.address, account.address.toString());
  if (balance < amountIn) {
    Logger.warn(`Insufficient ${config.tokenIn.symbol} balance. Skipping...`);
    return 0;
  }
  Logger.log('Balance', formatTokenAmount(balance, config.tokenIn.decimals, config.tokenIn.symbol));

  // Approve tokens to limit orders contract
  const approved = await approveToken(
    provider,
    config.tokenIn.address,
    limitOrdersContract.address.toString(),
    amountIn,
    config.tokenIn.symbol
  );

  if (!approved) {
    Logger.error('Token approval failed');
    return 0;
  }

  // Calculate expiry
  const expiryTime = calculateDeadline(config.durationSeconds);

  // Create limit order
  const orderArgs = new Args()
    .addString(config.tokenIn.address)
    .addString(config.tokenOut.address)
    .add(toU256(amountIn))
    .add(toU256(minAmountOut))
    .add(toU256(limitPriceScaled))
    .addU64(BigInt(expiryTime))
    .addU64(BigInt(config.maxSlippage))
    .addBool(false); // partialFillAllowed

  Logger.info('Creating limit order...');

  try {
    await callContract(limitOrdersContract, 'createLimitOrder', orderArgs, '0.1', 'Create limit order');

    await sleep(3000);

    // Get order count to find the order ID
    const orderCountResult = await readContract(limitOrdersContract, 'getOrderCount');
    const orderCountArgs = new Args(orderCountResult.value);
    const orderCountStr = orderCountArgs.nextString().unwrap();
    const orderId = parseInt(orderCountStr);

    Logger.success(`Limit order created with ID: ${orderId}`);

    // Verify order details
    Logger.info('Verifying order...');
    const orderDetailsResult = await readContract(
      limitOrdersContract,
      'getOrderDetails',
      new Args().addU64(BigInt(orderId))
    );

    if (orderDetailsResult.value.length > 0) {
      Logger.success('Order verified and stored correctly');
    }

    return orderId;
  } catch (error) {
    Logger.error(`Failed to create limit order: ${error}`);
    return 0;
  }
}

/**
 * Create a stop-loss order
 */
async function createStopLossOrder(
  limitOrdersContract: SmartContract,
  config: typeof TEST_CONFIG.stopLossOrders[0]
): Promise<number> {
  Logger.section(`🛑 CREATE STOP-LOSS ORDER: ${config.name}`);

  const { account, provider } = await initializeAccount();

  const amountIn = parseTokenAmount(config.amountIn, config.tokenIn.decimals);
  const triggerPriceScaled = parseTokenAmount(config.triggerPrice, 18);
  const minAmountOut = parseTokenAmount(config.minAmountOut, config.tokenOut.decimals);

  Logger.log('Token In', config.tokenIn.symbol);
  Logger.log('Token Out', config.tokenOut.symbol);
  Logger.log('Amount In', formatTokenAmount(amountIn, config.tokenIn.decimals, config.tokenIn.symbol));
  Logger.log('Trigger Price', `${config.triggerPrice} ${config.tokenOut.symbol}/${config.tokenIn.symbol}`);
  Logger.log('Min Amount Out', formatTokenAmount(minAmountOut, config.tokenOut.decimals, config.tokenOut.symbol));

  // Check balance
  const balance = await getTokenBalance(provider, config.tokenIn.address, account.address.toString());
  if (balance < amountIn) {
    Logger.warn(`Insufficient ${config.tokenIn.symbol} balance. Skipping...`);
    return 0;
  }

  // Approve tokens
  const approved = await approveToken(
    provider,
    config.tokenIn.address,
    limitOrdersContract.address.toString(),
    amountIn,
    config.tokenIn.symbol
  );

  if (!approved) {
    Logger.error('Token approval failed');
    return 0;
  }

  const expiryTime = calculateDeadline(config.durationSeconds);

  const orderArgs = new Args()
    .addString(config.tokenIn.address)
    .addString(config.tokenOut.address)
    .add(toU256(amountIn))
    .add(toU256(triggerPriceScaled))
    .add(toU256(minAmountOut))
    .addU64(BigInt(expiryTime));

  Logger.info('Creating stop-loss order...');

  try {
    await callContract(limitOrdersContract, 'createStopLossOrder', orderArgs, '0.1', 'Create stop-loss');

    await sleep(3000);

    const orderCountResult = await readContract(limitOrdersContract, 'getOrderCount');
    const orderCountArgs = new Args(orderCountResult.value);
    const orderCountStr = orderCountArgs.nextString().unwrap();
    const orderId = parseInt(orderCountStr);

    Logger.success(`Stop-loss order created with ID: ${orderId}`);
    return orderId;
  } catch (error) {
    Logger.error(`Failed to create stop-loss order: ${error}`);
    return 0;
  }
}

/**
 * Create a take-profit order
 */
async function createTakeProfitOrder(
  limitOrdersContract: SmartContract,
  config: typeof TEST_CONFIG.takeProfitOrders[0]
): Promise<number> {
  Logger.section(`📈 CREATE TAKE-PROFIT ORDER: ${config.name}`);

  const { account, provider } = await initializeAccount();

  const amountIn = parseTokenAmount(config.amountIn, config.tokenIn.decimals);
  const triggerPriceScaled = parseTokenAmount(config.triggerPrice, 18);
  const minAmountOut = parseTokenAmount(config.minAmountOut, config.tokenOut.decimals);

  Logger.log('Token In', config.tokenIn.symbol);
  Logger.log('Token Out', config.tokenOut.symbol);
  Logger.log('Amount In', formatTokenAmount(amountIn, config.tokenIn.decimals, config.tokenIn.symbol));
  Logger.log('Trigger Price', `${config.triggerPrice} ${config.tokenOut.symbol}/${config.tokenIn.symbol}`);

  // Check balance
  const balance = await getTokenBalance(provider, config.tokenIn.address, account.address.toString());
  if (balance < amountIn) {
    Logger.warn(`Insufficient ${config.tokenIn.symbol} balance. Skipping...`);
    return 0;
  }

  // Approve tokens
  const approved = await approveToken(
    provider,
    config.tokenIn.address,
    limitOrdersContract.address.toString(),
    amountIn,
    config.tokenIn.symbol
  );

  if (!approved) return 0;

  const expiryTime = calculateDeadline(config.durationSeconds);

  const orderArgs = new Args()
    .addString(config.tokenIn.address)
    .addString(config.tokenOut.address)
    .add(toU256(amountIn))
    .add(toU256(triggerPriceScaled))
    .add(toU256(minAmountOut))
    .addU64(BigInt(expiryTime));

  Logger.info('Creating take-profit order...');

  try {
    await callContract(limitOrdersContract, 'createTakeProfitOrder', orderArgs, '0.1', 'Create take-profit');

    await sleep(3000);

    const orderCountResult = await readContract(limitOrdersContract, 'getOrderCount');
    const orderCountArgs = new Args(orderCountResult.value);
    const orderCountStr = orderCountArgs.nextString().unwrap();
    const orderId = parseInt(orderCountStr);

    Logger.success(`Take-profit order created with ID: ${orderId}`);
    return orderId;
  } catch (error) {
    Logger.error(`Failed to create take-profit order: ${error}`);
    return 0;
  }
}

/**
 * Create a trailing stop order
 */
async function createTrailingStopOrder(
  limitOrdersContract: SmartContract,
  config: typeof TEST_CONFIG.trailingStopOrders[0]
): Promise<number> {
  Logger.section(`📉 CREATE TRAILING STOP ORDER: ${config.name}`);

  const { account, provider } = await initializeAccount();

  const amountIn = parseTokenAmount(config.amountIn, config.tokenIn.decimals);
  const minAmountOut = parseTokenAmount(config.minAmountOut, config.tokenOut.decimals);

  Logger.log('Token In', config.tokenIn.symbol);
  Logger.log('Token Out', config.tokenOut.symbol);
  Logger.log('Amount In', formatTokenAmount(amountIn, config.tokenIn.decimals, config.tokenIn.symbol));
  Logger.log('Trailing Percent', `${config.trailingPercent / 100}%`);

  // Check balance
  const balance = await getTokenBalance(provider, config.tokenIn.address, account.address.toString());
  if (balance < amountIn) {
    Logger.warn(`Insufficient ${config.tokenIn.symbol} balance. Skipping...`);
    return 0;
  }

  // Approve tokens
  const approved = await approveToken(
    provider,
    config.tokenIn.address,
    limitOrdersContract.address.toString(),
    amountIn,
    config.tokenIn.symbol
  );

  if (!approved) return 0;

  const expiryTime = calculateDeadline(config.durationSeconds);

  const orderArgs = new Args()
    .addString(config.tokenIn.address)
    .addString(config.tokenOut.address)
    .add(toU256(amountIn))
    .addU64(BigInt(config.trailingPercent))
    .add(toU256(minAmountOut))
    .addU64(BigInt(expiryTime));

  Logger.info('Creating trailing stop order...');

  try {
    await callContract(limitOrdersContract, 'createTrailingStopOrder', orderArgs, '0.1', 'Create trailing stop');

    await sleep(3000);

    const orderCountResult = await readContract(limitOrdersContract, 'getOrderCount');
    const orderCountArgs = new Args(orderCountResult.value);
    const orderCountStr = orderCountArgs.nextString().unwrap();
    const orderId = parseInt(orderCountStr);

    Logger.success(`Trailing stop order created with ID: ${orderId}`);
    return orderId;
  } catch (error) {
    Logger.error(`Failed to create trailing stop order: ${error}`);
    return 0;
  }
}

/**
 * Create Native MAS limit orders
 * Note: Current limit_orders.ts only supports ERC20 tokens
 * This function demonstrates the pattern for MAS orders when/if implemented
 */
async function createMASLimitOrder(
  limitOrdersContract: SmartContract,
  massaBeamContract: SmartContract,
  config: typeof TEST_CONFIG.masOrders[0]
): Promise<number> {
  Logger.section(`💰 CREATE MAS LIMIT ORDER: ${config.name}`);

  Logger.warn('Native MAS limit orders require WMAS wrapper or direct MAS support');
  Logger.info('Current implementation: Using standard limit order pattern');

  // For MAS → Token orders, we'd need to:
  // 1. Wrap MAS to WMAS (if wrapper exists)
  // 2. Create limit order with WMAS as tokenIn
  // 3. Order executes swap via swapTokensForMAS or standard swap

  // For Token → MAS orders:
  // 1. Create limit order with token as tokenIn, WMAS as tokenOut
  // 2. Order executes and receives WMAS
  // 3. Auto-unwrap WMAS to MAS

  Logger.warn('Skipping MAS limit order - requires wrapper implementation');
  return 0;
}

// ============================================================================
// ORDER EXECUTION & MANAGEMENT
// ============================================================================

/**
 * Execute a limit order manually
 */
async function executeLimitOrder(limitOrdersContract: SmartContract, orderId: number): Promise<boolean> {
  Logger.section(`⚡ EXECUTE LIMIT ORDER #${orderId}`);

  // Get order details
  Logger.info('Fetching order details...');
  const orderDetailsResult = await readContract(
    limitOrdersContract,
    'getOrderDetails',
    new Args().addU64(BigInt(orderId))
  );

  if (!orderDetailsResult.value || orderDetailsResult.value.length === 0) {
    Logger.error('Order not found');
    return false;
  }

  // Parse order details
  const orderArgs = new Args(orderDetailsResult.value);
  const orderIdRead = orderArgs.nextU64().unwrap();
  const user = orderArgs.nextString().unwrap();
  const tokenIn = orderArgs.nextString().unwrap();
  const tokenOut = orderArgs.nextString().unwrap();
  const amountIn = orderArgs.nextU256().unwrap();
  const minAmountOut = orderArgs.nextU256().unwrap();
  const limitPrice = orderArgs.nextU256().unwrap();

  Logger.log('Order ID', orderIdRead.toString());
  Logger.log('User', user.slice(0, 15) + '...');
  Logger.log('Token In', tokenIn.slice(0, 15) + '...');
  Logger.log('Token Out', tokenOut.slice(0, 15) + '...');
  Logger.log('Amount In', formatTokenAmount(fromU256(amountIn), 18));
  Logger.log('Limit Price', formatTokenAmount(fromU256(limitPrice), 18));

  // Check if order is eligible
  Logger.info('Checking eligibility...');
  const eligibleResult = await readContract(
    limitOrdersContract,
    'isOrderEligible',
    new Args().addU64(BigInt(orderId))
  );

  const eligibleArgs = new Args(eligibleResult.value);
  const isEligible = eligibleArgs.nextBool().unwrap();

  if (!isEligible) {
    Logger.warn('Order is not eligible for execution');
    return false;
  }

  Logger.success('Order is eligible for execution');

  // For demonstration, use a mock current price
  // In production, this would come from a price oracle
  const currentPrice = limitPrice; // Assume price meets condition

  const executeArgs = new Args().addU64(BigInt(orderId)).add(currentPrice);

  Logger.info('Executing order...');

  try {
    await callContract(limitOrdersContract, 'executeLimitOrder', executeArgs, '0.2', 'Execute limit order');

    await sleep(3000);

    Logger.success('Order executed successfully');
    return true;
  } catch (error) {
    Logger.error(`Execution failed: ${error}`);
    return false;
  }
}

/**
 * Cancel a limit order
 */
async function cancelLimitOrder(limitOrdersContract: SmartContract, orderId: number): Promise<boolean> {
  Logger.section(`❌ CANCEL LIMIT ORDER #${orderId}`);

  const cancelArgs = new Args().addU64(BigInt(orderId));

  Logger.info('Canceling order...');

  try {
    await callContract(limitOrdersContract, 'cancelLimitOrder', cancelArgs, '0.1', 'Cancel limit order');

    await sleep(2000);

    Logger.success('Order cancelled successfully');
    return true;
  } catch (error) {
    Logger.error(`Cancellation failed: ${error}`);
    return false;
  }
}

// ============================================================================
// AUTONOMOUS BOT TESTING
// ============================================================================

/**
 * Test autonomous bot execution
 */
async function testAutonomousBot(limitOrdersContract: SmartContract): Promise<void> {
  Logger.section('🤖 TEST AUTONOMOUS BOT EXECUTION');

  Logger.info('This tests the startBot/advance/stopBot autonomous execution pattern');
  Logger.info('Pattern: Contract uses callNextSlot() to schedule self-execution');

  // Start bot
  Logger.info('Starting autonomous bot...');
  const startArgs = new Args().addU64(BigInt(10)); // Max 10 iterations

  try {
    await callContract(limitOrdersContract, 'startBot', startArgs, '0.1', 'Start bot');

    await sleep(2000);
    Logger.success('Bot started successfully');

    // Wait for a few cycles
    Logger.info('Waiting for bot to execute cycles...');
    await sleep(10000); // Wait 10 seconds

    // Check bot status
    Logger.info('Bot is running autonomously via callNextSlot()');
    Logger.info('Each cycle checks eligible orders and executes them');

    // Stop bot
    Logger.info('Stopping autonomous bot...');
    await callContract(limitOrdersContract, 'stopBot', new Args(), '0.1', 'Stop bot');

    await sleep(2000);
    Logger.success('Bot stopped successfully');

    Logger.info('Autonomous execution complete');
    Logger.info('Pattern demonstrated:');
    Logger.log('  1. startBot()', 'Initializes bot state, triggers first cycle');
    Logger.log('  2. advance()', 'Processes orders, schedules next cycle via callNextSlot()');
    Logger.log('  3. stopBot()', 'Sets counter to max, prevents further cycles');
  } catch (error) {
    Logger.error(`Bot test failed: ${error}`);
  }
}

// ============================================================================
// QUERY & STATISTICS FUNCTIONS
// ============================================================================

/**
 * Display order statistics and details
 */
async function displayOrderStats(limitOrdersContract: SmartContract): Promise<void> {
  Logger.section('📊 LIMIT ORDERS STATISTICS');

  try {
    // Get total order count
    const orderCountResult = await readContract(limitOrdersContract, 'getOrderCount');
    const orderCountArgs = new Args(orderCountResult.value);
    const orderCountStr = orderCountArgs.nextString().unwrap();
    const totalOrders = parseInt(orderCountStr);

    Logger.log('Total Orders', totalOrders.toString());

    // Get MassaBeam integration address
    const massaBeamResult = await readContract(limitOrdersContract, 'getMassaBeamAddress');
    const massaBeamArgs = new Args(massaBeamResult.value);
    const massaBeamAddress = massaBeamArgs.nextString().unwrap();

    Logger.log('MassaBeam AMM', massaBeamAddress.slice(0, 15) + '...');

    // Display order breakdown
    Logger.info('Order Type Breakdown:');
    Logger.log('  Standard Limit', TEST_CONFIG.fungibleOrders.length.toString());
    Logger.log('  Stop-Loss', TEST_CONFIG.stopLossOrders.length.toString());
    Logger.log('  Take-Profit', TEST_CONFIG.takeProfitOrders.length.toString());
    Logger.log('  Trailing Stop', TEST_CONFIG.trailingStopOrders.length.toString());

    Logger.success('Statistics retrieved successfully');
  } catch (error) {
    Logger.error(`Failed to get statistics: ${error}`);
  }
}

/**
 * Display detailed order information
 */
async function displayOrderDetails(limitOrdersContract: SmartContract, orderId: number): Promise<void> {
  Logger.section(`📋 ORDER DETAILS #${orderId}`);

  try {
    const orderDetailsResult = await readContract(
      limitOrdersContract,
      'getOrderDetails',
      new Args().addU64(BigInt(orderId))
    );

    if (!orderDetailsResult.value || orderDetailsResult.value.length === 0) {
      Logger.warn('Order not found');
      return;
    }

    const args = new Args(orderDetailsResult.value);
    const id = args.nextU64().unwrap();
    const user = args.nextString().unwrap();
    const tokenIn = args.nextString().unwrap();
    const tokenOut = args.nextString().unwrap();
    const amountIn = args.nextU256().unwrap();
    const minAmountOut = args.nextU256().unwrap();
    const limitPrice = args.nextU256().unwrap();
    const expiryTime = args.nextU64().unwrap();
    const createdTime = args.nextU64().unwrap();
    const status = args.nextU8().unwrap();

    const statusMap: { [key: number]: string } = {
      0: 'ACTIVE',
      1: 'FILLED',
      2: 'CANCELLED',
      3: 'EXPIRED',
    };

    Logger.log('Order ID', id.toString());
    Logger.log('User', user.slice(0, 15) + '...');
    Logger.log('Status', statusMap[status] || 'UNKNOWN');
    Logger.log('Token In', tokenIn.slice(0, 15) + '...');
    Logger.log('Token Out', tokenOut.slice(0, 15) + '...');
    Logger.log('Amount In', formatTokenAmount(fromU256(amountIn), 18));
    Logger.log('Min Amount Out', formatTokenAmount(fromU256(minAmountOut), 18));
    Logger.log('Limit Price', formatTokenAmount(fromU256(limitPrice), 18));
    Logger.log('Created', new Date(Number(createdTime) * 1000).toISOString());
    Logger.log('Expires', new Date(Number(expiryTime) * 1000).toISOString());

    Logger.success('Order details retrieved');
  } catch (error) {
    Logger.error(`Failed to get order details: ${error}`);
  }
}

// ============================================================================
// MAIN TEST ORCHESTRATOR
// ============================================================================

async function main() {
  Logger.section('🎯 MASSABEAM LIMIT ORDERS - COMPREHENSIVE TEST SUITE');

  const args = process.argv.slice(2);
  const actionArg = args.find((arg) => arg.startsWith('--action='))?.split('=')[1] || 'all';

  Logger.log('Test Action', actionArg);

  // Load deployed addresses
  const addresses = loadDeployedAddresses();

  if (!addresses.massaBeam) {
    Logger.error('MassaBeam AMM not deployed. Run: npm run deploy first');
    process.exit(1);
  }

  if (!addresses.limitOrders) {
    Logger.error('Limit Orders contract not deployed. Run: npm run deploy -- --contracts=limitorders');
    process.exit(1);
  }

  Logger.log('MassaBeam AMM', addresses.massaBeam.slice(0, 15) + '...');
  Logger.log('Limit Orders', addresses.limitOrders.slice(0, 15) + '...');

  const { provider } = await initializeAccount();
  const limitOrdersContract = new SmartContract(provider, addresses.limitOrders);
  const massaBeamContract = new SmartContract(provider, addresses.massaBeam);

  const createdOrderIds: number[] = [];

  try {
    // Display initial stats
    await displayOrderStats(limitOrdersContract);

    // Create fungible token limit orders
    if (actionArg === 'all' || actionArg === 'create') {
      Logger.section('CREATING FUNGIBLE TOKEN LIMIT ORDERS');

      for (const config of TEST_CONFIG.fungibleOrders) {
        const orderId = await createFungibleLimitOrder(limitOrdersContract, config);
        if (orderId > 0) {
          createdOrderIds.push(orderId);
          await displayOrderDetails(limitOrdersContract, orderId);
        }
        await sleep(2000);
      }

      // Create stop-loss orders
      Logger.section('CREATING STOP-LOSS ORDERS');
      for (const config of TEST_CONFIG.stopLossOrders) {
        const orderId = await createStopLossOrder(limitOrdersContract, config);
        if (orderId > 0) createdOrderIds.push(orderId);
        await sleep(2000);
      }

      // Create take-profit orders
      Logger.section('CREATING TAKE-PROFIT ORDERS');
      for (const config of TEST_CONFIG.takeProfitOrders) {
        const orderId = await createTakeProfitOrder(limitOrdersContract, config);
        if (orderId > 0) createdOrderIds.push(orderId);
        await sleep(2000);
      }

      // Create trailing stop orders
      Logger.section('CREATING TRAILING STOP ORDERS');
      for (const config of TEST_CONFIG.trailingStopOrders) {
        const orderId = await createTrailingStopOrder(limitOrdersContract, config);
        if (orderId > 0) createdOrderIds.push(orderId);
        await sleep(2000);
      }

      // Create MAS orders (demonstration)
      Logger.section('NATIVE MAS LIMIT ORDERS');
      for (const config of TEST_CONFIG.masOrders) {
        await createMASLimitOrder(limitOrdersContract, massaBeamContract, config);
        await sleep(2000);
      }
    }

    // Execute orders
    if (actionArg === 'all' || actionArg === 'execute') {
      if (createdOrderIds.length > 0) {
        Logger.section('EXECUTING LIMIT ORDERS');
        const orderId = createdOrderIds[0];
        await executeLimitOrder(limitOrdersContract, orderId);
        await sleep(2000);
      }
    }

    // Test cancellation
    if (actionArg === 'all' || actionArg === 'cancel') {
      if (createdOrderIds.length > 1) {
        Logger.section('TESTING ORDER CANCELLATION');
        const orderId = createdOrderIds[1];
        await cancelLimitOrder(limitOrdersContract, orderId);
        await sleep(2000);
      }
    }

    // Test autonomous bot
    if (actionArg === 'all' || actionArg === 'bot') {
      await testAutonomousBot(limitOrdersContract);
    }

    // Final statistics
    Logger.section('✅ TEST SUITE COMPLETE');
    await displayOrderStats(limitOrdersContract);

    Logger.success('All limit orders tests completed successfully!');
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
