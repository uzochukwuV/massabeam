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

// Liquidity configuration
const LIQUIDITY_TO_ADD = [
    {
      name: 'BEAM/USDT',
      tokenA: 'BEAM',
      tokenB: 'USDT',
      amountA: '10', // 1 BEAM
      amountB: '10', // 1 USDT (1 BEAM = 1 USDT)
      decimalsA: 8,
      decimalsB: 8,
    },
    {
      name: 'BEAM/USDC',
      tokenA: 'BEAM',
      tokenB: 'USDC',
      amountA: '5000', // 5 BEAM
      amountB: '500', // 1 USDC (5 BEAM = 1 USDC)
      decimalsA: 8,
      decimalsB: 8,
    },
    {
      name: 'USDT/USDC',
      tokenA: 'USDT',
      tokenB: 'USDC',
      amountA: '5000', // 5 USDT
      amountB: '500', // 1 USDC (1:1 ratio)
      decimalsA: 8,
      decimalsB: 8,
    },
  ];

function toU256(amount: string, decimals: number): bigint {
  const multiplier = BigInt(10 ** decimals);
  const [whole, decimal = '0'] = amount.split('.');
  const decimalPart = decimal.padEnd(decimals, '0').slice(0, decimals);
  return BigInt(whole) * multiplier + BigInt(decimalPart);
}

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('💧 MassaBeam Add Liquidity Script');
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
  console.log(`💧 Adding liquidity to ${LIQUIDITY_TO_ADD.length} pools...\n`);

  for (const liquidity of LIQUIDITY_TO_ADD) {
    console.log('═══════════════════════════════════════════════════════');
    console.log(`💧 Adding liquidity to: ${liquidity.name}`);
    console.log('═══════════════════════════════════════════════════════\n');

    const tokenAAddress = deployedAddresses.tokens[liquidity.tokenA];
    const tokenBAddress = deployedAddresses.tokens[liquidity.tokenB];

    if (!tokenAAddress || !tokenBAddress) {
      console.error(`❌ Token not found: ${liquidity.tokenA} or ${liquidity.tokenB}\n`);
      continue;
    }

    try {
      // Convert amounts to u256
      const amountA256 = toU256(liquidity.amountA, liquidity.decimalsA);
      const amountB256 = toU256(liquidity.amountB, liquidity.decimalsB);

      console.log(`📍 Token A (${liquidity.tokenA}): ${tokenAAddress}`);
      console.log(`📍 Token B (${liquidity.tokenB}): ${tokenBAddress}`);
      console.log(`💧 Amount A: ${liquidity.amountA} ${liquidity.tokenA}`);
      console.log(`💧 Amount B: ${liquidity.amountB} ${liquidity.tokenB}\n`);

      // Step 1: Approve Token A
      console.log(`🔓 Approving ${liquidity.tokenA}...`);
      const tokenAContract = new SmartContract(provider, tokenAAddress);

      await tokenAContract.call(
        'increaseAllowance',
        new Args().addString(deployedAddresses.contracts.massaBeam).addU256(amountA256),
        { coins: Mas.fromString('0.01') }
      );

      console.log(`   ✅ ${liquidity.tokenA} approved\n`);
      await sleep(2000);

      // Step 2: Approve Token B
      console.log(`🔓 Approving ${liquidity.tokenB}...`);
      const tokenBContract = new SmartContract(provider, tokenBAddress);

      await tokenBContract.call(
        'increaseAllowance',
        new Args().addString(deployedAddresses.contracts.massaBeam).addU256(amountB256),
        { coins: Mas.fromString('0.01') }
      );

      console.log(`   ✅ ${liquidity.tokenB} approved\n`);
      await sleep(2000);

      // Step 3: Add Liquidity
      console.log(`💧 Adding liquidity...`);

      const deadline = BigInt(Date.now() + 60 * 60 * 1000); // 1 hour from now

      const addLiquidityArgs = new Args()
        .addString(tokenAAddress.toString())
        .addString(tokenBAddress.toString())
        .addU64(BigInt(liquidity.amountA))
        .addU64(BigInt(liquidity.amountB))
        .addU64(BigInt(0)) // amountAMin
        .addU64(BigInt(0)) // amountBMin
        .addU64(deadline);

      await ammContract.call('addLiquidity', addLiquidityArgs, {
        coins: Mas.fromString('0.1'),
      });

      console.log(`   ✅ Liquidity added successfully!\n`);
      await sleep(3000);
    } catch (error) {
      console.error(`❌ Failed to add liquidity to ${liquidity.name} pool:`, error);
      console.log('');
    }
  }

  console.log('═══════════════════════════════════════════════════════');
  console.log('✨ Add liquidity completed!');
  console.log('═══════════════════════════════════════════════════════\n');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main()
  .then(() => {
    console.log('✅ Add liquidity script completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Add liquidity failed:', error);
    process.exit(1);
  });
