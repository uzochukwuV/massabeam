/**
 * Test Limit Orders Bot - Corrected Price Calculation
 *
 * FIX: Use swap-quote-based price (what the contract uses)
 * NOT reserve-ratio-based price
 *
 * Usage: npx tsx src/test-limit-orders-bot-corrected.ts
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
  logSection('🤖 LIMIT ORDERS BOT - CORRECTED PRICE TEST');

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
    // STEP 1: Get current price using SWAP QUOTE (what contract uses)
    logSection('📊 STEP 1: Get Current Price via Swap Quote');

    const amountIn = 1n * 10n ** 6n; // 1 token (6 decimals)

    log(`Querying price for: ${amountIn.toString()} TOKEN_A`);
    const priceDataBytes = await ammContract.read(
      'readQuoteSwapExactInput',
      new Args()
        .addString(TOKEN_A)
        .addString(TOKEN_B)
        .addU256(amountIn)
    );

    const priceArgs = new Args(priceDataBytes.value);
    const currentSwapPrice = priceArgs.nextU256(); // This is amountOut for 1 token
    const poolFee = priceArgs.nextU64();

    logSuccess(`Swap quote received`);
    log(`  For 1 TOKEN_A, you get: ${currentSwapPrice.toString()} TOKEN_B`);
    log(`  Pool Fee: ${poolFee} basis points`);

    // Also get reserve-based price for reference
    log(`\nQuerying pool reserves...`);
    const poolDataBytes = await ammContract.read(
      'readPool',
      new Args()
        .addString(TOKEN_A)
        .addString(TOKEN_B)
    );

    const poolArgs = new Args(poolDataBytes.value);
    poolArgs.nextString(); // tokenA
    poolArgs.nextString(); // tokenB
    const reserveA = poolArgs.nextU256();
    const reserveB = poolArgs.nextU256();

    log(`  Reserve A: ${reserveA.toString()}`);
    log(`  Reserve B: ${reserveB.toString()}`);
    log(`  Reserve-ratio price: ${Number(reserveB) / Number(reserveA)}`);

    // =========================================================================
    // STEP 2: Set limit price LOWER than current price to trigger execution
    logSection('📝 STEP 2: Create Limit Orders');

    // Set limit price to 50% of current swap price
    // This will trigger execution when price becomes favorable
    const limitPrice = currentSwapPrice / 2n;

    log(`Current swap price: ${currentSwapPrice.toString()}`);
    log(`Limit price (50%): ${limitPrice.toString()}`);

    const minAmountOut = 1n;
    const now = Date.now();
    const expiryDuration = 600n; // 600 seconds

    log(`\nOrder parameters:`);
    log(`  Amount In: ${amountIn.toString()}`);
    log(`  Min Amount Out: ${minAmountOut.toString()}`);
    log(`  Limit Price: ${limitPrice.toString()}`);
    log(`  Expiry Duration: ${expiryDuration} seconds`);

    const orderIds: bigint[] = [];

    for (let orderIdx = 0; orderIdx < 2; orderIdx++) {
      logDebug(`\nCreating order ${orderIdx + 1}...`);

      // Approve
      await tokenAContract.call(
        'increaseAllowance',
        new Args()
          .addString(limitOrdersAddress)
          .addU256(amountIn),
        { coins: Mas.fromString('0.01') }
      );

      logSuccess(`Approval sent`);

      // Create order
      const createTx = await loContract.call('createLimitOrder',
        new Args()
          .addString(TOKEN_A)
          .addString(TOKEN_B)
          .addU256(amountIn)
          .addU256(minAmountOut)
          .addU256(limitPrice)
          .addU64(expiryDuration),
        { coins: Mas.fromString('0.5'), maxGas: BigInt(4000000000) }
      );

      await createTx.waitFinalExecution();
      const events = await createTx.getFinalEvents();

      for (const event of events) {
        logEvent(event.data);
        if (event.data.includes('LimitOrder:Created')) {
          const idMatch = event.data.match(/id=(\d+)/);
          if (idMatch) {
            orderIds.push(BigInt(idMatch[1]));
            logSuccess(`Order #${idMatch[1]} created`);
          }
        }
      }

      await sleep(500);
    }

    log(`\n📊 Created ${orderIds.length} orders`);

    // =========================================================================
    // STEP 3: Start bot
    logSection('🚀 STEP 3: Start Autonomous Bot');

    const maxIterations = 100n;
    log(`Starting bot with maxIterations=${maxIterations}...`);

    const botTx = await loContract.call(
      'startBot',
      new Args().addU64(maxIterations),
      { coins: Mas.fromString('1'), maxGas: BigInt(4000000000) }
    );

    await botTx.waitFinalExecution();
    const botEvents = await botTx.getFinalEvents();

    for (const event of botEvents) {
      if (event.data.includes('Bot')) {
        logEvent(event.data);
      }
    }

    logSuccess('Bot started');

    // =========================================================================
    // STEP 4: Monitor execution
    logSection('👀 STEP 4: Monitor Bot Execution');

    log('Waiting for bot cycles...\n');

    for (let wait = 0; wait < 6; wait++) {
      await sleep(5000);

      const statusBytes = await loContract.read('readBotStatus', new Args());
      const statusArgs = new Args(statusBytes.value);
      const enabled = statusArgs.nextBool();
      const counter = statusArgs.nextU64();
      const maxIter = statusArgs.nextU64();
      const totalExec = statusArgs.nextU64();

      log(`[${wait + 1}/6] Cycle: ${counter}/${maxIter} | Executed: ${totalExec} | Running: ${enabled ? '✅' : '❌'}`);

      if (!enabled) {
        logSuccess('Bot completed!');
        break;
      }
    }

    // =========================================================================
    // SUMMARY
    logSection('📊 TEST SUMMARY');

    const finalStatusBytes = await loContract.read('readBotStatus', new Args());
    const finalStatusArgs = new Args(finalStatusBytes.value);
    const finalEnabled = finalStatusArgs.nextBool();
    const finalCounter = finalStatusArgs.nextU64();
    const finalMaxIter = finalStatusArgs.nextU64();
    const finalExec = finalStatusArgs.nextU64();

    log(`\n✨ Results:`);
    log(`  Orders Created: ${orderIds.length}`);
    log(`  Bot Cycles: ${finalCounter}/${finalMaxIter}`);
    log(`  Orders Executed: ${finalExec}`);
    log(`  Status: ${finalEnabled ? 'RUNNING' : 'STOPPED'}`);

    if (finalExec > 0n) {
      logSuccess(`✅ Bot executed ${finalExec} orders!`);
      logSuccess(`✅ PRICE CALCULATION WAS CORRECT`);
    } else {
      logWarn(`⚠️  Bot didn't execute orders`);
      log(`\nDebug info:`);
      log(`  Current price from contract: ${currentSwapPrice.toString()}`);
      log(`  Limit price set: ${limitPrice.toString()}`);
      log(`  Condition: currentPrice (${currentSwapPrice}) <= limitPrice (${limitPrice})`);
      log(`  Result: ${currentSwapPrice <= limitPrice}`);
    }

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

main().catch(console.error);
