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

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface DeployedAddresses {
  tokens: {
    [key: string]: string;
  };
}

// Accounts to mint tokens to (add your test accounts here)
const TEST_ACCOUNTS = [
  // Add test account addresses here
  // Example: 'AU12abc...xyz',
  "AU12G4TFGs7EFxAd98sDyW2qni8LMwy6QPoNuDao2DmF3NdCun7ma"
];

// Amount to mint per token (adjust as needed)
const MINT_AMOUNTS = {
  USDT: Mas.fromString('100000'), // 100,000 USDT
  USDC: Mas.fromString('100000'), // 100,000 USDC
  BEAM: Mas.fromString('1000000'), // 1,000,000 BEAM
};

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('🪙  MassaBeam Token Minting Script');
  console.log('═══════════════════════════════════════════════════════\n');

  // Load deployed addresses
  const addressesPath = path.join(__dirname, '..', 'deployed-addresses.json');
  if (!fs.existsSync(addressesPath)) {
    throw new Error('❌ deployed-addresses.json not found! Run deploy-full.ts first.');
  }

  const deployedAddresses: DeployedAddresses = JSON.parse(
    fs.readFileSync(addressesPath, 'utf-8')
  );

  // Initialize account and provider
  const account = await Account.fromEnv();
  const provider = JsonRpcProvider.buildnet(account);

  console.log('📌 Using account:', account.address.toString());
  const balance = await provider.balanceOf([account.address.toString()]);
  console.log('💰 Account balance:', Mas.toString(balance[0].balance), 'MAS\n');

  // Add deployer to test accounts if not already there
  if (!TEST_ACCOUNTS.includes(account.address.toString())) {
    TEST_ACCOUNTS.push(account.address.toString());
  }

  console.log(`🎯 Minting tokens to ${TEST_ACCOUNTS.length} account(s):\n`);

  for (const recipientAddress of TEST_ACCOUNTS) {
    console.log(`📤 Minting to: ${recipientAddress}\n`);

    for (const [symbol, tokenAddress] of Object.entries(deployedAddresses.tokens)) {
      try {
        const amount = MINT_AMOUNTS[symbol as keyof typeof MINT_AMOUNTS] || Mas.fromString('10000');

        console.log(`   🪙  Minting ${Mas.toString(amount)} ${symbol}...`);

        const tokenContract = new SmartContract(provider, tokenAddress);

        await tokenContract.call(
          'mint',
          new Args().addString(recipientAddress).addU256(amount),
          { coins: Mas.fromString('0.01') }
        );

        console.log(`   ✅ Minted ${Mas.toString(amount)} ${symbol}\n`);

        // Wait to avoid nonce issues
        await sleep(1500);
      } catch (error) {
        console.error(`   ❌ Failed to mint ${symbol}:`, error);
      }
    }

    console.log(`✅ Completed minting for ${recipientAddress}\n`);
    console.log('─────────────────────────────────────────────────────\n');
  }

  console.log('═══════════════════════════════════════════════════════');
  console.log('✨ Token minting completed!');
  console.log('═══════════════════════════════════════════════════════\n');

  console.log('💡 Next steps:');
  console.log('   1. Check token balances in your wallet');
  console.log('   2. Approve tokens for the AMM contract');
  console.log('   3. Create liquidity pools using create-pools.ts\n');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main()
  .then(() => {
    console.log('✅ Minting script completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Minting failed:', error);
    process.exit(1);
  });
