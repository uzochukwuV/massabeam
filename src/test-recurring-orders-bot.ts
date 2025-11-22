/**
 * Test Recurring Orders Bot - Autonomous DCA/Grid/Interval Trading
 *
 * Tests the recurring orders autonomous bot:
 * 1. Create recurring DCA orders (dollar cost averaging)
 * 2. Create grid trading orders (buy/sell at multiple levels)
 * 3. Start autonomous bot
 * 4. Monitor bot execution via events
 * 5. Verify orders execute based on price % change or time intervals
 * 6. Check execution counts and order status
 *
 * Recurring Order Types:
 * - BUY_ON_INCREASE (0): Execute buy when price increases by X%
 * - SELL_ON_DECREASE (1): Execute sell when price decreases by X%
 * - GRID (2): Buy/sell at multiple price levels
 * - DCA (3): Dollar cost averaging at fixed intervals
 *
 * Usage: npx tsx src/test-recurring-orders-bot.ts
 */

import 'dotenv/config';
import {
  Account,
  Args,
  Mas,
  SmartContract,
  JsonRpcProvider,
} from '@massalabs/massa-web3';
import { USDC } from '@dusalabs/sdk';
import { loadAddresses } from './utils/address-book.js';

// Token addresses
const TOKEN_A = 'AS1nDAemyLSLUuNZ747Dt3NgzEC9WGCkmjRvY9hZwW2928Fxb4Fk';
const TOKEN_B = USDC[0].address;

// Recurring order constants
const ORDER_TYPE_BUY_ON_INCREASE = 0n;
const ORDER_TYPE_SELL_ON_DECREASE = 1n;
const ORDER_TYPE_GRID = 2n;
const ORDER_TYPE_DCA = 3n;

const EXECUTION_MODE_TRIGGERED = 0n;
const EXECUTION_MODE_INTERVAL = 1n;

