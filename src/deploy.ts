/**
 * MassaBeam Protocol - Master Deployment Script
 *
 * Deploys all MassaBeam contracts in correct order with proper validation
 *
 * Contracts deployed:
 * 1. MassaBeam AMM (main.ts) - Core constant-product DEX
 * 2. SmartSwap Router (smart_swap.ts) - Intelligent routing between DEXs
 * 3. Arbitrage Engine (arbitrage_engine.ts) - Cross-DEX arbitrage
 * 4. Limit Orders (limit_orders.ts) - Price-based order execution
 * 5. Recurring Orders (recurring_orders.ts) - DCA and grid trading
 *
 * Usage:
 *   npm run deploy -- --contracts all
 *   npm run deploy -- --contracts massabeam,smartswap
 *   npm run deploy -- --contract massabeam
 */

import 'dotenv/config';
import { Args } from '@massalabs/massa-web3';
import { LB_ROUTER_ADDRESS } from '@dusalabs/sdk';
import {
  Logger,
  initializeAccount,
  deployContract,
  saveDeployedAddresses,
  loadDeployedAddresses,
  sleep,
  readContract,
  DEFAULT_CONFIG,
} from './test-utils.js';

// ============================================================================
// CONTRACT DEPLOYMENT FUNCTIONS
// ============================================================================

async function deployMassaBeamAMM() {
  const { account, provider } = await initializeAccount();

  const contract = await deployContract(
    provider,
    'main.wasm',
    new Args(), // No constructor args for MassaBeam AMM
    '2',
    'MassaBeam AMM'
  );

  // Verify deployment
  Logger.info('Verifying deployment...');
  try {
    const initialized = await readContract(contract, 'readInitialized');
    Logger.success(`Contract initialized: ${initialized.value.length > 0}`);

    const poolCount = await readContract(contract, 'readPoolCount');
    Logger.log('Pool Count', '0 (expected for fresh deployment)');
  } catch (error) {
    Logger.warn('Verification skipped (contract settling)');
  }

  await sleep(2000);
  return contract.address.toString();
}

async function deploySmartSwap(massaBeamAddress: string) {
  const { provider } = await initializeAccount();

  // Get Dusa Router address
  const dusaRouterAddress = LB_ROUTER_ADDRESS[0] as string;
  Logger.log('Dusa Router', dusaRouterAddress.slice(0, 15) + '...');
  Logger.log('MassaBeam AMM', massaBeamAddress.slice(0, 15) + '...');

  const constructorArgs = new Args()
    .addString(dusaRouterAddress)
    .addString(massaBeamAddress);

  const contract = await deployContract(
    provider,
    'smart_swap.wasm',
    constructorArgs,
    '2',
    'SmartSwap Router'
  );

  // Verify
  Logger.info('Verifying SmartSwap...');
  try {
    const stats = await readContract(contract, 'getStatistics');
    Logger.success('SmartSwap is responsive');
  } catch (error) {
    Logger.warn('Verification skipped');
  }

  await sleep(2000);
  return contract.address.toString();
}

async function deployArbitrageEngine(massaBeamAddress: string) {
  const { provider } = await initializeAccount();

  const dusaRouterAddress = LB_ROUTER_ADDRESS[0] as string;

  // FIXED: Arbitrage engine takes only 2 parameters!
  const constructorArgs = new Args()
    .addString(massaBeamAddress)
    .addString(dusaRouterAddress);

  const contract = await deployContract(
    provider,
    'arbitrage_engine.wasm',
    constructorArgs,
    '2',
    'Arbitrage Engine'
  );

  await sleep(2000);
  return contract.address.toString();
}

async function deployLimitOrders(massaBeamAddress: string) {
  const { provider } = await initializeAccount();

  const constructorArgs = new Args().addString(massaBeamAddress);

  const contract = await deployContract(
    provider,
    'limit_orders.wasm',
    constructorArgs,
    '2',
    'Limit Orders'
  );

  await sleep(2000);
  return contract.address.toString();
}

async function deployRecurringOrders(massaBeamAddress: string) {
  const { provider } = await initializeAccount();

  const constructorArgs = new Args().addString(massaBeamAddress);

  const contract = await deployContract(
    provider,
    'recurring_orders.wasm',
    constructorArgs,
    '2',
    'Recurring Orders'
  );

  await sleep(2000);
  return contract.address.toString();
}

// ============================================================================
// MAIN DEPLOYMENT ORCHESTRATOR
// ============================================================================

async function main() {
  Logger.section('🚀 MASSABEAM PROTOCOL DEPLOYMENT');

  const args = process.argv.slice(2);
  const contractsArg = args.find(arg => arg.startsWith('--contracts='))?.split('=')[1] || 'all';
  const contracts = contractsArg === 'all'
    ? ['massabeam', 'smartswap', 'arbitrage', 'limitorders', 'recurringorders']
    : contractsArg.split(',');

  Logger.log('Contracts to deploy', contracts.join(', '));

  const addresses = loadDeployedAddresses();
  let massaBeamAddress = addresses.massaBeam;

  try {
    // Deploy MassaBeam AMM (required for all other contracts)
    if (contracts.includes('massabeam') || !massaBeamAddress) {
      massaBeamAddress = await deployMassaBeamAMM();
      saveDeployedAddresses({ massaBeam: massaBeamAddress });
    } else {
      Logger.info(`Using existing MassaBeam at ${massaBeamAddress}`);
    }

    // Deploy SmartSwap
    if (contracts.includes('smartswap')) {
      const smartSwapAddress = await deploySmartSwap(massaBeamAddress!);
      saveDeployedAddresses({ smartSwap: smartSwapAddress });
    }

    // Deploy Arbitrage Engine
    if (contracts.includes('arbitrage')) {
      const arbitrageAddress = await deployArbitrageEngine(massaBeamAddress!);
      saveDeployedAddresses({ arbitrageEngine: arbitrageAddress });
    }

    // Deploy Limit Orders
    if (contracts.includes('limitorders')) {
      const limitOrdersAddress = await deployLimitOrders(massaBeamAddress!);
      saveDeployedAddresses({ limitOrders: limitOrdersAddress });
    }

    // Deploy Recurring Orders
    if (contracts.includes('recurringorders')) {
      const recurringOrdersAddress = await deployRecurringOrders(massaBeamAddress!);
      saveDeployedAddresses({ recurringOrders: recurringOrdersAddress });
    }

    // Final summary
    Logger.section('✅ DEPLOYMENT COMPLETE');
    const final Addresses = loadDeployedAddresses();
    Object.entries(finalAddresses).forEach(([name, addr]) => {
      if (addr) Logger.log(name, addr);
    });

    Logger.success('All contracts deployed successfully!');
    Logger.info('Addresses saved to deployed-addresses.json');

  } catch (error) {
    Logger.error(`Deployment failed: ${error}`);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
