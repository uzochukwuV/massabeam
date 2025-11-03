/**
 * MassaBeam Swap Script
 *
 * Comprehensive script for executing token swaps on MassaBeam AMM
 * Supports: exact input swaps, exact output swaps, and batch swaps
 * Uses Dusa SDK tokens: DAI, USDC, WETH
 *
 * Usage:
 *   npx ts-node src/swap.ts --action swapIn
 *   npx ts-node src/swap.ts (default: swapIn)
 *
 * Note: MassaBeam only supports exact input swaps
 * For exact output, calculate required input using readGetAmountIn view function
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
 * Swap operations configuration
 * Supports different swap types and batch operations
 */
const SWAP_CONFIG = {
  exactInput: [
    {
      name: 'USDC → WETH',
      tokenA: USDC[0],
      tokenB: WETH[0],
      amountIn: '500000', // 0.1 USDC (6 decimals)
      amountOutMin: '900', // Minimum 0.09 WETH (10% slippage)
      deadline: 60 * 60 * 1000, // 1 hour
    },
    {
      name: 'DAI → USDC',
      tokenA: DAI[0],
      tokenB: USDC[0],
      amountIn: '1000000000000000000', // 1 DAI (18 decimals)
      amountOutMin: '1800000', // Minimum 1.8 USDC (10% slippage)
      deadline: 60 * 60 * 1000,
    },
    {
      name: 'WETH → USDC',
      tokenA: WETH[0],
      tokenB: USDC[0],
      amountIn: '500000', // 0.5 WETH
      amountOutMin: '450000', // Minimum 0.45 USDC
      deadline: 60 * 60 * 1000,
    },
  ],
  exactOutput: [
    {
      name: 'USDC → 0.5 WETH',
      tokenA: USDC[0],
      tokenB: WETH[0],
      amountOut: '500000', // Want exactly 0.5 WETH
      amountInMax: '550000', // Max 0.55 USDC (10% slippage)
      deadline: 60 * 60 * 1000,
    },
    {
      name: 'WETH → 5 USDC',
      tokenA: WETH[0],
      tokenB: USDC[0],
      amountOut: '5000000', // Want exactly 5 USDC
      amountInMax: '5500000', // Max 5.5 WETH
      deadline: 60 * 60 * 1000,
    },
  ],
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Convert decimal amount to u256 with proper decimals
 */
function toU256(amount: string, decimals: number): bigint {
  const multiplier = BigInt(10 ** decimals);
  const [whole, decimal = '0'] = amount.split('.');
  const decimalPart = decimal.padEnd(decimals, '0').slice(0, decimals);
  return BigInt(whole) * multiplier + BigInt(decimalPart);
}

/**
 * Convert u256 to readable decimal format
 */
function fromU256(amount: bigint, decimals: number): string {
  const divisor = BigInt(10 ** decimals);
  const whole = amount / divisor;
  const remainder = amount % divisor;
  const paddedRemainder = remainder.toString().padStart(decimals, '0');
  return `${whole}.${paddedRemainder}`;
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Formatted logging
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

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Execute exact input swap (known input, minimum output)
 */
async function swapExactInput(
  contract: SmartContract,
  swap: (typeof SWAP_CONFIG.exactInput)[0],
  account: Account,
  provider: JsonRpcProvider,
  contractAddress: string
): Promise<boolean> {
  logSection(`🔄 SWAP EXACT INPUT: ${swap.name}`);

  try {
    log('Token In:', `${swap.tokenA.symbol} (${swap.tokenA.address})`);
    log('Token Out:', `${swap.tokenB.symbol} (${swap.tokenB.address})`);
    log('Amount In:', `${fromU256(BigInt(swap.amountIn), swap.tokenA.decimals)} ${swap.tokenA.symbol}`);
    log('Min Amount Out:', `${fromU256(BigInt(swap.amountOutMin), swap.tokenB.decimals)} ${swap.tokenB.symbol}`);
    log('Slippage:', '10%');

    const amountIn = BigInt(swap.amountIn);
    const amountOutMin = BigInt(swap.amountOutMin);
    const deadline =  swap.deadline - 1000;

    // Approve token in
    logInfo(`Approving ${swap.tokenA.symbol}...`);
    const tokenInContract = new SmartContract(provider, swap.tokenA.address);
    await tokenInContract.call(
      'increaseAllowance',
      new Args().addString(contractAddress).addU256(amountIn),
      { coins: Mas.fromString('0.01') }
    );
    logSuccess(`${swap.tokenA.symbol} approved`);
    await sleep(2000);

    // Execute swap
    logInfo('Executing swap...');
    const pool = await contract.read('readPool', new Args().addString(swap.tokenA.address).addString(swap.tokenB.address));
    console.log(pool)
    const poolInfo = new Args(pool.value)
    console.log(poolInfo.nextString())
    console.log(poolInfo.nextString())


    const swapArgs = new Args()
      .addString(swap.tokenA.address)
      .addString(swap.tokenB.address)
      .addU64(amountIn)
      .addU64(amountOutMin)
      .addU64(BigInt(deadline));

    const result = await contract.call('swap', swapArgs, {
      coins: Mas.fromString('0.1'),
    });

    logSuccess(`Swap executed successfully!`);
    log('Transaction:', result.toString());
    log('Swap Name:', swap.name);

    await sleep(2000);
    return true;
  } catch (error) {
    logError(`Failed to execute swap: ${error}`);
    return false;
  }
}

/**
 * NOTE: MassaBeam only supports exact input swaps
 * The contract does not have swapExactOutput function
 * For exact output swaps, calculate required input using getAmountIn view function
 */

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main(): Promise<void> {
  logSection('🌊 MASSABEAM SWAP');

  // Get action from command line arguments
  const args = process.argv.slice(2);
  const action = args.find((arg) => arg.startsWith('--action='))?.split('=')[1] || 'batch';

  if (!['swapIn', 'swapOut', 'batch'].includes(action)) {
    logError(`Invalid action: ${action}. Use: swapIn, swapOut, or batch`);
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

    let massaBeamAddress: string;
    if (fs.existsSync(addressesPath)) {
      const deployedAddresses = JSON.parse(fs.readFileSync(addressesPath, 'utf-8'));
      massaBeamAddress = deployedAddresses.contracts.massaBeam;
      log('MassaBeam Contract:', massaBeamAddress);
    } else {
      logError('deployed-addresses.json not found!');
      logInfo('Please run: npx ts-node src/deploy-massabeam.ts');
      process.exit(1);
    }

    const contract = new SmartContract(provider, massaBeamAddress);
    logSuccess('Contract loaded');
    await sleep(1000);

    // Display token information
    logSection('📊 TOKEN INFORMATION');
    log('USDC', `${USDC[0].symbol} - ${USDC[0].address.slice(0, 10)}...`);
    log('WETH', `${WETH[0].symbol} - ${WETH[0].address.slice(0, 10)}...`);
    log('DAI', `${DAI[0].symbol} - ${DAI[0].address.slice(0, 10)}...`);
    logSuccess('Tokens configured');
    await sleep(1000);

    // Execute swaps
    let totalSuccess = 0;
    let totalAttempted = 0;

    // Execute exact input swaps
    if (action === 'swapIn' || action === 'batch') {
      logSection('💱 EXACT INPUT SWAPS');
      let successCount = 0;

      for (const swap of SWAP_CONFIG.exactInput) {
        totalAttempted++;
        const success = await swapExactInput(contract, swap, account, provider, massaBeamAddress);
        if (success) {
          successCount++;
          totalSuccess++;
        }
      }

      logSection('📊 EXACT INPUT SUMMARY');
      log('Successful:', `${successCount}/${SWAP_CONFIG.exactInput.length}`);
      logSuccess('Exact input swaps complete');
      await sleep(2000);
    }

    // Note: MassaBeam only supports exact input swaps
    // For exact output swaps, use the getAmountIn view function to calculate required input
    if (action === 'swapOut') {
      logSection('⚠️  NOTE');
      logInfo('MassaBeam only supports exact input swaps (swap function)');
      logInfo('For exact output scenarios, calculate required input using readGetAmountIn view function');
      logInfo('Then execute swap with calculated input amount');
      await sleep(2000);
    }

    // Final summary
    logSection('✨ SWAP EXECUTION COMPLETE');
    console.log(`
  📝 Summary:
  - Action executed: ${action.toUpperCase()}
  - Total swaps: ${totalAttempted}
  - Successful: ${totalSuccess}
  - Success rate: ${totalAttempted > 0 ? ((totalSuccess / totalAttempted) * 100).toFixed(1) : 0}%
  - Account: ${account.address.toString()}
  - Contract: ${massaBeamAddress}
  - Network: Buildnet
  - Timestamp: ${new Date().toISOString()}

  Next steps:
  1. Monitor transaction status on block explorer
  2. Verify token balances using readBalance function
  3. Check pool reserves using readPool function
  4. Monitor price impact and slippage
    `);

    console.log(`${'═'.repeat(70)}\n`);
  } catch (error) {
    logError(`Swap execution failed: ${error}`);
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
