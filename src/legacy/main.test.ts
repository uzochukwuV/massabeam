import 'dotenv/config';
import {
  Account,
  Args,
  Mas,
  SmartContract,
  JsonRpcProvider,
  bytesToStr,
} from '@massalabs/massa-web3';
import { WMAS, USDC, USDT } from '@dusalabs/sdk';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface TokenInfo {
  address: string;
  decimals: number;
  name: string;
  symbol: string;
}

interface DeployedAddresses {
  contracts: {
    massaBeam: string;
  };
}

interface TestResults {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

// ============================================================================
// TEST CONFIGURATION
// ============================================================================

const TEST_CONFIG = {
  // Pool creation test
  POOL_CREATION: {
    tokenA: USDC[0],
    tokenB: USDT[0],
  },
  // Add liquidity test
  ADD_LIQUIDITY: {
    name: 'USDC/USDT',
    tokenA: USDC[0],
    tokenB: USDT[0],
    amountA: '1000000', // 1 USDC (6 decimals for most stable coins)
    amountB: '1000000', // 1 USDT (6 decimals)
  },
  // Remove liquidity test
  REMOVE_LIQUIDITY: {
    name: 'USDC/USDT',
    tokenA: USDC[0],
    tokenB: USDT[0],
    lpTokens: '500000', // Amount of LP tokens to burn
    amountAMin: '0',
    amountBMin: '0',
  },
  // Swap test
  SWAP: {
    tokenIn: USDC[0],
    tokenOut: USDT[0],
    amountIn: '100000', // 0.1 USDC
  },
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Convert amount string to bigint with decimals
 */
function toU64(amount: string, decimals: number): bigint {
  const multiplier = BigInt(10 ** decimals);
  const [whole, decimal = '0'] = amount.split('.');
  const decimalPart = decimal.padEnd(decimals, '0').slice(0, decimals);
  return BigInt(whole) * multiplier + BigInt(decimalPart);
}

/**
 * Sleep function
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Format console output
 */
function log(title: string, message: string): void {
  console.log(`  ${title.padEnd(25)} ${message}`);
}

function logSection(title: string): void {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`${title}`);
  console.log(`${'═'.repeat(70)}`);
}

/**
 * Assert condition
 */
function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

/**
 * Format time duration
 */
function formatDuration(ms: number): string {
  return `${(ms / 1000).toFixed(2)}s`;
}

// ============================================================================
// TEST SUITE
// ============================================================================

class MassaBeamTestSuite {
  private account: Account | null = null;
  private provider: JsonRpcProvider | null = null;
  private deployedAddresses: DeployedAddresses | null = null;
  private ammContract: SmartContract | null = null;
  private testResults: TestResults[] = [];

  /**
   * Initialize test environment
   */
  async initialize(): Promise<void> {
    logSection('🔧 INITIALIZING TEST ENVIRONMENT');

    // Load account
    this.account = await Account.fromEnv();
    log('Account:', this.account.address.toString());

    // Initialize provider
    this.provider = JsonRpcProvider.buildnet(this.account);
    const balance = await this.provider.balanceOf([this.account.address.toString()]);
    log('MAS Balance:', `${balance[0].balance} MAS`);

    // Load deployed addresses
    const addressesPath = path.join(__dirname, '..', 'deployed-addresses.json');
    if (!fs.existsSync(addressesPath)) {
      throw new Error('❌ deployed-addresses.json not found! Run deploy first.');
    }

    this.deployedAddresses = JSON.parse(
      fs.readFileSync(addressesPath, 'utf-8')
    );
    log('Deployed File:', 'deployed-addresses.json loaded');

    // Initialize AMM contract
    this.ammContract = new SmartContract(
      this.provider,
      this.deployedAddresses!.contracts.massaBeam
    );
    log('AMM Contract:', this.deployedAddresses!.contracts.massaBeam);

    // Log token info
    logSection('📦 TOKEN INFORMATION');
    log('USDC Address:', USDC[0].address);
    log('USDC Name:', USDC[0].name);
    log('USDC Symbol:', USDC[0].symbol);
    log('USDC Decimals:', USDC[0].decimals.toString());
    console.log('');
    log('USDT Address:', USDT[0].address);
    log('USDT Name:', USDT[0].name);
    log('USDT Symbol:', USDT[0].symbol);
    log('USDT Decimals:', USDT[0].decimals.toString());
    console.log('');
    log('WMAS Address:', WMAS[0].address);
    log('WMAS Name:', WMAS[0].name);
    log('WMAS Symbol:', WMAS[0].symbol);
    log('WMAS Decimals:', WMAS[0].decimals.toString());

    console.log('\n✅ Initialization complete\n');
  }

