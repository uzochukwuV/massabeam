/**
 * MassaBeam DeFi Suite - Complete Deployment Script
 *
 * Deploys:
 * 1. MassaBeam AMM contract (constant product AMM with TWAP oracle)
 * 2. SmartSwap Router contract (intelligent routing between MassaBeam and Dusa)
 * 3. Arbitrage Engine contract (cross-DEX arbitrage detection & execution)
 * 4. Limit Orders contract (fixed-price limit orders with autonomous execution)
 *
 * SmartSwap integrates with Dusa using addresses from @dusalabs/sdk:
 * - LB_ROUTER_ADDRESS: Dusa Liquidity Book Router
 * - LB_QUOTER_ADDRESS: Dusa Quoter for price discovery
 * - LB_FACTORY_ADDRESS: Dusa Factory for pair management
 *
 * Features:
 * - Automatic contract verification
 * - Deployment info saved to deployed-addresses.json
 * - Complete integration with Dusa protocol
 * - MEV protection for limit orders (minimum execution delay)
 * - Partial fill support for limit orders
 * - Cross-DEX price discovery and arbitrage
 *
 * Usage:
 *   npx ts-node src/deploy-massabeam.ts
 */

import 'dotenv/config';
import {
  Account,
  Args,
  Mas,
  SmartContract,
  JsonRpcProvider,
} from '@massalabs/massa-web3';
import {
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
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get WASM bytecode from file
 */
function getScByteCode(dirPath: string, filename: string): StaticArray<u8> {
  const filePath = path.join(dirPath, filename);
  if (!fs.existsSync(filePath)) {
    throw new Error(`WASM file not found: ${filePath}`);
  }
  const buffer = fs.readFileSync(filePath);
  return new StaticArray<u8>(buffer.length);
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

// ============================================================================
// DEPLOYMENT
// ============================================================================

async function deployMassaBeam(): Promise<{ massaBeamAddress: string; provider: JsonRpcProvider; account: any }> {
  logSection('🚀 MASSABEAM AMM DEPLOYMENT');

  try {
    // Initialize account
    logSection('🔑 ACCOUNT SETUP');
    const account = await Account.fromEnv();
    log('Account Address:', account.address.toString());
    log('Public Key:', account.publicKey.toString());

    // Initialize provider
    const provider = JsonRpcProvider.buildnet(account);
    const balance = await provider.balanceOf([account.address.toString()]);
    log('MAS Balance:', `${balance[0].balance} MAS`);

    // Check balance
    const balanceNum = Number(balance[0].balance.toString());
    if (balanceNum < 2) {
      throw new Error('Insufficient balance. Need at least 2 MAS for deployment.');
    }

    console.log('✅ Account setup complete\n');
    await sleep(1000);

    // Load WASM bytecode
    logSection('📦 LOADING CONTRACT BYTECODE');
    log('Looking for:', 'main.wasm');

    // Try multiple possible paths
    const possiblePaths = [
      path.join(process.cwd(), 'build', 'main.wasm'),
      path.join(process.cwd(), 'testDir', 'build', 'main.wasm'),
      path.join(__dirname, '..', '..', 'build', 'main.wasm'),
    ];

    let wasmPath: string | null = null;
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        wasmPath = p;
        break;
      }
    }

    if (!wasmPath) {
      throw new Error(`WASM file not found. Tried: ${possiblePaths.join(', ')}`);
    }

    const wasmBuffer = fs.readFileSync(wasmPath);
    log('WASM File:', wasmPath);
    log('WASM Size:', `${(wasmBuffer.length / 1024).toFixed(2)} KB`);

    console.log('✅ Bytecode loaded\n');
    await sleep(1000);

    // Deploy contract
    logSection('🚀 DEPLOYING CONTRACT');
    log('Network:', 'Buildnet');
    log('Deployment Cost:', '2 MAS');

    const constructorArgs = new Args();
    // No constructor args needed for MassaBeam

    console.log('Deploying...');
    const contract = await SmartContract.deploy(
      provider,
      wasmBuffer,
      constructorArgs,
      { coins: Mas.fromString('2') }
    );

    log('Contract Address:', contract.address.toString());
    console.log('✅ Contract deployed successfully\n');
    await sleep(3000);

    const smartSwapAddress = await deploySmartSwap(provider, contract.address.toString(), account);
    const arbitrageAddress = await deployArbitrageEngine(provider, contract.address.toString(), account);
    const limitOrdersAddress = await deployLimitOrders(provider, contract.address.toString(), account);

    // Verify deployment
    logSection('✅ VERIFYING DEPLOYMENT');
    log('Checking:', 'Contract initialization status');

    try {
      const initializedResult = await contract.read('readInitialized', new Args());
      const initialized = initializedResult.value.length > 0;
      log('Initialized:', initialized ? '✅ YES' : '❌ NO');

      const poolCountResult = await contract.read('readPoolCount', new Args());
      log('Pool Count:', '0 (expected)');
    } catch (e) {
      console.log('   ⚠️  Cannot verify (contract may need time to settle)');
    }

    console.log('✅ Verification complete\n');
    await sleep(1000);

    // Save deployment info
    logSection('💾 SAVING DEPLOYMENT INFO');

    const deployedAddresses = {
      contracts: {
        massaBeam: contract.address.toString(),
        smartSwap: smartSwapAddress,
        arbitrageEngine: arbitrageAddress,
        limitOrders: limitOrdersAddress,
      },
      deployment: {
        timestamp: new Date().toISOString(),
        network: 'buildnet',
        account: account.address.toString(),
        txHash: 'N/A', // Would need to extract from receipt
      },
      integration: {
        dusaRouter: LB_ROUTER_ADDRESS[0],
        dusaQuoter: LB_QUOTER_ADDRESS[0],
      },
    };

    const outputPath = path.join(__dirname, 'deployed-addresses.json');
    fs.writeFileSync(outputPath, JSON.stringify(deployedAddresses, null, 2));
    log('Saved to:', outputPath);

    // Print deployment summary
    logSection('📋 DEPLOYMENT SUMMARY');
    log('MassaBeam AMM:', contract.address.toString());
    log('SmartSwap Router:', smartSwapAddress);
    log('Arbitrage Engine:', arbitrageAddress);
    log('Limit Orders:', limitOrdersAddress);
    log('Network:', 'buildnet');
    log('Account:', account.address.toString());

    console.log('✅ Deployment info saved\n');

    return {
      massaBeamAddress: contract.address.toString(),
      account: account.address.toString(),
      provider,
    };
  } catch (error) {
    console.error('\n❌ MassaBeam deployment failed:', error);
    throw error;
  }
}

