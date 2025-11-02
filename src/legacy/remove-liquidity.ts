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
  contracts: {
    massaBeam: string;
    massaBeamDCA: string;
    massaBeamEngine: string;
  };
}

// Liquidity removal configuration
const LIQUIDITY_TO_REMOVE = [
  {
    name: 'BEAM/USDT',
    tokenA: 'BEAM',
    tokenB: 'USDT',
    liquidityTokens: '1000', // Amount of LP tokens to burn
    amountAMin: '0', // Minimum amount of token A to receive
    amountBMin: '0', // Minimum amount of token B to receive
    decimals: 18, // LP tokens typically have 18 decimals
  },
  // Add more pools as needed
];

function toU256(amount: string, decimals: number): bigint {
  const multiplier = BigInt(10 ** decimals);
  const [whole, decimal = '0'] = amount.split('.');
  const decimalPart = decimal.padEnd(decimals, '0').slice(0, decimals);
  return BigInt(whole) * multiplier + BigInt(decimalPart);
}

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('💧 MassaBeam Remove Liquidity Script');
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
  console.log('💰 Account balance:', balance[0].balance, 'MAS\n');

  const ammContract = new SmartContract(
    provider,
    deployedAddresses.contracts.massaBeam
  );

  console.log('🎯 AMM Contract:', deployedAddresses.contracts.massaBeam);
  console.log(`💧 Removing liquidity from ${LIQUIDITY_TO_REMOVE.length} pools...\n`);

  for (const liquidity of LIQUIDITY_TO_REMOVE) {
    console.log('═══════════════════════════════════════════════════════');
    console.log(`💧 Removing liquidity from: ${liquidity.name}`);
    console.log('═══════════════════════════════════════════════════════\n');

    const tokenAAddress = deployedAddresses.tokens[liquidity.tokenA];
    const tokenBAddress = deployedAddresses.tokens[liquidity.tokenB];

    if (!tokenAAddress || !tokenBAddress) {
      console.error(`❌ Token not found: ${liquidity.tokenA} or ${liquidity.tokenB}\n`);
      continue;
    }

    try {
      // Convert amounts to u256
      const liquidityTokens256 = toU256(liquidity.liquidityTokens, liquidity.decimals);
      const amountAMin256 = toU256(liquidity.amountAMin, liquidity.decimals);
      const amountBMin256 = toU256(liquidity.amountBMin, liquidity.decimals);

      console.log(`📍 Token A (${liquidity.tokenA}): ${tokenAAddress}`);
      console.log(`📍 Token B (${liquidity.tokenB}): ${tokenBAddress}`);
      console.log(`💧 LP Tokens to burn: ${liquidity.liquidityTokens}`);
      console.log(`💧 Minimum ${liquidity.tokenA}: ${liquidity.amountAMin}`);
      console.log(`💧 Minimum ${liquidity.tokenB}: ${liquidity.amountBMin}\n`);

      // Step 1: Get pool info to check LP balance
      console.log(`📊 Checking pool information...`);

      const getPoolArgs = new Args()
        .addString(tokenAAddress)
        .addString(tokenBAddress);

      const poolInfo = await ammContract.read('readPool', getPoolArgs);
      console.log(`   ✅ Pool found\n`);
      await sleep(1000);

      // Step 2: Remove Liquidity
      console.log(`💧 Removing liquidity...`);

      const deadline = BigInt(60 * 60 * 1000); // 1 hour from now

      const removeLiquidityArgs = new Args()
        .addString(tokenAAddress)
        .addString(tokenBAddress)
        .addU256(liquidityTokens256)
        .addU256(amountAMin256)
        .addU256(amountBMin256)
        .addU64(deadline);

      const result = await ammContract.call('removeLiquidity', removeLiquidityArgs, {
        coins: Mas.fromString('0.1'),
      });

      console.log(`   ✅ Liquidity removed successfully!`);
      console.log(`   📋 Operation ID: ${result}\n`);
      await sleep(3000);
    } catch (error) {
      console.error(`❌ Failed to remove liquidity from ${liquidity.name} pool:`, error);
      console.log('');
    }
  }

  console.log('═══════════════════════════════════════════════════════');
  console.log('✨ Remove liquidity completed!');
  console.log('═══════════════════════════════════════════════════════\n');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main()
  .then(() => {
    console.log('✅ Remove liquidity script completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Remove liquidity failed:', error);
    process.exit(1);
  });
