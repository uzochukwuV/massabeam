import 'dotenv/config';
import {
  Account,
  Args,
  Mas,
  SmartContract,
  JsonRpcProvider,
} from '@massalabs/massa-web3';
import { getScByteCode } from './utils';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Dussa addresses (buildnet - index 0)
const DUSSA_ROUTER = "AS1XqtvX3rz2RWbnqLfaYVKEjM3VS5pny9yKDdXcmJ5C1vrcLEFd";
const DUSSA_FACTORY = "AS125Y3UWiMoEx3w71jf7iq1RwkxXdwkEVdoucBTAmvyzGh2KUqXS";
const DUSSA_QUOTER = "AS1Wse7vxWvB1iP1DwNQTQQctwU1fQ1jrq5JgdSPZH132UYrYrXF";

// MassaBeam AMM address (from contracts-config.js)
const MASSABEAM_AMM = "AS1x8K4VnKatHuP1uUHzxcAVCHoFtytm6KoxuxKcBrjrb8h2Lbq4";

const DEPLOYMENT_CONFIG = {
  coins: Mas.fromString('0.2'), // 0.2 MAS for storage
  gasLimit: 2_000_000_000n, // 2 billion gas
};

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('🚀 SmartRouter Deployment Script');
  console.log('═══════════════════════════════════════════════════════\n');

  // Initialize account and provider
  const account = await Account.fromEnv();
  const provider = JsonRpcProvider.buildnet(account);

  console.log('📌 Using account:', account.address.toString());
  const balance = await provider.balanceOf([account.address.toString()]);
  console.log('💰 Account balance:', Mas.toString(balance[0].balance), 'MAS\n');

  if (balance[0].balance < Mas.fromString('0.5')) {
    throw new Error('❌ Insufficient balance! Need at least 0.5 MAS for deployment');
  }

  // Read bytecode
  console.log('📦 Loading SmartRouter bytecode...');
  const bytecode = getScByteCode('build', 'SmartRouter.wasm');
  console.log('✅ Bytecode loaded');
  console.log('   Size:', bytecode.length, 'bytes\n');

  // Prepare constructor arguments (must match SmartRouter constructor)
  console.log('📝 Constructor Arguments:');
  console.log('   MassaBeam AMM:', MASSABEAM_AMM);
  console.log('   Dussa Router: ', DUSSA_ROUTER);
  console.log('   Dussa Factory:', DUSSA_FACTORY);
  console.log('   Dussa Quoter: ', DUSSA_QUOTER);
  console.log();

  const constructorArgs = new Args()
    .addString(MASSABEAM_AMM)
    .addString(DUSSA_ROUTER)
    .addString(DUSSA_FACTORY)
    .addString(DUSSA_QUOTER);

  // Deploy
  console.log('🚀 Deploying SmartRouter...');
  const smartRouterContract = await SmartContract.deploy(
    provider,
    bytecode,
    constructorArgs,
    DEPLOYMENT_CONFIG,
  );

  const contractAddress = smartRouterContract.address.toString();

  console.log('✅ SmartRouter deployed at:', contractAddress);
  console.log();

  // Wait a bit
  await sleep(2000);

  // Update contracts-config.js
  console.log('═══════════════════════════════════════════════════════');
  console.log('💾 Updating Frontend Configuration');
  console.log('═══════════════════════════════════════════════════════\n');

  updateContractsConfig(contractAddress, account.address.toString());

  console.log('═══════════════════════════════════════════════════════');
  console.log('🎉 DEPLOYMENT COMPLETE!');
  console.log('═══════════════════════════════════════════════════════\n');

  console.log('📍 SmartRouter Address:', contractAddress);
  console.log('🔗 Deployer:', account.address.toString());
  console.log();

  console.log('═══════════════════════════════════════════════════════');
  console.log('📝 Next Steps:');
  console.log('═══════════════════════════════════════════════════════\n');

  console.log('1. Open massabeam/app.html in your browser');
  console.log('2. Connect your wallet');
  console.log('3. Try swapping tokens - SmartRouter will compare:');
  console.log('   ✅ MassaBeam prices');
  console.log('   ✅ Dussa prices');
  console.log('   ✅ Automatically use the best DEX!\n');

  console.log('═══════════════════════════════════════════════════════');
  console.log('✨ Happy Building on Massa! ✨');
  console.log('═══════════════════════════════════════════════════════\n');

  // Get final balance
  const finalBalance = await provider.balanceOf([account.address.toString()]);
  const spent = balance[0].balance - finalBalance[0].balance;
  console.log('💸 Total MAS spent on deployment:', Mas.toString(spent), 'MAS\n');

  return contractAddress;
}

