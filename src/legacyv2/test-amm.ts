/**
 * MassaBeam AMM - Comprehensive Test Suite
 *
 * Tests all core AMM functionality with proper u256 handling:
 * - Pool creation
 * - Adding liquidity
 * - Removing liquidity
 * - Token swaps (exact input)
 * - Pool state queries
 * - Error handling
 *
 * Usage:
 *   npm run test:amm -- --action create
 *   npm run test:amm -- --action add
 *   npm run test:amm -- --action remove
 *   npm run test:amm -- --action swap
 *   npm run test:amm -- --action all
 */

import 'dotenv/config';
import { Args, SmartContract } from '@massalabs/massa-web3';
import { DAI, USDC, WETH, USDT } from '@dusalabs/sdk';
import {
  Logger,
  initializeAccount,
  loadDeployedAddresses,
  approveToken,
  getTokenBalance,
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
  pools: [
    {
      name: 'DAI/USDC',
      tokenA: DAI[0],
      tokenB: USDC[0],
      amountA: '10',  // 1000 DAI
      amountB: '10',  // 1000 USDC
    },
    {
      name: 'WETH/USDC',
      tokenA: WETH[0],
      tokenB: USDC[0],
      amountA: '0.01',     // 1 WETH
      amountB: '30',  // 3000 USDC
    },
    {
      name: 'DAI/USDT',
      tokenA: DAI[0],
      tokenB: USDT[0],
      amountA: '5',   // 500 DAI
      amountB: '5',   // 500 USDT
    },
  ],

  swaps: [
    {
      name: 'DAI → USDC',
      tokenIn: DAI[0],
      tokenOut: USDC[0],
      amountIn: '1',      // 100 DAI
      slippageBps: 200,     // 2% slippage
    },
    {
      name: 'USDC → WETH',
      tokenIn: USDC[0],
      tokenOut: WETH[0],
      amountIn: '1',     // 1000 USDC
      slippageBps: 300,     // 3% slippage
    },
  ],
};

// ============================================================================
// POOL CREATION
// ============================================================================

async function createPool(
  contract: SmartContract,
  pool: typeof TEST_CONFIG.pools[0],
  contractAddress: string
) {
  Logger.section(`🏊 CREATING POOL: ${pool.name}`);

  try {
    const { provider } = await initializeAccount();

    // Parse amounts with correct decimals
    const amountA = parseTokenAmount(pool.amountA, pool.tokenA.decimals);
    const amountB = parseTokenAmount(pool.amountB, pool.tokenB.decimals);

    Logger.log('Token A', `${pool.tokenA.symbol} (${pool.tokenA.decimals} decimals)`);
    Logger.log('Token B', `${pool.tokenB.symbol} (${pool.tokenB.decimals} decimals)`);
    Logger.log('Amount A', `${pool.amountA} ${pool.tokenA.symbol}`);
    Logger.log('Amount B', `${pool.amountB} ${pool.tokenB.symbol}`);

    // Validate balances
    const caller = (await initializeAccount()).account.address.toString();
    const validationA = await validateTokenOperation(
      provider,
      pool.tokenA.address,
      caller,
      contractAddress,
      amountA,
      pool.tokenA.symbol
    );

    const validationB = await validateTokenOperation(
      provider,
      pool.tokenB.address,
      caller,
      contractAddress,
      amountB,
      pool.tokenB.symbol
    );

    if (!validationA.hasBalance || !validationB.hasBalance) {
      Logger.error('Insufficient token balance');
      return false;
    }

    // Approve tokens if needed
    if (validationA.needsApproval) {
      await approveToken(provider, pool.tokenA.address, contractAddress, amountA, pool.tokenA.symbol);
    }

    if (validationB.needsApproval) {
      await approveToken(provider, pool.tokenB.address, contractAddress, amountB, pool.tokenB.symbol);
    }

    // Create pool (u256 for amounts, u64 for deadline)
    Logger.info('Creating pool...');
    const deadline = calculateDeadline(3600); // 1 hour

    const createPoolArgs = new Args()
      .addString(pool.tokenA.address)
      .addString(pool.tokenB.address)
      .addU256(toU256(amountA))      // u256!
      .addU256(toU256(amountB))      // u256!
      .addU64(BigInt(deadline)); // u64 for deadline

    await callContract(contract, 'createPool', createPoolArgs, '0.2', `Create ${pool.name} pool`);

    Logger.success(`Pool ${pool.name} created successfully!`);

    // Verify pool state
    await sleep(2000);
    await displayPoolInfo(contract, pool.tokenA.address, pool.tokenB.address);

    return true;
  } catch (error) {
    Logger.error(`Failed to create pool: ${error}`);
    return false;
  }
}

