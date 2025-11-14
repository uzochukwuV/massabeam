/**
 * MassaBeam SmartSwap Router - Comprehensive Test Suite
 *
 * Tests intelligent routing between MassaBeam and Dusa with u256 support:
 * - Quote comparison (MassaBeam vs Dusa)
 * - Best route selection
 * - Smart swap execution (fungible tokens)
 * - Native MAS token swaps
 * - Routing statistics
 * - Multi-path optimization
 *
 * Usage:
 *   npm run test:smartswap -- --action quote
 *   npm run test:smartswap -- --action swap
 *   npm run test:smartswap -- --action mas
 *   npm run test:smartswap -- --action stats
 *   npm run test:smartswap -- --action all
 */

import 'dotenv/config';
import { Args, SmartContract, Mas } from '@massalabs/massa-web3';
import { DAI, USDC, WETH, USDT } from '@dusalabs/sdk';
import {
  Logger,
  initializeAccount,
  loadDeployedAddresses,
  approveToken,
  validateTokenOperation,
  callContract,
  readContract,
  sleep,
  parseTokenAmount,
  formatTokenAmount,
  calculateMinOutput,
  calculateDeadline,
  toU256,
  fromU256,
} from './test-utils.js';

// ============================================================================
// TEST CONFIGURATION
// ============================================================================

const TEST_CONFIG = {
  // Fungible token swaps
  fungibleSwaps: [
    {
      name: 'DAI → USDC (Small)',
      tokenIn: DAI[0],
      tokenOut: USDC[0],
      amountIn: '100',      // 100 DAI
      slippageBps: 200,     // 2% slippage
    },
    {
      name: 'USDC → DAI (Medium)',
      tokenIn: USDC[0],
      tokenOut: DAI[0],
      amountIn: '500',      // 500 USDC
      slippageBps: 200,
    },
    {
      name: 'WETH → USDC (Large)',
      tokenIn: WETH[0],
      tokenOut: USDC[0],
      amountIn: '2',        // 2 WETH
      slippageBps: 300,     // 3% slippage
    },
    {
      name: 'DAI → WETH (Cross)',
      tokenIn: DAI[0],
      tokenOut: WETH[0],
      amountIn: '1000',     // 1000 DAI
      slippageBps: 400,     // 4% slippage
    },
  ],

  // Native MAS token swaps
  masSwaps: [
    {
      name: 'MAS → USDC',
      tokenOut: USDC[0],
      masAmount: '10',      // 10 MAS
      slippageBps: 300,
    },
    {
      name: 'USDC → MAS',
      tokenIn: USDC[0],
      usdcAmount: '100',    // 100 USDC
      slippageBps: 300,
    },
    {
      name: 'MAS → DAI',
      tokenOut: DAI[0],
      masAmount: '5',       // 5 MAS
      slippageBps: 300,
    },
    {
      name: 'DAI → MAS',
      tokenIn: DAI[0],
      daiAmount: '50',      // 50 DAI
      slippageBps: 300,
    },
  ],

  // Quote comparisons
  quoteTests: [
    {
      name: 'DAI/USDC Quote',
      tokenIn: DAI[0],
      tokenOut: USDC[0],
      amountIn: '1000',
    },
    {
      name: 'WETH/USDC Quote',
      tokenIn: WETH[0],
      tokenOut: USDC[0],
      amountIn: '1',
    },
  ],
};

// ============================================================================
// QUOTE COMPARISON
// ============================================================================

