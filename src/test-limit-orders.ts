/**
 * Limit Orders Test
 * Tests limit order creation and execution with price changes
 *
 * Usage: npx tsx src/test-limit-orders.ts
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
  logSection('🧪 TEST: LIMIT ORDERS');

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
    log(`Token A: ${TOKEN_A}`);
    log(`Token B: ${TOKEN_B}`);

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
    const totalSupply = poolArgs.nextU256();
    const fee = poolArgs.nextU64();

    log('✅ Pool found!');
    log(`Token A: ${poolTokenA}`);
    log(`Token B: ${poolTokenB}`);
    log(`Reserve A: ${Number(reserveA) / 1e6} (${reserveA.toString()} units)`);
    log(`Reserve B: ${Number(reserveB) / 1e6} (${reserveB.toString()} units)`);

    const currentPrice = Number(reserveB) / Number(reserveA);
    log(`Current Price: 1 A = ${currentPrice.toFixed(6)} B`);

    // Step 2: Create a limit order
    logSection('📝 CREATING LIMIT ORDER');

    // Order: buy B at a lower price (limit price = current price * 0.8)
    const amountIn = 10n * 10n ** 6n;              // 10 Token A
    const limitPrice = BigInt(Math.floor(Number(reserveB) / Number(reserveA) * 0.8 * 1e18)); // Target price in 18 decimals
    const minAmountOut = 5n * 10n ** 6n;           // Min 5 Token B
    const expiryTime = BigInt(Math.floor(Date.now()) + 3600000); // 1 hour from now (in milliseconds)

    log(`Creating limit order:`);
    log(`  Input: ${Number(amountIn) / 1e6} Token A`);
    log(`  Target Price: ${Number(limitPrice) / 1e18} B per A (80% of current)`);
    log(`  Minimum Output: ${Number(minAmountOut) / 1e6} Token B`);
    log(`  Expiry: 1 hour from now`);

    // Approve token
    log('\n1️⃣ Approving Token A for limit order...');
    await tokenAContract.call(
      'increaseAllowance',
      new Args()
        .addString(limitOrdersAddress)
        .addU256(amountIn),
      { coins: Mas.fromString('0.01') }
    );
    log('✅ Token A approved');

    // Create limit order
    log('\n2️⃣ Creating limit order...');
    const createOrderArgs = new Args()
      .addString(TOKEN_A)        // tokenIn
      .addString(TOKEN_B)        // tokenOut
      .addU256(amountIn)         // amountIn
      .addU256(minAmountOut)     // minAmountOut
      .addU256(limitPrice)       // limitPrice
      .addU64(expiryTime)        // expiryTime
      .addU64(100n);             // maxSlippage (1%)

    const createTx = await loContract.call('createLimitOrder', createOrderArgs, {
      coins: Mas.fromString('0.5'),
      maxGas: BigInt(4000000000),
    });

    await createTx.waitFinalExecution();
    const createEvents = await createTx.getFinalEvents();
    console.log(createEvents);

    log('✅ Limit order created!');

    // Step 3: Manipulate price to trigger the order
    logSection('💹 MANIPULATING PRICE TO TRIGGER ORDER');

    log('Current price is too high. Simulating large swap to lower price...');
    log('(In real scenario, market would naturally move price)');

    // Simulate price change by swapping a large amount
    const swapAmount = 50n * 10n ** 6n; // Swap 50 Token A

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
    console.log(priceEvents);

    log('✅ Price simulation complete!');

    // Step 4: Read updated pool price
    logSection('📊 READING UPDATED POOL DATA');

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
    log(`New Price: 1 A = ${newPrice.toFixed(6)} B`);
    log(`Price Change: ${((newPrice - currentPrice) / currentPrice * 100).toFixed(2)}%`);

    if (newPrice < Number(limitPrice) / 1e18) {
      log(`✅ Price has fallen below limit price! Order can be executed.`);
    } else {
      log(`❌ Price is still above limit price. Order cannot execute yet.`);
    }

    logSection('✨ TEST COMPLETE');

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
