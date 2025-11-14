/**
 * Pool Read Operations Test
 * Tests all read functions for pool data
 * 
 * Usage: npx tsx src/test-read-pools.ts
 */

import 'dotenv/config';
import {
  Account,
  Args,
  SmartContract,
  JsonRpcProvider,
  bytesToStr,
  bytesToF64,
} from '@massalabs/massa-web3';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const WMAS_ADDRESS = 'AS1TyABhGT2YUPuGFxeEaJJ4Fq8s4fqEEZW9W4zKFkkGcHr4AC1t';
const USDC_ADDRESS = 'AS1nDAemyLSLUuNZ747Dt3NgzEC9WGCkmjRvY9hZwW2928Fxb4Fk';
const TOKEN_B = 'AS1GrZXNAdVUtCbWC3FE3kajmaEg6FxiE9cxQuYBM3KQELGjEE31';

function log(message: string): void {
  console.log(`  ${message}`);
}

function logSection(title: string): void {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  ${title}`);
  console.log(`${'═'.repeat(70)}`);
}

async function main(): Promise<void> {
  logSection('📖 TEST: READ POOL DATA');

  try {
    const account = await Account.fromEnv();
    const provider = JsonRpcProvider.buildnet(account);
    
    log(`Account: ${account.address.toString()}`);

    // Load MassaBeam address
    const addressesPath = path.join(__dirname, '..', 'deployed-addresses.json');
    const deployed = JSON.parse(fs.readFileSync(addressesPath, 'utf-8'));
    const massaBeamAddress = deployed.contracts.massaBeam;
    
    log(`MassaBeam: ${massaBeamAddress}`);

    const ammContract = new SmartContract(provider, massaBeamAddress);

    // 1. Read Pool Count
    logSection('1️⃣ POOL COUNT');
    const poolCount = await ammContract.read('readPoolCount');
    log(`Total Pools: ${bytesToStr(poolCount.value)}`);

    // 2. Read Pool Data (WMAS/USDC)
    logSection('2️⃣ POOL DATA: WMAS/USDC');
    const poolData = await ammContract.read(
      'readPool',
      new Args()
        .addString(WMAS_ADDRESS)
        .addString(USDC_ADDRESS)
    );
    
    if (bytesToStr(poolData.value) === 'null') {
      log('Pool does not exist');
    } else {
      const args = new Args(poolData.value);
      const tokenA = args.nextString();
      const tokenB = args.nextString();
      const reserveA = args.nextU256();
      const reserveB = args.nextU256();
      const totalSupply = args.nextU256();
      const fee = args.nextU64();
      
      log(`Token A: ${tokenA}`);
      log(`Token B: ${tokenB}`);
      log(`Reserve A: ${reserveA.toString()}`);
      log(`Reserve B: ${reserveB.toString()}`);
      log(`Total Supply: ${totalSupply.toString()}`);
      log(`Fee: ${fee} basis points (${(Number(fee) / 100).toFixed(2)}%)`);
    }

    // 3. Read Pool Data (USDC/TOKEN_B)
    logSection('3️⃣ POOL DATA: USDC/TOKEN_B');
    const poolData2 = await ammContract.read(
      'readPool',
      new Args()
        .addString(USDC_ADDRESS)
        .addString(TOKEN_B)
    );
    
    if (bytesToStr(poolData2.value) === 'null') {
      log('Pool does not exist');
    } else {
      const args = new Args(poolData2.value);
      const tokenA = args.nextString();
      const tokenB = args.nextString();
      const reserveA = args.nextU256();
      const reserveB = args.nextU256();
      const totalSupply = args.nextU256();
      const fee = args.nextU64();
      
      log(`Token A: ${tokenA}`);
      log(`Token B: ${tokenB}`);
      log(`Reserve A: ${reserveA.toString()}`);
      log(`Reserve B: ${reserveB.toString()}`);
      log(`Total Supply: ${totalSupply.toString()}`);
      log(`Fee: ${fee} basis points (${(Number(fee) / 100).toFixed(2)}%)`);
    }

    // 4. Read User LP Balance
    logSection('4️⃣ USER LP BALANCE: WMAS/USDC');
    const lpBalance = await ammContract.read(
      'readLPBalance',
      new Args()
        .addString(WMAS_ADDRESS)
        .addString(USDC_ADDRESS)
        .addString(account.address.toString())
    );
    log(`LP Balance: ${bytesToStr(lpBalance.value)}`);

    // 5. Read Pool Total Liquidity
    logSection('5️⃣ POOL TOTAL LIQUIDITY: WMAS/USDC');
    const totalLiquidity = await ammContract.read(
      'readPoolTotalLiquidity',
      new Args()
        .addString(WMAS_ADDRESS)
        .addString(USDC_ADDRESS)
    );
    log(`Total Liquidity: ${bytesToStr(totalLiquidity.value)}`);

    // 6. Read Pool Key
    logSection('6️⃣ POOL KEY');
    const poolKey = await ammContract.read(
      'readPoolKey',
      new Args()
        .addString(WMAS_ADDRESS)
        .addString(USDC_ADDRESS)
    );
    log(`Pool Key: ${bytesToStr(poolKey.value)}`);

    // 7. Read Total Volume
    logSection('7️⃣ PROTOCOL STATS');
    const totalVolume = await ammContract.read('readTotalVolume');
    log(`Total Volume: ${bytesToStr(totalVolume.value)}`);
    console.log(totalVolume)

    // 8. Read Protocol Fee Rate
    const protocolFeeRate = await ammContract.read('readProtocolFeeRate');
    log(`Protocol Fee Rate: ${bytesToStr(protocolFeeRate.value)}`);

    // 9. Read Initialization Status
    const initialized = await ammContract.read('readU256Bytes');
    log(`Initialized: ${bytesToStr(initialized.value)}`);
    console.log(initialized)

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