async function testQuoteComparison(
  contract: SmartContract,
  test: typeof TEST_CONFIG.quoteTests[0]
) {
  Logger.section(`💡 QUOTE COMPARISON: ${test.name}`);

  try {
    const amountIn = parseTokenAmount(test.amountIn, test.tokenIn.decimals);

    Logger.log('Token In', test.tokenIn.symbol!);
    Logger.log('Token Out', test.tokenOut.symbol!);
    Logger.log('Amount In', `${test.amountIn} ${test.tokenIn.symbol}`);

    // Get best quote
    Logger.info('Fetching best quote from SmartSwap...');
    const quoteArgs = new Args()
      .addString(test.tokenIn.address)
      .addString(test.tokenOut.address)
      .addU256(toU256(amountIn));

    const result = await readContract(contract, 'getBestQuote', quoteArgs);

    if (result.value && result.value.length > 0) {
      const args = new Args(result.value);
      const dex = args.nextString()
      const amountOut = fromU256(args.nextU256());
      const priceImpactBps = args.nextU64()
      const feeBps = args.nextU64()
      const reason = args.nextString()

      Logger.section('📊 BEST QUOTE RESULTS');
      Logger.log('Selected DEX', dex);
      Logger.log('Amount Out', formatTokenAmount(amountOut, test.tokenOut.decimals, test.tokenOut.symbol));
      Logger.log('Price Impact', `${Number(priceImpactBps) / 100}%`);
      Logger.log('Fee', `${Number(feeBps) / 100}%`);
      Logger.log('Reason', reason);

      // Get comparison between both DEXs
      Logger.info('Comparing MassaBeam vs Dusa...');
      const compareResult = await readContract(contract, 'compareQuotes', quoteArgs);

      if (compareResult.value && compareResult.value.length > 0) {
        const cArgs = new Args(compareResult.value);

        // MassaBeam quote
        const mbDex = cArgs.nextString();
        const mbOut = fromU256(cArgs.nextU256());
        const mbImpact = cArgs.nextU64();
        const mbFee = cArgs.nextU64();
        const mbGas = cArgs.nextU64();

        // Dusa quote
        const dusaDex = cArgs.nextString();
        const dusaOut = fromU256(cArgs.nextU256());
        const dusaImpact = cArgs.nextU64();
        const dusaFee = cArgs.nextU64();
        const dusaGas = cArgs.nextU64();

        Logger.section('⚖️  DEX COMPARISON');
        Logger.log('', 'MassaBeam vs Dusa');
        Logger.log('─'.repeat(25), '─'.repeat(40));
        Logger.log('Output',
          `${formatTokenAmount(mbOut, test.tokenOut.decimals)} vs ${formatTokenAmount(dusaOut, test.tokenOut.decimals)}`);
        Logger.log('Price Impact',
          `${Number(mbImpact) / 100}% vs ${Number(dusaImpact) / 100}%`);
        Logger.log('Fee',
          `${Number(mbFee) / 100}% vs ${Number(dusaFee) / 100}%`);
        Logger.log('Gas Estimate',
          `${mbGas} vs ${dusaGas} MAS`);
      }

      return true;
    } else {
      Logger.warn('No quote available');
      return false;
    }
  } catch (error) {
    Logger.error(`Quote comparison failed: ${error}`);
    return false;
  }
}

// ============================================================================
// FUNGIBLE TOKEN SWAPS
// ============================================================================

async function executeFungibleSwap(
  contract: SmartContract,
  swap: typeof TEST_CONFIG.fungibleSwaps[0],
  contractAddress: string
) {
  Logger.section(`🔄 SMART SWAP: ${swap.name}`);

  try {
    const { provider, account } = await initializeAccount();

    const amountIn = parseTokenAmount(swap.amountIn, swap.tokenIn.decimals);

    Logger.log('Token In', swap.tokenIn.symbol!);
    Logger.log('Token Out', swap.tokenOut.symbol!);
    Logger.log('Amount In', `${swap.amountIn} ${swap.tokenIn.symbol!}`);
    Logger.log('Max Slippage', `${swap.slippageBps / 100}%`);

    // Get quote
    Logger.info('Getting best quote...');
    const quoteArgs = new Args()
      .addString(swap.tokenIn.address)
      .addString(swap.tokenOut.address)
      .addU256(toU256(amountIn));

    const quoteResult = await readContract(contract, 'getBestQuote', quoteArgs);
    const quoteArgs2 = new Args(quoteResult.value);
    const selectedDex = quoteArgs2.nextString();
    const expectedOut = fromU256(quoteArgs2.nextU256());

    const minAmountOut = calculateMinOutput(expectedOut, swap.slippageBps);

    Logger.log('Selected DEX', selectedDex);
    Logger.log('Expected Out', formatTokenAmount(expectedOut, swap.tokenOut.decimals, swap.tokenOut.symbol));
    Logger.log('Min Out', formatTokenAmount(minAmountOut, swap.tokenOut.decimals, swap.tokenOut.symbol));

    // Validate and approve
    const validation = await validateTokenOperation(
      provider,
      swap.tokenIn.address,
      account.address.toString(),
      contractAddress,
      amountIn,
      swap.tokenIn.symbol
    );

    if (!validation.hasBalance) {
      Logger.error('Insufficient balance');
      return false;
    }

    if (validation.needsApproval) {
      await approveToken(provider, swap.tokenIn.address, contractAddress, amountIn, swap.tokenIn.symbol);
    }

    // Execute smart swap (u256 for amounts, u64 for deadline)
    Logger.info(`Executing swap on ${selectedDex}...`);
    const deadline = calculateDeadline(600); // 10 minutes

    const swapArgs = new Args()
      .addString(swap.tokenIn.address)
      .addString(swap.tokenOut.address)
      .addU256(toU256(amountIn))
      .addU256(toU256(minAmountOut))
      .addU64(BigInt(deadline));

    await callContract(contract, 'smartSwap', swapArgs, '0.2', `SmartSwap ${swap.name}`);

    Logger.success('Smart swap executed successfully!');
    return true;
  } catch (error) {
    Logger.error(`Smart swap failed: ${error}`);
    return false;
  }
}

