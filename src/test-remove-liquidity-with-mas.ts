/**
 * Remove Liquidity with MAS Test
 * Tests removeLiquidityWithMAS function for MAS/Token pool
 *
 * Usage: npx tsx src/test-remove-liquidity-with-mas.ts
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Token address
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
  logSection('🧪 TEST: REMOVE LIQUIDITY WITH MAS');

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

    // Step 0: Read user's LP balance
    logSection('📊 READING USER LP BALANCE');
    log('Reading user LP balance...');

    const lpBalanceBytes = await ammContract.read(
      'readLPBalance',
      new Args()
        .addString(WMAS_ADDRESS)
        .addString(TOKEN)
        .addString(account.address.toString())
    );

    const lpBalanceStr = bytesToStr(lpBalanceBytes.value);
    const lpBalance = BigInt(lpBalanceStr);

    log(`✅ User LP Balance: ${lpBalance.toString()}`);

    if (lpBalance === 0n) {
      throw new Error('No LP tokens to remove!');
    }

    // Remove a portion of LP tokens (10% of balance)
    const liquidityToRemove = lpBalance ;
    const tokenAmountMin = 1n;                // Minimum token amount (very small)
    const masAmountMin = Mas.fromString('0.001');  // Minimum MAS amount

    logSection('🏊 REMOVING LIQUIDITY WITH MAS');
    log(`LP Tokens to Burn: ${liquidityToRemove.toString()}`);
    log(`Minimum Token Amount: ${tokenAmountMin} (1 unit minimum)`);
    log(`Minimum MAS Amount: ${masAmountMin.toString()}`);
    log(`(Removing 10% of user's LP balance)`);

    log('\n1️⃣ Removing liquidity with MAS...');
    const deadline = 3600000n; // 1 hour in ms

    const removeLiquidityWithMASArgs = new Args()
      .addString(TOKEN)              // token address (USDC)
      .addU256(liquidityToRemove)    // liquidity to remove
      .addU256(tokenAmountMin)       // tokenAmountMin
      .addU64(BigInt(masAmountMin.toString().split('.')[0]))  // masAmountMin
      .addU64(deadline);             // deadline

    const tx = await ammContract.call('removeLiquidityWithMAS', removeLiquidityWithMASArgs, {
      coins: Mas.fromString('0.5'),
      maxGas: BigInt(4000000000),
    });

    await tx.waitFinalExecution();
    const events = await tx.getFinalEvents();
    console.log(events);

    log('✅ Liquidity removed with MAS successfully!');
    log(`   Burned: ${liquidityToRemove.toString()} LP tokens`);
    log(`   Received: MAS + Token`);

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
