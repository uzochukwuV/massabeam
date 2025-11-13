/**
 * SmartSwap Router Script
 *
 * Comprehensive script for executing intelligent swaps that automatically
 * route trades between MassaBeam and Dusa based on best prices.
 *
 * Features:
 * - Automatic DEX selection (MassaBeam vs Dusa)
 * - Price comparison and best route discovery
 * - Multi-DEX swap execution
 * - Slippage protection and deadline enforcement
 * - Comprehensive statistics and reporting
 * - Support for multiple swap scenarios
 *
 * Usage:
 *   npx ts-node src/smart-swap.ts --action swap
 *   npx ts-node src/smart-swap.ts --action quote
 *   npx ts-node src/smart-swap.ts --action compare
 *   npx ts-node src/smart-swap.ts --action all
 */

import 'dotenv/config';
import {
  Account,
  Args,
  Mas,
  SmartContract,
  JsonRpcProvider,
} from '@massalabs/massa-web3';
import { DAI, USDC, WETH } from '@dusalabs/sdk';
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
 * SmartSwap operations configuration
 * Multiple swap scenarios demonstrating different token pairs and amounts
 */
const SMARTSWAP_CONFIG = {
  swaps: [
    {
      name: 'DAI → USDC (Small)',
      tokenIn: DAI[0],
      tokenOut: USDC[0],
      amountIn: '1000000000000000000', // 1 DAI (18 decimals)
      slippagePercent: 2, // 2% slippage
      deadline: 60 * 60 * 100, // 1 hour
    },
    {
      name: 'USDC → DAI (Medium)',
      tokenIn: USDC[0],
      tokenOut: DAI[0],
      amountIn: '5000000', // 5 USDC (6 decimals)
      slippagePercent: 2,
      deadline: 60 * 60 * 100,
    },
    {
      name: 'USDC → WETH (Cross-chain)',
      tokenIn: USDC[0],
      tokenOut: WETH[0],
      amountIn: '100000000', // 100 USDC (6 decimals)
      slippagePercent: 5,
      deadline: 60 * 60 * 100,
    },
    {
      name: 'DAI → WETH (Large)',
      tokenIn: DAI[0],
      tokenOut: WETH[0],
      amountIn: '10000000000000000000', // 10 DAI (18 decimals)
      slippagePercent: 3,
      deadline: 60 * 60 * 100,
    },
  ],

  quotes: [
    {
      name: 'Quote: DAI → USDC',
      tokenIn: DAI[0],
      tokenOut: USDC[0],
      amountIn: '1000000000000000000', // 1 DAI
    },
    {
      name: 'Quote: USDC → DAI',
      tokenIn: USDC[0],
      tokenOut: DAI[0],
      amountIn: '5000000', // 5 USDC
    },
  ],
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Convert decimal amount to wei with proper decimals
 */
function toWei(amount: string, decimals: number): bigint {
  const multiplier = BigInt(10 ** decimals);
  const [whole, decimal = '0'] = amount.split('.');
  const decimalPart = decimal.padEnd(decimals, '0').slice(0, decimals);
  return BigInt(whole) * multiplier + BigInt(decimalPart);
}

/**
 * Convert wei to readable decimal format
 */
function fromWei(amount: bigint, decimals: number): string {
  const divisor = BigInt(10 ** decimals);
  const whole = amount / divisor;
  const remainder = amount % divisor;
  const paddedRemainder = remainder.toString().padStart(decimals, '0');
  return `${whole}.${paddedRemainder}`;
}

/**
 * Calculate minimum output with slippage protection
 */
function calculateMinOutput(amountOut: bigint, slippagePercent: number): bigint {
  const slippageFactor = BigInt(Math.floor((100 - slippagePercent) * 100)) / BigInt(10000);
  return (amountOut * slippageFactor) / BigInt(100);
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Formatted logging functions
 */
function log(title: string, message: string): void {
  console.log(`  ${title.padEnd(25)} ${message}`);
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

function logWarning(message: string): void {
  console.log(`  ⚠️  ${message}`);
}

// ============================================================================
// QUOTE FUNCTIONS
// ============================================================================

/**
 * Get best quote for a swap (read-only)
 * Compares prices on MassaBeam and Dusa, returns best quote
 */
async function getBestQuote(
  smartSwapContract: SmartContract,
  tokenIn: (typeof DAI)[0],
  tokenOut: (typeof USDC)[0],
  amountIn: bigint
): Promise<{ dex: string; amountOut: bigint; priceImpact: number; fee: number } | null> {
  try {
    logInfo(`Getting best quote for ${tokenIn.symbol} → ${tokenOut.symbol}...`);

    const quoteArgs = new Args()
      .addString(tokenIn.address)
      .addString(tokenOut.address)
      .addU64(amountIn);

    const result = await smartSwapContract.read('getBestQuote', quoteArgs);

    if (!result.value || result.value.length === 0) {
      logWarning('No quote available');
      return null;
    }

    const args = new Args(result.value);
    const dex = args.nextString();
    const amountOut = args.nextU64();
    const priceImpactBps = args.nextU64();
    const fee = args.nextU64();
    const reason = args.nextString();

    const priceImpact = Number(priceImpactBps) / 100.0;

    log('DEX Selected:', dex);
    log('Amount Out:', `${fromWei(amountOut, tokenOut.decimals)} ${tokenOut.symbol}`);
    log('Price Impact:', `${priceImpact.toFixed(2)}%`);
    log('Fee:', `${Number(fee) / 100.0}%`);
    log('Reason:', reason);

    return { dex, amountOut, priceImpact, fee: Number(fee) };
  } catch (error) {
    logError(`Failed to get quote: ${error}`);
    return null;
  }
}

/**
 * Compare quotes from both DEXs
 */
async function compareQuotes(
  smartSwapContract: SmartContract,
  tokenIn: (typeof DAI)[0],
  tokenOut: (typeof USDC)[0],
  amountIn: bigint
): Promise<void> {
  try {
    logInfo(`Comparing quotes for ${tokenIn.symbol} → ${tokenOut.symbol}...`);

    const compareArgs = new Args()
      .addString(tokenIn.address)
      .addString(tokenOut.address)
      .addU64(amountIn);

    const result = await smartSwapContract.read('compareQuotes', compareArgs);

    if (!result.value || result.value.length === 0) {
      logWarning('Could not compare quotes');
      return;
    }

    const args = new Args(result.value);

    // Parse MassaBeam quote
    const massaBeamDex = args.nextString();
    const massaBeamOut = args.nextU64();
    const massaBeamImpact = args.nextU64();
    const massaBeamFee = args.nextU64();
    const massaBeamGas = args.nextU64();

    // Parse Dusa quote
    const dusaDex = args.nextString();
    const dusaOut = args.nextU64();
    const dusaImpact = args.nextU64();
    const dusaFee = args.nextU64();
    const dusaGas = args.nextU64();

    logSection('💰 QUOTE COMPARISON');

    log('', '');
    log('DEX', 'MassaBeam vs Dusa');
    log('─'.repeat(25), '─'.repeat(45));

    log('Output Amount',
      `${fromWei(massaBeamOut, tokenOut.decimals)} vs ${fromWei(dusaOut, tokenOut.decimals)} ${tokenOut.symbol}`);
    log('Price Impact',
      `${(Number(massaBeamImpact) / 100.0).toFixed(2)}% vs ${(Number(dusaImpact) / 100.0).toFixed(2)}%`);
    log('Fee',
      `${Number(massaBeamFee) / 100.0}% vs ${Number(dusaFee) / 100.0}%`);
    log('Gas Estimate',
      `${massaBeamGas} vs ${dusaGas} MAS`);

    // Determine winner
    const winner = massaBeamOut > dusaOut ? 'MassaBeam' : 'Dusa';
    const difference = massaBeamOut > dusaOut
      ? massaBeamOut - dusaOut
      : dusaOut - massaBeamOut;
    const percentDiff = (Number(difference) / Number(massaBeamOut > dusaOut ? dusaOut : massaBeamOut)) * 100.0;

    log('', '');
    logSuccess(`${winner} offers better price (+${percentDiff.toFixed(2)}% improvement)`);
  } catch (error) {
    logError(`Failed to compare quotes: ${error}`);
  }
}

// ============================================================================
// SWAP FUNCTIONS
// ============================================================================

/**
 * Execute a smart swap with automatic DEX selection
 */
async function executeSmartSwap(
  smartSwapContract: SmartContract,
  swap: (typeof SMARTSWAP_CONFIG.swaps)[0],
  account: Account,
  provider: JsonRpcProvider
): Promise<boolean> {
  logSection(`🔄 EXECUTING SMART SWAP: ${swap.name}`);

  try {
    log('Token In:', `${swap.tokenIn.symbol} (${swap.tokenIn.address.slice(0, 10)}...)`);
    log('Token Out:', `${swap.tokenOut.symbol} (${swap.tokenOut.address.slice(0, 10)}...)`);

    const amountInBigInt = BigInt(swap.amountIn);
    log('Amount In:', `${fromWei(amountInBigInt, swap.tokenIn.decimals)} ${swap.tokenIn.symbol}`);
    log('Slippage:', `${swap.slippagePercent}%`);
    log('Deadline:', `${swap.deadline} seconds`);

    // Step 1: Get best quote
    logInfo('Getting best quote...');
    const quoteResult = await getBestQuote(
      smartSwapContract,
      swap.tokenIn,
      swap.tokenOut,
      amountInBigInt
    );

    if (!quoteResult) {
      logError('No liquidity available on either DEX');
      return false;
    }

    // Step 2: Calculate minimum output with slippage
    const minAmountOut = calculateMinOutput(quoteResult.amountOut, swap.slippagePercent);

    logInfo(`Minimum output with slippage: ${fromWei(minAmountOut, swap.tokenOut.decimals)} ${swap.tokenOut.symbol}`);

    // Step 3: Prepare swap arguments
    const deadline = Math.floor(Date.now() / 1000) + swap.deadline;
    const swapArgs = new Args()
      .addString(swap.tokenIn.address)
      .addString(swap.tokenOut.address)
      .addU64(amountInBigInt)
      .addU64(minAmountOut)
      .addU64(BigInt(deadline));

    // Step 4: Execute swap
    logInfo('Executing swap on selected DEX...');
    const result = await smartSwapContract.call('smartSwap', swapArgs, {
      coins: Mas.fromString('0.1'),
    });

    logSuccess(`Swap executed successfully!`);
    log('Transaction:', result.toString());

    // Display results
    logSection('📊 SWAP RESULTS');
    log('Expected Output:', `${fromWei(quoteResult.amountOut, swap.tokenOut.decimals)} ${swap.tokenOut.symbol}`);
    log('Minimum Output:', `${fromWei(minAmountOut, swap.tokenOut.decimals)} ${swap.tokenOut.symbol}`);
    log('DEX Used:', quoteResult.dex);
    log('Price Impact:', `${quoteResult.priceImpact.toFixed(2)}%`);

    await sleep(2000);
    return true;
  } catch (error) {
    logError(`Failed to execute swap: ${error}`);
    return false;
  }
}

// ============================================================================
// STATISTICS FUNCTIONS
// ============================================================================

/**
 * Get and display routing statistics
 */
async function getStatistics(smartSwapContract: SmartContract): Promise<void> {
  try {
    logInfo('Loading routing statistics...');

    const result = await smartSwapContract.read('getStatistics', new Args());

    if (!result.value || result.value.length === 0) {
      logWarning('No statistics available yet');
      return;
    }

    const args = new Args(result.value);
    const totalSwaps = args.nextString();
    const dusaSwaps = args.nextString();
    const massabeamSwaps = args.nextString();
    const totalVolume = args.nextString();
    const totalSavings = args.nextString();

    logSection('📈 SMARTSWAP ROUTING STATISTICS');
    log('Total Swaps', totalSwaps);
    log('MassaBeam Swaps', massabeamSwaps);
    log('Dusa Swaps', dusaSwaps);
    log('Total Volume (wei)', totalVolume);
    log('Total Savings (wei)', totalSavings);

    // Calculate percentages
    const total = parseInt(totalSwaps);
    if (total > 0) {
      const dusaPercent = (parseInt(dusaSwaps) / total * 100).toFixed(1);
      const massaPercent = (parseInt(massabeamSwaps) / total * 100).toFixed(1);

      logInfo(`MassaBeam: ${massaPercent}% | Dusa: ${dusaPercent}%`);
    }

    logSuccess('Statistics loaded');
  } catch (error) {
    logInfo(`Could not load statistics: ${error}`);
  }
}

// ============================================================================
// ADMIN FUNCTIONS
// ============================================================================

/**
 * Update DEX contract addresses
 */
async function updateAddresses(
  smartSwapContract: SmartContract,
  dusaRouterAddress: string,
  massaBeamAddress: string
): Promise<boolean> {
  logSection('🔧 UPDATING CONTRACT ADDRESSES');

  try {
    log('Dusa Router:', dusaRouterAddress.slice(0, 10) + '...');
    log('MassaBeam AMM:', massaBeamAddress.slice(0, 10) + '...');

    logInfo('Sending update transaction...');

    const updateArgs = new Args()
      .addString(dusaRouterAddress)
      .addString(massaBeamAddress);

    const result = await smartSwapContract.call('updateAddresses', updateArgs, {
      coins: Mas.fromString('0.01'),
    });

    logSuccess('Addresses updated successfully!');
    log('Transaction:', result.toString());
    await sleep(2000);
    return true;
  } catch (error) {
    logError(`Failed to update addresses: ${error}`);
    return false;
  }
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main(): Promise<void> {
  logSection('🤖 SMARTSWAP ROUTER EXECUTION');

  // Get action from command line arguments
  const args = process.argv.slice(2);
  const action = args.find((arg) => arg.startsWith('--action='))?.split('=')[1] || 'all';

  if (!['swap', 'quote', 'compare', 'stats', 'all'].includes(action)) {
    logError(`Invalid action: ${action}. Use: swap, quote, compare, stats, or all`);
    process.exit(1);
  }

  try {
    // Setup account and provider
    logSection('🔑 ACCOUNT SETUP');
    const account = await Account.fromEnv();
    log('Account:', account.address.toString());

    const provider = JsonRpcProvider.buildnet(account);
    const balance = await provider.balanceOf([account.address.toString()]);
    const balanceNum = balance[0].balance;
    log('MAS Balance:', balanceNum.toString());

    logSuccess('Account setup complete');
    await sleep(1000);

    // Load deployed addresses
    logSection('📋 LOADING DEPLOYMENT INFO');
    const addressesPath = path.join(__dirname, '../deployed-addresses.json');

    let smartSwapAddress: string;
    if (fs.existsSync(addressesPath)) {
      const deployedAddresses = JSON.parse(fs.readFileSync(addressesPath, 'utf-8'));
      smartSwapAddress = deployedAddresses.contracts.smartSwap;
      log('SmartSwap Contract:', smartSwapAddress);
    } else {
      logError('deployed-addresses.json not found!');
      logInfo('Please run: npx ts-node src/deploy-massabeam.ts');
      process.exit(1);
    }

    const smartSwapContract = new SmartContract(provider, smartSwapAddress);
    logSuccess('SmartSwap contract loaded');
    await sleep(1000);

    // Display token information
    logSection('📊 TOKEN INFORMATION');
    log('DAI', `${DAI[0].symbol} - ${DAI[0].address.slice(0, 10)}...`);
    log('USDC', `${USDC[0].symbol} - ${USDC[0].address.slice(0, 10)}...`);
    log('WETH', `${WETH[0].symbol} - ${WETH[0].address.slice(0, 10)}...`);
    logSuccess('Tokens configured');
    await sleep(1000);

    // Execute quote operations
    if (action === 'quote' || action === 'all') {
      logSection('💡 QUOTE OPERATIONS');
      let successCount = 0;

      for (const quote of SMARTSWAP_CONFIG.quotes) {
        logSection(quote.name);
        const result = await getBestQuote(
          smartSwapContract,
          quote.tokenIn,
          quote.tokenOut,
          BigInt(quote.amountIn)
        );
        if (result) successCount++;
        await sleep(1000);
      }

      logSection('✅ QUOTE SUMMARY');
      log('Successful Quotes:', `${successCount}/${SMARTSWAP_CONFIG.quotes.length}`);
      logSuccess('Quote phase complete');
      await sleep(2000);
    }

    // Execute comparison operations
    if (action === 'compare' || action === 'all') {
      logSection('📊 COMPARISON OPERATIONS');

      for (const quote of SMARTSWAP_CONFIG.quotes) {
        await compareQuotes(
          smartSwapContract,
          quote.tokenIn,
          quote.tokenOut,
          BigInt(quote.amountIn)
        );
        await sleep(1000);
      }

      logSuccess('Comparison phase complete');
      await sleep(2000);
    }

    // Execute swap operations
    if (action === 'swap' || action === 'all') {
      logSection('🔄 SWAP OPERATIONS');
      let successCount = 0;

      for (const swap of SMARTSWAP_CONFIG.swaps) {
        const success = await executeSmartSwap(smartSwapContract, swap, account, provider);
        if (success) successCount++;
      }

      logSection('✅ SWAP SUMMARY');
      log('Successful Swaps:', `${successCount}/${SMARTSWAP_CONFIG.swaps.length}`);
      logSuccess('Swap phase complete');
      await sleep(2000);
    }

    // Display statistics
    if (action === 'stats' || action === 'all') {
      logSection('📈 STATISTICS');
      await getStatistics(smartSwapContract);
      await sleep(1000);
    }

    // Final summary
    logSection('✨ SMARTSWAP EXECUTION COMPLETE');
    console.log(`
  📝 Summary:
  - Action executed: ${action.toUpperCase()}
  - Account: ${account.address.toString()}
  - SmartSwap Contract: ${smartSwapAddress}
  - Network: Buildnet
  - Timestamp: ${new Date().toISOString()}

  Next steps:
  1. Monitor transaction status on block explorer
  2. Check routing decisions in contract events
  3. Verify swap execution on both DEXs
  4. Compare actual output with expected slippage
  5. Review routing statistics for optimization
    `);

    console.log(`${'═'.repeat(70)}\n`);
  } catch (error) {
    logError(`SmartSwap execution failed: ${error}`);
    process.exit(1);
  }
}

// Execute main function
main()
  .then(() => {
    logSuccess('Script completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    logError(`Script failed: ${error}`);
    process.exit(1);
  });