  /**
   * Test 1: Pool Creation
   */
  async testPoolCreation(): Promise<void> {
    const startTime = Date.now();
    const testName = '1️⃣  CREATE POOL';

    try {
      logSection(testName);

      assert(this.account && this.provider && this.deployedAddresses && this.ammContract,
        'Environment not initialized');

      const tokenA = TEST_CONFIG.POOL_CREATION.tokenA;
      const tokenB = TEST_CONFIG.POOL_CREATION.tokenB;
      const amountA = toU64('1', tokenA.decimals); // 1 token
      const amountB = toU64('1', tokenB.decimals); // 1 token

      log('Token A:', `${tokenA.name} (${tokenA.symbol})`);
      log('Token B:', `${tokenB.name} (${tokenB.symbol})`);
      log('Amount A:', `1 ${tokenA.symbol}`);
      log('Amount B:', `1 ${tokenB.symbol}`);
      log('Token A Address:', tokenA.address);
      log('Token B Address:', tokenB.address);

      // Approve Token A
      log('Step 1:', `Approving ${tokenA.symbol}...`);
      const tokenAContract = new SmartContract(this.provider!, tokenA.address);
      await tokenAContract.call(
        'increaseAllowance',
        new Args()
          .addString(this.deployedAddresses!.contracts.massaBeam)
          .addU64(amountA),
        { coins: Mas.fromString('0.01') }
      );
      console.log('   ✅ Token A approved');
      await sleep(2000);

      // Approve Token B
      log('Step 2:', `Approving ${tokenB.symbol}...`);
      const tokenBContract = new SmartContract(this.provider!, tokenB.address);
      await tokenBContract.call(
        'increaseAllowance',
        new Args()
          .addString(this.deployedAddresses!.contracts.massaBeam)
          .addU64(amountB),
        { coins: Mas.fromString('0.01') }
      );
      console.log('   ✅ Token B approved');
      await sleep(2000);

      // Create pool
      log('Step 3:', 'Creating pool...');
      const deadline = BigInt(Date.now() + 60 * 60 * 1000); // 1 hour
      const createPoolArgs = new Args()
        .addString(tokenA.address)
        .addString(tokenB.address)
        .addU64(amountA)
        .addU64(amountB)
        .addU64(deadline);

      await this.ammContract!.call('createPool', createPoolArgs, {
        coins: Mas.fromString('0.2'),
      });

      console.log('   ✅ Pool created successfully');
      await sleep(3000);

      // Verify pool was created
      log('Step 4:', 'Verifying pool creation...');
      const poolKey = new Args()
        .addString(tokenA.address)
        .addString(tokenB.address);

      const poolData = await this.ammContract!.read('readPool', poolKey);
      assert(poolData.value.length > 0, 'Pool data is empty');
      console.log('   ✅ Pool verified');

      this.testResults.push({
        name: testName,
        passed: true,
        duration: Date.now() - startTime,
      });

      console.log(`✅ Test passed in ${formatDuration(Date.now() - startTime)}\n`);
    } catch (error) {
      console.error(`❌ Test failed:`, error);
      this.testResults.push({
        name: testName,
        passed: false,
        error: String(error),
        duration: Date.now() - startTime,
      });
    }
  }

