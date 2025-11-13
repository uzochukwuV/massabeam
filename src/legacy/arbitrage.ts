/**
 * MassaBeam Arbitrage Engine - Execution Script
 *
 * Comprehensive script for executing cross-DEX arbitrage between MassaBeam and Dusa
 *
 * Features:
 * - Autonomous arbitrage opportunity detection
 * - Profit calculation and threshold validation
 * - Cross-DEX execution (MassaBeam vs Dusa)
 * - MEV protection and slippage management
 * - Statistics and performance tracking
 * - Support for multiple token pairs
 *
 * Arbitrage Scenarios:
 * 1. DETECT: Scan for profitable opportunities
 * 2. EXECUTE: Execute detected arbitrage trades
 * 3. MONITOR: Track arbitrage statistics
 * 4. ALL: Run complete arbitrage cycle
 *
 * Usage:
 *   npx ts-node src/arbitrage.ts --action detect
 *   npx ts-node src/arbitrage.ts --action execute
 *   npx ts-node src/arbitrage.ts --action monitor
 *   npx ts-node src/arbitrage.ts --action start (autonomous mode)
 */

import 'dotenv/config';
import {
  Account,
  Args,
  Mas,
  SmartContract,
  JsonRpcProvider,
  Address,
  bytesToStr,
  bytesToF64,
} from '@massalabs/massa-web3';
import {
  DAI,
  USDC,
  USDT,
  WETH,
  WBTC,
  LB_ROUTER_ADDRESS,
  LB_QUOTER_ADDRESS,
} from '@dusalabs/sdk';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Arbitrage engine configuration
 * Token pairs to scan for arbitrage opportunities
 */
const ARBITRAGE_CONFIG = {
  // Token pairs to monitor for cross-DEX arbitrage
  tokenPairs: [
    {
      name: 'DAI/USDC',
      tokenA: DAI[0],
      tokenB: USDC[0],
      minProfit: 50, // 0.5% minimum profit
    },
    {
      name: 'DAI/USDT',
      tokenA: DAI[0],
      tokenB: USDT[0],
      minProfit: 50,
    },
    {
      name: 'USDC/USDT',
      tokenA: USDC[0],
      tokenB: USDT[0],
      minProfit: 30, // 0.3% for stablecoin arbs
    },
    {
      name: 'WETH/DAI',
      tokenA: WETH[0],
      tokenB: DAI[0],
      minProfit: 75, // 0.75% for volatile pairs
    },
    {
      name: 'WBTC/USDC',
      tokenA: WBTC[0],
      tokenB: USDC[0],
      minProfit: 100, // 1% for volatile pairs
    },
  ],

  // Arbitrage execution parameters
  execution: {
    maxSlippage: 500, // 5% max slippage
    mevProtectionDelay: 10, // 10 seconds
    maxOpportunitiesPerCycle: 5,
    minProfitThreshold: 1000 * 10 ** 6, // 1000 tokens minimum
  },

  // Scanning parameters
  scanning: {
    scanInterval: 10, // Scan every 10 slots
    maxIterationsPerRun: 100,
    batchSize: 10,
  },
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Format console output
 */
function log(title: string, message: string): void {
  console.log(`  ${title.padEnd(30)} ${message}`);
}

function logSection(title: string): void {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`${title}`);
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

function logWarning(message: string): void {
  console.log(`  ⚠️  ${message}`);
}

/**
 * Sleep function
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Load deployed contract addresses
 */
function loadDeployedAddresses(): {
  massaBeamAddress: string;
  smartSwapAddress: string;
  arbitrageEngineAddress: string;
} {
  const configPath = path.join(__dirname, 'deployed-addresses.json');
  if (!fs.existsSync(configPath)) {
    throw new Error(`Deployed addresses file not found: ${configPath}`);
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  return {
    massaBeamAddress: config.contracts?.massaBeam,
    smartSwapAddress: config.contracts?.smartSwap,
    arbitrageEngineAddress: config.contracts?.arbitrageEngine,
  };
}

/**
 * Save arbitrage statistics
 */
function saveArbitrageStats(stats: any): void {
  const statsPath = path.join(__dirname, 'arbitrage-stats.json');
  fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2));
  log('Statistics saved:', statsPath);
}

// ============================================================================
// PRICE DISCOVERY
// ============================================================================

/**
 * Get current price from MassaBeam AMM
 */
