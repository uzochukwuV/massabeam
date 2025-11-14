/**
 * Add Liquidity Test
 * Tests addLiquidity function for existing ERC20/ERC20 pool
 *
 * Usage: npx tsx src/test-add-liquidity.ts
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
  logSection('🧪 TEST: ADD LIQUIDITY TO ERC20/ERC20 POOL');

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
    const tokenAContract = new SmartContract(provider, TOKEN_A);
    const tokenBContract = new SmartContract(provider, TOKEN_B);

    // Add liquidity amounts
    const amountADesired = 100n * 10n ** 6n;  // 100 tokens (6 decimals)
    const amountBDesired = 2n * 10n ** 6n;   // 2 tokens (6 decimals)
    const amountAMin = 90n * 10n ** 6n;      // 90 tokens minimum
    const amountBMin = 1n * 10n ** 6n;       // 1 token minimum

    logSection('💧 ADDING LIQUIDITY');
    log(`Desired Amount A: ${amountADesired} (100 tokens)`);
    log(`Desired Amount B: ${amountBDesired} (2 tokens)`);
    log(`Minimum Amount A: ${amountAMin} (90 tokens)`);
    log(`Minimum Amount B: ${amountBMin} (1 token)`);

    // Step 1: Approve Token A
    log('\n1️⃣ Approving Token A...');
    await tokenAContract.call(
      'increaseAllowance',
      new Args()
        .addString(massaBeamAddress)
        .addU256(amountADesired),
      { coins: Mas.fromString('0.01') }
    );
    log('✅ Token A approved');

    // Step 2: Approve Token B
    log('\n2️⃣ Approving Token B...');
    await tokenBContract.call(
      'increaseAllowance',
      new Args()
        .addString(massaBeamAddress)
        .addU256(amountBDesired),
      { coins: Mas.fromString('0.01') }
    );
    log('✅ Token B approved');

    // Step 3: Add liquidity
    log('\n3️⃣ Adding liquidity to pool...');
    const deadline = 3600000n; // 1 hour in ms

    const addLiquidityArgs = new Args()
      .addString(TOKEN_A)
      .addString(TOKEN_B)
      .addU256(amountADesired)
      .addU256(amountBDesired)
      .addU256(amountAMin)
      .addU256(amountBMin)
      .addU64(deadline);

    const tx = await ammContract.call('addLiquidity', addLiquidityArgs, {
      coins: Mas.fromString('0.5'),
      maxGas: BigInt(4000000000),
    });

    await tx.waitFinalExecution();
    const events = await tx.getFinalEvents();
    console.log(events);

    log('✅ Liquidity added successfully!');
    log(`   Added: 100 Token A + 2 Token B`);
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