// ============================================================================
// NATIVE MAS TOKEN SWAPS
// ============================================================================

async function executeMASSwap(
  contract: SmartContract,
  swap: typeof TEST_CONFIG.masSwaps[0],
  massaBeamAddress: string
) {
  Logger.section(`🪙 MAS SWAP: ${swap.name}`);

  try {
    const { provider, account } = await initializeAccount();

    if (swap.name.startsWith('MAS →')) {
      // MAS → Token swap
      const masAmount = parseTokenAmount(swap.masAmount!, 9); // MAS has 9 decimals
      const minTokenOut = 0n; // Accept any amount for testing

      Logger.log('Sending', `${swap.masAmount} MAS`);
      Logger.log('Receiving', swap.tokenOut!.symbol!);
      Logger.log('Slippage', `${swap.slippageBps / 100}%`);

      const deadline = calculateDeadline(600);

      // Call swapMASForTokens with MAS sent as coins
      const swapArgs = new Args()
        .addString(swap.tokenOut!.address)
        .addU256(toU256(minTokenOut))
        .addU64(BigInt(deadline));

      // Get MassaBeam contract (SmartSwap routes to it)
      const massaBeam = new SmartContract(provider, massaBeamAddress);

      await callContract(
        massaBeam,
        'swapMASForTokens',
        swapArgs,
        swap.masAmount, // Send MAS as coins
        `Swap ${swap.masAmount} MAS to ${swap.tokenOut!.symbol}`
      );

      Logger.success('MAS → Token swap executed!');
      return true;

    } else {
      // Token → MAS swap
      const tokenIn = swap.tokenIn;
      const tokenAmount = parseTokenAmount(
        swap!.name!.includes('USDC') ? swap!.usdcAmount : swap!.daiAmount,
        tokenIn!.decimals
      );

      Logger.log('Sending', formatTokenAmount(tokenAmount, tokenIn!.decimals, tokenIn!.symbol));
      Logger.log('Receiving', 'MAS');
      Logger.log('Slippage', `${swap.slippageBps / 100}%`);

      // Validate and approve
      const validation = await validateTokenOperation(
        provider,
        tokenIn!.address,
        account.address.toString(),
        massaBeamAddress,
        tokenAmount,
        tokenIn!.symbol
      );

      if (!validation.hasBalance) {
        Logger.error('Insufficient token balance');
        return false;
      }

      if (validation.needsApproval) {
        await approveToken(provider, tokenIn!.address, massaBeamAddress, tokenAmount, tokenIn!.symbol);
      }

      const deadline = calculateDeadline(600);
      const minMASOut = 0n; // Accept any amount for testing

      const swapArgs = new Args()
        .addString(tokenIn!.address)
        .addU256(toU256(tokenAmount))
        .addU64(minMASOut) // MAS output is u64
        .addU64(BigInt(deadline));

      // Get MassaBeam contract
      const massaBeam = new SmartContract(provider, massaBeamAddress);

      await callContract(
        massaBeam,
        'swapTokensForMAS',
        swapArgs,
        '0.1',
        `Swap ${tokenIn!.symbol} to MAS`
      );

      Logger.success('Token → MAS swap executed!');
      return true;
    }
  } catch (error) {
    Logger.error(`MAS swap failed: ${error}`);
    return false;
  }
}