async function getMassaBeamPrice(
  provider: JsonRpcProvider,
  massaBeamAddress: string,
  tokenA: string,
  tokenB: string,
): Promise<number> {
  try {
    const massaBeam = new SmartContract(provider, massaBeamAddress);

    // Call getPool to get reserves
    const poolArgs = new Args().addString(tokenA).addString(tokenB);
    const poolData = await massaBeam.read('getPool', poolArgs);

    // Parse pool reserves
    if (poolData && poolData.value) {
      const reserves = poolData.value; // [reserveA, reserveB]
      // Calculate price: reserveB / reserveA
      const reserveA = Number(reserves[0] || 0);
      const reserveB = Number(reserves[1] || 0);

      if (reserveA === 0) {
        return 0; // Pool doesn't exist or empty
      }

      return reserveB / reserveA;
    }
  } catch (error) {
    logWarning(`Failed to get MassaBeam price for ${tokenA}/${tokenB}: ${error}`);
  }
  return 0;
}

/**
 * Get current price from Dusa via IQuoter
 */
async function getDusaPrice(
  provider: JsonRpcProvider,
  tokenA: string,
  tokenB: string,
  amountIn: number = 1000000,
): Promise<number> {
  try {
    const quoterAddress = LB_QUOTER_ADDRESS[0];
    const quoter = new SmartContract(provider, quoterAddress);

    // Build quote request
    const quoteArgs = new Args()
      .addString(tokenA)
      .addString(tokenB)
      .addU64(BigInt(amountIn));

    const quoteData = await quoter.read('quote', quoteArgs);

    if (quoteData && quoteData.value) {
      const amountOut = Number(quoteData.value[0] || 0);
      if (amountIn === 0) return 0;
      return amountOut / amountIn;
    }
  } catch (error) {
    logWarning(`Failed to get Dusa price for ${tokenA}/${tokenB}: ${error}`);
  }
  return 0;
}

// ============================================================================
// ARBITRAGE DETECTION
// ============================================================================

/**
 * Detect arbitrage opportunity between two DEXs
 */
interface ArbitrageOpportunity {
  tokenA: string;
  tokenB: string;
  priceMassaBeam: number;
  priceDusa: number;
  priceDiscrepancy: number; // in basis points (0.01% = 1 bp)
  cheaperDEX: string;
  expensiveDEX: string;
  estimatedProfit: number; // percentage
  recommendedAmount: number;
}

async function detectArbitrage(
  provider: JsonRpcProvider,
  massaBeamAddress: string,
  tokenPair: any,
): Promise<ArbitrageOpportunity | null> {
  const { name, tokenA, tokenB, minProfit } = tokenPair;

  logInfo(`Scanning ${name}...`);

  // Get prices from both DEXs
  const [priceMassaBeam, priceDusa] = await Promise.all([
    getMassaBeamPrice(provider, massaBeamAddress, tokenA, tokenB),
    getDusaPrice(provider, tokenA, tokenB),
  ]);

  if (priceMassaBeam === 0 || priceDusa === 0) {
    logWarning(`No liquidity found for ${name}`);
    return null;
  }

  // Calculate discrepancy
  const discrepancy = Math.abs(priceMassaBeam - priceDusa) / priceMassaBeam;
  const discrepancyBps = discrepancy * 10000;

  // Determine cheaper and expensive DEX
  const cheaperDEX = priceMassaBeam < priceDusa ? 'MassaBeam' : 'Dusa';
  const expensiveDEX = priceMassaBeam < priceDusa ? 'Dusa' : 'MassaBeam';

  // Check if profitable
  const estimatedProfit = discrepancyBps - 20; // Subtract ~20 bps for fees

  if (estimatedProfit >= minProfit) {
    return {
      tokenA,
      tokenB,
      priceMassaBeam,
      priceDusa,
      priceDiscrepancy: discrepancyBps,
      cheaperDEX,
      expensiveDEX,
      estimatedProfit,
      recommendedAmount: 10000, // Default amount for arbitrage
    };
  }

  return null;
}

/**
 * Scan all token pairs for arbitrage opportunities
 */
async function scanForOpportunities(
  provider: JsonRpcProvider,
  massaBeamAddress: string,
): Promise<ArbitrageOpportunity[]> {
  const opportunities: ArbitrageOpportunity[] = [];

  for (const tokenPair of ARBITRAGE_CONFIG.tokenPairs) {
    const opportunity = await detectArbitrage(
      provider,
      massaBeamAddress,
      tokenPair,
    );
    if (opportunity) {
      opportunities.push(opportunity);
      logSuccess(
        `${opportunity.tokenA.slice(0, 10)}.../${opportunity.tokenB.slice(0, 10)}... | Profit: ${opportunity.estimatedProfit.toFixed(2)} bps`,
      );
    }
    await sleep(500); // Rate limiting
  }

  return opportunities;
}

// ============================================================================
// ARBITRAGE EXECUTION
// ============================================================================

/**
 * Execute arbitrage on detected opportunity
 */
