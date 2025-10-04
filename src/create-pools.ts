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

// Pool configurations
const POOLS = [
  {
    name: 'BEAM/USDT',
    tokenA: 'BEAM',
    tokenB: 'USDT',
    amountA: '460000000', // 1 BEAM
    amountB: '1000000', // 1 USDT (1 BEAM = 1 USDT)
    decimalsA: 8,
    decimalsB: 8,
  },
  {
    name: 'BEAM/USDC',
    tokenA: 'BEAM',
    tokenB: 'USDC',
    amountA: '500000000', // 5 BEAM
    amountB: '50000000', // 1 USDC (5 BEAM = 1 USDC)
    decimalsA: 8,
    decimalsB: 8,
  },
  {
    name: 'USDT/USDC',
    tokenA: 'USDT',
    tokenB: 'USDC',
    amountA: '5000000000', // 5 USDT
    amountB: '500000000', // 1 USDC (1:1 ratio)
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
  console.log('🏊 MassaBeam Pool Creation Script');
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
  console.log(`📊 Creating ${POOLS.length} liquidity pools...\n`);

  for (const pool of POOLS) {
    console.log(`═══════════════════════════════════════════════════════`);
    console.log(`🏊 Creating Pool: ${pool.name}`);
    console.log(`═══════════════════════════════════════════════════════\n`);

    const tokenAAddress = deployedAddresses.tokens[pool.tokenA];
    const tokenBAddress = deployedAddresses.tokens[pool.tokenB];

    if (!tokenAAddress || !tokenBAddress) {
      console.error(`❌ Token not found: ${pool.tokenA} or ${pool.tokenB}\n`);
      continue;
    }

    try {
      // Convert amounts to u256
      const amountA256 = toU256(pool.amountA, pool.decimalsA);
      const amountB256 = toU256(pool.amountB, pool.decimalsB);

      console.log(`📍 Token A (${pool.tokenA}): ${tokenAAddress}`);
      console.log(`📍 Token B (${pool.tokenB}): ${tokenBAddress}`);
      console.log(`💧 Amount A: ${pool.amountA} ${pool.tokenA}`);
      console.log(`💧 Amount B: ${pool.amountB} ${pool.tokenB}\n`);

      // Step 1: Approve Token A
      console.log(`🔓 Approving ${pool.tokenA}...`);
      const tokenAContract = new SmartContract(provider, tokenAAddress);

      await tokenAContract.call(
        'increaseAllowance',
        new Args().addString(deployedAddresses.contracts.massaBeam).addU256(amountA256),
        { coins: Mas.fromString('0.01') }
      );

      console.log(`   ✅ ${pool.tokenA} approved\n`);
      await sleep(2000);

      // Step 2: Approve Token B
      console.log(`🔓 Approving ${pool.tokenB}...`);
      const tokenBContract = new SmartContract(provider, tokenBAddress);

      await tokenBContract.call(
        'increaseAllowance',
        new Args().addString(deployedAddresses.contracts.massaBeam).addU256(amountB256),
        { coins: Mas.fromString('0.01') }
      );

      console.log(`   ✅ ${pool.tokenB} approved\n`);
      await sleep(2000);

      // Step 3: Create Pool
      console.log(`🏊 Creating pool...`);

      const deadline = BigInt(60 * 60 * 1000); // 1 hour from now

      const createPoolArgs = new Args()
        .addString(tokenAAddress)
        .addString(tokenBAddress)
        .addU64(BigInt(pool.amountA))
        .addU64(BigInt(pool.amountB))
        .addU64(deadline);

      await ammContract.call('createPool', createPoolArgs, {
        coins: Mas.fromString('0.1'),
      });

      console.log(`   ✅ Pool created successfully!\n`);

      // Calculate initial price
      const priceAB = parseFloat(pool.amountB) / parseFloat(pool.amountA);
      const priceBA = parseFloat(pool.amountA) / parseFloat(pool.amountB);

      console.log(`📊 Initial Price:`);
      console.log(`   1 ${pool.tokenA} = ${priceAB.toFixed(6)} ${pool.tokenB}`);
      console.log(`   1 ${pool.tokenB} = ${priceBA.toFixed(6)} ${pool.tokenA}\n`);

      await sleep(3000);
    } catch (error) {
      console.error(`❌ Failed to create ${pool.name} pool:`, error);
      console.log('');
    }
  }

  console.log('═══════════════════════════════════════════════════════');
  console.log('✨ Pool creation completed!');
  console.log('═══════════════════════════════════════════════════════\n');

  console.log('💡 Next steps:');
  console.log('   1. Open the frontend: massabeam/app.html');
  console.log('   2. Connect your wallet');
  console.log('   3. Check the pools in the Liquidity section');
  console.log('   4. Try swapping tokens in the Trade section');
  console.log('   5. Create DCA strategies');
  console.log('   6. Monitor arbitrage opportunities\n');

  console.log('🎉 Your MassaBeam Protocol is ready to use!');
  console.log('═══════════════════════════════════════════════════════\n');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main()
  .then(() => {
    console.log('✅ Pool creation script completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Pool creation failed:', error);
    process.exit(1);
  });