function updateContractsConfig(smartRouterAddress: string, deployerAddress: string) {
  console.log('📝 Updating contracts-config.js...');

  const configPath = path.join(
    __dirname,
    '..',
    'massabeam',
    'src',
    'js',
    'organisation',
    'contracts-config.js'
  );

  const configContent = `// Auto-generated on ${new Date().toISOString()}
// DO NOT EDIT MANUALLY

export const DEPLOYED_CONTRACTS = {
  // Token Addresses
  TOKENS: {
    USDT: "AS12M4KwP2fRrrkb2oY47hhZqcNRC4sbZ8uPfqKNoR3f3b5eqy2yo",
    USDC: "AS12fCBhCRMzqDuCH9fY25Gtu1wNJyxgF1YHuZEW91UBrg2EgjeSB",
    BEAM: "AS1oAHhbH7mMmPDoZJsSx8dnWzNgW2F8ugVBXpso3bTSTJFU6TUk",
  },

  // Protocol Contracts
  AMM: "AS1x8K4VnKatHuP1uUHzxcAVCHoFtytm6KoxuxKcBrjrb8h2Lbq4",
  DCA: "AS12Z8eKEdKv6mJiBFrh53gWFLY3K5LnKnxuFymCCXEBpk3rMD7Ua",
  ENGINE: "AS1QXNZ6MB9GV3zmtSLgEKFAXs3Sxcp4qnCtupLXku942QgxBn4P",
  SMART_ROUTER: "${smartRouterAddress}",

  // Dussa DEX (Buildnet)
  DUSSA: {
    ROUTER: "${DUSSA_ROUTER}",
    FACTORY: "${DUSSA_FACTORY}",
    QUOTER: "${DUSSA_QUOTER}",
  },

  // Deployment Info
  DEPLOYER: "${deployerAddress}",
  DEPLOYED_AT: "${new Date().toISOString()}",
};

// Token Metadata
export const TOKEN_METADATA = {
  USDT: { name: "BeamUSDT", symbol: "USDT", decimals: 8, address: DEPLOYED_CONTRACTS.TOKENS.USDT },
  USDC: { name: "BeamUSDC", symbol: "USDC", decimals: 8, address: DEPLOYED_CONTRACTS.TOKENS.USDC },
  BEAM: { name: "BeamCoin", symbol: "BEAM", decimals: 8, address: DEPLOYED_CONTRACTS.TOKENS.BEAM },
};

// Dussa Tokens (Buildnet)
export const DUSSA_TOKENS = {
  WMAS: "AS12FW5Rs5YN2zdpEnqwj4iHUUPt9R4Eqjq2qtpJFNKW3mn33RuLU",
  USDC: "AS12N76WPYB3QNYKGhV2jZuQs1djdhNJLQgnm7m52pHWecvvj1fCQ",
};

// Get all tokens as array
export const TOKENS_LIST = Object.values(TOKEN_METADATA);
`;

  fs.writeFileSync(configPath, configContent);
  console.log('✅ contracts-config.js updated!');
  console.log('   Path:', configPath);
  console.log();
}

// Helper function
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Run deployment
main()
  .then((address) => {
    console.log('✅ Deployment script completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Deployment failed:', error);
    process.exit(1);
  });
