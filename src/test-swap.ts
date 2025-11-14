/**
 * Swap Test
 * Tests swap function for ERC20/ERC20 token pair
 *
 * Usage: npx tsx src/test-swap.ts
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
const TOKEN_A = 'AS1nDAemyLSLUuNZ747Dt3NgzEC9WGCkmjRvY9hZwW2928Fxb4Fk'; // USDC (input)
const TOKEN_B = USDC[0].address; // Second token (output)

function log(message: string): void {
  console.log(`  ${message}`);
}

function logSection(title: string): void {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  ${title}`);
  console.log(`${'═'.repeat(70)}`);
}

async function main(): Promise<void> {
  logSection('🧪 TEST: SWAP ERC20/ERC20 TOKENS');

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
    log(`Token In (A): ${TOKEN_A}`);
    log(`Token Out (B): ${TOKEN_B}`);

    const ammContract = new SmartContract(provider, massaBeamAddress);
    const tokenAContract = new SmartContract(provider, TOKEN_A);

    // Swap amounts
    const amountIn = 1n * 10n ** 6n;     // 1 token (6 decimals) - small amount
    const amountOutMin = 1n;              // 1 unit minimum (very small for slippage)

    logSection('🔄 SWAPPING TOKENS');
    log(`Input Amount (Token A): ${amountIn} (1 token)`);
    log(`Minimum Output (Token B): ${amountOutMin} (1 unit minimum)`);

    // Step 1: Approve Token A for swap
    log('\n1️⃣ Approving Token A for swap...');
    await tokenAContract.call(
      'increaseAllowance',
      new Args()
        .addString(massaBeamAddress)
        .addU256(amountIn),
      { coins: Mas.fromString('0.01') }
    );
    log('✅ Token A approved');

    // Step 2: Execute swap
    log('\n2️⃣ Executing token swap...');
    const deadline = 3600000n; // 1 hour in ms

    const swapArgs = new Args()
      .addString(TOKEN_A)           // tokenIn
      .addString(TOKEN_B)           // tokenOut
      .addU256(amountIn)            // amountIn
      .addU256(amountOutMin)        // amountOutMin
      .addU64(deadline);            // deadline

    const tx = await ammContract.call('swap', swapArgs, {
      coins: Mas.fromString('0.5'),
      maxGas: BigInt(4000000000),
    });

    await tx.waitFinalExecution();
    const events = await tx.getFinalEvents();
    console.log(events);

    log('✅ Swap completed successfully!');
    log(`   Swapped: 1 Token A → received Token B`);
    log(`   Price impact depends on pool reserves`);

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