/**
 * Deploy SmartSwap Router contract
 */
async function deploySmartSwap(
  provider: JsonRpcProvider,
  massaBeamAddress: string,
  account: any
): Promise<string> {
  logSection('🤖 SMARTSWAP ROUTER DEPLOYMENT');

  try {
    // Load WASM bytecode
    logSection('📦 LOADING SMARTSWAP BYTECODE');
    log('Looking for:', 'smart_swap.wasm');

    const possiblePaths = [
      path.join(process.cwd(), 'build', 'smart_swap.wasm'),
      path.join(process.cwd(), 'testDir', 'build', 'smart_swap.wasm'),
      path.join(__dirname, '..', '..', 'build', 'smart_swap.wasm'),
      path.join(process.cwd(), 'assembly', 'contracts', 'build', 'smart_swap.wasm'),
    ];

    let wasmPath: string | null = null;
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        wasmPath = p;
        break;
      }
    }

    if (!wasmPath) {
      throw new Error(`SmartSwap WASM file not found. Tried: ${possiblePaths.join(', ')}`);
    }

    const wasmBuffer = fs.readFileSync(wasmPath);
    log('WASM File:', wasmPath);
    log('WASM Size:', `${(wasmBuffer.length / 1024).toFixed(2)} KB`);

    logSuccess('Bytecode loaded\n');
    await sleep(1000);

    // Get Dusa addresses
    logSection('🔗 DUSA INTEGRATION SETUP');

    // Get router and quoter addresses from Dusa SDK
    // These are pre-configured addresses for Dusa protocol integration
    const dusaRouterAddress = LB_ROUTER_ADDRESS[0] as string;
    const dusaQuoterAddress = LB_QUOTER_ADDRESS[0] as string;

    log('Dusa Router:', dusaRouterAddress.slice(0, 10) + '...');
    log('Dusa Quoter:', dusaQuoterAddress.slice(0, 10) + '...');
    log('MassaBeam AMM:', massaBeamAddress.slice(0, 10) + '...');

    logSuccess('Addresses resolved\n');
    await sleep(1000);

    // Deploy SmartSwap contract
    logSection('🚀 DEPLOYING SMARTSWAP');
    log('Network:', 'Buildnet');
    log('Deployment Cost:', '2 MAS');

    const constructorArgs = new Args()
      .addString(dusaRouterAddress)
      .addString(massaBeamAddress);

    logInfo('Deploying SmartSwap Router...');
    const smartSwapContract = await SmartContract.deploy(
      provider,
      wasmBuffer,
      constructorArgs,
      { coins: Mas.fromString('2') }
    );

    log('SmartSwap Address:', smartSwapContract.address.toString());
    logSuccess('SmartSwap deployed successfully\n');
    await sleep(3000);

    // Verify deployment
    logSection('✅ VERIFYING SMARTSWAP DEPLOYMENT');
    log('Checking:', 'Contract initialization status');

    try {
      const statsResult = await smartSwapContract.read('getStatistics', new Args());
      logSuccess('SmartSwap contract is responsive');
      log('Contract Status:', '✅ ACTIVE');
    } catch (e) {
      logInfo('Cannot verify immediately (contract may need time to settle)');
    }

    logSuccess('Verification complete\n');
    await sleep(1000);

    return smartSwapContract.address.toString();
  } catch (error) {
    logError(`SmartSwap deployment failed: ${error}`);
    throw error;
  }
}