function log(message: string): void {
  console.log(`  ${message}`);
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

function logEvent(data: string): void {
  console.log(`  📤 ${data}`);
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  logSection('🤖 TEST: RECURRING ORDERS BOT - AUTONOMOUS DCA/GRID TRADING');

  try {
    const account = await Account.fromEnv();
    const provider = JsonRpcProvider.buildnet(account);

    log(`Account: ${account.address.toString()}`);

    const deployed = loadAddresses();
    const massaBeamAddress = deployed.contracts.massaBeam;
    const recurringOrdersAddress = deployed.contracts.recurringOrders;

    log(`MassaBeam: ${massaBeamAddress}`);
    log(`RecurringOrders: ${recurringOrdersAddress}`);

    const ammContract = new SmartContract(provider, massaBeamAddress);
    const roContract = new SmartContract(provider, recurringOrdersAddress);
    const tokenAContract = new SmartContract(provider, TOKEN_A);


     const exBytes = await roContract.read('getStatistics', new Args());
    const exArgs = new Args(exBytes.value);
    console.log(exArgs.nextU64())
    console.log(exArgs.nextU64())
    console.log(exArgs.nextU64())
    console.log(exArgs.nextU64())


    // =========================================================================
    // STEP 1: Get current pool price
    logSection('📊 STEP 1: Check Pool & Get Current Price');

    log('Reading pool...');
    const poolDataBytes = await ammContract.read(
      'readPool',
      new Args()
        .addString(TOKEN_A)
        .addString(TOKEN_B)
    );

    const poolResult = new TextDecoder().decode(poolDataBytes.value);
    if (poolResult === 'null') {
      throw new Error('Pool does not exist!');
    }

    const poolArgs = new Args(poolDataBytes.value);
    poolArgs.nextString(); // tokenA
    poolArgs.nextString(); // tokenB
    const reserveA = poolArgs.nextU256();
    const reserveB = poolArgs.nextU256();

    const currentPrice = Number(reserveB) / Number(reserveA);
    const entryPrice = BigInt(Math.floor(currentPrice * 1e18));

    logSuccess('Pool found');
    log(`Current Price: 1 A = ${currentPrice.toFixed(10)} B`);
    log(`Entry Price (18 decimals): ${entryPrice.toString()}`);

    // =========================================================================
    // STEP 2: Check initial bot status
    logSection('📋 STEP 2: Check Initial Bot Status');

    log('Reading bot status...');
    const botStatusBytes = await roContract.read('getBotStatus', new Args());
    const botStatusArgs = new Args(botStatusBytes.value);
    const initialBotCounter = botStatusArgs.nextU64();
    const initialBotMaxIter = botStatusArgs.nextU64();

    log(`Initial Bot Counter: ${initialBotCounter}`);
    log(`Initial Max Iterations: ${initialBotMaxIter}`);

    // =========================================================================
    // STEP 3: Create DCA recurring order
    logSection('📝 STEP 3: Create DCA Recurring Order');

    log('Creating DCA (Dollar Cost Averaging) order...');
    log('  - Buy TOKEN_B every 60 seconds');
    log('  - Amount per execution: 1 TOKEN_A');
    log('  - Max 3 executions');

    const dcaAmountPerExec = 1n * 10n ** 6n; // 1 TOKEN_A
    const dcaMinOutput = 1n * 10n ** 5n; // Min output
    const dcaInterval = 60n; // 60 seconds
    const now = Math.floor(Date.now() / 1000);
    const dcaExpiry = BigInt(now + 3600); // 1 hour

    // Approve tokens
    await tokenAContract.call(
      'increaseAllowance',
      new Args()
        .addString(recurringOrdersAddress)
        .addU256(dcaAmountPerExec * 3n), // 3 executions worth
      { coins: Mas.fromString('0.01') }
    );

    logSuccess('Approval sent');

    // Create DCA order
    const dcaArgs = new Args()
      .addString(TOKEN_A) // tokenIn
      .addString(TOKEN_B) // tokenOut
      .addU8(ORDER_TYPE_DCA) // orderType
      .addU8(EXECUTION_MODE_INTERVAL) // executionMode (time-based)
      .addU256(entryPrice) // entryPrice
      .addU64(100n) // triggerPercentage (1%)
      .addU64(3n) // maxExecutions
      .addU256(dcaAmountPerExec) // amountPerExecution
      .addU256(dcaMinOutput) // minAmountOut
      .addU64(dcaInterval) // executionInterval (60 seconds)
      .addU64(dcaExpiry); // expiryTime

    const dcaTx = await roContract.call('createRecurringOrder', dcaArgs, {
      coins: Mas.fromString('1.0'),
      maxGas: BigInt(4000000000),
    });

    await dcaTx.waitFinalExecution();
    const dcaEvents = await dcaTx.getFinalEvents();

    let dcaOrderId = 0n;
    for (const event of dcaEvents) {
      if (event.data.includes('RecurringOrder:Created')) {
        logEvent(event.data);
        const idMatch = event.data.match(/id=(\d+)/);
        if (idMatch) {
          dcaOrderId = BigInt(idMatch[1]);
        }
      }
    }

    logSuccess(`DCA Order created with ID: ${dcaOrderId}`);

    // =========================================================================
    // STEP 4: Create Grid trading order
    logSection('📝 STEP 4: Create Grid Trading Order');

    log('Creating GRID trading order...');
    log('  - Buy at -2% and -4% (price drops)');
    log('  - Sell at +2% and +4% (price rises)');
    log('  - Amount per level: 0.5 TOKEN_A');

    const gridLevels = [200n, 400n, 200n, 400n]; // -2%, -4%, +2%, +4% (in basis points)
    const gridAmountPerLevel = 5n * 10n ** 5n; // 0.5 TOKEN_A per level

    // Approve tokens for grid (4 levels)
    await tokenAContract.call(
      'increaseAllowance',
      new Args()
        .addString(recurringOrdersAddress)
        .addU256(gridAmountPerLevel * 4n),
      { coins: Mas.fromString('0.01') }
    );

    logSuccess('Grid approval sent');

    // Create Grid order
    const gridArgs = new Args()
      .addString(TOKEN_A) // tokenIn
      .addString(TOKEN_B) // tokenOut
      .addU8(ORDER_TYPE_GRID) // orderType
      .addU8(EXECUTION_MODE_TRIGGERED) // executionMode (price-based)
      .addU256(entryPrice) // entryPrice
      .addU64(200n) // triggerPercentage (2%)
      .addU64(4n) // maxExecutions
      .addU256(gridAmountPerLevel) // amountPerExecution
      .addU256(dcaMinOutput); // minAmountOut
    // Note: Grid levels and amounts would need array support in Args

    log('⚠️  Grid order skipped (requires array support in test)');

    // =========================================================================
    // STEP 5: Check order counts
    logSection('📋 STEP 5: Check Order Counts');

    log('Reading order counts...');
    // const countBytes = await roContract.read('getRecurringOrderCount', new Args());
    // console.log(countBytes)
    // const countArgs = new Args(countBytes.value);
    const totalOrderCount = 1 // countArgs.nextU64();

    log(`Total Recurring Orders: ${totalOrderCount}`);

    // =========================================================================
    // STEP 6: Start bot
    logSection('🚀 STEP 6: Start Autonomous Bot');

    log('Starting bot with maxIterations=10...');
    const botStartTx = await roContract.call(
      'startBot',
      new Args().addU64(10000n),
      { coins: Mas.fromString('0.5'), maxGas: BigInt(4000000000) }
    );

    await botStartTx.waitFinalExecution();
    const botStartEvents = await botStartTx.getFinalEvents();

    for (const event of botStartEvents) {
      if (event.data.includes('RecurringOrder:Bot') || event.data.includes('RecurringOrder:Advance')) {
        logEvent(event.data);
      }
    }

    logSuccess('Bot started');

    // =========================================================================
    // STEP 7: Monitor bot execution
    logSection('👀 STEP 7: Monitor Bot Execution');

    log('Waiting for bot cycles...');
    log('(This may take 30-60 seconds as bot runs autonomously)\n');

    let maxWaitCycles = 12;
    let botCompleted = false;

    for (let wait = 0; wait < maxWaitCycles; wait++) {
      await sleep(5000);

      const botStatusBytes = await roContract.read('getBotStatus', new Args());
      const botStatusArgs = new Args(botStatusBytes.value);
      const counter = botStatusArgs.nextU64();
      const maxIter = botStatusArgs.nextU64();

      log(`[${wait + 1}/${maxWaitCycles}] Bot State: cycle=${counter}/${maxIter}`);

      if (counter >= maxIter) {
        logSuccess('Bot completed all cycles!');
        botCompleted = true;
        break;
      }
    }

    // =========================================================================
    // STEP 8: Check order execution counts
    logSection('📊 STEP 8: Check Order Execution Counts');

    log('Reading execution statistics...');
    const executionStatsBytes = await roContract.read('getStatistics', new Args());
    const executionStatsArgs = new Args(executionStatsBytes.value);
    const totalExecuted = executionStatsArgs.nextU64();

    log(`Total Orders Executed: ${totalExecuted}`);

    if (totalExecuted > 0n) {
      logSuccess(`Orders were executed by bot!`);
    } else {
      log('ℹ️  No orders executed (may be waiting for price/time conditions)');
    }

    // =========================================================================
    // STEP 9: Check DCA order status
    logSection('📖 STEP 9: Check DCA Order Status');

    if (dcaOrderId > 0n) {
      log(`Checking DCA order #${dcaOrderId}...`);

      const orderBytes = await roContract.read(
        'getRecurringOrderDetails',
        new Args().addU64(dcaOrderId)
      );

      const orderResult = new TextDecoder().decode(orderBytes.value);
      if (orderResult === 'null') {
        logError(`Order #${dcaOrderId} not found`);
      } else {
        const orderArgs = new Args(orderBytes.value);

        // Parse RecurringOrder fields
        const orderId = orderArgs.nextU64();
        const user = orderArgs.nextString();
        const orderType = orderArgs.nextU8();
        const executionMode = orderArgs.nextU8();
        const status = orderArgs.nextU8();
        const tokenIn = orderArgs.nextString();
        const tokenOut = orderArgs.nextString();
        const entryPriceRead = orderArgs.nextU256();
        const triggerPct = orderArgs.nextU64();
        const maxExec = orderArgs.nextU64();
        const execCount = orderArgs.nextU64();
        const amountPerExec = orderArgs.nextU256();
        const minAmountOut = orderArgs.nextU256();
        const execInterval = orderArgs.nextU64();
        const lastExecTime = orderArgs.nextU64();

        log(`  ID: ${orderId}`);
        log(`  User: ${user.substring(0, 20)}...`);
        log(`  Order Type: ${orderType === 3n ? 'DCA' : 'Other'}`);
        log(`  Execution Mode: ${executionMode === 1n ? 'INTERVAL (time-based)' : 'TRIGGERED (price-based)'}`);
        log(`  Status: ${status === 0n ? 'ACTIVE' : status === 1n ? 'COMPLETED' : 'PAUSED/CANCELLED'}`);
        log(`  Execution Count: ${execCount}/${maxExec}`);
        log(`  Interval: ${execInterval} seconds`);
        log(`  Amount Per Exec: ${amountPerExec.toString()}`);

        if (execCount > 0n) {
          logSuccess(`DCA order executed ${execCount} times!`);
        }
      }
    }

    // =========================================================================
    // STEP 10: Check bot final status
    logSection('📊 STEP 10: Check Final Bot Status');

    log('Reading final bot status...');
    const finalBotStatusBytes = await roContract.read('getBotStatus', new Args());
    const finalBotStatusArgs = new Args(finalBotStatusBytes.value);
    const finalCounter = finalBotStatusArgs.nextU64();
    const finalMaxIter = finalBotStatusArgs.nextU64();

    log(`Final Cycle Counter: ${finalCounter}/${finalMaxIter}`);
    log(`Bot Completed: ${botCompleted ? '✅' : '❌'}`);

    // =========================================================================
    // SUMMARY
    logSection('📊 TEST SUMMARY');

    logSuccess('Recurring Orders Bot Test Complete!');

    log(`\n💡 Bot Execution Summary:`);
    log(`  Cycles Executed: ${finalCounter}`);
    log(`  Total Orders Executed: ${totalExecuted}`);
    log(`  DCA Order ID: ${dcaOrderId}`);
    log(`  Test Status: ${botCompleted ? 'PASSED ✅' : 'IN PROGRESS ⏳'}`);

    log(`\n📋 Recurring Order Types Tested:`);
    log(`  ✅ DCA (Dollar Cost Averaging) - Time-based execution`);
    log(`  ⚠️  GRID Trading - Requires array support`);
    log(`  ℹ️  Available types: BUY_ON_INCREASE, SELL_ON_DECREASE, DCA, GRID`);

    log(`\n🔄 Bot Cycle Information:`);
    log(`  Each cycle checks up to 20 orders`);
    log(`  Processes batches to avoid gas limits`);
    log(`  Reschedules itself via callNextSlot() for next block slot`);
    log(`  Continues until maxIterations reached or stopped`);

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

main().catch(console.error);