  /**
   * Test 2: Add Liquidity
   */
  async testAddLiquidity(): Promise<void> {
    const startTime = Date.now();
    const testName = '2️⃣  ADD LIQUIDITY';

    try {
      logSection(testName);

      assert(this.account && this.provider && this.deployedAddresses && this.ammContract,
        'Environment not initialized');

      const tokenA = TEST_CONFIG.ADD_LIQUIDITY.tokenA;
      const tokenB = TEST_CONFIG.ADD_LIQUIDITY.tokenB;
      const amountA = toU64(TEST_CONFIG.ADD_LIQUIDITY.amountA, tokenA.decimals);
      const amountB = toU64(TEST_CONFIG.ADD_LIQUIDITY.amountB, tokenB.decimals);

      log('Pool:', TEST_CONFIG.ADD_LIQUIDITY.name);
      log('Amount A:', `${TEST_CONFIG.ADD_LIQUIDITY.amountA} ${tokenA.symbol}`);
      log('Amount B:', `${TEST_CONFIG.ADD_LIQUIDITY.amountB} ${tokenB.symbol}`);

      // Approve Token A
      log('Step 1:', `Approving ${tokenA.symbol}...`);
      const tokenAContract = new SmartContract(this.provider!, tokenA.address);
      await tokenAContract.call(
        'increaseAllowance',
        new Args()
          .addString(this.deployedAddresses!.contracts.massaBeam)
          .addU64(amountA),
        { coins: Mas.fromString('0.01') }
      );
      console.log('   ✅ Token A approved');
      await sleep(2000);

      // Approve Token B
      log('Step 2:', `Approving ${tokenB.symbol}...`);
      const tokenBContract = new SmartContract(this.provider!, tokenB.address);
      await tokenBContract.call(
        'increaseAllowance',
        new Args()
          .addString(this.deployedAddresses!.contracts.massaBeam)
          .addU64(amountB),
        { coins: Mas.fromString('0.01') }
      );
      console.log('   ✅ Token B approved');
      await sleep(2000);

      // Add liquidity
      log('Step 3:', 'Adding liquidity...');
      const deadline = BigInt(Date.now() + 60 * 60 * 1000);
      const addLiquidityArgs = new Args()
        .addString(tokenA.address)
        .addString(tokenB.address)
        .addU64(amountA)
        .addU64(amountB)
        .addU64(BigInt(0)) // amountAMin
        .addU64(BigInt(0)) // amountBMin
        .addU64(deadline);

      await this.ammContract!.call('addLiquidity', addLiquidityArgs, {
        coins: Mas.fromString('0.1'),
      });

      console.log('   ✅ Liquidity added successfully');
      await sleep(3000);

      // Verify LP balance
      log('Step 4:', 'Verifying LP balance...');
      const lpBalanceArgs = new Args()
        .addString(tokenA.address)
        .addString(tokenB.address)
        .addString(this.account!.address.toString());

      const lpBalanceResult = await this.ammContract!.read('readLPBalance', lpBalanceArgs);
      const lpBalance = bytesToStr(lpBalanceResult.value);
      assert(BigInt(lpBalance) > 0n, 'LP balance is zero');
      log('LP Balance:', lpBalance);

      console.log('   ✅ LP balance verified');

      this.testResults.push({
        name: testName,
        passed: true,
        duration: Date.now() - startTime,
      });

      console.log(`✅ Test passed in ${formatDuration(Date.now() - startTime)}\n`);
    } catch (error) {
      console.error(`❌ Test failed:`, error);
      this.testResults.push({
        name: testName,
        passed: false,
        error: String(error),
        duration: Date.now() - startTime,
      });
    }
  }

  /**
   * Test 3: Read Pool Data
   */
  async testReadPoolData(): Promise<void> {
    const startTime = Date.now();
    const testName = '3️⃣  READ POOL DATA';

    try {
      logSection(testName);

      assert(this.account && this.provider && this.deployedAddresses && this.ammContract,
        'Environment not initialized');

      const tokenA = TEST_CONFIG.ADD_LIQUIDITY.tokenA;
      const tokenB = TEST_CONFIG.ADD_LIQUIDITY.tokenB;

      log('Reading:', `${TEST_CONFIG.ADD_LIQUIDITY.name} pool data`);

      const poolArgs = new Args()
        .addString(tokenA.address)
        .addString(tokenB.address);

      const poolResult = await this.ammContract!.read('readPool', poolArgs);
      assert(poolResult.value.length > 0, 'Pool data is empty');

      const poolData = new Args(poolResult.value);
      const poolTokenA = poolData.nextString();
      const poolTokenB = poolData.nextString();
      const reserveA = poolData.nextU64();
      const reserveB = poolData.nextU64();
      const totalSupply = poolData.nextU64();
      const fee = poolData.nextU64();

      log('Token A:', poolTokenA as string);
      log('Token B:', poolTokenB as string);
      log('Reserve A:', (reserveA as bigint).toString());
      log('Reserve B:', (reserveB as bigint).toString());
      log('Total Supply:', (totalSupply as bigint).toString());
      log('Fee (basis points):', (fee as bigint).toString());

      assert(reserveA && reserveB, 'Reserves are zero');

      this.testResults.push({
        name: testName,
        passed: true,
        duration: Date.now() - startTime,
      });

      console.log(`✅ Test passed in ${formatDuration(Date.now() - startTime)}\n`);
    } catch (error) {
      console.error(`❌ Test failed:`, error);
      this.testResults.push({
        name: testName,
        passed: false,
        error: String(error),
        duration: Date.now() - startTime,
      });
    }
  }

