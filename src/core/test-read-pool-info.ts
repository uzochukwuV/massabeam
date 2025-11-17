/**
 * Read Pool Information
 * Displays current pool state and reserves
 *
 * Usage: npx tsx src/test-read-pool-info.ts
 */

import 'dotenv/config';
import {
  Account,
  Args,
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

const TOKEN_A = 'AS1nDAemyLSLUuNZ747Dt3NgzEC9WGCkmjRvY9hZwW2928Fxb4Fk'; // USDC
const TOKEN_B = USDC[0].address;

function log(message: string): void {
  console.log(`  ${message}`);
}

function logSection(title: string): void {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  ${title}`);
  console.log(`${'═'.repeat(70)}`);
}

async function main(): Promise<void> {
  logSection('📊 READING POOL INFORMATION');

  try {
    const account = await Account.fromEnv();
    const provider = JsonRpcProvider.buildnet(account);

    const addressesPath = path.join(__dirname, '..', 'deployed-addresses.json');
    const deployed = JSON.parse(fs.readFileSync(addressesPath, 'utf-8'));
    const massaBeamAddress = deployed.contracts.massaBeam;

    const ammContract = new SmartContract(provider, massaBeamAddress);

    log(`MassaBeam: ${massaBeamAddress}`);
    log(`Token A: ${TOKEN_A}`);
    log(`Token B: ${TOKEN_B}`);

    logSection('🔍 POOL ERC20/ERC20');

    const poolData = await ammContract.read(
      'readPool',
      new Args()
        .addString(TOKEN_A)
        .addString(TOKEN_B)
    );

    if (poolData.value && poolData.value.length > 0) {
      console.log('Pool data (raw bytes):', poolData.value);
      log('✅ Pool exists!');
    } else {
      log('❌ Pool does not exist');
    }

    logSection('✨ DONE');

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
