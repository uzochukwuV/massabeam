/**
 * Complete Deployment Script for MassaBeam DeFi Platform
 *
 * Deploys all contracts in the correct order and connects them:
 * 1. MassaBeam AMM (main.ts) - Core constant product AMM
 * 2. Limit Orders (limit_orders.ts) - Advanced order types
 * 3. Recurring Orders (recurring_orders.ts) - DCA & Grid trading
 * 4. Flash Arbitrage Bot (flash_arbitrage_bot.ts) - Autonomous arbitrage
 * 5. Smart Swap (smart_swap.ts) - Cross-DEX routing
 * 6. Arbitrage Engine (arbitrage_engine.ts) - Arbitrage detection
 *
 * Token Decimals on Massa:
 * - USDC: 6 decimals (1 USDC = 1,000,000)
 * - DAI: 18 decimals (1 DAI = 1,000,000,000,000,000,000)
 * - WETH: 18 decimals
 * - WMAS: 9 decimals (1 WMAS = 1,000,000,000)
 *
 * Contract uses u64 for internal calculations, u256 for token transfers
 *
 * Usage:
 *   npx tsx src/deploy-all-contracts.ts
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
  WMAS,
} from '@dusalabs/sdk';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// TYPES
// ============================================================================

interface DeploymentAddresses {
  contracts: {
    massaBeam: string;
    limitOrders: string;
    recurringOrders: string;
    flashArbitrageBot: string;
    smartSwap: string;
    arbitrageEngine: string;
  };
  deployment: {
    timestamp: string;
    network: string;
    account: string;
    totalGasUsed: string;
  };
  integration: {
    dusaRouter: string;
    dusaQuoter: string;
    wmasAddress: string;
  };
  decimals: {
    usdc: number;
    dai: number;
    weth: number;
    wmas: number;
    note: string;
  };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function log(title: string, message: string): void {
  console.log(`  ${title.padEnd(35)} ${message}`);
}

function logSection(title: string): void {
  console.log(`\n${'═'.repeat(75)}`);
  console.log(`  ${title}`);
  console.log(`${'═'.repeat(75)}`);
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

function getWasmPath(filename: string): string {
  const possiblePaths = [
    path.join(process.cwd(), 'build', filename),
    path.join(process.cwd(), 'testDir', 'build', filename),
    path.join(__dirname, '..', 'build', filename),
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  throw new Error(`WASM file not found: ${filename}. Tried: ${possiblePaths.join(', ')}`);
}

// ============================================================================
// DEPLOYMENT FUNCTIONS
// ============================================================================

/**
 * Deploy MassaBeam AMM (main.ts)
 */
async function deployMassaBeam(
  provider: JsonRpcProvider,
  account: Account
): Promise<string> {
  logSection('1️⃣  MASSABEAM AMM DEPLOYMENT');

  try {
    const wasmPath = getWasmPath('main.wasm');
    const wasmBuffer = fs.readFileSync(wasmPath);

    log('WASM File:', wasmPath);
    log('WASM Size:', `${(wasmBuffer.length / 1024).toFixed(2)} KB`);
    logSuccess('Bytecode loaded');
    await sleep(1000);

    logInfo('Deploying MassaBeam AMM...');
    log('Cost:', '2 MAS');

    const constructorArgs = new Args();
    // No constructor args for main.ts

    const contract = await SmartContract.deploy(
      provider,
      wasmBuffer,
      constructorArgs,
      { coins: Mas.fromString('2') }
    );

    log('Contract Address:', contract.address.toString());
    logSuccess('MassaBeam AMM deployed!');
    await sleep(3000);

    return contract.address.toString();
  } catch (error) {
    logError(`Deployment failed: ${error}`);
    throw error;
  }
}

/**
 * Deploy Limit Orders (limit_orders.ts)
 */
async function deployLimitOrders(
  provider: JsonRpcProvider,
  account: Account,
  massaBeamAddress: string
): Promise<string> {
  logSection('2️⃣  LIMIT ORDERS DEPLOYMENT');

  try {
    const wasmPath = getWasmPath('limit_orders.wasm');
    const wasmBuffer = fs.readFileSync(wasmPath);

    log('WASM Size:', `${(wasmBuffer.length / 1024).toFixed(2)} KB`);
    logSuccess('Bytecode loaded');
    await sleep(1000);

    logInfo('Deploying Limit Orders...');
    log('MassaBeam Address:', massaBeamAddress.slice(0, 15) + '...');

    const constructorArgs = new Args().addString(massaBeamAddress);

    const contract = await SmartContract.deploy(
      provider,
      wasmBuffer,
      constructorArgs,
      { coins: Mas.fromString('2') }
    );

    log('Contract Address:', contract.address.toString());
    logSuccess('Limit Orders deployed!');
    await sleep(3000);

    return contract.address.toString();
  } catch (error) {
    logError(`Deployment failed: ${error}`);
    throw error;
  }
}

