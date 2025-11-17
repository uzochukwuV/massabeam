/**
 * Test Limit Orders Bot - Autonomous Execution Test
 *
 * Tests the autonomous bot functionality:
 * 1. Create multiple limit orders
 * 2. Start autonomous bot
 * 3. Monitor bot execution via events
 * 4. Check bot status and execution counts
 * 5. Verify orders are being executed autonomously
 *
 * Usage: npx tsx src/test-limit-orders-bot.ts
 */

import 'dotenv/config';
import {
  Account,
  Args,
  Mas,
  SmartContract,
  JsonRpcProvider,
} from '@massalabs/massa-web3';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { USDC } from '@dusalabs/sdk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

function logEvent(data: string): void {
  console.log(`  📤 ${data}`);
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  logSection('🤖 TEST: LIMIT ORDERS BOT - AUTONOMOUS EXECUTION');

  try {
    const account = await Account.fromEnv();
    const provider = JsonRpcProvider.buildnet(account);

    log(`Account: ${account.address.toString()}`);

    const addressesPath = path.join(__dirname, '', 'deployed-addresses.json');
    if (!fs.existsSync(addressesPath)) {
      throw new Error('deployed-addresses.json not found!');
    }

    const deployed = JSON.parse(fs.readFileSync(addressesPath, 'utf-8'));
    const massaBeamAddress = deployed.contracts.massaBeam;
    const limitOrdersAddress = deployed.contracts.limitOrders;

    log(`MassaBeam: ${massaBeamAddress}`);
    log(`LimitOrders: ${limitOrdersAddress}`);

    const ammContract = new SmartContract(provider, massaBeamAddress);
    const loContract = new SmartContract(provider, limitOrdersAddress);
    const tokenAContract = new SmartContract(provider, TOKEN_A);

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
    logSuccess(`Pool found`);
    log(`Current Price: 1 A = ${currentPrice.toFixed(10)} B`);

    // =========================================================================
    // STEP 2: Check initial bot status
    logSection('📋 STEP 2: Check Initial Bot Status');

    log('Reading bot status...');
    const botStatusBytes = await loContract.read('readBotStatus', new Args());
    const botStatusArgs = new Args(botStatusBytes.value);
    const initialBotEnabled = botStatusArgs.nextBool();
    const initialCounter = botStatusArgs.nextU64();
    const initialMaxIter = botStatusArgs.nextU64();
    const initialTotalExec = botStatusArgs.nextU64();

    log(`Bot Enabled: ${initialBotEnabled ? '✅' : '❌'}`);
    log(`Cycle Counter: ${initialCounter}`);
    log(`Max Iterations: ${initialMaxIter}`);
    log(`Total Executed: ${initialTotalExec}`);

    // =========================================================================
    // STEP 3: Create multiple limit orders
    logSection('📝 STEP 3: Create Multiple Limit Orders');

    const limitPrice = BigInt(Math.floor(currentPrice * 0.5 * 1e18)); // 50% of current price
    const amountIn = 1n * 10n ** 6n;
    const minAmountOut = 1n * 10n ** 6n;
    const now = Math.floor(Date.now() / 1000);
    const expiryTime = BigInt(now + 3600);

    const orderIds: bigint[] = [];

    for (let orderIdx = 0; orderIdx < 3; orderIdx++) {
      log(`\nCreating order ${orderIdx + 1}...`);

      // Approve
      await tokenAContract.call(
        'increaseAllowance',
        new Args()
          .addString(limitOrdersAddress)
          .addU256(amountIn),
        { coins: Mas.fromString('0.01') }
      );

      logSuccess(`Approval ${orderIdx + 1} sent`);

      // Create
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

      await createTx.waitFinalExecution();
      const createEvents = await createTx.getFinalEvents();

      for (const event of createEvents) {
        if (event.data.includes('LimitOrder:Created')) {
          logEvent(event.data);
          const idMatch = event.data.match(/id=(\d+)/);
          if (idMatch) {
            orderIds.push(BigInt(idMatch[1]));
          }
        } else if (event.data.includes('LimitOrder:')) {
          logEvent(event.data);
        }
      }

      logSuccess(`Order ${orderIdx + 1} created`);
      await sleep(1000);
    }

    log(`\nTotal orders created: ${orderIds.length}`);
    for (const orderId of orderIds) {
      log(`  - Order #${orderId}`);
    }

    // =========================================================================
    // STEP 4: Start bot
    logSection('🚀 STEP 4: Start Autonomous Bot');

    log('Starting bot with maxIterations=10...');
    const botStartTx = await loContract.call(
      'startBot',
      new Args().addU64(10n),
      { coins: Mas.fromString('0.5'), maxGas: BigInt(4000000000) }
    );

    await botStartTx.waitFinalExecution();
    const botStartEvents = await botStartTx.getFinalEvents();

    for (const event of botStartEvents) {
      if (event.data.includes('Bot')) {
        logEvent(event.data);
      }
    }

    logSuccess('Bot started');

    // =========================================================================
    // STEP 5: Monitor bot execution
    logSection('👀 STEP 5: Monitor Bot Execution');

    log('Waiting for bot cycles...');
    log('(This may take 30-60 seconds as bot runs autonomously)\n');

    for (let wait = 0; wait < 12; wait++) {
      await sleep(5000);

      const botStatusBytes = await loContract.read('readBotStatus', new Args());
      const botStatusArgs = new Args(botStatusBytes.value);
      const botEnabled = botStatusArgs.nextBool();
      const counter = botStatusArgs.nextU64();
      const maxIter = botStatusArgs.nextU64();
      const totalExec = botStatusArgs.nextU64();

      log(`[${wait + 1}/12] Bot State: enabled=${botEnabled}, cycle=${counter}/${maxIter}, executed=${totalExec}`);

      if (!botEnabled) {
        logSuccess('Bot completed!');
        break;
      }
    }

    // =========================================================================
    // STEP 6: Check final bot status
    logSection('📊 STEP 6: Check Final Bot Status');

    log('Reading final bot status...');
    const finalBotStatusBytes = await loContract.read('readBotStatus', new Args());
    const finalBotStatusArgs = new Args(finalBotStatusBytes.value);
    const finalBotEnabled = finalBotStatusArgs.nextBool();
    const finalCounter = finalBotStatusArgs.nextU64();
    const finalMaxIter = finalBotStatusArgs.nextU64();
    const finalTotalExec = finalBotStatusArgs.nextU64();

    log(`Bot Enabled: ${finalBotEnabled ? '✅' : '❌'}`);
    log(`Cycles Executed: ${finalCounter}/${finalMaxIter}`);
    log(`Orders Executed: ${finalTotalExec}`);

    if (finalTotalExec > 0n) {
      logSuccess(`Bot executed ${finalTotalExec} orders!`);
    } else {
      log('⚠️  No orders were executed (price condition not met)');
    }

    // =========================================================================
    // STEP 7: Check order statuses
    logSection('📖 STEP 7: Check Order Statuses');

    for (const orderId of orderIds) {
      log(`Checking order #${orderId}...`);

      const orderBytes = await loContract.read(
        'readOrder',
        new Args().addU64(orderId)
      );

      const orderResult = new TextDecoder().decode(orderBytes.value);
      if (orderResult === 'null') {
        logError(`Order #${orderId} not found`);
      } else {
        const orderArgs = new Args(orderBytes.value);
        const id = orderArgs.nextU64();
        orderArgs.nextString(); // user
        orderArgs.nextString(); // tokenIn
        orderArgs.nextString(); // tokenOut
        orderArgs.nextU256(); // amountIn
        orderArgs.nextU256(); // minAmountOut
        orderArgs.nextU256(); // limitPrice
        orderArgs.nextU64(); // createdAt
        orderArgs.nextU64(); // expiryAt
        const status = orderArgs.nextU8();

        const statusName = status === 0n ? 'ACTIVE' : status === 1n ? 'FILLED' : status === 2n ? 'CANCELLED' : 'EXPIRED';
        log(`  Status: ${statusName}`);

        if (status === 1n) {
          logSuccess(`Order #${orderId} was FILLED by bot!`);
        }
      }
    }

    // =========================================================================
    // SUMMARY
    logSection('📊 TEST SUMMARY');

    if (finalTotalExec > 0n) {
      logSuccess(`Bot successfully executed ${finalTotalExec} orders autonomously!`);
      logSuccess(`All autonomous execution tests PASSED`);
    } else {
      log('⚠️  Bot ran ${finalCounter} cycles but no orders were executed');
      log('Reason: Price condition not met (current price > limit price)');
      log('To trigger execution, use: setPoolReserves() to lower reserve ratio');
    }

    log(`\n💡 Bot Execution Summary:`);
    log(`  Total Cycles: ${finalCounter}`);
    log(`  Orders Executed: ${finalTotalExec}`);
    log(`  Execution Rate: ${finalCounter > 0n ? ((Number(finalTotalExec) / Number(finalCounter)) * 100).toFixed(1) : 0}%`);

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

main().catch(console.error);
