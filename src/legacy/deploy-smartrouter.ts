/**
 * Deploy SmartRouter with verified Dussa buildnet addresses
 *
 * This script deploys the SmartRouter contract that routes swaps between
 * MassaBeam and Dussa to get the best prices for users.
 */

import 'dotenv/config';
import {
  Account,
  Args,
  SmartContract,
  JsonRpcProvider,
  Address,
} from '@massalabs/massa-web3';
import {
  ChainId,
  LB_ROUTER_ADDRESS,
  LB_FACTORY_ADDRESS,
  LB_QUOTER_ADDRESS,
  WMAS as _WMAS,
} from '@dusalabs/sdk';
import { getScByteCode } from './utils';
import fs from 'fs';

// Verified Dussa Buildnet Addresses (from test-dussa-swap.ts results)
const DUSSA_BUILDNET_INDEX = 0; // We verified that index[0] is buildnet

async function deploySmartRouter() {
  console.log("=".repeat(70));
  console.log("Deploying SmartRouter to Massa Buildnet");
  console.log("=".repeat(70));
  console.log();

  try {
    // Setup account
    const account = await Account.fromEnv();
    console.log('Using account:', account.address?.toString());

    const provider = JsonRpcProvider.buildnet(account);

    // Get account balance
    const balances = await provider.balanceOf([account.address!.toString()]);
    const balance = balances?.[0]?.balance || 0n;
    console.log('Account balance:', balance.toString(), 'nanoMAS');
    console.log();

    // Load deployed addresses
    const deployedData = JSON.parse(fs.readFileSync('deployed-addresses.json', 'utf-8'));
    const MASSABEAM_AMM = deployedData.contracts.massaBeam;

    if (!MASSABEAM_AMM) {
      throw new Error("MassaBeam AMM not found in deployed-addresses.json. Please deploy it first.");
    }

    console.log("Existing Contracts:");
    console.log("  MassaBeam AMM:", MASSABEAM_AMM);
    console.log();

    // Get Dussa addresses from SDK
    const CHAIN_ID = ChainId.BUILDNET;

    const DUSSA_ROUTER = LB_ROUTER_ADDRESS[DUSSA_BUILDNET_INDEX];
    const DUSSA_QUOTER = LB_QUOTER_ADDRESS[DUSSA_BUILDNET_INDEX];
    const DUSSA_FACTORY = LB_FACTORY_ADDRESS[DUSSA_BUILDNET_INDEX];
    const WMAS_ADDRESS = _WMAS[CHAIN_ID].address;

    console.log("Dussa Buildnet Addresses (Verified):");
    console.log("  Router:  ", DUSSA_ROUTER);
    console.log("  Quoter:  ", DUSSA_QUOTER);
    console.log("  Factory: ", DUSSA_FACTORY);
    console.log("  WMAS:    ", WMAS_ADDRESS);
    console.log();

    // Cross-check with known addresses
    console.log("Cross-checking addresses...");
    const expectedRouter = "AS1XqtvX3rz2RWbnqLfaYVKEjM3VS5pny9yKDdXcmJ5C1vrcLEFd";
    const expectedFactory = "AS125Y3UWiMoEx3w71jf7iq1RwkxXdwkEVdoucBTAmvyzGh2KUqXS";
    const expectedQuoter = "AS1Wse7vxWvB1iP1DwNQTQQctwU1fQ1jrq5JgdSPZH132UYrYrXF";

    if (DUSSA_ROUTER !== expectedRouter) {
      throw new Error(`Router address mismatch! Got ${DUSSA_ROUTER}, expected ${expectedRouter}`);
    }
    if (DUSSA_FACTORY !== expectedFactory) {
      throw new Error(`Factory address mismatch! Got ${DUSSA_FACTORY}, expected ${expectedFactory}`);
    }
    if (DUSSA_QUOTER !== expectedQuoter) {
      throw new Error(`Quoter address mismatch! Got ${DUSSA_QUOTER}, expected ${expectedQuoter}`);
    }

    console.log("✅ All addresses verified successfully!");
    console.log();

    // Prepare constructor arguments
    const constructorArgs = new Args()
      .addString(DUSSA_ROUTER)       // Dussa Router
      .addString(DUSSA_QUOTER)       // Dussa Quoter
      .addString(DUSSA_FACTORY)      // Dussa Factory
      .addString(MASSABEAM_AMM)      // MassaBeam AMM
      .addString(WMAS_ADDRESS);      // WMAS

    console.log("Constructor Arguments:");
    console.log("  1. Dussa Router:     ", DUSSA_ROUTER);
    console.log("  2. Dussa Quoter:     ", DUSSA_QUOTER);
    console.log("  3. Dussa Factory:    ", DUSSA_FACTORY);
    console.log("  4. MassaBeam AMM:    ", MASSABEAM_AMM);
    console.log("  5. WMAS Address:     ", WMAS_ADDRESS);
    console.log();

    // Get bytecode
    console.log('Loading SmartRouter bytecode...');
    const bytecode = getScByteCode('build', 'SmartRouter.wasm');
    console.log('Bytecode size:', bytecode.length, 'bytes');
    console.log();

    // Deploy contract
    console.log('Deploying SmartRouter contract...');
    console.log('This may take a few minutes...');
    console.log();

    // Add coins for storage costs (0.05 MAS should be enough for all storage entries)
    const storageCost = 50_000_000n; // 0.05 MAS in nanoMAS

    const deploymentOperation = await SmartContract.deploy(
      provider,
      bytecode,
      constructorArgs,
      {
        coins: storageCost,
        maxGas: 1_000_000_000n, // 1 billion gas
      }
    );

    console.log('Deployment operation ID:', deploymentOperation.address);
    console.log('Waiting for deployment to be finalized...');

    // // Wait for deployment
    // await deploymentOperation.waitSpeculativeExecution();

    // const events = await deploymentOperation.getSpeculativeEvents();
    // console.log();
    // console.log('Deployment Events:');
    // events.forEach(event => {
    //   console.log(' ', event.data);
    // });
    // console.log();

    // Get contract address
    const smartRouterAddress = deploymentOperation.address;

    if (!smartRouterAddress) {
      throw new Error('Failed to get SmartRouter contract address');
    }

    console.log("=".repeat(70));
    console.log("✅ SmartRouter Deployed Successfully!");
    console.log("=".repeat(70));
    console.log();
    console.log("Contract Address:", smartRouterAddress);
    console.log();

    // Update deployed-addresses.json
    deployedData.contracts.smartRouter = smartRouterAddress;
    deployedData.dussa = {
      router: DUSSA_ROUTER,
      quoter: DUSSA_QUOTER,
      factory: DUSSA_FACTORY,
      wmas: WMAS_ADDRESS
    };
    deployedData.timestamp = new Date().toISOString();

    fs.writeFileSync(
      'deployed-addresses.json',
      JSON.stringify(deployedData, null, 2)
    );

    console.log("Updated deployed-addresses.json");
    console.log();

    // Summary
    console.log("=".repeat(70));
    console.log("Deployment Summary");
    console.log("=".repeat(70));
    console.log();
    console.log("SmartRouter Configuration:");
    console.log("  Contract Address:    ", smartRouterAddress);
    console.log("  MassaBeam AMM:       ", MASSABEAM_AMM);
    console.log("  Dussa Router:        ", DUSSA_ROUTER);
    console.log("  Dussa Quoter:        ", DUSSA_QUOTER);
    console.log("  Dussa Factory:       ", DUSSA_FACTORY);
    console.log("  WMAS:                ", WMAS_ADDRESS);
    console.log();
    console.log("Next Steps:");
    console.log("  1. Test SmartRouter with a swap");
    console.log("  2. Compare prices between MassaBeam and Dussa");
    console.log("  3. Update frontend to use SmartRouter");
    console.log();

  } catch (error: any) {
    console.error("❌ Deployment failed:", error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run deployment
deploySmartRouter().catch(console.error);