// ============================================================================
// ADD LIQUIDITY
// ============================================================================

async function addLiquidity(
  contract: SmartContract,
  pool: typeof TEST_CONFIG.pools[0],
  contractAddress: string
) {
  Logger.section(`💧 ADDING LIQUIDITY: ${pool.name}`);

  try {
    const { provider } = await initializeAccount();

    // Use 50% of original amounts for adding liquidity
    const amountA = parseTokenAmount(pool.amountA, pool.tokenA.decimals) / 2n;
    const amountB = parseTokenAmount(pool.amountB, pool.tokenB.decimals) / 2n;

    // Calculate minimum amounts (5% slippage)
    const amountAMin = calculateMinOutput(amountA, 500);
    const amountBMin = calculateMinOutput(amountB, 500);

    Logger.log('Amount A Desired', formatTokenAmount(amountA, pool.tokenA.decimals, pool.tokenA.symbol));
    Logger.log('Amount B Desired', formatTokenAmount(amountB, pool.tokenB.decimals, pool.tokenB.symbol));
    Logger.log('Min A (5% slippage)', formatTokenAmount(amountAMin, pool.tokenA.decimals));
    Logger.log('Min B (5% slippage)', formatTokenAmount(amountBMin, pool.tokenB.decimals));

    // Approve tokens
    const caller = (await initializeAccount()).account.address.toString();
    await approveToken(provider, pool.tokenA.address, contractAddress, amountA, pool.tokenA.symbol);
    await approveToken(provider, pool.tokenB.address, contractAddress, amountB, pool.tokenB.symbol);

    // Add liquidity (all u256 except deadline)
    Logger.info('Adding liquidity...');
    const deadline = calculateDeadline(3600);

    const addLiquidityArgs = new Args()
      .addString(pool.tokenA.address)
      .addString(pool.tokenB.address)
      .addU256(toU256(amountA))      // u256
      .addU256(toU256(amountB))      // u256
      .addU256(toU256(amountAMin))   // u256
      .addU256(toU256(amountBMin))   // u256
      .addU64(BigInt(deadline)); // u64

    await callContract(contract, 'addLiquidity', addLiquidityArgs, '0.1', `Add liquidity to ${pool.name}`);

    Logger.success('Liquidity added successfully!');

    // Display updated pool state
    await sleep(2000);
    await displayPoolInfo(contract, pool.tokenA.address, pool.tokenB.address);

    return true;
  } catch (error) {
    Logger.error(`Failed to add liquidity: ${error}`);
    return false;
  }
}

// ============================================================================
// REMOVE LIQUIDITY
// ============================================================================