// ============================================================================
// ROUTING STATISTICS
// ============================================================================

async function displayRoutingStats(contract: SmartContract) {
  Logger.section('📈 ROUTING STATISTICS');

  try {
    const result = await readContract(contract, 'getStatistics');

    if (result.value && result.value.length > 0) {
      const args = new Args(result.value);
      const totalSwaps = args.nextString();
      const dusaSwaps = args.nextString();
      const massabeamSwaps = args.nextString();
      const totalVolume = args.nextString();
      const totalSavings = args.nextString();

      Logger.log('Total Swaps', totalSwaps);
      Logger.log('MassaBeam Swaps', massabeamSwaps);
      Logger.log('Dusa Swaps', dusaSwaps);
      Logger.log('Total Volume', totalVolume);
      Logger.log('Total Savings', totalSavings);

      // Calculate routing percentages
      const total = parseInt(totalSwaps);
      if (total > 0) {
        const mbPercent = (parseInt(massabeamSwaps) / total * 100).toFixed(1);
        const dusaPercent = (parseInt(dusaSwaps) / total * 100).toFixed(1);
        Logger.log('', '');
        Logger.log('Routing Split', `MassaBeam: ${mbPercent}% | Dusa: ${dusaPercent}%`);
      }

      Logger.success('Statistics loaded');
      return true;
    } else {
      Logger.info('No statistics available yet');
      return false;
    }
  } catch (error) {
    Logger.warn(`Could not load statistics: ${error}`);
    return false;
  }
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
  Logger.section('🤖 SMARTSWAP ROUTER TEST SUITE');

  const args = process.argv.slice(2);
  const actionArg = args.find(arg => arg.startsWith('--action='));
  const action = actionArg ? actionArg.split('=')[1] : 'all';

  if (!['quote', 'swap', 'mas', 'stats', 'all'].includes(action)) {
    Logger.error(`Invalid action: ${action}. Use: quote, swap, mas, stats, or all`);
    process.exit(1);
  }

  try {
    // Load contracts
    const addresses = loadDeployedAddresses();
    if (!addresses.smartSwap || !addresses.massaBeam) {
      Logger.error('SmartSwap or MassaBeam not deployed. Run: npm run deploy');
      process.exit(1);
    }

    const { provider } = await initializeAccount();
    const contract = new SmartContract(provider, addresses.smartSwap);
    Logger.log('SmartSwap', addresses.smartSwap);
    Logger.log('MassaBeam', addresses.massaBeam);

    let successCount = 0;
    let totalCount = 0;

    // Quote comparisons
    if (action === 'quote' || action === 'all') {
      Logger.section('💡 QUOTE COMPARISONS');
      for (const test of TEST_CONFIG.quoteTests) {
        totalCount++;
        if (await testQuoteComparison(contract, test)) {
          successCount++;
        }
        await sleep(2000);
      }
    }

    // Fungible token swaps
    if (action === 'swap' || action === 'all') {
      Logger.section('🔄 FUNGIBLE TOKEN SWAPS');
      for (const swap of TEST_CONFIG.fungibleSwaps) {
        totalCount++;
        if (await executeFungibleSwap(contract, swap, addresses.smartSwap)) {
          successCount++;
        }
        await sleep(2000);
      }
    }

    // Native MAS swaps
    if (action === 'mas' || action === 'all') {
      Logger.section('🪙 NATIVE MAS TOKEN SWAPS');
      for (const swap of TEST_CONFIG.masSwaps) {
        totalCount++;
        if (await executeMASSwap(contract, swap, addresses.massaBeam)) {
          successCount++;
        }
        await sleep(2000);
      }
    }

    // Display statistics
    if (action === 'stats' || action === 'all') {
      await displayRoutingStats(contract);
    }

    // Final summary
    if (totalCount > 0) {
      Logger.section('✅ TEST SUITE COMPLETE');
      Logger.log('Total Tests', totalCount.toString());
      Logger.log('Successful', successCount.toString());
      Logger.log('Success Rate', `${((successCount / totalCount) * 100).toFixed(1)}%`);

      if (successCount === totalCount) {
        Logger.success('All tests passed!');
      } else {
        Logger.warn(`${totalCount - successCount} tests failed`);
      }
    }

  } catch (error) {
    Logger.error(`Test suite failed: ${error}`);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
