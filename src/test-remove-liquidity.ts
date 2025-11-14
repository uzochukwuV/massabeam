/**
 * Remove Liquidity Test
 * Tests removeLiquidity function for existing ERC20/ERC20 pool
 *
 * Usage: npx tsx src/test-remove-liquidity.ts
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
const TOKEN_B = USDC[0].address; // Second token

function log(message: string): void {
  console.log(`  ${message}`);
}

function logSection(title: string): void {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  ${title}`);
  console.log(`${'═'.repeat(70)}`);
}

async function main(): Promise<void> {
  logSection('🧪 TEST: REMOVE LIQUIDITY FROM ERC20/ERC20 POOL');

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
    log(`Token A: ${TOKEN_A}`);
    log(`Token B: ${TOKEN_B}`);

    const ammContract = new SmartContract(provider, massaBeamAddress);

    const lpBalanceBytes = await ammContract.read(
          'readLPBalance',
          new Args()
            .addString(TOKEN_A)
            .addString(TOKEN_B)
            .addString(account.address.toString())
        );
    
        const lpBalanceStr = bytesToStr(lpBalanceBytes.value);
        const lpBalance = BigInt(lpBalanceStr);

    // Remove liquidity amounts
    // User must specify how many LP tokens to burn
    // For this test, we'll remove a small portion
    const liquidityToRemove = lpBalance;    // 1 million LP tokens
    const amountAMin = 1n * 10n ** 5n;           // 0.1 Token A minimum
    const amountBMin = 1n * 10n ** 3n;           // 0.001 Token B minimum

    logSection('🏊 REMOVING LIQUIDITY');
    log(`LP Tokens to Burn: ${liquidityToRemove} (1M LP tokens)`);
    log(`Minimum Amount A: ${amountAMin} (0.1 tokens)`);
    log(`Minimum Amount B: ${amountBMin} (0.001 tokens)`);

    log('\n1️⃣ Removing liquidity from pool...');
    const deadline = 3600000n; // 1 hour in ms

    const removeLiquidityArgs = new Args()
      .addString(TOKEN_A)
      .addString(TOKEN_B)
      .addU256(liquidityToRemove)
      .addU256(amountAMin)
      .addU256(amountBMin)
      .addU64(deadline);

    const tx = await ammContract.call('removeLiquidity', removeLiquidityArgs, {
      coins: Mas.fromString('0.5'),
      maxGas: BigInt(4000000000),
    });

    await tx.waitFinalExecution();
    const events = await tx.getFinalEvents();
    console.log(events);

    log('✅ Liquidity removed successfully!');
    log(`   Burned LP tokens and received:`)
    log(`   - Token A`);
    log(`   - Token B`);

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