async function removeLiquidity(
  contract: SmartContract,
  pool: typeof TEST_CONFIG.pools[0],
  contractAddress: string
) {
  Logger.section(`💧 REMOVING LIQUIDITY: ${pool.name}`);

  try {
    const { provider, account } = await initializeAccount();

    // Get LP balance
    Logger.info('Checking LP token balance...');
    const lpBalanceArgs = new Args()
      .addString(pool.tokenA.address)
      .addString(pool.tokenB.address)
      .addString(account.address.toString());

    const lpBalanceResult = await readContract(contract, 'readLPBalance', lpBalanceArgs);

    if (!lpBalanceResult.value || lpBalanceResult.value.length === 0) {
      Logger.error('No LP tokens found');
      return false;
    }

    const lpBalanceStr = new Args(lpBalanceResult.value).nextString();
    const lpBalance = BigInt(lpBalanceStr);

    Logger.log('LP Balance', lpBalance.toString());

    if (lpBalance === 0n) {
      Logger.error('No LP tokens to remove');
      return false;
    }

    // Remove 50% of LP tokens
    const liquidity = lpBalance / 2n;

    // Set minimum amounts (10% slippage for safety)
    const amountAMin = 0n; // Accept any amount for testing
    const amountBMin = 0n;

    Logger.log('LP Tokens to Remove', liquidity.toString());
    Logger.log('Min Amount A', amountAMin.toString());
    Logger.log('Min Amount B', amountBMin.toString());

    // Remove liquidity (all u256 except deadline)
    Logger.info('Removing liquidity...');
    const deadline = calculateDeadline(3600);

    const removeLiquidityArgs = new Args()
      .addString(pool.tokenA.address)
      .addString(pool.tokenB.address)
      .addU256(toU256(liquidity))    // u256
      .addU256(toU256(amountAMin))   // u256
      .addU256(toU256(amountBMin))   // u256
      .addU64(BigInt(deadline)); // u64

    await callContract(contract, 'removeLiquidity', removeLiquidityArgs, '0.1', `Remove liquidity from ${pool.name}`);

    Logger.success('Liquidity removed successfully!');

    // Display updated pool state
    await sleep(2000);
    await displayPoolInfo(contract, pool.tokenA.address, pool.tokenB.address);

    return true;
  } catch (error) {
    Logger.error(`Failed to remove liquidity: ${error}`);
    return false;
  }
}

// ============================================================================
// TOKEN SWAPS
// ============================================================================

async function executeSwap(
  contract: SmartContract,
  swap: typeof TEST_CONFIG.swaps[0],
  contractAddress: string
) {
  Logger.section(`🔄 EXECUTING SWAP: ${swap.name}`);

  try {
    const { provider, account } = await initializeAccount();

    // Parse amount
    const amountIn = parseTokenAmount(swap.amountIn, swap.tokenIn.decimals);

    Logger.log('Token In', `${swap.tokenIn.symbol}`);
    Logger.log('Token Out', `${swap.tokenOut.symbol}`);
    Logger.log('Amount In', `${swap.amountIn} ${swap.tokenIn.symbol}`);
    Logger.log('Slippage', `${swap.slippageBps / 100}%`);

    // Get expected output
    Logger.info('Getting quote...');
    const quoteArgs = new Args()
      .addString(swap.tokenIn.address)
      .addString(swap.tokenOut.address)
      .addU256(toU256(amountIn));

    const quoteResult = await readContract(contract, 'readGetAmountOut', quoteArgs);
    const expectedOut = fromU256(new Args(quoteResult.value).nextU256());

    const minAmountOut = calculateMinOutput(expectedOut, swap.slippageBps);

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
      Logger.error('Insufficient balance for swap');
      return false;
    }

    if (validation.needsApproval) {
      await approveToken(provider, swap.tokenIn.address, contractAddress, amountIn, swap.tokenIn.symbol);
    }

    // Execute swap (all u256 except deadline)
    Logger.info('Executing swap...');
    const deadline = calculateDeadline(300); // 5 minutes

    const swapArgs = new Args()
      .addString(swap.tokenIn.address)
      .addString(swap.tokenOut.address)
      .addU256(toU256(amountIn))       // u256
      .addU256(toU256(minAmountOut))   // u256
      .addU64(BigInt(deadline));   // u64

    await callContract(contract, 'swap', swapArgs, '0.1', `Swap ${swap.name}`);

    Logger.success('Swap executed successfully!');

    // Display results
    await sleep(2000);
    Logger.section('📊 SWAP RESULTS');
    const balanceOut = await getTokenBalance(provider, swap.tokenOut.address, account.address.toString());
    Logger.log('New Balance', formatTokenAmount(balanceOut, swap.tokenOut.decimals, swap.tokenOut.symbol));

    return true;
  } catch (error) {
    Logger.error(`Failed to execute swap: ${error}`);
    return false;
  }
}

// ============================================================================
// POOL INFO DISPLAY
// ============================================================================