/**
 * Deploy Recurring Orders (recurring_orders.ts)
 */
async function deployRecurringOrders(
  provider: JsonRpcProvider,
  account: Account,
  massaBeamAddress: string
): Promise<string> {
  logSection('3️⃣  RECURRING ORDERS & DCA DEPLOYMENT');

  try {
    const wasmPath = getWasmPath('recurring_orders.wasm');
    const wasmBuffer = fs.readFileSync(wasmPath);

    log('WASM Size:', `${(wasmBuffer.length / 1024).toFixed(2)} KB`);
    logSuccess('Bytecode loaded');
    await sleep(1000);

    logInfo('Deploying Recurring Orders...');
    log('MassaBeam Address:', massaBeamAddress.slice(0, 15) + '...');

    const constructorArgs = new Args().addString(massaBeamAddress);

    const contract = await SmartContract.deploy(
      provider,
      wasmBuffer,
      constructorArgs,
      { coins: Mas.fromString('2') }
    );

    log('Contract Address:', contract.address.toString());
    logSuccess('Recurring Orders deployed!');
    await sleep(3000);

    return contract.address.toString();
  } catch (error) {
    logError(`Deployment failed: ${error}`);
    throw error;
  }
}

/**
 * Deploy Flash Arbitrage Bot (flash_arbitrage_bot.ts)
 */
async function deployFlashArbitrageBot(
  provider: JsonRpcProvider,
  account: Account,
  massaBeamAddress: string,
  dusaRouterAddress: string,
  dusaQuoterAddress: string
): Promise<string> {
  logSection('4️⃣  FLASH ARBITRAGE BOT DEPLOYMENT');

  try {
    const wasmPath = getWasmPath('flash_arbitrage_bot.wasm');
    const wasmBuffer = fs.readFileSync(wasmPath);

    log('WASM Size:', `${(wasmBuffer.length / 1024).toFixed(2)} KB`);
    logSuccess('Bytecode loaded');
    await sleep(1000);

    logInfo('Deploying Flash Arbitrage Bot...');
    log('MassaBeam:', massaBeamAddress.slice(0, 15) + '...');
    log('Dussa Router:', dusaRouterAddress.slice(0, 15) + '...');
    log('Dussa Quoter:', dusaQuoterAddress.slice(0, 15) + '...');

    const constructorArgs = new Args()
      .addString(massaBeamAddress)
      .addString(dusaRouterAddress)
      .addString(dusaQuoterAddress);

    const contract = await SmartContract.deploy(
      provider,
      wasmBuffer,
      constructorArgs,
      { coins: Mas.fromString('2') }
    );

    log('Contract Address:', contract.address.toString());
    logSuccess('Flash Arbitrage Bot deployed!');
    await sleep(3000);

    return contract.address.toString();
  } catch (error) {
    logError(`Deployment failed: ${error}`);
    throw error;
  }
}

/**
 * Deploy Smart Swap (smart_swap.ts)
 */
async function deploySmartSwap(
  provider: JsonRpcProvider,
  account: Account,
  massaBeamAddress: string,
  dusaRouterAddress: string
): Promise<string> {
  logSection('5️⃣  SMART SWAP ROUTER DEPLOYMENT');

  try {
    const wasmPath = getWasmPath('smart_swap.wasm');
    const wasmBuffer = fs.readFileSync(wasmPath);

    log('WASM Size:', `${(wasmBuffer.length / 1024).toFixed(2)} KB`);
    logSuccess('Bytecode loaded');
    await sleep(1000);

    logInfo('Deploying Smart Swap Router...');
    log('Dussa Router:', dusaRouterAddress.slice(0, 15) + '...');
    log('MassaBeam:', massaBeamAddress.slice(0, 15) + '...');

    const constructorArgs = new Args()
      .addString(dusaRouterAddress)
      .addString(massaBeamAddress);

    const contract = await SmartContract.deploy(
      provider,
      wasmBuffer,
      constructorArgs,
      { coins: Mas.fromString('2') }
    );

    log('Contract Address:', contract.address.toString());
    logSuccess('Smart Swap Router deployed!');
    await sleep(3000);

    return contract.address.toString();
  } catch (error) {
    logError(`Deployment failed: ${error}`);
    throw error;
  }
}

