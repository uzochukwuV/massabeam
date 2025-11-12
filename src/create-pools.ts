/**
 * MassaBeam Pool Creation Script (Proper Decimal Handling)
 *
 * Creates liquidity pools with correct token decimal standards:
 * - USDC: 6 decimals
 * - DAI: 18 decimals
 * - WETH: 18 decimals
 * - WMAS: 9 decimals
 *
 * Usage:
 *   npx tsx src/create-pools.ts
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
// POOL CONFIGURATIONS
// ============================================================================

interface PoolConfig {
  name: string;
  tokenA: { address: string; symbol: string; decimals: number };
  tokenB: { address: string; symbol: string; decimals: number };
  amountA: number; // Human-readable amount
  amountB: number; // Human-readable amount
}

const POOLS: PoolConfig[] = [
  {
    name: 'USDC/DAI',
    tokenA: { address: USDC[0].address, symbol: 'USDC', decimals: 6 },
    tokenB: { address: DAI[0].address, symbol: 'DAI', decimals: 18 },
    amountA: 10000, // 10,000 USDC
    amountB: 10000, // 10,000 DAI (1:1 ratio)
  },
  {
    name: 'WETH/USDC',
    tokenA: { address: WETH[0].address, symbol: 'WETH', decimals: 18 },
    tokenB: { address: USDC[0].address, symbol: 'USDC', decimals: 6 },
    amountA: 5, // 5 WETH
    amountB: 10000, // 10,000 USDC (1 WETH = 2000 USDC)
  },
  {
    name: 'WMAS/USDC',
    tokenA: { address: WMAS[0].address, symbol: 'WMAS', decimals: 9 },
    tokenB: { address: USDC[0].address, symbol: 'USDC', decimals: 6 },
    amountA: 10000, // 10,000 WMAS
    amountB: 1000, // 1,000 USDC (10 WMAS = 1 USDC)
  },
  {
    name: 'WETH/DAI',
    tokenA: { address: WETH[0].address, symbol: 'WETH', decimals: 18 },
    tokenB: { address: DAI[0].address, symbol: 'DAI', decimals: 18 },
    amountA: 5, // 5 WETH
    amountB: 10000, // 10,000 DAI (1 WETH = 2000 DAI)
  },
];

// ============================================================================
// MAIN FUNCTION
// ============================================================================

async function main(): Promise<void> {
  logSection('🏊 MASSABEAM POOL CREATION');

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

    // Create pools
    logSection(`🏊 CREATING ${POOLS.length} POOLS`);
    console.log('');

    for (let i = 0; i < POOLS.length; i++) {
      const pool = POOLS[i];

      logSection(`${i + 1}/${POOLS.length}: ${pool.name}`);

      try {
        // Convert to contract units
        const amountAUnits = toContractUnits(pool.amountA, pool.tokenA.decimals);
        const amountBUnits = toContractUnits(pool.amountB, pool.tokenB.decimals);

        log('Token A:', `${pool.tokenA.symbol} (${pool.tokenA.decimals} decimals)`);
        log('Token B:', `${pool.tokenB.symbol} (${pool.tokenB.decimals} decimals)`);
        log('Amount A:', `${pool.amountA} ${pool.tokenA.symbol}`);
        log('Amount B:', `${pool.amountB} ${pool.tokenB.symbol}`);
        log('Contract Units A:', amountAUnits.toString());
        log('Contract Units B:', amountBUnits.toString());
        console.log('');

        // Step 1: Approve Token A
        logInfo(`Approving ${pool.tokenA.symbol}...`);
        const tokenAContract = new SmartContract(provider, pool.tokenA.address);

        await tokenAContract.call(
          'increaseAllowance',
          new Args()
            .addString(massaBeamAddress)
            .addU256(amountAUnits), // u256 for approval
          { coins: Mas.fromString('0.01') }
        );

        logSuccess(`${pool.tokenA.symbol} approved`);
        await sleep(2000);

        // Step 2: Approve Token B
        logInfo(`Approving ${pool.tokenB.symbol}...`);
        const tokenBContract = new SmartContract(provider, pool.tokenB.address);

        await tokenBContract.call(
          'increaseAllowance',
          new Args()
            .addString(massaBeamAddress)
            .addU256(amountBUnits), // u256 for approval
          { coins: Mas.fromString('0.01') }
        );

        logSuccess(`${pool.tokenB.symbol} approved`);
        await sleep(2000);

        // Step 3: Create Pool
        logInfo('Creating pool...');

        const deadline = BigInt(Date.now() + 3600000); // 1 hour from now

        // CRITICAL: Pass u64 to contract (as per main.ts specification)
        const createPoolArgs = new Args()
          .addString(pool.tokenA.address)
          .addString(pool.tokenB.address)
          .addU64(amountAUnits) // u64 with proper decimals
          .addU64(amountBUnits) // u64 with proper decimals
          .addU64(deadline);

        await ammContract.call('createPool', createPoolArgs, {
          coins: Mas.fromString('0.5'),
        });

        logSuccess('Pool created successfully!');

        // Calculate price
        const priceAB = pool.amountB / pool.amountA;
        const priceBA = pool.amountA / pool.amountB;

        log('Price:', `1 ${pool.tokenA.symbol} = ${priceAB.toFixed(6)} ${pool.tokenB.symbol}`);
        log('Price:', `1 ${pool.tokenB.symbol} = ${priceBA.toFixed(6)} ${pool.tokenA.symbol}`);

        await sleep(3000);
      } catch (error) {
        logError(`Failed to create ${pool.name}: ${error}`);
        logInfo('This might be due to:');
        console.log('   - Pool already exists');
        console.log('   - Insufficient token balance');
        console.log('   - Insufficient MAS for gas');
        console.log('');
      }
    }

    // Final summary
    logSection('✨ POOL CREATION COMPLETE');
    console.log(`
  📝 Summary:
  - Pools created: ${POOLS.length}
  - Network: Buildnet
  - MassaBeam AMM: ${massaBeamAddress}
  - Timestamp: ${new Date().toISOString()}

  📊 Created Pools:
  ${POOLS.map((p, i) => `${i + 1}. ${p.name}: ${p.amountA} ${p.tokenA.symbol} + ${p.amountB} ${p.tokenB.symbol}`).join('\n  ')}

  🎯 Next Steps:
  1. Add more liquidity: npm run add-liquidity
  2. Test swaps: npm run swap
  3. Create DCA orders: npm run test-recurring
  4. Monitor arbitrage: npm run test-flash-arb

  ✅ Your pools are ready for trading!
    `);

    console.log(`${'═'.repeat(70)}\n`);
  } catch (error) {
    logError(`Pool creation failed: ${error}`);
    console.error(error);
    process.exit(1);
  }
}

// Execute main function
main()
  .then(() => {
    logSuccess('Pool creation script completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    logError(`Script failed: ${error}`);
    console.error(error);
    process.exit(1);
  });
