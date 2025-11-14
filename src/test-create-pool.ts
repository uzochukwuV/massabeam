/**
 * Simple Pool Creation Test - MAS/USDC
 * Tests createPool function with native MAS and USDC token
 */

import 'dotenv/config';
import {
  Account,
  Args,
  Mas,
  SmartContract,
  JsonRpcProvider,
  bytesToF64,
} from '@massalabs/massa-web3';
import { WMAS } from '@dusalabs/sdk';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test USDC token address
const USDC_ADDRESS = 'AS1nDAemyLSLUuNZ747Dt3NgzEC9WGCkmjRvY9hZwW2928Fxb4Fk';
const USDC_DECIMALS = 6;

function log(message: string): void {
  console.log(`  ${message}`);
}

function logSection(title: string): void {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  ${title}`);
  console.log(`${'═'.repeat(70)}`);
}

async function main(): Promise<void> {
  logSection('🧪 TEST: CREATE MAS/USDC POOL');

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
    const wmasAddress = 'AS1TyABhGT2YUPuGFxeEaJJ4Fq8s4fqEEZW9W4zKFkkGcHr4AC1t';
    
    log(`MassaBeam: ${massaBeamAddress}`);
    log(`WMAS: ${wmasAddress}`);
    log(`USDC: ${USDC_ADDRESS}`);

    const ammContract = new SmartContract(provider, massaBeamAddress);
    const usdcContract = new SmartContract(provider, USDC_ADDRESS);

    // Set WMAS address
    logSection('⚙️  SETUP WMAS ADDRESS');
    log('Setting WMAS address...');
    await ammContract.call(
      'setWMASAddress',
      new Args().addString(wmasAddress).serialize(),
      { coins: Mas.fromString('0.01') }
    );
    log('✅ WMAS address set');


    // Check USDC balance
    logSection('📊 TOKEN BALANCES');
    const usdcBalance = await usdcContract.read('balanceOf', new Args().addString(account.address.toString()));
    log(`USDC Balance: ${bytesToF64(usdcBalance.value)}`);

    // Pool amounts (simple test amounts)
    const masAmount = 1n * 10n ** 7n; // 0.1 WMAS (9 decimals)
    const usdcAmount = 50n * 10n ** 6n; // 50 USDC (6 decimals)
    
    logSection('🏊 CREATING POOL');
    log(`Amount A (WMAS): ${masAmount} (100 WMAS)`);
    log(`Amount B (USDC): ${usdcAmount} (50 USDC)`);

    // Step 1: Approve USDC
    log('\n1️⃣ Approving USDC...');
    await usdcContract.call(
      'increaseAllowance',
      new Args()
        .addString(massaBeamAddress)
        .addU256(usdcAmount),
      { coins: Mas.fromString('0.01') }
    );
    log('✅ USDC approved');

    // Step 2: Create pool with native MAS
    log('\n2️⃣ Creating pool with native MAS...');
    const deadline = 3600000n; // 1 hour in ms
    const masToSend = 2; // 100 MAS
    
    const createPoolArgs = new Args()
      .addString(USDC_ADDRESS)
      .addU256(usdcAmount)
      .addU64(deadline);

    const txr  =await ammContract.call('createPoolWithMAS', createPoolArgs.serialize(), {
      coins: Mas.fromString(masToSend.toString()),
      maxGas: BigInt(2_000_000_000n),
    });
    console.log(txr)

    await txr.waitSpeculativeExecution(2000)
   
    console.log(await txr.getFinalEvents())
    log('✅ Pool created successfully!');
    log(`   Price: 1 WMAS = 0.5 USDC`);
    log(`   Price: 1 USDC = 2 WMAS`);

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
