/**
 * MassaBeam Liquidity Management Script
 *
 * Comprehensive script for adding and removing liquidity from pools
 * Supports multiple operations: add liquidity, remove liquidity, and liquidity management
 * Uses Dusa SDK tokens: DAI, USDC, USDT
 *
 * Usage:
 *   npx ts-node src/liquidity.ts --action create
 *   npx ts-node src/liquidity.ts --action add
 *   npx ts-node src/liquidity.ts --action remove
 *   npx ts-node src/liquidity.ts --action all
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
import { DAI, USDC, WETH, WBTC } from '@dusalabs/sdk';
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
 * Liquidity operations configuration
 * Supports multiple pools with add and remove operations
 */
const LIQUIDITY_CONFIG = {
  create: [
    {
      name: 'DAI/WETH',
      tokenA: DAI[0],
      tokenB: WETH[0],
      amountA: '50000000', // 5 DAI (18 decimals) - initial liquidity
      amountB: '50000000', // 10 USDC (6 decimals) - initial liquidity
      deadline: 60 * 60 * 100,
    },
    {
      name: 'USDC/WETH',
      tokenA: USDC[0],
      tokenB: WETH[0],
      amountA: '50000000', // 5 DAI (18 decimals) - initial liquidity
      amountB: '10000', // 10 USDC (6 decimals) - initial liquidity
      deadline: 60 * 60 * 100,
    },
    {
      name: 'DAI/USDC',
      tokenA: DAI[0],
      tokenB: USDC[0],
      amountA: '50000000', // 5 DAI (18 decimals) - initial liquidity
      amountB: '10000000', // 10 USDC (6 decimals) - initial liquidity
      deadline: 60 * 60 * 100,
    },
  ],
  add: [
    {
       name: 'DAI/WETH',
      tokenA: DAI[0],
      tokenB: WETH[0],
      amountA: '50000000', // 5 DAI (18 decimals)
      amountB: '10000000', // 100 USDC (6 decimals)
      amountAMin: '450000', // 10% slippage
      amountBMin: '9000000', // 10% slippage
      deadline: 60 * 60 * 100, // 1 hour
    },
   {
       name: 'USDC/WETH',
      tokenA: USDC[0],
      tokenB: WETH[0],
      amountA: '50000000', // 5 DAI (18 decimals)
      amountB: '1000', // 100 USDC (6 decimals)
      amountAMin: '450000', // 10% slippage
      amountBMin: '900', // 10% slippage
      deadline: 60 * 60 * 100, // 1 hour
    },
    {
      name: 'DAI/USDC',
      tokenA: DAI[0],
      tokenB: USDC[0],
      amountA: '50000000', // 5 DAI (18 decimals)
      amountB: '10000000', // 100 USDC (6 decimals)
      amountAMin: '450000', // 10% slippage
      amountBMin: '9000000', // 10% slippage
      deadline: 60 * 60 * 100, // 1 hour
    },
  ],
  remove: [
    {
        name: 'DAI/WETH',
      tokenA: DAI[0],
      tokenB: WETH[0],
      liquidityTokens: '34163074', // Amount of LP tokens to burn
      amountAMin: '2000', // Minimum 2 DAI
      amountBMin: '40000', // Minimum 40 USDC
      deadline: 60 * 60 * 100, // 1 hour
    },
    {
      name: 'USDC/WETH',
      tokenA: USDC[0],
      tokenB: WETH[0],
      liquidityTokens: '34163074', // Amount of LP tokens to burn
      amountAMin: '2000', // Minimum 2 DAI
      amountBMin: '40000', // Minimum 40 USDC
      deadline: 60 * 60 * 100, // 1 hour
    },
    {
      name: 'DAI/USDC',
      tokenA: DAI[0],
      tokenB: USDC[0],
      liquidityTokens: '34163074', // Amount of LP tokens to burn
      amountAMin: '2000', // Minimum 2 DAI
      amountBMin: '40000', // Minimum 40 USDC
      deadline: 60 * 60 * 100, // 1 hour
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
 * Create a new pool with initial liquidity
 * Note: Fee is hardcoded to DEFAULT_FEE_RATE (0.3%) in the contract
 */
async function createPool(
  contract: SmartContract,
  pool: (typeof LIQUIDITY_CONFIG.create)[0],
  account: Account,
  provider: JsonRpcProvider,
  contractAddress: string
): Promise<boolean> {
  logSection(`🏊 CREATING POOL: ${pool.name}`);

  try {
    log('Token A:', `${pool.tokenA.symbol} (${pool.tokenA.address})`);
    log('Token B:', `${pool.tokenB.symbol} (${pool.tokenB.address})`);
    log('Initial Amount A:', `${fromU256(BigInt(pool.amountA), pool.tokenA.decimals)} ${pool.tokenA.symbol}`);
    log('Initial Amount B:', `${fromU256(BigInt(pool.amountB), pool.tokenB.decimals)} ${pool.tokenB.symbol}`);
    log('Fee:', '0.3% (default - hardcoded in contract)');

    const amountA = BigInt(pool.amountA);
    const amountB = BigInt(pool.amountB);
    const deadline = pool.deadline - 1000;

    // Step 1: Approve Token A
    logInfo(`Approving ${pool.tokenA.symbol}...`);
    const tokenAContract = new SmartContract(provider, pool.tokenA.address);

    const tokenABalance =await tokenAContract.read('balanceOf', new Args().addString(account.address.toString()));
    console.log(tokenABalance)
    console.log('Token A Balance:', bytesToF64(tokenABalance.value));
    await tokenAContract.call(
      'increaseAllowance',
      new Args().addString(contractAddress).addU256(amountA),
      { coins: Mas.fromString('0.01') }
    );
    logSuccess(`${pool.tokenA.symbol} approved`);


    await sleep(2000);



    // Step 2: Approve Token B
    logInfo(`Approving ${pool.tokenB.symbol}...`);
    const tokenBContract = new SmartContract(provider, pool.tokenB.address);

    const tokenBBalance =await tokenAContract.read('balanceOf', new Args().addString(account.address.toString()));
    console.log(tokenBBalance)
    console.log('Token A Balance:', bytesToF64(tokenBBalance.value));
    await tokenBContract.call(
      'increaseAllowance',
      new Args().addString(contractAddress).addU256(amountB),
      { coins: Mas.fromString('0.01') }
    );
    logSuccess(`${pool.tokenB.symbol} approved`);
    await sleep(2000);

    // Step 3: Create pool
    logInfo('Creating pool with initial liquidity...');

    const createPoolArgs = new Args()
      .addString(pool.tokenA.address)
      .addString(pool.tokenB.address)
      .addU64(amountA)
      .addU64(amountB)
      .addU64(BigInt(deadline));

    const result = await contract.call('createPool', createPoolArgs, {
      coins: Mas.fromString('0.1'),
    });

    logSuccess(`Pool created successfully!`);
    log('Transaction:', result.toString());
    log('Pool Name:', pool.name);

    await sleep(2000);
    return true;
  } catch (error) {
    logError(`Failed to create pool: ${error}`);
    return false;
  }
}

/**
 * Add liquidity to a pool
 */
async function addLiquidity(
  contract: SmartContract,
  pool: (typeof LIQUIDITY_CONFIG.add)[0],
  account: Account,
  provider: JsonRpcProvider
): Promise<boolean> {
  logSection(`💧 ADDING LIQUIDITY: ${pool.name}`);

  try {
    log('Token A:', `${pool.tokenA.symbol} (${pool.tokenA.address})`);
    log('Token B:', `${pool.tokenB.symbol} (${pool.tokenB.address})`);
    log('Amount A:', `${pool.amountA} wei (${fromU256(BigInt(pool.amountA), pool.tokenA.decimals)})`);
    log('Amount B:', `${pool.amountB} wei (${fromU256(BigInt(pool.amountB), pool.tokenB.decimals)})`);
    log('Min Slippage A:', `${fromU256(BigInt(pool.amountAMin), pool.tokenA.decimals)}`);
    log('Min Slippage B:', `${fromU256(BigInt(pool.amountBMin), pool.tokenB.decimals)}`);

    // Convert amounts
    const amountA = BigInt(pool.amountA);
    const amountB = BigInt(pool.amountB);
    const amountAMin = BigInt(pool.amountAMin);
    const amountBMin = BigInt(pool.amountBMin);
    const deadline = pool.deadline - 10000;

    logInfo('Approving tokens...');

    // Approve tokens (would need token contract calls in real scenario)
    // For now, we'll skip approval and assume tokens are approved

    logInfo('Adding liquidity to contract...');

    const addLiquidityArgs = new Args()
      .addString(pool.tokenA.address)
      .addString(pool.tokenB.address)
      .addU64(amountA)
      .addU64(amountB)
      .addU64(amountAMin)
      .addU64(amountBMin)
      .addU64(BigInt(deadline));

    const result = await contract.call('addLiquidity', addLiquidityArgs, {
      coins: Mas.fromString('0.1'),
    });

    logSuccess(`Liquidity added successfully!`);
    log('Transaction:', result.toString());
    log('Pool Name:', pool.name);

    await sleep(2000);
    return true;
  } catch (error) {
    logError(`Failed to add liquidity: ${error}`);
    return false;
  }
}

/**
 * Remove liquidity from a pool
 */
async function removeLiquidity(
  contract: SmartContract,
  pool: (typeof LIQUIDITY_CONFIG.remove)[0],
  account: Account,
  provider: JsonRpcProvider
): Promise<boolean> {
  logSection(`💧 REMOVING LIQUIDITY: ${pool.name}`);

  try {
    log('Token A:', `${pool.tokenA.symbol} (${pool.tokenA.address})`);
    log('Token B:', `${pool.tokenB.symbol} (${pool.tokenB.address})`);
    log('LP Tokens to Burn:', pool.liquidityTokens);
    log('Min Amount A:', `${fromU256(BigInt(pool.amountAMin), pool.tokenA.decimals)} ${pool.tokenA.symbol}`);
    log('Min Amount B:', `${fromU256(BigInt(pool.amountBMin), pool.tokenB.decimals)} ${pool.tokenB.symbol}`);

    const liquidityTokens = BigInt(pool.liquidityTokens);
    const amountAMin = BigInt(pool.amountAMin);
    const amountBMin = BigInt(pool.amountBMin);
    const deadline = pool.deadline - 1000;

    logInfo('Checking pool state...');

    // Read pool info before removal
    try {
      const poolArgs = new Args()
        .addString(pool.tokenA.address)
        .addString(pool.tokenB.address);

      const poolInfo = await contract.read('readPool', poolArgs);
      console.log(poolInfo.value);

      // const arsg = new Args(poolInfo.value);
      // const tokenAString = arsg.nextString();
      // const tokenBString = arsg.nextString();
      // const reserveA = arsg.nextU64();
      // const reserveB = arsg.nextU64();
      // const totalSupply = arsg.nextU64();
      // const feeRate = arsg.nextU32();
      // const lastUpdateTime = arsg.nextU64();
      // const isActive = arsg.nextBool();
      // const cumulativePriceA = arsg.nextU256();
      // const cumulativePriceB = arsg.nextU256();
      // const blockTimestampLast = arsg.nextU64();

      // log('Pool State:', "");
      // log('  Token A:', tokenAString);
      // log('  Token B:', tokenBString);
      // log('  Reserve A:', reserveA.toString());
      // log('  Reserve B:', reserveB.toString());
      // log('  Total Supply:', totalSupply.toString());
      // log('  Fee Rate:', feeRate.toString());
      // log('  Last Update Time:', lastUpdateTime.toString());
      // log('  Is Active:', isActive);


    //   args.add(this.tokenA.toString());
    // args.add(this.tokenB.toString());
    // args.add(this.reserveA);
    // args.add(this.reserveB);
    // args.add(this.totalSupply);
    // args.add(this.fee);
    // args.add(this.lastUpdateTime);
    // args.add(this.isActive);
    // args.add(this.cumulativePriceA);
    // args.add(this.cumulativePriceB);
    // args.add(this.blockTimestampLast);



      logSuccess('Pool found and verified');
    } catch (e) {
      logError('Could not read pool state, continuing anyway...');
    }

    logInfo('Removing liquidity...');
    const lpBalance = await contract.read('readLPBalance', new Args()
      .addString(pool.tokenA.address)
      .addString(pool.tokenB.address)
      .addString(account.address.toString()));
    log('Current LP Balance:', bytesToStr(lpBalance.value));

    const removeLiquidityArgs = new Args()
      .addString(pool.tokenA.address)
      .addString(pool.tokenB.address)
      .addU256(BigInt(bytesToStr(lpBalance.value)))
      .addU256(amountAMin)
      .addU256(amountBMin)
      .addU64(BigInt(deadline));
    

    const result = await contract.call('removeLiquidity', removeLiquidityArgs, {
      coins: Mas.fromString('0.1'),
    });

    logSuccess(`Liquidity removed successfully!`);
    log('Transaction:', result.toString());
    log('Pool Name:', pool.name);

    await sleep(2000);
    return true;
  } catch (error) {
    logError(`Failed to remove liquidity: ${error}`);
    return false;
  }
}

/**
 * Read pool information and display statistics
 */
async function displayPoolStats(
  contract: SmartContract,
  tokenA: (typeof USDC)[0],
  tokenB: (typeof DAI)[0]
): Promise<void> {
  try {
    const poolArgs = new Args()
      .addString(tokenA.address)
      .addString(tokenB.address);

    const poolInfo = await contract.read('readPool', poolArgs);
    logInfo(`Pool ${tokenA.symbol}/${tokenB.symbol} statistics loaded`);
  } catch (error) {
    logInfo(`Could not read pool stats: ${error}`);
  }
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main(): Promise<void> {
  logSection('🌊 MASSABEAM LIQUIDITY MANAGEMENT');

  // Get action from command line arguments
  const args = process.argv.slice(2);
  const action = args.find((arg) => arg.startsWith('--action='))?.split('=')[1] || 'all';

  if (!['create', 'add', 'remove', 'all'].includes(action)) {
    logError(`Invalid action: ${action}. Use: create, add, remove, or all`);
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
    log('USDT', `${DAI[0].symbol} - ${DAI[0].address.slice(0, 10)}...`);
    log('DAI', `${DAI[0].symbol} - ${DAI[0].address.slice(0, 10)}...`);
    logSuccess('Tokens configured');
    await sleep(1000);

    // Execute create pool operations
    if (action === 'create' || action === 'all') {
      logSection('🏊 CREATE POOL OPERATIONS');
      let successCount = 0;

      for (const pool of LIQUIDITY_CONFIG.create) {
        const success = await createPool(contract, pool, account, provider, massaBeamAddress);
        if (success) successCount++;
      }

      logSection('✅ CREATE POOL SUMMARY');
      log('Successful:', `${successCount}/${LIQUIDITY_CONFIG.create.length}`);
      logSuccess('Create pool phase complete');
      await sleep(2000);
    }

    // Execute add liquidity operations
    if (action === 'add' || action === 'all') {
      logSection('💧 ADD LIQUIDITY OPERATIONS');
      let successCount = 0;

      for (const pool of LIQUIDITY_CONFIG.add) {
        const success = await addLiquidity(contract, pool, account, provider);
        if (success) successCount++;
      }

      logSection('📈 ADD LIQUIDITY SUMMARY');
      log('Successful:', `${successCount}/${LIQUIDITY_CONFIG.add.length}`);
      logSuccess('Add liquidity phase complete');
      await sleep(2000);
    }

    // Execute remove liquidity operations
    if (action === 'remove' || action === 'all') {
      logSection('💧 REMOVE LIQUIDITY OPERATIONS');
      let successCount = 0;

      for (const pool of LIQUIDITY_CONFIG.remove) {
        const success = await removeLiquidity(contract, pool, account, provider);
        if (success) successCount++;
      }

      logSection('📉 REMOVE LIQUIDITY SUMMARY');
      log('Successful:', `${successCount}/${LIQUIDITY_CONFIG.remove.length}`);
      logSuccess('Remove liquidity phase complete');
      await sleep(2000);
    }

    // Display pool statistics
    logSection('📊 POOL STATISTICS');
    await displayPoolStats(contract, USDC[0], DAI[0]);
    await displayPoolStats(contract, DAI[0], USDC[0]);
    logSuccess('Statistics loaded');

    // Final summary
    logSection('✨ LIQUIDITY MANAGEMENT COMPLETE');
    console.log(`
  📝 Summary:
  - Action executed: ${action.toUpperCase()}
  - Account: ${account.address.toString()}
  - Contract: ${massaBeamAddress}
  - Network: Buildnet
  - Timestamp: ${new Date().toISOString()}

  Next steps:
  1. Monitor transaction status on block explorer
  2. Verify pool state using readPool function
  3. Check LP token balance using readLpBalance function
  4. Monitor gas costs and slippage
    `);

    console.log(`${'═'.repeat(70)}\n`);
  } catch (error) {
    logError(`Liquidity management failed: ${error}`);
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