  /**
   * Test 4: Swap Tokens
   */
  async testSwap(): Promise<void> {
    const startTime = Date.now();
    const testName = '4️⃣  SWAP TOKENS';

    try {
      logSection(testName);

      assert(this.account && this.provider && this.deployedAddresses && this.ammContract,
        'Environment not initialized');

      const tokenIn = TEST_CONFIG.SWAP.tokenIn;
      const tokenOut = TEST_CONFIG.SWAP.tokenOut;
      const amountIn = toU64(TEST_CONFIG.SWAP.amountIn, tokenIn.decimals);

      log('Swap:', `${tokenIn.symbol} → ${tokenOut.symbol}`);
      log('Amount In:', `${TEST_CONFIG.SWAP.amountIn} ${tokenIn.symbol}`);
      log('Token In Address:', tokenIn.address);
      log('Token Out Address:', tokenOut.address);

      // Step 1: Approve token in
      log('Step 1:', `Approving ${tokenIn.symbol}...`);
      const tokenInContract = new SmartContract(this.provider!, tokenIn.address);
      await tokenInContract.call(
        'increaseAllowance',
        new Args()
          .addString(this.deployedAddresses!.contracts.massaBeam)
          .addU64(amountIn),
        { coins: Mas.fromString('0.01') }
      );
      console.log('   ✅ Token approved');
      await sleep(2000);

      // Step 2: Get pool data
      log('Step 2:', 'Reading pool data...');
      const readPoolArgs = new Args()
        .addString(tokenIn.address)
        .addString(tokenOut.address);

      const readPoolResult = await this.ammContract!.read('readPool', readPoolArgs);
      const poolData = new Args(readPoolResult.value);

      const poolTokenA = poolData.nextString();
      const poolTokenB = poolData.nextString();
      const reserveA = poolData.nextU64() as bigint;
      const reserveB = poolData.nextU64() as bigint;
      const fee = poolData.nextU64() as bigint;

      assert(reserveA > 0n && reserveB > 0n, 'Pool has no liquidity');

      log('Pool Token A:', poolTokenA as string);
      log('Pool Reserve A:', reserveA.toString());
      log('Pool Reserve B:', (reserveB as bigint).toString());
      log('Pool Fee:', (fee as bigint).toString());

      // Step 3: Calculate expected output
      log('Step 3:', 'Calculating expected output...');
      const tokenInIsA = (poolTokenA as string) === tokenIn.address;
      const reserveIn = tokenInIsA ? reserveA : reserveB;
      const reserveOut = tokenInIsA ? reserveB : reserveA;

      // Manual formula: (amountIn * (10000 - fee) * reserveOut) / (reserveIn * 10000 + amountIn * (10000 - fee))
      const feeMultiplier = 10000n - fee;
      const amountInWithFee = amountIn * feeMultiplier;
      const numerator = amountInWithFee * reserveOut;
      const denominator = reserveIn * 10000n + amountInWithFee;
      const expectedAmountOut = numerator / denominator;

      log('Expected Output:', expectedAmountOut.toString());

      // Step 4: Verify with contract
      log('Step 4:', 'Verifying with contract function...');
      const getAmountOutArgs = new Args()
        .addU64(amountIn)
        .addU64(reserveIn)
        .addU64(reserveOut)
        .addU64(fee);

      const getAmountOutResult = await this.ammContract!.read('readGetAmountOut', getAmountOutArgs);
      const contractAmountOut = BigInt(bytesToStr(getAmountOutResult.value));
      log('Contract Output:', contractAmountOut.toString());
      log('Match:', contractAmountOut === expectedAmountOut ? '✅ YES' : '⚠️  DIFFERENCE');

      // Step 5: Execute swap
      log('Step 5:', 'Executing swap...');
      const slippage = 100n; // 1% slippage
      let amountOutMin = contractAmountOut * (10000n - slippage) / 10000n;
      if (amountOutMin === 0n && contractAmountOut > 0n) {
        amountOutMin = 1n;
      }

      log('Min Amount Out:', amountOutMin.toString());

      const deadline = BigInt(Date.now() + 60 * 60 * 1000);
      const swapArgs = new Args()
        .addString(tokenIn.address)
        .addString(tokenOut.address)
        .addU64(amountIn)
        .addU64(amountOutMin)
        .addU64(deadline);

      await this.ammContract!.call('swap', swapArgs, {
        coins: Mas.fromString('0.1'),
      });

      console.log('   ✅ Swap executed successfully');
      await sleep(3000);

      log('Result:', `Swapped ${TEST_CONFIG.SWAP.amountIn} ${tokenIn.symbol}`);

      this.testResults.push({
        name: testName,
        passed: true,
        duration: Date.now() - startTime,
      });

      console.log(`✅ Test passed in ${formatDuration(Date.now() - startTime)}\n`);
    } catch (error) {
      console.error(`❌ Test failed:`, error);
      this.testResults.push({
        name: testName,
        passed: false,
        error: String(error),
        duration: Date.now() - startTime,
      });
    }
  }

