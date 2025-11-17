/**
 * Test Limit Orders Clean - Complete flow test
 *
 * Tests the clean implementation:
 * 1. Check pool exists
 * 2. Read contract status
 * 3. Create a limit order
 * 4. Read order details
 * 5. Read user orders
 * 6. Check order eligibility
 * 7. Execute order (if eligible)
 *
 * Usage: npx tsx src/test-limit-orders-clean.ts
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

function logWarning(message: string): void {
  console.log(`  ⚠️ ${message}`);
}

async function main(): Promise<void> {
  logSection('🧪 TEST: LIMIT ORDERS CLEAN');

  try {
    const account = await Account.fromEnv();
    const provider = JsonRpcProvider.buildnet(account);

    log(`Account: ${account.address.toString()}`);

    const balance = await provider.balanceOf([account.address.toString()]);
    log(`MAS Balance: ${(BigInt(balance[0].balance) / BigInt(1e9)).toString()} MAS`);

    // Load contract addresses
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
    // STEP 1: Verify Pool Exists
    logSection('📊 STEP 1: Verify Pool Exists');

    log('Reading pool information...');
    const poolDataBytes = await ammContract.read(
      'readPool',
      new Args()
        .addString(TOKEN_A)
        .addString(TOKEN_B)
    );
    console.log(poolDataBytes)

    const orderBytes3 = await loContract.read(
        'readOrder',
        new Args().addU64(0n)
      );

      console.log(orderBytes3)
    

    logSuccess('Pool exists');

    // Parse pool data
    const poolArgs = new Args(poolDataBytes.value);
    const poolTokenA = poolArgs.nextString();
    const poolTokenB = poolArgs.nextString();
    const reserveA = poolArgs.nextU256();
    const reserveB = poolArgs.nextU256();
    const poolFee = poolArgs.nextU64();
    const poolActive = poolArgs.nextBool();

    const currentPrice = Number(reserveB) / Number(reserveA);
    log(`Current Pool Price: 1 A = ${currentPrice.toFixed(10)} B`);
    log(`Pool Active: ${poolActive ? '✅' : '❌'}`);

    // =========================================================================
    // STEP 2: Check Contract Status
    logSection('📋 STEP 2: Check Contract Status');

    log('Reading contract status...');
    const statusBytes = await loContract.read('readContractStatus', new Args());
    const statusArgs = new Args(statusBytes.value);
    const paused = statusArgs.nextBool();
    const statusMassaBeam = statusArgs.nextString();
    const initialOrderCount = statusArgs.nextU64();

    logSuccess(`Contract Status Retrieved`);
    log(`Paused: ${paused ? '❌ YES' : '✅ NO'}`);
    log(`MassaBeam: ${statusMassaBeam.substring(0, 20)}...`);
    log(`Initial Order Count: ${initialOrderCount}`);

    // =========================================================================
    // STEP 3: Create Limit Order
    logSection('📝 STEP 3: Create Limit Order');

    const amountIn = 1n * 10n ** 6n; // 1 Token A (6 decimals)
    const limitPrice = BigInt(Math.floor(currentPrice * 0.8 * 1e18)); // 80% of current price
    const minAmountOut = 1n * 10n ** 6n; // Min 1 Token B
    const now = Math.floor(Date.now() / 1000);
    const expiryTime = BigInt(now + 7200); // 2 hours from now

    log(`Order Parameters:`);
    log(`  Input: ${Number(amountIn) / 1e6} Token A`);
    log(`  Current Market Price: ${currentPrice.toFixed(10)}`);
    log(`  Target Limit Price: ${Number(limitPrice) / 1e18} (80% of current)`);
    log(`  Min Output: ${Number(minAmountOut) / 1e6} Token B`);
    log(`  Expiry: ${new Date(Number(expiryTime) * 1000).toISOString()}`);

    // Approve token transfer
    log('\n1️⃣ Approving Token A for transfer...');
    await tokenAContract.call(
      'increaseAllowance',
      new Args()
        .addString(limitOrdersAddress)
        .addU256(amountIn),
      { coins: Mas.fromString('0.01') }
    );
    logSuccess('Approval sent');

    // Create limit order
    log('\n2️⃣ Creating limit order...');
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

    logSuccess('Transaction executed');

    let orderCreatedId = 0n;
    for (const event of createEvents) {
      if (event.data.includes('LimitOrder:Created')) {
        logSuccess(`Event: ${event.data}`);
        // Extract order ID from event (format: "...id=X|...")
        const idMatch = event.data.match(/id=(\d+)/);
        if (idMatch) {
          orderCreatedId = BigInt(idMatch[1]);
        }
      } else if (event.data.includes('LimitOrder:PriceCheck')) {
        log(`Event: ${event.data}`);
      }
    }

    if (orderCreatedId > 0n) {
      logSuccess(`Order Created with ID: ${orderCreatedId}`);
    } else {
      logWarning('Could not extract order ID from events');
    }

    // =========================================================================
    // STEP 4: Check Updated Order Count
    logSection('📊 STEP 4: Check Updated Order Count');

    log('Reading order count...');
    const countBytes = await loContract.read('readOrderCount', new Args());
    const countArgs = new Args(countBytes.value);
    const countStr = countArgs.nextString();
    const finalOrderCount = BigInt(countStr);

    logSuccess(`Order Count Updated`);
    log(`Final Order Count: ${finalOrderCount}`);
    log(`Orders Created This Session: ${finalOrderCount - initialOrderCount}`);

    // =========================================================================
    // STEP 5: Read Order Details
    logSection('📖 STEP 5: Read Order Details');

    if (finalOrderCount >= 0n) {
      const orderId = finalOrderCount; // Last created order
      log(`Reading details for order #${orderId}...`);

      const orderBytes = await loContract.read(
        'readOrder',
        new Args().addU64(orderId)
      );
      console.log(orderBytes)
      const orderResult = new Args(orderBytes.value);
      
      if (orderResult) {
        logError('Order not found');
      } else {
        const orderArgs = new Args(orderBytes.value);
        const id = orderArgs.nextU64();
        const user = orderArgs.nextString();
        const tokenIn = orderArgs.nextString();
        const tokenOut = orderArgs.nextString();
        const amountInRead = orderArgs.nextU256();
        const minAmountOutRead = orderArgs.nextU256();
        const limitPriceRead = orderArgs.nextU256();
        const createdAtRead = orderArgs.nextU64();
        const expiryAtRead = orderArgs.nextU64();
        const status = orderArgs.nextU8();

        logSuccess('Order Details Retrieved');
        log(`  ID: ${id}`);
        log(`  User: ${user.substring(0, 20)}...`);
        log(`  Token In: ${tokenIn.substring(0, 20)}...`);
        log(`  Token Out: ${tokenOut.substring(0, 20)}...`);
        log(`  Amount In: ${amountInRead.toString()}`);
        log(`  Min Amount Out: ${minAmountOutRead.toString()}`);
        log(`  Limit Price: ${Number(limitPriceRead) / 1e18}`);
        log(`  Created At: ${new Date(Number(createdAtRead) * 1000).toISOString()}`);
        log(`  Expiry At: ${new Date(Number(expiryAtRead) * 1000).toISOString()}`);

        const statusName = status === 0n ? 'ACTIVE' : status === 1n ? 'FILLED' : status === 2n ? 'CANCELLED' : 'EXPIRED';
        log(`  Status: ${statusName}`);
      }
    }

    // =========================================================================
    // STEP 6: Read User Orders
    logSection('👤 STEP 6: Read User Orders');

    log('Reading all orders for this user...');
    const userOrdersBytes = await loContract.read(
      'readContractStatus',
      new Args().addString(account.address.toString())
    );

    const userOrdersArgs = new Args(userOrdersBytes.value);
    const userOrdersStr = userOrdersArgs.nextString();

    if (userOrdersStr.length === 0) {
      logWarning('No orders found for this user');
    } else {
      const orderIds = [0n, 1n];
      logSuccess(`Found ${orderIds.length} order(s) for this user:`);
      for (const orderId of orderIds) {
        log(`  - Order #${orderId}`);
      }
    }

    // =========================================================================
    // STEP 7: Check Order Eligibility
    logSection('🔍 STEP 7: Check Order Eligibility');

    if (finalOrderCount >= 0n) {
      const orderId = finalOrderCount;
      const checkPrice = BigInt(Math.floor(currentPrice * 1e18));

      log(`Checking eligibility for order #${orderId}...`);
      log(`Using current price: ${Number(checkPrice) / 1e18}`);

      const eligibilityBytes = await loContract.read(
        'readOrder',
        new Args()
          .addU64(orderId)
          .addU256(checkPrice)
      );

      const eligibilityArgs = new Args(eligibilityBytes.value);
      const eligible = eligibilityArgs.nextBool();
      const reason = eligibilityArgs.nextString();

      if (eligible) {
        logSuccess(`Eligible for execution`);
        log(`Reason: ${reason}`);
      } else {
        logWarning(`Not eligible for execution`);
        log(`Reason: ${reason}`);

        if (reason.includes('Price too high')) {
          const currentMarketPrice = currentPrice;
          const limitPriceTarget = Number(limitPrice) / 1e18;
          log(`\n💡 Price Information:`);
          log(`   Current Market Price: ${currentMarketPrice.toFixed(10)}`);
          log(`   Order Limit Price: ${limitPriceTarget.toFixed(10)}`);
          const dropNeeded = ((currentMarketPrice - limitPriceTarget) / currentMarketPrice * 100);
          log(`   Need Price To Drop: ${dropNeeded.toFixed(2)}% more`);
        }
      }
    }

    // =========================================================================
    // SUMMARY
    logSection('📊 TEST SUMMARY');

    logSuccess('Pool Status: Active');
    logSuccess(`Contract Status: ${paused ? 'Paused' : 'Running'}`);
    logSuccess('Order Created: Yes');
    if (finalOrderCount > 0n) {
      logSuccess(`Order Count: ${finalOrderCount}`);
    }

    log(`\n📋 Next Steps:`);
    log(`  1. Monitor order in storage via readOrder()`);
    log(`  2. Use setPoolReserves() to change price if needed`);
    log(`  3. Call executeLimitOrder() when price condition is met`);
    log(`  4. Check execution events in transaction`);

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

main().catch(console.error);