/**
 * Deploy Arbitrage Engine (arbitrage_engine.ts)
 */
async function deployArbitrageEngine(
  provider: JsonRpcProvider,
  account: Account,
  massaBeamAddress: string,
  dusaRouterAddress: string,
  dusaQuoterAddress: string
): Promise<string> {
  logSection('6️⃣  ARBITRAGE ENGINE DEPLOYMENT');

  try {
    const wasmPath = getWasmPath('arbitrage_engine.wasm');
    const wasmBuffer = fs.readFileSync(wasmPath);

    log('WASM Size:', `${(wasmBuffer.length / 1024).toFixed(2)} KB`);
    logSuccess('Bytecode loaded');
    await sleep(1000);

    logInfo('Deploying Arbitrage Engine...');
    log('MassaBeam:', massaBeamAddress.slice(0, 15) + '...');
    log('Dussa Router:', dusaRouterAddress.slice(0, 15) + '...');

    const constructorArgs = new Args()
      .addString(massaBeamAddress)
      .addString(dusaRouterAddress)
      .addString(dusaQuoterAddress);

    const contract = await SmartContract.deploy(
      provider,
      wasmBuffer,
      constructorArgs,
      { coins: Mas.fromString('2') }
    );

    log('Contract Address:', contract.address.toString());
    logSuccess('Arbitrage Engine deployed!');
    await sleep(3000);

    return contract.address.toString();
  } catch (error) {
    logError(`Deployment failed: ${error}`);
    throw error;
  }
}

/**
 * Set WMAS address in MassaBeam AMM
 */
async function setWMASAddress(
  provider: JsonRpcProvider,
  massaBeamAddress: string,
  wmasAddress: string
): Promise<void> {
  logSection('🔗 CONFIGURE WMAS ADDRESS');

  try {
    logInfo('Setting WMAS address in MassaBeam...');
    log('WMAS Address:', wmasAddress);

    const contract = new SmartContract(provider, massaBeamAddress);
    const args = new Args().addString(wmasAddress);

    await contract.call('setWMASAddress', args, {
      coins: Mas.fromString('0.1'),
    });

    logSuccess('WMAS address configured!');
    await sleep(2000);
  } catch (error) {
    logError(`Configuration failed: ${error}`);
    throw error;
  }
}

// ============================================================================
// MAIN DEPLOYMENT
// ============================================================================