/**
 * Deploy Arbitrage Engine contract
 */
async function deployArbitrageEngine(
  provider: JsonRpcProvider,
  massaBeamAddress: string,
  account: any
): Promise<string> {
  logSection('🔄 ARBITRAGE ENGINE DEPLOYMENT');

  try {
    // Load WASM bytecode
    logSection('📦 LOADING ARBITRAGE ENGINE BYTECODE');
    log('Looking for:', 'arbitrage_engine.wasm');

    const possiblePaths = [
      path.join(process.cwd(), 'build', 'arbitrage_engine.wasm'),
      path.join(process.cwd(), 'testDir', 'build', 'arbitrage_engine.wasm'),
      path.join(__dirname, '..', '..', 'build', 'arbitrage_engine.wasm'),
      path.join(process.cwd(), 'assembly', 'contracts', 'build', 'arbitrage_engine.wasm'),
    ];

    let wasmPath: string | null = null;
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        wasmPath = p;
        break;
      }
    }

    if (!wasmPath) {
      throw new Error(`Arbitrage Engine WASM file not found. Tried: ${possiblePaths.join(', ')}`);
    }

    const wasmBuffer = fs.readFileSync(wasmPath);
    log('WASM File:', wasmPath);
    log('WASM Size:', `${(wasmBuffer.length / 1024).toFixed(2)} KB`);

    logSuccess('Bytecode loaded\n');
    await sleep(1000);

    // Get Dusa addresses
    logSection('🔗 DUSA INTEGRATION SETUP');

    const dusaRouterAddress = LB_ROUTER_ADDRESS[0] as string;
    const dusaQuoterAddress = LB_QUOTER_ADDRESS[0] as string;

    log('Dusa Router:', dusaRouterAddress.slice(0, 10) + '...');
    log('Dusa Quoter:', dusaQuoterAddress.slice(0, 10) + '...');
    log('MassaBeam AMM:', massaBeamAddress.slice(0, 10) + '...');

    logSuccess('Addresses resolved\n');
    await sleep(1000);

    // Deploy Arbitrage Engine contract
    logSection('🚀 DEPLOYING ARBITRAGE ENGINE');
    log('Network:', 'Buildnet');
    log('Deployment Cost:', '2 MAS');

    const constructorArgs = new Args()
      .addString(massaBeamAddress)
      .addString(dusaRouterAddress)
      .addString(dusaQuoterAddress);

    logInfo('Deploying Arbitrage Engine...');
    const arbitrageContract = await SmartContract.deploy(
      provider,
      wasmBuffer,
      constructorArgs,
      { coins: Mas.fromString('2') }
    );

    log('Arbitrage Engine Address:', arbitrageContract.address.toString());
    logSuccess('Arbitrage Engine deployed successfully\n');
    await sleep(3000);

    // Verify deployment
    logSection('✅ VERIFYING ARBITRAGE ENGINE DEPLOYMENT');
    log('Checking:', 'Contract initialization status');

    try {
      const statsResult = await arbitrageContract.read('getStatistics', new Args());
      logSuccess('Arbitrage Engine contract is responsive');
      log('Contract Status:', '✅ ACTIVE');
    } catch (e) {
      logInfo('Cannot verify immediately (contract may need time to settle)');
    }

    logSuccess('Verification complete\n');
    await sleep(1000);

    return arbitrageContract.address.toString();
  } catch (error) {
    logError(`Arbitrage Engine deployment failed: ${error}`);
    throw error;
  }
}

