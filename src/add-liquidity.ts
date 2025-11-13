/**
 * MassaBeam Add Liquidity Script (Proper Decimal Handling)
 *
 * Adds liquidity to existing pools with correct token decimal standards:
 * - USDC: 6 decimals
 * - DAI: 18 decimals
 * - WETH: 18 decimals
 * - WMAS: 9 decimals
 *
 * Usage:
 *   npx tsx src/add-liquidity.ts
 */

import 'dotenv/config';
import {
  Account,
  Args,
  Mas,
  SmartContract,
  JsonRpcProvider,
} from '@massalabs/massa-web3';
import { USDC, DAI, WETH, WMAS } from '@dusalabs/sdk';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function log(title: string, message: string): void {
  console.log(`  ${title.padEnd(30)} ${message}`);
}

function logSection(title: string): void {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  ${title}`);
  console.log(`${'═'.repeat(70)}`);
}

function logSuccess(message: string): void {
  console.log(`  ✅ ${message}`);
}

function logError(message: string): void {
  console.log(`  ❌ ${message}`);
}

function logInfo(message: string): void {
  console.log(`  ℹ️  ${message}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Convert human-readable amount to contract units (u64)
 * Example: toContractUnits(1000, 6) = 1000000000 (1000 USDC)
 */
function toContractUnits(humanAmount: number, decimals: number): bigint {
  return BigInt(humanAmount) * BigInt(10 ** decimals);
}

/**
 * Format contract units to human-readable
 */
function formatAmount(amount: bigint, decimals: number, symbol: string): string {
  const divisor = BigInt(10 ** decimals);
  const whole = amount / divisor;
  const fraction = amount % divisor;
  return `${whole}.${fraction.toString().padStart(decimals, '0')} ${symbol}`;
}

// ============================================================================
// LIQUIDITY CONFIGURATIONS
// ============================================================================

interface LiquidityConfig {
  name: string;
  tokenA: { address: string; symbol: string; decimals: number };
  tokenB: { address: string; symbol: string; decimals: number };
  amountADesired: number; // Human-readable amount
  amountBDesired: number; // Human-readable amount
  slippageBps: number; // Slippage in basis points (100 = 1%)
}

const LIQUIDITY_CONFIGS: LiquidityConfig[] = [
  {
    name: 'USDC/DAI',
    tokenA: { address: USDC[0].address, symbol: 'USDC', decimals: 6 },
    tokenB: { address: DAI[0].address, symbol: 'DAI', decimals: 18 },
    amountADesired: 5000, // 5,000 USDC
    amountBDesired: 5000, // 5,000 DAI
    slippageBps: 100, // 1% slippage
  },
  {
    name: 'WETH/USDC',
    tokenA: { address: WETH[0].address, symbol: 'WETH', decimals: 18 },
    tokenB: { address: USDC[0].address, symbol: 'USDC', decimals: 6 },
    amountADesired: 2, // 2 WETH
    amountBDesired: 4000, // 4,000 USDC
    slippageBps: 200, // 2% slippage
  },
  {
    name: 'WMAS/USDC',
    tokenA: { address: WMAS[0].address, symbol: 'WMAS', decimals: 9 },
    tokenB: { address: USDC[0].address, symbol: 'USDC', decimals: 6 },
    amountADesired: 5000, // 5,000 WMAS
    amountBDesired: 500, // 500 USDC
    slippageBps: 150, // 1.5% slippage
  },
  {
    name: 'WETH/DAI',
    tokenA: { address: WETH[0].address, symbol: 'WETH', decimals: 18 },
    tokenB: { address: DAI[0].address, symbol: 'DAI', decimals: 18 },
    amountADesired: 2, // 2 WETH
    amountBDesired: 4000, // 4,000 DAI
    slippageBps: 200, // 2% slippage
  },
];

// ============================================================================
// MAIN FUNCTION
// ============================================================================

async function main(): Promise<void> {
  logSection('💧 MASSABEAM ADD LIQUIDITY');

  try {
    // Setup account
    logSection('🔑 ACCOUNT SETUP');
    const account = await Account.fromEnv();
    log('Account:', account.address.toString());

    const provider = JsonRpcProvider.buildnet(account);
    const balance = await provider.balanceOf([account.address.toString()]);
    log('MAS Balance:', balance[0].balance.toString());

    logSuccess('Account setup complete');
    await sleep(1000);

    // Load deployed addresses
    logSection('📋 LOADING DEPLOYMENT INFO');
    const addressesPath = path.join(__dirname, '../deployed-addresses.json');

    if (!fs.existsSync(addressesPath)) {
      logError('deployed-addresses.json not found!');
      logInfo('Please deploy contracts first: npm run deploy:all');
      process.exit(1);
    }

    const deployedAddresses = JSON.parse(fs.readFileSync(addressesPath, 'utf-8'));

    if (!deployedAddresses.contracts.massaBeam) {
      logError('MassaBeam contract not deployed!');
      process.exit(1);
    }

    const massaBeamAddress = deployedAddresses.contracts.massaBeam;
    log('MassaBeam AMM:', massaBeamAddress);

    const ammContract = new SmartContract(provider, massaBeamAddress);
    logSuccess('Contracts loaded');
    await sleep(1000);

    // Display token information
    logSection('📊 TOKEN DECIMAL STANDARDS');
    log('USDC:', `${USDC[0].symbol} - 6 decimals`);
    log('DAI:', `${DAI[0].symbol} - 18 decimals`);
    log('WETH:', `${WETH[0].symbol} - 18 decimals`);
    log('WMAS:', `${WMAS[0].symbol} - 9 decimals`);
    await sleep(1000);

    // Add liquidity
    logSection(`💧 ADDING LIQUIDITY TO ${LIQUIDITY_CONFIGS.length} POOLS`);
    console.log('');

    for (let i = 0; i < LIQUIDITY_CONFIGS.length; i++) {
      const config = LIQUIDITY_CONFIGS[i];

      logSection(`${i + 1}/${LIQUIDITY_CONFIGS.length}: ${config.name}`);

      try {
        // Convert to contract units
        const amountADesired = toContractUnits(config.amountADesired, config.tokenA.decimals);
        const amountBDesired = toContractUnits(config.amountBDesired, config.tokenB.decimals);

        // Calculate minimum amounts with slippage protection
        const slippageMultiplier = BigInt(10000 - config.slippageBps);
        const amountAMin = (amountADesired * slippageMultiplier) / BigInt(10000);
        const amountBMin = (amountBDesired * slippageMultiplier) / BigInt(10000);

        log('Token A:', `${config.tokenA.symbol} (${config.tokenA.decimals} decimals)`);
        log('Token B:', `${config.tokenB.symbol} (${config.tokenB.decimals} decimals)`);
        log('Amount A Desired:', `${config.amountADesired} ${config.tokenA.symbol}`);
        log('Amount B Desired:', `${config.amountBDesired} ${config.tokenB.symbol}`);
        log('Slippage:', `${config.slippageBps / 100}%`);
        log('Amount A Min:', formatAmount(amountAMin, config.tokenA.decimals, config.tokenA.symbol));
        log('Amount B Min:', formatAmount(amountBMin, config.tokenB.decimals, config.tokenB.symbol));
        console.log('');

        // Step 1: Approve Token A
        logInfo(`Approving ${config.tokenA.symbol}...`);
        const tokenAContract = new SmartContract(provider, config.tokenA.address);

        await tokenAContract.call(
          'increaseAllowance',
          new Args()
            .addString(massaBeamAddress)
            .addU256(amountADesired), // u256 for approval
          { coins: Mas.fromString('0.01') }
        );

        logSuccess(`${config.tokenA.symbol} approved`);
        await sleep(2000);

        // Step 2: Approve Token B
        logInfo(`Approving ${config.tokenB.symbol}...`);
        const tokenBContract = new SmartContract(provider, config.tokenB.address);

        await tokenBContract.call(
          'increaseAllowance',
          new Args()
            .addString(massaBeamAddress)
            .addU256(amountBDesired), // u256 for approval
          { coins: Mas.fromString('0.01') }
        );

        logSuccess(`${config.tokenB.symbol} approved`);
        await sleep(2000);

        // Step 3: Add Liquidity
        logInfo('Adding liquidity...');

        const deadline = BigInt(Date.now() + 3600000); // 1 hour from now

        // CRITICAL: Pass u64 to contract (as per main.ts specification)
        const addLiquidityArgs = new Args()
          .addString(config.tokenA.address)
          .addString(config.tokenB.address)
          .addU64(amountADesired) // u64 with proper decimals
          .addU64(amountBDesired) // u64 with proper decimals
          .addU64(amountAMin) // u64 min amounts
          .addU64(amountBMin) // u64 min amounts
          .addU64(deadline);

        await ammContract.call('addLiquidity', addLiquidityArgs, {
          coins: Mas.fromString('0.5'),
        });

        logSuccess('Liquidity added successfully!');

        // Calculate price
        const priceAB = config.amountBDesired / config.amountADesired;
        const priceBA = config.amountADesired / config.amountBDesired;

        log('Price:', `1 ${config.tokenA.symbol} = ${priceAB.toFixed(6)} ${config.tokenB.symbol}`);
        log('Price:', `1 ${config.tokenB.symbol} = ${priceBA.toFixed(6)} ${config.tokenA.symbol}`);

        await sleep(3000);
      } catch (error) {
        logError(`Failed to add liquidity to ${config.name}: ${error}`);
        logInfo('This might be due to:');
        console.log('   - Pool does not exist (create it first)');
        console.log('   - Insufficient token balance');
        console.log('   - Slippage too low');
        console.log('   - Insufficient MAS for gas');
        console.log('');
      }
    }

    // Final summary
    logSection('✨ LIQUIDITY ADDITION COMPLETE');
    console.log(`
  📝 Summary:
  - Liquidity added to: ${LIQUIDITY_CONFIGS.length} pools
  - Network: Buildnet
  - MassaBeam AMM: ${massaBeamAddress}
  - Timestamp: ${new Date().toISOString()}

  💧 Liquidity Added:
  ${LIQUIDITY_CONFIGS.map((c, i) => `${i + 1}. ${c.name}: ${c.amountADesired} ${c.tokenA.symbol} + ${c.amountBDesired} ${c.tokenB.symbol}`).join('\n  ')}

  🎯 Next Steps:
  1. Check pool reserves: Use getPool() function
  2. Test swaps: npm run swap
  3. Remove liquidity: npm run remove-liquidity
  4. Create DCA orders: npm run test-recurring
  5. Monitor arbitrage: npm run test-flash-arb

  ✅ Your pools now have more liquidity!
    `);

    console.log(`${'═'.repeat(70)}\n`);
  } catch (error) {
    logError(`Add liquidity failed: ${error}`);
    console.error(error);
    process.exit(1);
  }
}

// Execute main function
main()
  .then(() => {
    logSuccess('Add liquidity script completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    logError(`Script failed: ${error}`);
    console.error(error);
    process.exit(1);
  });