async function executeArbitrage(
  provider: JsonRpcProvider,
  account: any,
  arbitrageEngineAddress: string,
  opportunity: ArbitrageOpportunity,
): Promise<boolean> {
  try {
    logInfo(
      `Executing arbitrage: Buy from ${opportunity.cheaperDEX}, Sell to ${opportunity.expensiveDEX}`,
    );

    const engine = new SmartContract(provider,arbitrageEngineAddress);

    // Build execution args
    const executeArgs = new Args()
      .addString(opportunity.tokenA)
      .addString(opportunity.tokenB)
      .addU64(BigInt(opportunity.recommendedAmount));

    // Execute arbitrage
    const receipt = await engine.call('executeArbitrage', executeArgs, {
      coins: Mas.fromString('1'),
    });

    if (receipt) {
      logSuccess(
        `Arbitrage executed. Estimated profit: ${opportunity.estimatedProfit.toFixed(2)} bps`,
      );
      return true;
    }
  } catch (error) {
    logError(`Arbitrage execution failed: ${error}`);
  }
  return false;
}

// ============================================================================
// MONITORING & STATISTICS
// ============================================================================

/**
 * Get arbitrage engine statistics
 */
async function getEngineStats(
  provider: JsonRpcProvider,
  arbitrageEngineAddress: string,
): Promise<any> {
  try {
    const engine = new SmartContract(provider,arbitrageEngineAddress);
    const statsResult = await engine.read(
      'getStatistics',
      new Args(),
    );

    if (statsResult && statsResult.value) {
      return {
        opportunitiesDetected: statsResult.value[0] || 0,
        opportunitiesExecuted: statsResult.value[1] || 0,
        totalProfitRealized: statsResult.value[2] || 0,
        successRate: 0, // Will calculate below
        timestamp: new Date().toISOString(),
      };
    }
  } catch (error) {
    logWarning(`Failed to get engine statistics: ${error}`);
  }
  return null;
}

// ============================================================================
// MAIN OPERATIONS
// ============================================================================

/**
 * Detect arbitrage opportunities
 */
async function detectAction(): Promise<void> {
  logSection('🔍 ARBITRAGE OPPORTUNITY DETECTION');

  try {
    // Setup
    const account = await Account.fromEnv();
    const provider = JsonRpcProvider.buildnet(account);
    const { massaBeamAddress, arbitrageEngineAddress } =
      loadDeployedAddresses();

    log('Account:', account.address.toString().slice(0, 10) + '...');
    log('MassaBeam:', massaBeamAddress.slice(0, 10) + '...');
    log('Arbitrage Engine:', arbitrageEngineAddress.slice(0, 10) + '...');

    // Scan for opportunities
    logSection('🔎 SCANNING TOKEN PAIRS');
    const opportunities = await scanForOpportunities(
      provider,
      massaBeamAddress,
    );

    // Report results
    logSection('📊 DETECTION RESULTS');
    if (opportunities.length === 0) {
      logInfo('No profitable arbitrage opportunities found');
    } else {
      log('Opportunities Found:', opportunities.length.toString());
      opportunities.forEach((opp) => {
        console.log(`\n  📈 ${opp.tokenA.slice(0, 10)}.../${opp.tokenB.slice(0, 10)}...`);
        log('  MassaBeam Price:', opp.priceMassaBeam.toFixed(6));
        log('  Dusa Price:', opp.priceDusa.toFixed(6));
        log('  Discrepancy:', `${(opp.priceDiscrepancy / 100).toFixed(4)}%`);
        log('  Cheaper DEX:', opp.cheaperDEX);
        log('  Est. Profit:', `${opp.estimatedProfit.toFixed(2)} bps`);
      });
    }

    // Save results
    const results = {
      timestamp: new Date().toISOString(),
      opportunitiesFound: opportunities.length,
      opportunities: opportunities,
    };
    saveArbitrageStats(results);

    logSuccess('Detection completed');
  } catch (error) {
    logError(`Detection failed: ${error}`);
    throw error;
  }
}

/**
 * Execute top arbitrage opportunities
 */