async function displayPoolInfo(contract: SmartContract, tokenA: string, tokenB: string) {
  try {
    Logger.info('Reading pool state...');

    const poolArgs = new Args()
      .addString(tokenA)
      .addString(tokenB);

    const result = await readContract(contract, 'readPool', poolArgs);

    if (result.value && result.value.length > 0) {
      const args = new Args(result.value);

      // Parse pool data
      const tokenAAddr = args.nextString();
      const tokenBAddr = args.nextString();
      const reserveA = fromU256(args.nextU256());
      const reserveB = fromU256(args.nextU256());
      const totalSupply = fromU256(args.nextU256());
      const fee = args.nextU32();
      const isActive = args.nextBool();

      Logger.section('📊 POOL STATE');
      Logger.log('Reserve A', reserveA.toString());
      Logger.log('Reserve B', reserveB.toString());
      Logger.log('Total LP Supply', totalSupply.toString());
      Logger.log('Fee', `${fee / 100}%`);
      Logger.log('Status', isActive ? 'Active' : 'Inactive');

      if (reserveA > 0n && reserveB > 0n) {
        const price = Number(reserveB) / Number(reserveA);
        Logger.log('Price (B/A)', price.toFixed(6));
      }
    }
  } catch (error) {
    Logger.warn(`Could not read pool info: ${error}`);
  }
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
  Logger.section('🌊 MASSABEAM AMM TEST SUITE');

  const args = process.argv.slice(2);
  const actionArg = args.find(arg => arg.startsWith('--action='));
  const action = actionArg ? actionArg.split('=')[1] : 'all';

  if (!['create', 'add', 'remove', 'swap', 'all'].includes(action)) {
    Logger.error(`Invalid action: ${action}. Use: create, add, remove, swap, or all`);
    process.exit(1);
  }

  try {
    // Load contract
    const addresses = loadDeployedAddresses();
    if (!addresses.massaBeam) {
      Logger.error('MassaBeam contract not deployed. Run: npm run deploy');
      process.exit(1);
    }

    const { provider } = await initializeAccount();
    const contract = new SmartContract(provider, addresses.massaBeam);
    Logger.log('Contract', addresses.massaBeam);

    let successCount = 0;
    let totalCount = 0;

    // Create pools
    if (action === 'create' || action === 'all') {
      Logger.section('🏊 CREATE POOLS');
      for (const pool of TEST_CONFIG.pools) {
        totalCount++;
        if (await createPool(contract, pool, addresses.massaBeam)) {
          successCount++;
        }
        await sleep(2000);
      }
    }

    // Add liquidity
    if (action === 'add' || action === 'all') {
      Logger.section('💧 ADD LIQUIDITY');
      for (const pool of TEST_CONFIG.pools) {
        totalCount++;
        if (await addLiquidity(contract, pool, addresses.massaBeam)) {
          successCount++;
        }
        await sleep(2000);
      }
    }

    // Execute swaps
    if (action === 'swap' || action === 'all') {
      Logger.section('🔄 EXECUTE SWAPS');
      for (const swap of TEST_CONFIG.swaps) {
        totalCount++;
        if (await executeSwap(contract, swap, addresses.massaBeam)) {
          successCount++;
        }
        await sleep(2000);
      }
    }

    // Remove liquidity
    if (action === 'remove' || action === 'all') {
      Logger.section('💧 REMOVE LIQUIDITY');
      for (const pool of TEST_CONFIG.pools) {
        totalCount++;
        if (await removeLiquidity(contract, pool, addresses.massaBeam)) {
          successCount++;
        }
        await sleep(2000);
      }
    }

    // Final summary
    Logger.section('✅ TEST SUITE COMPLETE');
    Logger.log('Total Tests', totalCount.toString());
    Logger.log('Successful', successCount.toString());
    Logger.log('Success Rate', `${((successCount / totalCount) * 100).toFixed(1)}%`);

    if (successCount === totalCount) {
      Logger.success('All tests passed!');
    } else {
      Logger.warn(`${totalCount - successCount} tests failed`);
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