async function main(): Promise<void> {
  logSection('🚀 MASSABEAM COMPLETE DEPLOYMENT');

  console.log(`
  This script will deploy all MassaBeam contracts:
  ✓ MassaBeam AMM (main.ts)
  ✓ Limit Orders (advanced order types)
  ✓ Recurring Orders & DCA (dollar-cost averaging)
  ✓ Flash Arbitrage Bot (autonomous profit)
  ✓ Smart Swap Router (cross-DEX routing)
  ✓ Arbitrage Engine (opportunity detection)

  Total deployment cost: ~12 MAS
  `);

  await sleep(2000);

  try {
    // Setup account
    logSection('🔑 ACCOUNT SETUP');
    const account = await Account.fromEnv();
    log('Account Address:', account.address.toString());

    const provider = JsonRpcProvider.buildnet(account);
    const balance = await provider.balanceOf([account.address.toString()]);
    log('MAS Balance:', balance[0].balance.toString());

    const balanceNum = Number(balance[0].balance.toString());
    if (balanceNum < 12) {
      throw new Error('Insufficient balance. Need at least 12 MAS for deployment.');
    }

    logSuccess('Account setup complete');
    await sleep(2000);

    // Get Dussa addresses
    logSection('📋 DUSSA INTEGRATION ADDRESSES');
    const dusaRouterAddress = LB_ROUTER_ADDRESS[0] as string;
    const dusaQuoterAddress = LB_QUOTER_ADDRESS[0] as string;
    const wmasAddress = WMAS[0].address;

    log('Dussa Router:', dusaRouterAddress);
    log('Dussa Quoter:', dusaQuoterAddress);
    log('WMAS Address:', wmasAddress);
    logSuccess('Integration addresses loaded');
    await sleep(2000);

    // Deploy contracts in order
    const startTime = Date.now();

    const massaBeamAddress = await deployMassaBeam(provider, account);
    const limitOrdersAddress = await deployLimitOrders(provider, account, massaBeamAddress);
    const recurringOrdersAddress = await deployRecurringOrders(provider, account, massaBeamAddress);
    const flashArbitrageBotAddress = await deployFlashArbitrageBot(
      provider,
      account,
      massaBeamAddress,
      dusaRouterAddress,
      dusaQuoterAddress
    );
    const smartSwapAddress = await deploySmartSwap(
      provider,
      account,
      massaBeamAddress,
      dusaRouterAddress
    );
    const arbitrageEngineAddress = await deployArbitrageEngine(
      provider,
      account,
      massaBeamAddress,
      dusaRouterAddress,
      dusaQuoterAddress
    );

    // Configure WMAS
    await setWMASAddress(provider, massaBeamAddress, wmasAddress);

    const endTime = Date.now();
    const deploymentTime = ((endTime - startTime) / 1000).toFixed(2);

    // Save deployment info
    logSection('💾 SAVING DEPLOYMENT INFO');

    const deployedAddresses: DeploymentAddresses = {
      contracts: {
        massaBeam: massaBeamAddress,
        limitOrders: limitOrdersAddress,
        recurringOrders: recurringOrdersAddress,
        flashArbitrageBot: flashArbitrageBotAddress,
        smartSwap: smartSwapAddress,
        arbitrageEngine: arbitrageEngineAddress,
      },
      deployment: {
        timestamp: new Date().toISOString(),
        network: 'buildnet',
        account: account.address.toString(),
        totalGasUsed: '~12 MAS',
      },
      integration: {
        dusaRouter: dusaRouterAddress,
        dusaQuoter: dusaQuoterAddress,
        wmasAddress: wmasAddress,
      },
      decimals: {
        usdc: 6,
        dai: 18,
        weth: 18,
        wmas: 9,
        note: 'Contracts use u64 for internal calculations, u256 for token transfers',
      },
    };

    const outputPath = path.join(__dirname, '..', 'deployed-addresses.json');
    fs.writeFileSync(outputPath, JSON.stringify(deployedAddresses, null, 2));
    log('Saved to:', outputPath);
    logSuccess('Deployment info saved');
    await sleep(1000);

    // Print final summary
    logSection('✨ DEPLOYMENT COMPLETE');
    console.log(`
  📝 Deployment Summary:
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  🏦 Core Contracts:
  ├─ MassaBeam AMM:           ${massaBeamAddress}
  ├─ Limit Orders:            ${limitOrdersAddress}
  ├─ Recurring Orders:        ${recurringOrdersAddress}
  ├─ Flash Arbitrage Bot:     ${flashArbitrageBotAddress}
  ├─ Smart Swap Router:       ${smartSwapAddress}
  └─ Arbitrage Engine:        ${arbitrageEngineAddress}

  🔗 Integration:
  ├─ Dussa Router:            ${dusaRouterAddress}
  ├─ Dussa Quoter:            ${dusaQuoterAddress}
  └─ WMAS Address:            ${wmasAddress}

  ⏱️  Deployment Details:
  ├─ Time taken:              ${deploymentTime}s
  ├─ Network:                 Buildnet
  ├─ Account:                 ${account.address.toString().slice(0, 20)}...
  └─ Timestamp:               ${new Date().toISOString()}

  📊 Token Decimals (Important!):
  ├─ USDC:  6 decimals  (1 USDC = 1,000,000)
  ├─ DAI:   18 decimals (1 DAI = 1e18)
  ├─ WETH:  18 decimals (1 WETH = 1e18)
  └─ WMAS:  9 decimals  (1 WMAS = 1,000,000,000)

  💡 Note: Contracts use u64 internally, u256 for token transfers

  🎯 Next Steps:
  1. Run test scripts:
     - pnpm run test-flash-arb
     - pnpm run test-recurring

  2. Create pools and add liquidity:
     - pnpm run create-pools
     - pnpm run add-liquidity

  3. Test swaps:
     - pnpm run swap

  4. Start autonomous bots (optional):
     - Flash Arbitrage Bot: Call startBot(maxIterations)
     - Recurring Orders Bot: Call startBot(maxIterations)

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    `);

    console.log(`${'═'.repeat(75)}\n`);

  } catch (error) {
    logError(`Deployment failed: ${error}`);
    console.error(error);
    process.exit(1);
  }
}

// Execute main function
main()
  .then(() => {
    logSuccess('Deployment script completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    logError(`Deployment script failed: ${error}`);
    console.error(error);
    process.exit(1);
  });
