/**
 * Complete Limit Orders Test with Bot Execution
 * Tests limit order creation, price manipulation, and autonomous bot execution
 *
 * Usage: npx tsx src/test-limit-orders-full.ts
 */

import 'dotenv/config';
import {
  Account,
  Args,
  Mas,
  SmartContract,
  JsonRpcProvider,
  bytesToStr,
} from '@massalabs/massa-web3';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { USDC } from '@dusalabs/sdk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Token addresses
const TOKEN_A = 'AS1nDAemyLSLUuNZ747Dt3NgzEC9WGCkmjRvY9hZwW2928Fxb4Fk'; // USDC
const TOKEN_B = USDC[0].address; // Token B

function log(message: string): void {
  console.log(`  ${message}`);
}

function logSection(title: string): void {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  ${title}`);
  console.log(`${'═'.repeat(70)}`);
}

async function main(): Promise<void> {
  logSection('🤖 TEST: LIMIT ORDERS WITH BOT EXECUTION');

  try {
    // Setup
    const account = await Account.fromEnv();
    const provider = JsonRpcProvider.buildnet(account);

    log(`Account: ${account.address.toString()}`);

    const balance = await provider.balanceOf([account.address.toString()]);
    log(`MAS Balance: ${balance[0].balance.toString()}`);

    // Load contract addresses
    const addressesPath = path.join(__dirname, '..', 'deployed-addresses.json');
    if (!fs.existsSync(addressesPath)) {
      throw new Error('deployed-addresses.json not found! Deploy contracts first.');
    }

    const deployed = JSON.parse(fs.readFileSync(addressesPath, 'utf-8'));
    const massaBeamAddress = deployed.contracts.massaBeam;
    const limitOrdersAddress = deployed.contracts.limitOrders;

    log(`MassaBeam: ${massaBeamAddress}`);
    log(`LimitOrders: ${limitOrdersAddress}`);

    const ammContract = new SmartContract(provider, massaBeamAddress);
    const loContract = new SmartContract(provider, limitOrdersAddress);
    const tokenAContract = new SmartContract(provider, TOKEN_A);

    // Step 1: Read current pool state
    logSection('📊 READING POOL DATA');
    log('Reading current pool reserves...');

    const poolDataBytes = await ammContract.read(
      'readPool',
      new Args()
        .addString(TOKEN_A)
        .addString(TOKEN_B)
    );

    if (bytesToStr(poolDataBytes.value) === 'null') {
      throw new Error('Pool does not exist! Create pool first.');
    }

    const poolArgs = new Args(poolDataBytes.value);
    const poolTokenA = poolArgs.nextString();
    const poolTokenB = poolArgs.nextString();
    const reserveA = poolArgs.nextU256();
    const reserveB = poolArgs.nextU256();

    log('✅ Pool found!');
    log(`Reserve A: ${Number(reserveA) / 1e6} tokens (${reserveA.toString()} units)`);
    log(`Reserve B: ${Number(reserveB) / 1e6} tokens (${reserveB.toString()} units)`);

    const currentPrice = Number(reserveB) / Number(reserveA);
    log(`Current Price: 1 A = ${currentPrice.toFixed(6)} B`);

    // Step 2: Create a limit order
    logSection('📝 CREATING LIMIT ORDER');

    const amountIn = 5n * 10n ** 6n;              // 5 Token A
    const limitPrice = BigInt(Math.floor(Number(reserveB) / Number(reserveA) * 0.5 * 1e18)); // 50% of current
    const minAmountOut = 1n * 10n ** 6n;          // Min 1 Token B
    const expiryTime = BigInt(Math.floor(Date.now()) + 7200000); // 2 hours

    log(`Creating limit order to buy Token B at 50% of current price`);
    log(`  Input: 5 Token A`);
    log(`  Target Price: ${Number(limitPrice) / 1e18} B per A`);
    log(`  Minimum Output: 1 Token B`);

    // Approve token
    log('\n1️⃣ Approving Token A...');
    await tokenAContract.call(
      'increaseAllowance',
      new Args()
        .addString(limitOrdersAddress)
        .addU256(amountIn),
      { coins: Mas.fromString('0.01') }
    );
    log('✅ Approved');

    // Create limit order
    log('\n2️⃣ Creating limit order...');
    const createOrderArgs = new Args()
      .addString(TOKEN_A)        // tokenIn
      .addString(TOKEN_B)        // tokenOut
      .addU256(amountIn)         // amountIn
      .addU256(minAmountOut)     // minAmountOut
      .addU256(limitPrice)       // limitPrice
      .addU64(expiryTime);       // expiryTime

    const createTx = await loContract.call('createLimitOrder', createOrderArgs, {
      coins: Mas.fromString('0.5'),
      maxGas: BigInt(4000000000),
    });

    await createTx.waitFinalExecution();
    const createEvents = await createTx.getFinalEvents();

    let orderCreated = false;
    for (const event of createEvents) {
      if (event.data.includes('LimitOrder:Created')) {
        orderCreated = true;
        break;
      }
    }

    if (orderCreated) {
      log('✅ Limit order created!');
    } else {
      throw new Error('Order creation failed');
    }

    // Step 3: Start the bot for autonomous execution
    logSection('🤖 STARTING BOT FOR AUTONOMOUS EXECUTION');

    log('Starting bot to autonomously execute orders...');
    log('The bot will check and execute eligible orders periodically');

    const startBotArgs = new Args()
      .addU64(100n); // Max 100 iterations

    const botTx = await loContract.call('startBot', startBotArgs, {
      coins: Mas.fromString('0.5'),
      maxGas: BigInt(2000000000),
    });

    await botTx.waitFinalExecution();
    const botEvents = await botTx.getFinalEvents();

    let botStarted = false;
    for (const event of botEvents) {
      if (event.data.includes('BotStarted')) {
        botStarted = true;
        break;
      }
    }

    if (botStarted) {
      log('✅ Bot started successfully!');
      log('Bot will now automatically check and execute eligible orders');
    }

    // Step 4: Manipulate price to trigger the order
    logSection('💹 SIMULATING PRICE CHANGE');

    log('Simulating large swap to move price down...');
    log('(This will trigger the bot to execute the limit order)');

    // Need to swap enough to reach the limit price
    const swapAmount = 100n * 10n ** 6n; // Large swap

    log('\n3️⃣ Simulating price change...');
    const priceChangeArgs = new Args()
      .addString(TOKEN_A)
      .addString(TOKEN_B)
      .addU256(swapAmount);

    const priceTx = await ammContract.call('simulatePriceChange', priceChangeArgs, {
      coins: Mas.fromString('0.5'),
      maxGas: BigInt(4000000000),
    });

    await priceTx.waitFinalExecution();
    const priceEvents = await priceTx.getFinalEvents();

    log('✅ Price simulation executed');
    console.log(priceEvents);

    // Step 5: Check updated pool price
    logSection('📊 CHECKING NEW POOL STATE');

    const updatedPoolBytes = await ammContract.read(
      'readPool',
      new Args()
        .addString(TOKEN_A)
        .addString(TOKEN_B)
    );

    const updatedPoolArgs = new Args(updatedPoolBytes.value);
    updatedPoolArgs.nextString(); // skip tokenA
    updatedPoolArgs.nextString(); // skip tokenB
    const newReserveA = updatedPoolArgs.nextU256();
    const newReserveB = updatedPoolArgs.nextU256();

    const newPrice = Number(newReserveB) / Number(newReserveA);
    const priceChange = ((newPrice - currentPrice) / currentPrice * 100);

    log(`New Price: 1 A = ${newPrice.toFixed(6)} B`);
    log(`Price Change: ${priceChange.toFixed(2)}%`);

    if (newPrice < Number(limitPrice) / 1e18) {
      log(`✅ Price has fallen below limit price!`);
      log(`Bot should execute the limit order automatically`);
    } else {
      log(`Price is still above limit price`);
      log(`Order will execute when price falls further`);
    }

    // Step 6: Get bot execution status
    logSection('🔍 BOT EXECUTION STATUS');

    const orderCountBytes = await loContract.read('getOrderCount', new Args());
    const orderCount = bytesToStr(orderCountBytes.value);
    log(`Total Orders: ${orderCount}`);

    // Check if order is eligible
    const eligibleArgs = new Args().addU64(1n); // Check order ID 1
    const eligibleBytes = await loContract.read('isOrderEligible', eligibleArgs);

    // Parse boolean from serialized Args
    const eligibleArgsResult = new Args(eligibleBytes.value);
    const isEligible = eligibleArgsResult.nextBool();

    if (isEligible) {
      log('✅ Order is eligible for execution');
      log('Bot should pick it up and execute on next cycle');
    } else {
      log('❌ Order is not yet eligible');
      log('Either price condition not met or waiting for MEV protection delay');
    }

    logSection('✨ TEST COMPLETE');
    log('Bot is running autonomously');
    log('Orders will be executed when price conditions are met');

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
