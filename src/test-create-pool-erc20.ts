/**
 * ERC20 to ERC20 Pool Creation Test
 * Tests createPool function with two ERC20 tokens
 * 
 * Usage: npx tsx src/test-create-pool-erc20.ts
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
  logSection('🧪 TEST: CREATE ERC20/ERC20 POOL');

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

    // Pool amounts
    const amountA = 100n * 10n ** 6n; // 100 tokens (6 decimals)
    const amountB = 2n * 10n ** 6n;  // 50 tokens (6 decimals)
    
    logSection('🏊 CREATING POOL');
    log(`Amount A: ${amountA} (100 tokens)`);
    log(`Amount B: ${amountB} (2 tokens)`);

    // Step 1: Approve Token A
    log('\n1️⃣ Approving Token A...');
    await tokenAContract.call(
      'increaseAllowance',
      new Args()
        .addString(massaBeamAddress)
        .addU256(amountA),
      { coins: Mas.fromString('0.01') }
    );
    log('✅ Token A approved');

    // Step 2: Approve Token B
    log('\n2️⃣ Approving Token B...');
    await tokenBContract.call(
      'increaseAllowance',
      new Args()
        .addString(massaBeamAddress)
        .addU256(amountB),
      { coins: Mas.fromString('0.01') }
    );
    log('✅ Token B approved');

    // Step 3: Create pool
    log('\n3️⃣ Creating ERC20/ERC20 pool...');
    const deadline = 3600000n; // 1 hour in ms
    
    const createPoolArgs = new Args()
      .addString(TOKEN_A)
      .addString(TOKEN_B)
      .addU256(amountA)
      .addU256(amountB)
      .addU64(deadline);

    const tx =  await ammContract.call('createPool', createPoolArgs, {
      coins: Mas.fromString('0.5'),
      maxGas: BigInt(4000000000),
    });

    await tx.waitFinalExecution()

    console.log(await tx.getFinalEvents())



    log('✅ Pool created successfully!');
    log(`   Price: 1 Token A = 0.5 Token B`);
    log(`   Price: 1 Token B = 2 Token A`);

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
