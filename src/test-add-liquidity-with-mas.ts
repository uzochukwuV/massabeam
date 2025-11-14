/**
 * Add Liquidity with MAS Test
 * Tests addLiquidityWithMAS function for MAS/Token pool
 *
 * Reads actual pool data and calculates optimal amounts based on current reserves
 *
 * Usage: npx tsx src/test-add-liquidity-with-mas.ts
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
import { calculateOptimalAmountB, applySlippage } from './utils/liquidity-helper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Token address - USDC from pool (6 decimals)
const TOKEN = 'AS1nDAemyLSLUuNZ747Dt3NgzEC9WGCkmjRvY9hZwW2928Fxb4Fk'; // USDC
const WMAS_ADDRESS = 'AS1TyABhGT2YUPuGFxeEaJJ4Fq8s4fqEEZW9W4zKFkkGcHr4AC1t';

function log(message: string): void {
  console.log(`  ${message}`);
}

function logSection(title: string): void {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  ${title}`);
  console.log(`${'═'.repeat(70)}`);
}

async function main(): Promise<void> {
  logSection('🧪 TEST: ADD LIQUIDITY WITH NATIVE MAS');

  try {
    // Setup
    const account = await Account.fromEnv();
    const provider = JsonRpcProvider.buildnet(account);

    log(`Account: ${account.address.toString()}`);

    const balance = await provider.balanceOf([account.address.toString()]);
    log(`MAS Balance: ${balance[0].balance.toString()}`);

    // Load MassaBeam address
    const addressesPath = path.join(__dirname, '..', 'deployed-addresses.json');
    if (!fs.existsSync(addressesPath)) {
      throw new Error('deployed-addresses.json not found! Deploy contracts first.');
    }

    const deployed = JSON.parse(fs.readFileSync(addressesPath, 'utf-8'));
    const massaBeamAddress = deployed.contracts.massaBeam;

    log(`MassaBeam: ${massaBeamAddress}`);
    log(`WMAS: ${WMAS_ADDRESS}`);
    log(`Token (USDC): ${TOKEN}`);

    const ammContract = new SmartContract(provider, massaBeamAddress);
    const tokenContract = new SmartContract(provider, TOKEN);

    // Step 0: Read current pool data
    logSection('📊 READING POOL DATA');
    log('Reading current WMAS/USDC pool reserves...');

    const poolDataBytes = await ammContract.read(
      'readPool',
      new Args()
        .addString(WMAS_ADDRESS)
        .addString(TOKEN)
    );

    if (bytesToStr(poolDataBytes.value) === 'null') {
      throw new Error('Pool does not exist!');
    }

    // Deserialize pool data
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
    log(`Reserve A (WMAS): ${Number(reserveA) / 1e9} (${reserveA.toString()} units)`);
    log(`Reserve B (USDC): ${Number(reserveB) / 1e6} (${reserveB.toString()} units)`);
    log(`Total Supply: ${totalSupply.toString()}`);
    log(`Fee: ${fee} basis points`);

    // Calculate price from reserves
    const priceWmas = Number(reserveB) / Number(reserveA);
    log(`Current Price: 1 WMAS = ${priceWmas.toFixed(6)} USDC`);

    // Calculate optimal amounts
    logSection('💧 CALCULATING OPTIMAL AMOUNTS');

    // Provide 0.1 MAS and calculate optimal USDC needed
    const masAmountDesired = Mas.fromString('0.1');     // 0.1 MAS (100 million units)
    const masAmountDesiredU256 = 1n * 10n ** 8n;        // 0.1 WMAS in smallest units

    // Calculate optimal USDC = (0.1 * reserveB) / reserveA
    const usdcAmountOptimal = calculateOptimalAmountB(
      masAmountDesiredU256,
      reserveA,
      reserveB
    );

    // Apply 10% slippage tolerance for minimums (conservative)
    const usdcAmountDesired = usdcAmountOptimal;
    const usdcAmountMin = applySlippage(usdcAmountOptimal, 10);
    const masAmountMin = Mas.fromString('0.08');

    log(`Input MAS: ${masAmountDesired.toString()} MAS`);
    log(`Optimal USDC: ${Number(usdcAmountOptimal) / 1e6} USDC (${usdcAmountOptimal.toString()} units)`);
    log(`Min USDC (10% slippage): ${Number(usdcAmountMin) / 1e6} USDC (${usdcAmountMin.toString()} units)`);
    log(`Min MAS: ${masAmountMin.toString()} MAS`);

    logSection('💧 ADDING LIQUIDITY WITH MAS');
    log(`Desired MAS Amount: ${masAmountDesired.toString()} MAS`);
    log(`Desired USDC Amount: ${Number(usdcAmountDesired) / 1e6} USDC`);
    log(`Minimum USDC Amount: ${Number(usdcAmountMin) / 1e6} USDC (10% slippage)`);
    log(`Minimum MAS Amount: ${masAmountMin.toString()} MAS`);

    // Step 1: Approve USDC token
    log('\n1️⃣ Approving USDC...');
    await tokenContract.call(
      'increaseAllowance',
      new Args()
        .addString(massaBeamAddress)
        .addU256(usdcAmountDesired),
      { coins: Mas.fromString('0.01') }
    );
    log('✅ USDC approved');

    // Step 2: Add liquidity with MAS
    log('\n2️⃣ Adding liquidity with MAS...');
    const deadline = 3600000n; // 1 hour in ms

    const addLiquidityWithMASArgs = new Args()
      .addString(TOKEN)              // token address (USDC)
      .addU256(usdcAmountDesired)    // tokenAmountDesired
      .addU256(usdcAmountMin)        // tokenAmountMin
      .addU64(BigInt(masAmountMin.toString().split('.')[0]))  // masAmountMin
      .addU64(deadline);             // deadline

    const tx = await ammContract.call('addLiquidityWithMAS', addLiquidityWithMASArgs, {
      coins: masAmountDesired,
      maxGas: BigInt(4000000000),
    });

    await tx.waitFinalExecution();
    const events = await tx.getFinalEvents();
    console.log(events);

    log('✅ Liquidity added with MAS successfully!');
    log(`   Sent: ${masAmountDesired.toString()} MAS + ${Number(usdcAmountDesired) / 1e6} USDC`);
    log(`   Received LP tokens proportional to liquidity share`);

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