async function executeAction(): Promise<void> {
  logSection('⚡ ARBITRAGE EXECUTION');

  try {
    // Setup
    const account = await Account.fromEnv();
    const provider = JsonRpcProvider.buildnet(account);
    const { massaBeamAddress, arbitrageEngineAddress } =
      loadDeployedAddresses();

    log('Account:', account.address.toString().slice(0, 10) + '...');
    log('Arbitrage Engine:', arbitrageEngineAddress.slice(0, 10) + '...');

    // Detect opportunities
    logSection('🔎 SCANNING FOR OPPORTUNITIES');
    const opportunities = await scanForOpportunities(
      provider,
      massaBeamAddress,
    );

    if (opportunities.length === 0) {
      logWarning('No profitable opportunities found');
      return;
    }

    // Sort by profit
    opportunities.sort((a, b) => b.estimatedProfit - a.estimatedProfit);

    // Execute top opportunities
    logSection('💰 EXECUTING ARBITRAGE');
    let executedCount = 0;
    let totalProfit = 0;

    for (const opp of opportunities.slice(
      0,
      ARBITRAGE_CONFIG.execution.maxOpportunitiesPerCycle,
    )) {
      const success = await executeArbitrage(
        provider,
        account,
        arbitrageEngineAddress,
        opp,
      );
      if (success) {
        executedCount++;
        totalProfit += opp.estimatedProfit;
      }
      await sleep(1000);
    }

    // Report statistics
    logSection('📊 EXECUTION RESULTS');
    log('Executed Trades:', executedCount.toString());
    log('Total Profit (bps):', totalProfit.toFixed(2));
    log('Avg Profit/Trade (bps):', (totalProfit / executedCount).toFixed(2));

    logSuccess('Execution completed');
  } catch (error) {
    logError(`Execution failed: ${error}`);
    throw error;
  }
}

/**
 * Monitor arbitrage engine statistics
 */
async function monitorAction(): Promise<void> {
  logSection('📈 ARBITRAGE ENGINE MONITORING');

  try {
    // Setup
    const account = await Account.fromEnv();
    const provider = JsonRpcProvider.buildnet(account);
    const { arbitrageEngineAddress } = loadDeployedAddresses();

    log('Arbitrage Engine:', arbitrageEngineAddress.slice(0, 10) + '...');

    // Get statistics
    logSection('📊 ENGINE STATISTICS');
    const stats = await getEngineStats(provider, arbitrageEngineAddress);

    if (stats) {
      log('Opportunities Detected:', stats.opportunitiesDetected.toString());
      log('Opportunities Executed:', stats.opportunitiesExecuted.toString());
      log('Total Profit Realized:', stats.totalProfitRealized.toString());
      if (stats.opportunitiesDetected > 0) {
        const successRate = (
          (stats.opportunitiesExecuted / stats.opportunitiesDetected) *
          100
        ).toFixed(2);
        log('Success Rate:', `${successRate}%`);
      }
      log('Last Update:', stats.timestamp);
    } else {
      logWarning('Could not retrieve statistics');
    }

    logSuccess('Monitoring completed');
  } catch (error) {
    logError(`Monitoring failed: ${error}`);
    throw error;
  }
}

/**
 * Start autonomous arbitrage engine
 */
async function startAction(): Promise<void> {
  logSection('🤖 STARTING AUTONOMOUS ARBITRAGE ENGINE');

  try {
    // Setup
    const account = await Account.fromEnv();
    const provider = JsonRpcProvider.buildnet(account);
    const { arbitrageEngineAddress } = loadDeployedAddresses();

    log('Account:', account.address.toString().slice(0, 10) + '...');
    log('Arbitrage Engine:', arbitrageEngineAddress.slice(0, 10) + '...');

    // Initialize engine
    logSection('🚀 INITIALIZING ENGINE');
    const engine = new SmartContract(provider,arbitrageEngineAddress);

    const initArgs = new Args();
    const initReceipt = await engine.call( 'startEngine', initArgs, {
      coins: Mas.fromString('1'),
    });

    if (initReceipt) {
      logSuccess('Engine initialized and started');
      logSection('The arbitrage engine is now running autonomously');
      log('It will scan for opportunities every', ARBITRAGE_CONFIG.scanning.scanInterval + ' slots');
      logInfo('The engine runs through callNextSlot() - no manual intervention needed');
    } else {
      logError('Failed to initialize engine');
    }

    logSuccess('Engine startup completed');
  } catch (error) {
    logError(`Engine startup failed: ${error}`);
    throw error;
  }
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const actionIndex = args.findIndex((arg) => arg === '--action');
  const action = actionIndex !== -1 ? args[actionIndex + 1] : 'all';

  try {
    switch (action) {
      case 'detect':
        await detectAction();
        break;
      case 'execute':
        await executeAction();
        break;
      case 'monitor':
        await monitorAction();
        break;
      case 'start':
        await startAction();
        break;
      case 'all':
        await detectAction();
        await sleep(2000);
        await executeAction();
        await sleep(2000);
        await monitorAction();
        break;
      default:
        console.log('Invalid action. Available actions:');
        console.log('  detect  - Detect arbitrage opportunities');
        console.log('  execute - Execute detected opportunities');
        console.log('  monitor - Monitor engine statistics');
        console.log('  start   - Start autonomous engine');
        console.log('  all     - Run complete cycle (default)');
        process.exit(1);
    }

    console.log(
      '\n✅ Arbitrage operation completed successfully!\n',
    );
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Arbitrage operation failed:', error, '\n');
    process.exit(1);
  }
}

main();
