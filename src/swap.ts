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

// Swap configuration
const SWAP_CONFIG = {
  tokenIn: 'BEAM',
  tokenOut: 'USDT',
  amountIn: '1', // 1 BEAM
  decimalsIn: 8,
  decimalsOut: 8, // Assuming USDT also has 8 decimals
};

function toU256(amount: string, decimals: number): bigint {
  const multiplier = BigInt(10 ** decimals);
  const [whole, decimal = '0'] = amount.split('.');
  const decimalPart = decimal.padEnd(decimals, '0').slice(0, decimals);
  return BigInt(whole) * multiplier + BigInt(decimalPart);
}

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('🔄 MassaBeam Swap Script');
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
  console.log(`🔄 Performing swap...\n`);

  const tokenInAddress = deployedAddresses.tokens[SWAP_CONFIG.tokenIn];
  const tokenOutAddress = deployedAddresses.tokens[SWAP_CONFIG.tokenOut];

  if (!tokenInAddress || !tokenOutAddress) {
    console.error(`❌ Token not found: ${SWAP_CONFIG.tokenIn} or ${SWAP_CONFIG.tokenOut}\n`);
    return;
  }

  try {
    // Convert amount to u256
    const amountIn256 = toU256(SWAP_CONFIG.amountIn, SWAP_CONFIG.decimalsIn);

    console.log(`📍 Token In (${SWAP_CONFIG.tokenIn}): ${tokenInAddress}`);
    console.log(`📍 Token Out (${SWAP_CONFIG.tokenOut}): ${tokenOutAddress}`);
    console.log(`Amount In: ${SWAP_CONFIG.amountIn} ${SWAP_CONFIG.tokenIn}\n`);

    // Step 1: Approve Token In
    console.log(`🔓 Approving ${SWAP_CONFIG.tokenIn}...`);
    const tokenInContract = new SmartContract(provider, tokenInAddress);

    await tokenInContract.call(
      'increaseAllowance',
      new Args().addString(deployedAddresses.contracts.massaBeam).addU256(amountIn256),
      { coins: Mas.fromString('0.01') }
    );

    console.log(`   ✅ ${SWAP_CONFIG.tokenIn} approved\n`);
    await sleep(2000);

    // Step 2: Swap
    console.log(`🔄 Swapping...`);

    const deadline = BigInt(Date.now() + 60 * 60 * 1000); // 1 hour from now
    const path = [tokenInAddress, tokenOutAddress];

    const swapArgs = new Args()
      .addString(tokenInAddress)
      .addString(tokenOutAddress)
      .addU64(amountIn256)
      .addU64(BigInt(Number(amountIn256) * 0.995)) // amountOutMin
      .addU64(deadline);

    await ammContract.call('swap', swapArgs, {
      coins: Mas.fromString('0.1'),
    });

    console.log(`   ✅ Swap successful!\n`);

  } catch (error) {
    console.error(`❌ Failed to swap:`, error);
    console.log('');
  }

  console.log('═══════════════════════════════════════════════════════');
  console.log('✨ Swap completed!');
  console.log('═══════════════════════════════════════════════════════\n');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main()
  .then(() => {
    console.log('✅ Swap script completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Swap failed:', error);
    process.exit(1);
  });
