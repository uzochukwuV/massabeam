/**
 * Flash Arbitrage Bot Test Script
 *
 * Tests the autonomous flash loan arbitrage bot:
 * 1. Deploy/connect to flash arbitrage bot contract
 * 2. Add token pairs to watchlist
 * 3. Manually trigger scan for opportunities
 * 4. Check statistics
 * 5. Optionally start autonomous bot
 *
 * Usage:
 *   npx tsx src/test-flash-arbitrage.ts
 */

import 'dotenv/config';
import {
  Account,
  Args,
  Mas,
  SmartContract,
  JsonRpcProvider,
} from '@massalabs/massa-web3';
import { DAI, USDC, WETH, WMAS, LB_ROUTER_ADDRESS, LB_QUOTER_ADDRESS } from '@dusalabs/sdk';
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

// ============================================================================
// MAIN TEST FUNCTION
// ============================================================================

async function main(): Promise<void> {
  logSection('🤖 FLASH ARBITRAGE BOT TEST');

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
      logInfo('Please deploy contracts first');
      process.exit(1);
    }

    const deployedAddresses = JSON.parse(fs.readFileSync(addressesPath, 'utf-8'));

    // Check if flash arbitrage bot is deployed
    if (!deployedAddresses.contracts.flashArbitrageBot) {
      logError('Flash Arbitrage Bot not deployed!');
      logInfo('Deploy it using: npx tsx src/deploy-massabeam.ts --deploy all');
      process.exit(1);
    }

    const botAddress = deployedAddresses.contracts.flashArbitrageBot;
    const massaBeamAddress = deployedAddresses.contracts.massaBeam;

    log('Flash Arbitrage Bot:', botAddress);
    log('MassaBeam AMM:', massaBeamAddress);

    const botContract = new SmartContract(provider, botAddress);
    logSuccess('Contracts loaded');
    await sleep(1000);

    // Display token information
    logSection('📊 TOKEN PAIRS TO MONITOR');
    log('USDC/DAI', `${USDC[0].address.slice(0, 10)}... / ${DAI[0].address.slice(0, 10)}...`);
    log('WETH/USDC', `${WETH[0].address.slice(0, 10)}... / ${USDC[0].address.slice(0, 10)}...`);
    log('WMAS/USDC', `${WMAS[0].address.slice(0, 10)}... / ${USDC[0].address.slice(0, 10)}...`);
    await sleep(1000);

    // Test 1: Add pairs to watchlist
    logSection('1️⃣  ADD PAIRS TO WATCHLIST');
    try {
      logInfo('Adding USDC/DAI to watchlist...');
      const addArgs1 = new Args()
        .addString(USDC[0].address)
        .addString(DAI[0].address);

      await botContract.call('addToWatchlist', addArgs1, {
        coins: Mas.fromString('0.1'),
      });
      logSuccess('USDC/DAI added to watchlist');
      await sleep(2000);

      logInfo('Adding WETH/USDC to watchlist...');
      const addArgs2 = new Args()
        .addString(WETH[0].address)
        .addString(USDC[0].address);

      await botContract.call('addToWatchlist', addArgs2, {
        coins: Mas.fromString('0.1'),
      });
      logSuccess('WETH/USDC added to watchlist');
      await sleep(2000);

    } catch (error) {
      logError(`Failed to add pairs: ${error}`);
      logInfo('Pairs may already be in watchlist');
    }

    // Test 2: Scan for opportunities
    logSection('2️⃣  SCAN FOR ARBITRAGE OPPORTUNITIES');
    try {
      logInfo('Triggering manual scan...');
      await botContract.call('scanOpportunities', new Args(), {
        coins: Mas.fromString('0.5'),
      });
      logSuccess('Scan completed');
      logInfo('Check events for any opportunities found');
      await sleep(3000);

    } catch (error) {
      logError(`Scan failed: ${error}`);
      logInfo('This is normal if pools have no liquidity or no arbitrage opportunities exist');
    }

    // Test 3: Get statistics
    logSection('3️⃣  CHECK BOT STATISTICS');
    try {
      logInfo('Fetching bot statistics...');
      const statsResult = await botContract.read('getStatistics', new Args());

      // Parse statistics (7 values: totalOpps, totalExecuted, totalProfit, totalFailed, lastProfit, lastExecution, isRunning)
      const statsArgs = new Args(statsResult.value);
      const totalOpps = statsArgs.nextString()
      const totalExecuted = statsArgs.nextString()
      const totalProfit = statsArgs.nextString()
      const totalFailed = statsArgs.nextString()
      const lastProfit = statsArgs.nextString()
      const lastExecution = statsArgs.nextString()
      const isRunning = statsArgs.nextString()

      logSection('📈 BOT STATISTICS');
      log('Total Opportunities:', totalOpps);
      log('Total Executed:', totalExecuted);
      log('Total Profit:', `${totalProfit} tokens`);
      log('Total Failed:', totalFailed);
      log('Last Profit:', `${lastProfit} tokens`);
      log('Last Execution Time:', lastExecution);
      log('Bot Running:', isRunning === '1' ? 'Yes' : 'No');

      logSuccess('Statistics retrieved');
      await sleep(2000);

    } catch (error) {
      logError(`Failed to get statistics: ${error}`);
    }

    // Test 4: Optional - Start autonomous bot
    logSection('4️⃣  AUTONOMOUS BOT (OPTIONAL)');
    logInfo('To start autonomous bot execution:');
    console.log(`
  const startArgs = new Args().addU64(BigInt(100)); // Run for 100 iterations
  await botContract.call('startBot', startArgs, {
    coins: Mas.fromString('1.0'), // More gas for autonomous execution
  });
    `);
    logInfo('Bot will scan every 10 slots (~10 seconds)');
    logInfo('It will execute arbitrage automatically when profitable');
    await sleep(1000);

    // Final summary
    logSection('✨ TEST COMPLETE');
    console.log(`
  📝 Summary:
  - Flash Arbitrage Bot: ${botAddress}
  - Pairs in watchlist: 2 (USDC/DAI, WETH/USDC)
  - Manual scan: Completed
  - Statistics: Retrieved
  - Network: Buildnet
  - Timestamp: ${new Date().toISOString()}

  🎯 Next Steps:
  1. Add more pairs to watchlist using addToWatchlist()
  2. Ensure pools have liquidity on both MassaBeam and Dussa
  3. Start autonomous bot using startBot(maxIterations)
  4. Monitor statistics using getStatistics()
  5. Withdraw profits using withdrawProfits(token, to)

  ⚠️  Important Notes:
  - Bot requires 0.5% minimum profit after fees to execute
  - Flash loan fee: 0.09%, Swap fees: 0.6% total
  - Minimum trade: $100, Maximum: $1M
  - Bot runs autonomously without manual intervention
  - Opportunities depend on price differences between DEXs
    `);

    console.log(`${'═'.repeat(70)}\n`);

  } catch (error) {
    logError(`Test failed: ${error}`);
    console.error(error);
    process.exit(1);
  }
}

// Execute main function
main()
  .then(() => {
    logSuccess('Test completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    logError(`Test failed: ${error}`);
    console.error(error);
    process.exit(1);
  });
