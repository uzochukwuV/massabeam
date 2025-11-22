/**
 * Test Limit Orders Bot - Fixed Debug Version
 *
 * FIX: Expiry time should be between 200-3600 seconds (in milliseconds)
 * FIX: Bot iterations set to 2500 for comprehensive testing
 *
 * Usage: npx tsx src/test-limit-orders-bot-fixed.ts
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

function logWarn(message: string): void {
  console.log(`  ⚠️  ${message}`);
}

function logEvent(data: string): void {
  console.log(`  📤 ${data}`);
}

function logDebug(data: string): void {
  console.log(`  🔍 ${data}`);
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  logSection('🤖 LIMIT ORDERS BOT - FIXED TEST');

  try {
    const account = await Account.fromEnv();
    const provider = JsonRpcProvider.buildnet(account);

    log(`Account: ${account.address.toString()}`);

    const deployed = loadAddresses();
    const massaBeamAddress = deployed.contracts.massaBeam;
    const limitOrdersAddress = deployed.contracts.limitOrders;

    log(`MassaBeam: ${massaBeamAddress}`);
    log(`LimitOrders: ${limitOrdersAddress}`);

    const ammContract = new SmartContract(provider, massaBeamAddress);
    const loContract = new SmartContract(provider, limitOrdersAddress);
    const tokenAContract = new SmartContract(provider, TOKEN_A);

    // =========================================================================
    // STEP 1: Check Pool & Get Current Price
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
    logSuccess(`Pool found`);
    log(`Reserve A: ${reserveA.toString()}`);
    log(`Reserve B: ${reserveB.toString()}`);
    log(`Current Price: 1 A = ${currentPrice.toFixed(10)} B`);

    // =========================================================================
    // STEP 2: Create multiple limit orders
    logSection('📝 STEP 2: Create Multiple Limit Orders');

    // FIXED: Expiry between 200-3600 seconds converted to milliseconds
    const limitPrice = BigInt(Math.floor(currentPrice * 0.5 * 1e18)); // 50% of current price
    const amountIn = 1n * 10n ** 6n;
    const minAmountOut = 1n * 10n ** 6n;
    const now = Date.now();
    const expiryTime = BigInt(now + 600000); // 600 seconds (10 minutes) in milliseconds

    log(`Expiry time: ${expiryTime} (${new Date(Number(expiryTime)).toISOString()})`);
    log(`Current time: ${now} (${new Date(now).toISOString()})`);
    log(`Delta: ${(Number(expiryTime) - now) / 1000} seconds`);

    const orderIds: bigint[] = [];
    const txHashes: string[] = [];

    for (let orderIdx = 0; orderIdx < 3; orderIdx++) {
      logDebug(`\nCreating order ${orderIdx + 1}...`);

      // Approve
      log(`Approving ${amountIn.toString()} tokens...`);
      await tokenAContract.call(
        'increaseAllowance',
        new Args()
          .addString(limitOrdersAddress)
          .addU256(amountIn),
        { coins: Mas.fromString('0.01') }
      );

      logSuccess(`Approval sent`);

      // Create
      log(`Sending order creation transaction...`);
      const createOrderArgs = new Args()
        .addString(TOKEN_A)
        .addString(TOKEN_B)
        .addU256(amountIn)
        .addU256(minAmountOut)
        .addU256(limitPrice)
        .addU64(expiryTime);

      const createTx = await loContract.call('createLimitOrder', createOrderArgs, {
        coins: Mas.fromString('0.5'),
        maxGas: BigInt(4000000000),
      });

      logDebug(`Tx ID: ${createTx.id}`);
      txHashes.push(createTx.id);

      await createTx.waitFinalExecution();
      const createEvents = await createTx.getFinalEvents();

      logDebug(`Received ${createEvents.length} events`);
      for (const event of createEvents) {
        logEvent(`${event.data}`);

        if (event.data.includes('LimitOrder:Created')) {
          logSuccess(`Order creation event found!`);
          const idMatch = event.data.match(/id=(\d+)/);
          if (idMatch) {
            const orderId = BigInt(idMatch[1]);
            orderIds.push(orderId);
            logSuccess(`Extracted Order ID: ${orderId}`);
          }
        }
      }

      logSuccess(`Order ${orderIdx + 1} transaction completed`);
      await sleep(500);
    }

    log(`\n📊 Order Creation Summary:`);
    log(`  Transactions sent: ${txHashes.length}`);
    log(`  Order IDs extracted: ${orderIds.length}`);

    // =========================================================================
    // STEP 3: Check active orders
    logSection('📖 STEP 3: Check Active Orders');

    log('Getting active orders from contract...');
    const activeOrdersBytes = await loContract.read('getActiveOrders', new Args());

    if (activeOrdersBytes.value.length === 0) {
      logWarn(`No active orders returned (empty response)`);
    } else {
      const activeOrdersArgs = new Args(activeOrdersBytes.value);
      const activeOrderCount = activeOrdersArgs.nextU64();
      log(`Active orders found: ${activeOrderCount}`);

      for (let i = 0; i < Number(activeOrderCount); i++) {
        const orderId = activeOrdersArgs.nextU64();
        log(`  - Order #${orderId}`);
      }
    }

    // =========================================================================
    // STEP 4: Start bot with more iterations
    logSection('🚀 STEP 4: Start Autonomous Bot');

    // FIXED: Set bot iterations to 2500 for comprehensive testing
    const maxIterations = 2500n;
    log(`Starting bot with maxIterations=${maxIterations}...`);
    const botStartTx = await loContract.call(
      'startBot',
      new Args().addU64(maxIterations),
      { coins: Mas.fromString('1'), maxGas: BigInt(4000000000) }
    );

    logDebug(`Bot start tx: ${botStartTx.id}`);
    await botStartTx.waitFinalExecution();
    const botStartEvents = await botStartTx.getFinalEvents();

    logDebug(`Received ${botStartEvents.length} bot start events`);
    for (const event of botStartEvents) {
      if (event.data.includes('Bot')) {
        logEvent(event.data);
      }
    }

    logSuccess('Bot started');

    // =========================================================================
    // STEP 5: Monitor bot execution
    logSection('👀 STEP 5: Monitor Bot Execution');

    log('Bot is running autonomously...\n');

    let finalStatus = { enabled: false, counter: 0n, maxIter: 0n, totalExec: 0n };

    for (let wait = 0; wait < 12; wait++) {
      await sleep(5000);

      const botStatusBytes = await loContract.read('readBotStatus', new Args());
      const botStatusArgs = new Args(botStatusBytes.value);
      const botEnabled = botStatusArgs.nextBool();
      const counter = botStatusArgs.nextU64();
      const maxIter = botStatusArgs.nextU64();
      const totalExec = botStatusArgs.nextU64();

      finalStatus = { enabled: botEnabled, counter, maxIter, totalExec };

      log(`[${wait + 1}/12] Cycle: ${counter}/${maxIter} | Executed: ${totalExec} | Enabled: ${botEnabled ? '✅' : '❌'}`);

      if (!botEnabled) {
        logSuccess('Bot has completed all cycles!');
        break;
      }
    }

    // =========================================================================
    // SUMMARY
    logSection('📊 TEST RESULTS');

    log(`\n✨ Autonomous Bot Test Summary:`);
    log(`  Orders Created: ${Math.max(orderIds.length)}`);
    log(`  Bot Cycles: ${finalStatus.counter}/${finalStatus.maxIter}`);
    log(`  Orders Executed: ${finalStatus.totalExec}`);
    log(`  Bot Status: ${finalStatus.enabled ? 'RUNNING' : 'STOPPED'}`);
    log(`  Pool Price: 1 A = ${currentPrice.toFixed(10)} B`);

    if (finalStatus.totalExec > 0n) {
      logSuccess(`✅ Bot successfully executed ${finalStatus.totalExec} orders autonomously!`);
      logSuccess(`✅ ALL TESTS PASSED`);
    } else {
      logWarn(`⚠️  Bot ran but did not execute orders (price condition not met)`);
      log(`To trigger execution:`);
      log(`  1. Lower current price via setPoolReserves()`);
      log(`  2. Or set limit price higher via new order`);
    }

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

main().catch(console.error);