  /**
   * Test 5: Remove Liquidity
   */
  async testRemoveLiquidity(): Promise<void> {
    const startTime = Date.now();
    const testName = '5️⃣  REMOVE LIQUIDITY';

    try {
      logSection(testName);

      assert(this.account && this.provider && this.deployedAddresses && this.ammContract,
        'Environment not initialized');

      const tokenA = TEST_CONFIG.REMOVE_LIQUIDITY.tokenA;
      const tokenB = TEST_CONFIG.REMOVE_LIQUIDITY.tokenB;
      const liquidity = toU64(TEST_CONFIG.REMOVE_LIQUIDITY.lpTokens, 9);

      log('Pool:', TEST_CONFIG.REMOVE_LIQUIDITY.name);
      log('LP Tokens to burn:', TEST_CONFIG.REMOVE_LIQUIDITY.lpTokens);

      // Check LP balance first
      log('Step 1:', 'Checking LP balance...');
      const lpBalanceArgs = new Args()
        .addString(tokenA.address)
        .addString(tokenB.address)
        .addString(this.account!.address.toString());

      const lpBalanceResult = await this.ammContract!.read('readLPBalance', lpBalanceArgs);
      const currentLPBalance = BigInt(bytesToStr(lpBalanceResult.value));
      log('Current LP Balance:', currentLPBalance.toString());

      assert(currentLPBalance > 0n, 'No LP balance to remove');

      // Use minimum of desired or available
      const liquitityToRemove = liquidity > currentLPBalance ? currentLPBalance : liquidity;
      log('LP to Remove:', liquitityToRemove.toString());

      // Remove liquidity
      log('Step 2:', 'Removing liquidity...');
      const deadline = BigInt(Date.now() + 60 * 60 * 1000);
      const removeLiquidityArgs = new Args()
        .addString(tokenA.address)
        .addString(tokenB.address)
        .addU64(liquitityToRemove)
        .addU64(BigInt(0)) // amountAMin
        .addU64(BigInt(0)) // amountBMin
        .addU64(deadline);

      await this.ammContract!.call('removeLiquidity', removeLiquidityArgs, {
        coins: Mas.fromString('0.1'),
      });

      console.log('   ✅ Liquidity removed successfully');
      await sleep(3000);

      // Verify LP balance decreased
      log('Step 3:', 'Verifying LP balance...');
      const newLPBalanceResult = await this.ammContract!.read('readLPBalance', lpBalanceArgs);
      const newLPBalance = BigInt(bytesToStr(newLPBalanceResult.value));
      log('New LP Balance:', newLPBalance.toString());

      assert(newLPBalance < currentLPBalance, 'LP balance did not decrease');
      log('Verification:', `✅ Balance decreased by ${(currentLPBalance - newLPBalance).toString()}`);

      this.testResults.push({
        name: testName,
        passed: true,
        duration: Date.now() - startTime,
      });

      console.log(`✅ Test passed in ${formatDuration(Date.now() - startTime)}\n`);
    } catch (error) {
      console.error(`❌ Test failed:`, error);
      this.testResults.push({
        name: testName,
        passed: false,
        error: String(error),
        duration: Date.now() - startTime,
      });
    }
  }

