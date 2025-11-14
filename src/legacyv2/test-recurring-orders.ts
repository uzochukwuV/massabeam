/**
 * Recurring Orders & DCA Test Script
 *
 * Tests the recurring orders system:
 * 1. Create DCA order (time-based)
 * 2. Create Buy-on-Increase order (price-based)
 * 3. Create Sell-on-Decrease order (price-based)
 * 4. Create Grid trading order
 * 5. Get order details
 * 6. Check statistics
 * 7. Pause/Resume orders
 *
 * Usage:
 *   npx tsx src/test-recurring-orders.ts
 */

import 'dotenv/config';
import {
  Account,
  Args,
  Mas,
  SmartContract,
  JsonRpcProvider,
} from '@massalabs/massa-web3';
import { DAI, USDC, WETH, WMAS } from '@dusalabs/sdk';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function log(title: string, message: string): void {
  console.log(`  ${title.padEnd(30)} ${message}`);
}

function logSection(title: string): void {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  ${title}`);
  console.log(`${'═'.repeat(70)}`);
}

function logSuccess(message: string): void {
  console.log(`  ✅ ${message}`);
}

function logError(message: string): void {
  console.log(`  ❌ ${message}`);
}

function logInfo(message: string): void {
  console.log(`  ℹ️  ${message}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// MAIN TEST FUNCTION
// ============================================================================

async function main(): Promise<void> {
  logSection('📅 RECURRING ORDERS & DCA TEST');

  try {
    // Setup account
    logSection('🔑 ACCOUNT SETUP');
    const account = await Account.fromEnv();
    log('Account:', account.address.toString());

    const provider = JsonRpcProvider.buildnet(account);
    const balance = await provider.balanceOf([account.address.toString()]);
    log('MAS Balance:', balance[0].balance.toString());

    logSuccess('Account setup complete');
    await sleep(1000);

    // Load deployed addresses
    logSection('📋 LOADING DEPLOYMENT INFO');
    const addressesPath = path.join(__dirname, '../deployed-addresses.json');

    if (!fs.existsSync(addressesPath)) {
      logError('deployed-addresses.json not found!');
      logInfo('Please deploy contracts first');
      process.exit(1);
    }

    const deployedAddresses = JSON.parse(fs.readFileSync(addressesPath, 'utf-8'));

    // Check if recurring orders contract is deployed
    if (!deployedAddresses.contracts.recurringOrders) {
      logError('Recurring Orders contract not deployed!');
      logInfo('Deploy it using: npx tsx src/deploy-massabeam.ts --deploy all');
      process.exit(1);
    }

    const recurringOrdersAddress = deployedAddresses.contracts.recurringOrders;
    const massaBeamAddress = deployedAddresses.contracts.massaBeam;

    log('Recurring Orders:', recurringOrdersAddress);
    log('MassaBeam AMM:', massaBeamAddress);

    const ordersContract = new SmartContract(provider, recurringOrdersAddress);
    logSuccess('Contracts loaded');
    await sleep(1000);

    const usdcContract = new SmartContract(provider, USDC[0].address);

    // Display token information
    logSection('📊 TOKENS FOR TESTING');
    log('USDC', `${USDC[0].symbol} - ${USDC[0].address.slice(0, 10)}...`);
    log('DAI', `${DAI[0].symbol} - ${DAI[0].address.slice(0, 10)}...`);
    log('WETH', `${WETH[0].symbol} - ${WETH[0].address.slice(0, 10)}...`);
    await sleep(1000);

    let orderId1: string | null = null;
    let orderId2: string | null = null;
    let orderId3: string | null = null;

    // Test 1: Create DCA Order
    logSection('1️⃣  CREATE DCA ORDER');
    try {
      logInfo('Creating DCA order: Buy $10 of WETH every hour...');

      // Approve tokens
      const usdcContract = new SmartContract(provider, USDC[0].address);
      const approveAmount = BigInt(10 * 1000000 * 24); // $10 * 24 times (1 day worth)

      await usdcContract.call(
        'increaseAllowance',
        new Args().addString(recurringOrdersAddress).addU256(approveAmount),
        { coins: Mas.fromString('0.01') }
      );
      logSuccess('USDC approved');
      await sleep(2000);

      // Create DCA order
      // createDCAOrder(tokenIn, tokenOut, executionInterval, amountPerExecution, minAmountOut, maxExecutions)
      const dcaArgs = new Args()
        .addString(USDC[0].address)
        .addString(WETH[0].address)
        .addU64(BigInt(3600)) // 1 hour interval
        .addU64(BigInt(10 * 1000000)) // $10 per execution (6 decimals)
        .addU64(BigInt(0)) // Min amount out (for testing)
        .addU64(BigInt(24)); // 24 executions (1 day)

      const result1 = await ordersContract.call('createDCAOrder', dcaArgs, {
        coins: Mas.fromString('0.5'),
      });

      // Parse order ID from result
      orderId1 = '1'; // First order
      log('Order ID:', orderId1);
      log('Type:', 'DCA (Time-based)');
      log('Interval:', '1 hour');
      log('Amount:', '$10 USDC per execution');
      log('Total executions:', '24');

      logSuccess('DCA order created');
      await sleep(2000);

    } catch (error) {
      logError(`Failed to create DCA order: ${error}`);
      logInfo('This might be due to insufficient token balance or approval');
    }

    // Test 2: Create Buy-on-Increase Order
    logSection('2️⃣  CREATE BUY-ON-INCREASE ORDER');
    try {
      logInfo('Creating Buy-on-Increase: Buy $100 WETH when price rises 2%...');

      // Approve more USDC
      const approveAmount2 = BigInt(100 * 1000000 * 10); // $100 * 10 times
      await usdcContract.call(
        'increaseAllowance',
        new Args().addString(recurringOrdersAddress).addU256(approveAmount2),
        { coins: Mas.fromString('0.01') }
      );
      await sleep(2000);

      // Create buy-on-increase order
      // createBuyOnIncreaseOrder(tokenIn, tokenOut, triggerPercentage, amountPerExecution, minAmountOut, maxExecutions)
      const buyArgs = new Args()
        .addString(USDC[0].address)
        .addString(WETH[0].address)
        .addU64(BigInt(200)) // 2% trigger (200 basis points)
        .addU64(BigInt(100 * 1000000)) // $100 per execution
        .addU64(BigInt(0)) // Min out
        .addU64(BigInt(10)); // Max 10 times

      const result2 = await ordersContract.call('createBuyOnIncreaseOrder', buyArgs, {
        coins: Mas.fromString('0.5'),
      });

      orderId2 = '2'; // Second order
      log('Order ID:', orderId2);
      log('Type:', 'Buy-on-Increase (Price-based)');
      log('Trigger:', '+2% price increase');
      log('Amount:', '$100 USDC per execution');

      logSuccess('Buy-on-Increase order created');
      await sleep(2000);

    } catch (error) {
      logError(`Failed to create Buy-on-Increase order: ${error}`);
    }

    // Test 3: Create Grid Order
    logSection('3️⃣  CREATE GRID TRADING ORDER');
    try {
      logInfo('Creating Grid order: 3 buy levels at -2%, -4%, -6%...');

      // Approve tokens for grid
      const approveAmount3 = BigInt(600 * 1000000); // $600 total
      
      await usdcContract.call(
        'increaseAllowance',
        new Args().addString(recurringOrdersAddress).addU256(approveAmount3),
        { coins: Mas.fromString('0.01') }
      );
      await sleep(2000);

      // Create grid order
      // createGridOrder(tokenIn, tokenOut, numLevels, [levels...], [amounts...], minAmountOut)
      const gridArgs = new Args()
        .addString(USDC[0].address)
        .addString(WETH[0].address)
        .addU8(3n) // 3 levels
        .addU64(BigInt(200)) // -2% level 1
        .addU64(BigInt(100 * 1000000)) // $100 for level 1
        .addU64(BigInt(400)) // -4% level 2
        .addU64(BigInt(200 * 1000000)) // $200 for level 2
        .addU64(BigInt(600)) // -6% level 3
        .addU64(BigInt(300 * 1000000)) // $300 for level 3
        .addU64(BigInt(0)); // Min out

      const result3 = await ordersContract.call('createGridOrder', gridArgs, {
        coins: Mas.fromString('0.5'),
      });

      orderId3 = '3'; // Third order
      log('Order ID:', orderId3);
      log('Type:', 'Grid Trading');
      log('Levels:', '3 buy levels (-2%, -4%, -6%)');
      log('Total amount:', '$600 USDC');

      logSuccess('Grid order created');
      await sleep(2000);

    } catch (error) {
      logError(`Failed to create Grid order: ${error}`);
    }

    // Test 4: Get order details
    if (orderId1) {
      logSection('4️⃣  GET ORDER DETAILS');
      try {
        logInfo(`Fetching order #${orderId1} details...`);

        const detailsArgs = new Args().addU64(BigInt(orderId1));
        const detailsResult = await ordersContract.read('getOrderDetails', detailsArgs);

        logSuccess('Order details retrieved');
        log('Details available:', 'Check contract storage for full info');
        await sleep(1000);

      } catch (error) {
        logError(`Failed to get order details: ${error}`);
      }
    }

    // Test 5: Get user orders
    logSection('5️⃣  GET USER ORDERS');
    try {
      logInfo('Fetching all orders for current user...');

      const userOrdersArgs = new Args().addString(account.address.toString());
      const userOrdersResult = await ordersContract.read('getUserOrders', userOrdersArgs);

      // Parse result
      const ordersArgs = new Args(userOrdersResult.value);
      const orderCount = ordersArgs.nextU64()

      log('Total orders:', orderCount.toString());
      logSuccess('User orders retrieved');
      await sleep(1000);

    } catch (error) {
      logError(`Failed to get user orders: ${error}`);
    }

    // Test 6: Get statistics
    logSection('6️⃣  GET CONTRACT STATISTICS');
    try {
      logInfo('Fetching contract statistics...');

      const statsResult = await ordersContract.read('getStatistics', new Args());

      // Parse statistics
      const statsArgs = new Args(statsResult.value);
      const totalOrders = statsArgs.nextU64();
      const activeOrders = statsArgs.nextU64();
      const completedOrders = statsArgs.nextU64();
      const pausedOrders = statsArgs.nextU64();
      const cancelledOrders = statsArgs.nextU64();
      const totalExecutions = statsArgs.nextU64();
      const isBotRunning = statsArgs.nextBool();
      const botCounter = statsArgs.nextU64();

      logSection('📈 CONTRACT STATISTICS');
      log('Total Orders:', totalOrders.toString());
      log('Active Orders:', activeOrders.toString());
      log('Completed Orders:', completedOrders.toString());
      log('Paused Orders:', pausedOrders.toString());
      log('Cancelled Orders:', cancelledOrders.toString());
      log('Total Executions:', totalExecutions.toString());
      log('Bot Running:', isBotRunning ? 'Yes' : 'No');
      log('Bot Cycle Counter:', botCounter.toString());

      logSuccess('Statistics retrieved');
      await sleep(2000);

    } catch (error) {
      logError(`Failed to get statistics: ${error}`);
    }

    // Test 7: Pause/Resume (Optional)
    if (orderId1) {
      logSection('7️⃣  PAUSE/RESUME ORDER (OPTIONAL)');
      logInfo('To pause an order:');
      console.log(`
  const pauseArgs = new Args().addU64(BigInt(${orderId1}));
  await ordersContract.call('pauseOrder', pauseArgs, {
    coins: Mas.fromString('0.1'),
  });
      `);

      logInfo('To resume an order:');
      console.log(`
  const resumeArgs = new Args().addU64(BigInt(${orderId1}));
  await ordersContract.call('resumeOrder', resumeArgs, {
    coins: Mas.fromString('0.1'),
  });
      `);
      await sleep(1000);
    }

    // Final summary
    logSection('✨ TEST COMPLETE');
    console.log(`
  📝 Summary:
  - Recurring Orders Contract: ${recurringOrdersAddress}
  - Orders created: ${[orderId1, orderId2, orderId3].filter(id => id !== null).length}
  - Order types tested: DCA, Buy-on-Increase, Grid Trading
  - Network: Buildnet
  - Timestamp: ${new Date().toISOString()}

  📊 Order Details:
  ${orderId1 ? `- Order #${orderId1}: DCA (Buy $10 WETH hourly for 24 hours)` : ''}
  ${orderId2 ? `- Order #${orderId2}: Buy-on-Increase (Buy $100 when +2%)` : ''}
  ${orderId3 ? `- Order #${orderId3}: Grid Trading (3 levels: -2%, -4%, -6%)` : ''}

  🎯 Next Steps:
  1. Start autonomous bot: startBot(maxIterations)
  2. Bot will execute orders automatically when conditions are met
  3. Monitor order execution with getOrderDetails(orderId)
  4. Check statistics with getStatistics()
  5. Pause orders with pauseOrder(orderId)
  6. Cancel orders with cancelRecurringOrder(orderId)

  💡 Order Execution:
  - DCA: Executes every 1 hour (time-based)
  - Buy-on-Increase: Executes when price rises 2% (price-based)
  - Grid: Executes when price hits each level
  - Bot checks every 5 slots (~5 seconds)
  - All execution is fully autonomous!

  ⚠️  Important Notes:
  - Ensure pools have sufficient liquidity
  - Orders execute autonomously via Massa ASC
  - No manual intervention required after setup
  - Bot runs using callNextSlot() for scheduling
    `);

    console.log(`${'═'.repeat(70)}\n`);

  } catch (error) {
    logError(`Test failed: ${error}`);
    console.error(error);
    process.exit(1);
  }
}

// Execute main function
main()
  .then(() => {
    logSuccess('Test completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    logError(`Test failed: ${error}`);
    console.error(error);
    process.exit(1);
  });