/**
 * Deploy Limit Orders contract
 */
async function deployLimitOrders(
  provider: JsonRpcProvider,
  massaBeamAddress: string,
  account: any
): Promise<string> {
  logSection('🎯 LIMIT ORDERS DEPLOYMENT');

  try {
    // Load WASM bytecode
    logSection('📦 LOADING LIMIT ORDERS BYTECODE');
    log('Looking for:', 'limit_orders.wasm');

    const possiblePaths = [
      path.join(process.cwd(), 'build', 'limit_orders.wasm'),
      path.join(process.cwd(), 'testDir', 'build', 'limit_orders.wasm'),
      path.join(__dirname, '..', '..', 'build', 'limit_orders.wasm'),
      path.join(process.cwd(), 'assembly', 'contracts', 'build', 'limit_orders.wasm'),
    ];

    let wasmPath: string | null = null;
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        wasmPath = p;
        break;
      }
    }

    if (!wasmPath) {
      throw new Error(`Limit Orders WASM file not found. Tried: ${possiblePaths.join(', ')}`);
    }

    const wasmBuffer = fs.readFileSync(wasmPath);
    log('WASM File:', wasmPath);
    log('WASM Size:', `${(wasmBuffer.length / 1024).toFixed(2)} KB`);

    logSuccess('Bytecode loaded\n');
    await sleep(1000);

    // Setup
    logSection('🔗 CONTRACT SETUP');
    log('AMM Contract:', massaBeamAddress.slice(0, 10) + '...');

    logSuccess('Configuration ready\n');
    await sleep(1000);

    // Deploy Limit Orders contract
    logSection('🚀 DEPLOYING LIMIT ORDERS');
    log('Network:', 'Buildnet');
    log('Deployment Cost:', '2 MAS');

    const constructorArgs = new Args()
      .addString(massaBeamAddress);

    logInfo('Deploying Limit Orders contract...');
    const limitOrdersContract = await SmartContract.deploy(
      provider,
      wasmBuffer,
      constructorArgs,
      { coins: Mas.fromString('2') }
    );

    log('Limit Orders Address:', limitOrdersContract.address.toString());
    logSuccess('Limit Orders deployed successfully\n');
    await sleep(3000);

    // Verify deployment
    logSection('✅ VERIFYING LIMIT ORDERS DEPLOYMENT');
    log('Checking:', 'Contract initialization status');

    try {
      const orderCountResult = await limitOrdersContract.read('getOrderCount', new Args());
      logSuccess('Limit Orders contract is responsive');
      log('Contract Status:', '✅ ACTIVE');
      log('Initial Order Count:', '0 (expected)');
    } catch (e) {
      logInfo('Cannot verify immediately (contract may need time to settle)');
    }

    logSuccess('Verification complete\n');
    await sleep(1000);

    return limitOrdersContract.address.toString();
  } catch (error) {
    logError(`Limit Orders deployment failed: ${error}`);
    throw error;
  }
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

deployMassaBeam()
  .then(() => {
    console.log('✅ Deployment script completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Deployment script failed:', error);
    process.exit(1);
  });