  /**
   * Test 6: Contract Statistics
   */
  async testContractStatistics(): Promise<void> {
    const startTime = Date.now();
    const testName = '6️⃣  CONTRACT STATISTICS';

    try {
      logSection(testName);

      assert(this.account && this.provider && this.deployedAddresses && this.ammContract,
        'Environment not initialized');

      log('Reading:', 'Contract statistics');

      // Read pool count
      const poolCountResult = await this.ammContract!.read('readPoolCount', new Args());
      const poolCount = bytesToStr(poolCountResult.value);
      log('Pool Count:', poolCount);

      // Read total volume
      const totalVolumeResult = await this.ammContract!.read('readTotalVolume', new Args());
      const totalVolume = bytesToStr(totalVolumeResult.value);
      log('Total Volume:', totalVolume);

      // Read total fees (if function exists)
      try {
        const totalFeesResult = await this.ammContract!.read('readTotalFees', new Args());
        const totalFees = bytesToStr(totalFeesResult.value);
        log('Total Fees Collected:', totalFees);
      } catch (e) {
        log('Total Fees Collected:', 'Function not available');
      }

      // Read initialization status
      const initializedResult = await this.ammContract!.read('readInitialized', new Args());
      const initialized = bytesToStr(initializedResult.value);
      log('Initialized:', initialized === 'true' ? '✅ YES' : '❌ NO');

      assert(BigInt(poolCount) > 0n, 'No pools found');
      assert(initialized === 'true', 'Contract not initialized');

      this.testResults.push({
        name: testName,
        passed: true,
        duration: Date.now() - startTime,
      });

      console.log(`✅ Test passed in ${formatDuration(Date.now() - startTime)}\n`);
    } catch (error) {
      console.error(`❌ Test failed:`, error);
      this.testResults.push({
        name: testName,
        passed: false,
        error: String(error),
        duration: Date.now() - startTime,
      });
    }
  }

  /**
   * Print test results summary
   */
  printResults(): void {
    logSection('📊 TEST RESULTS SUMMARY');

    let passed = 0;
    let failed = 0;
    let totalTime = 0;

    console.log('');
    for (const result of this.testResults) {
      const status = result.passed ? '✅ PASS' : '❌ FAIL';
      const time = formatDuration(result.duration);
      console.log(`${status}  ${result.name.padEnd(40)} ${time.padStart(10)}`);

      if (result.error) {
        console.log(`      Error: ${result.error}\n`);
      }

      passed += result.passed ? 1 : 0;
      failed += result.passed ? 0 : 1;
      totalTime += result.duration;
    }

    console.log(`\n${'─'.repeat(70)}`);
    console.log(`Total Tests: ${this.testResults.length}`);
    console.log(`Passed: ${passed} ✅`);
    console.log(`Failed: ${failed} ❌`);
    console.log(`Total Time: ${formatDuration(totalTime)}`);
    console.log(`${'═'.repeat(70)}\n`);

    if (failed === 0) {
      console.log('🎉 All tests passed!\n');
    } else {
      console.log(`⚠️  ${failed} test(s) failed.\n`);
    }
  }

  /**
   * Run all tests
   */
  async runAllTests(): Promise<void> {
    console.clear();
    console.log(`\n${'═'.repeat(70)}`);
    console.log('🧪 MASSABEAM AMM TEST SUITE');
    console.log(`${'═'.repeat(70)}\n`);

    try {
      await this.initialize();

      // Run tests in sequence
      await this.testPoolCreation();
      await sleep(1000);

      await this.testAddLiquidity();
      await sleep(1000);

      await this.testReadPoolData();
      await sleep(1000);

      await this.testSwap();
      await sleep(1000);

      await this.testRemoveLiquidity();
      await sleep(1000);

      await this.testContractStatistics();

      this.printResults();
    } catch (error) {
      console.error('Fatal error:', error);
      process.exit(1);
    }
  }
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main(): Promise<void> {
  const testSuite = new MassaBeamTestSuite();
  await testSuite.runAllTests();
}

main()
  .then(() => {
    console.log('✅ Test suite completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  });
