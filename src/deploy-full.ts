import 'dotenv/config';
import {
  Account,
  Args,
  Mas,
  SmartContract,
  JsonRpcProvider,
  bytesToStr,
  Address,
} from '@massalabs/massa-web3';
import { getScByteCode } from './utils';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const TOKENS = [
  { name: 'BeamUSDT', symbol: 'USDT', decimals: 8, supply: '1000000000' }, // 1 billion USDT
  { name: 'BeamUSDC', symbol: 'USDC', decimals: 8, supply: '1000000000' }, // 1 billion USDC
  { name: 'BeamCoin', symbol: 'BEAM', decimals: 8, supply: '50000000000000' }, // 50 trillion BEAM
];

const DEPLOYMENT_CONFIG = {
  coins: Mas.fromString('2'), // Coins to send with deployment
  gasLimit: 4_000_000_000n, // 4 billion gas
};

interface DeployedAddresses {
  tokens: {
    [key: string]: string;
  };
  contracts: {
    massaBeam: string;
    massaBeamDCA: string;
    massaBeamEngine: string;
  };
  deployer: string;
  timestamp: string;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('🚀 MassaBeam Protocol Deployment Script');
  console.log('═══════════════════════════════════════════════════════\n');

  // Initialize account and provider
  const account = await Account.fromEnv();
  const provider = JsonRpcProvider.buildnet(account);

  console.log('📌 Using account:', account.address.toString());
  const balance = await provider.balanceOf([account.address.toString()]);
  console.log('💰 Account balance:', Mas.toString(balance[0].balance), 'MAS\n');

  if (balance[0].balance < Mas.fromString('10')) {
    throw new Error('❌ Insufficient balance! Need at least 10 MAS for deployment');
  }

  const deployedAddresses: DeployedAddresses = {
    tokens: {},
    contracts: {
      massaBeam: '',
      massaBeamDCA: '',
      massaBeamEngine: '',
    },
    deployer: account.address.toString(),
    timestamp: new Date().toISOString(),
  };

  // ═══════════════════════════════════════════════════════
  // STEP 1: Deploy Tokens
  // ═══════════════════════════════════════════════════════
  console.log('═══════════════════════════════════════════════════════');
  console.log('📦 STEP 1: Deploying Tokens');
  console.log('═══════════════════════════════════════════════════════\n');

  const tokenByteCode = getScByteCode('build', 'Token.wasm');

  for (const token of TOKENS) {
    console.log(`🪙  Deploying ${token.name} (${token.symbol})...`);

    try {
      // Token constructor expects: name, symbol, decimals, supply (all in Token.ts constructor)
      const constructorArgs = new Args()
        .addString(token.name)
        .addString(token.symbol)
        .addU8(BigInt(token.decimals))
        .addU256(BigInt(token.supply));

      const tokenContract = await SmartContract.deploy(
        provider,
        tokenByteCode,
        constructorArgs,
        DEPLOYMENT_CONFIG,
      );

      deployedAddresses.tokens[token.symbol] = tokenContract.address.toString();

      console.log(`   ✅ ${token.symbol} deployed at: ${tokenContract.address}`);
      console.log(`   📊 Supply: ${token.supply} (${token.decimals} decimals)\n`);

      // Verify deployment
      const name = await tokenContract.read('name', new Args());
      const symbol = await tokenContract.read('symbol', new Args());
      console.log(`   🔍 Verified - Name: ${bytesToStr(name.value)}, Symbol: ${bytesToStr(symbol.value)}\n`);

      // Wait a bit between deployments to avoid nonce issues
      await sleep(2000);
    } catch (error) {
      console.error(`   ❌ Failed to deploy ${token.symbol}:`, error);
      throw error;
    }
  }

  console.log('✅ All tokens deployed successfully!\n');

  // ═══════════════════════════════════════════════════════
  // STEP 2: Deploy MassaBeam (AMM) Contract
  // ═══════════════════════════════════════════════════════
  console.log('═══════════════════════════════════════════════════════');
  console.log('📦 STEP 2: Deploying MassaBeam AMM Contract');
  console.log('═══════════════════════════════════════════════════════\n');

  try {
    const ammByteCode = getScByteCode('build', 'massa_beam.wasm');

    // AMM contract constructor (no args needed based on your contract)
    const ammConstructorArgs = new Args();

    console.log('🔄 Deploying massa_beam.wasm...');
    const ammContract = await SmartContract.deploy(
      provider,
      ammByteCode,
      ammConstructorArgs,
      DEPLOYMENT_CONFIG,
    );

    deployedAddresses.contracts.massaBeam = ammContract.address.toString();

    console.log(`   ✅ MassaBeam AMM deployed at: ${ammContract.address}\n`);

    // Wait before next deployment
    await sleep(2000);
  } catch (error) {
    console.error('   ❌ Failed to deploy MassaBeam AMM:', error);
    throw error;
  }

  // ═══════════════════════════════════════════════════════
  // STEP 3: Deploy MassaBeam DCA Contract
  // ═══════════════════════════════════════════════════════
  console.log('═══════════════════════════════════════════════════════');
  console.log('📦 STEP 3: Deploying MassaBeam DCA Contract');
  console.log('═══════════════════════════════════════════════════════\n');

  try {
    const dcaByteCode = getScByteCode('build', 'massa_beam_dca.wasm');

    // DCA contract constructor - needs AMM contract address
    const dcaConstructorArgs = new Args()
      .addString(deployedAddresses.contracts.massaBeam);

    console.log('🔄 Deploying massa_beam_dca.wasm...');
    console.log(`   🔗 Linking to AMM: ${deployedAddresses.contracts.massaBeam}`);

    const dcaContract = await SmartContract.deploy(
      provider,
      dcaByteCode,
      dcaConstructorArgs,
      DEPLOYMENT_CONFIG,
    );

    deployedAddresses.contracts.massaBeamDCA = dcaContract.address.toString();

    console.log(`   ✅ MassaBeam DCA deployed at: ${dcaContract.address}\n`);

    // Wait before next deployment
    await sleep(2000);
  } catch (error) {
    console.error('   ❌ Failed to deploy MassaBeam DCA:', error);
    throw error;
  }

  // ═══════════════════════════════════════════════════════
  // STEP 4: Deploy MassaBeam Engine (Arbitrage) Contract
  // ═══════════════════════════════════════════════════════
  console.log('═══════════════════════════════════════════════════════');
  console.log('📦 STEP 4: Deploying MassaBeam Arbitrage Engine');
  console.log('═══════════════════════════════════════════════════════\n');

  try {
    const engineByteCode = getScByteCode('build', 'massa_beam_engine.wasm');

    // Engine contract constructor - needs AMM contract address
    const engineConstructorArgs = new Args()
      .addString(deployedAddresses.contracts.massaBeam);

    console.log('🔄 Deploying massa_beam_engine.wasm...');
    console.log(`   🔗 Linking to AMM: ${deployedAddresses.contracts.massaBeam}`);

    const engineContract = await SmartContract.deploy(
      provider,
      engineByteCode,
      engineConstructorArgs,
      DEPLOYMENT_CONFIG,
    );

    deployedAddresses.contracts.massaBeamEngine = engineContract.address.toString();

    console.log(`   ✅ MassaBeam Engine deployed at: ${engineContract.address}\n`);

    // Wait before next step
    await sleep(2000);
  } catch (error) {
    console.error('   ❌ Failed to deploy MassaBeam Engine:', error);
    throw error;
  }

  // ═══════════════════════════════════════════════════════
  // STEP 5: Initialize Pools (Optional but Recommended)
  // ═══════════════════════════════════════════════════════
  console.log('═══════════════════════════════════════════════════════');
  console.log('📦 STEP 5: Initializing Liquidity Pools (Optional)');
  console.log('═══════════════════════════════════════════════════════\n');

  console.log('ℹ️  You can manually create pools using the frontend or by calling:');
  console.log('   createPool(tokenA, tokenB, amountA, amountB, deadline)\n');
  console.log('💡 Recommended pairs:');
  console.log(`   - BEAM/USDT: ${deployedAddresses.tokens.BEAM} / ${deployedAddresses.tokens.USDT}`);
  console.log(`   - BEAM/USDC: ${deployedAddresses.tokens.BEAM} / ${deployedAddresses.tokens.USDC}`);
  console.log(`   - USDT/USDC: ${deployedAddresses.tokens.USDT} / ${deployedAddresses.tokens.USDC}\n`);

  // ═══════════════════════════════════════════════════════
  // STEP 6: Save Deployment Addresses
  // ═══════════════════════════════════════════════════════
  console.log('═══════════════════════════════════════════════════════');
  console.log('💾 STEP 6: Saving Deployment Addresses');
  console.log('═══════════════════════════════════════════════════════\n');

  const outputPath = path.join(__dirname, '..', 'deployed-addresses.json');
  fs.writeFileSync(outputPath, JSON.stringify(deployedAddresses, null, 2));

  console.log(`✅ Addresses saved to: ${outputPath}\n`);

  // Also create a TypeScript config file for the frontend
  const frontendConfigPath = path.join(
    __dirname,
    '..',
    '..',
    'massabeam',
    'src',
    'js',
    'organisation',
    'contracts-config.js'
  );

  const frontendConfig = `// Auto-generated on ${deployedAddresses.timestamp}
// DO NOT EDIT MANUALLY

export const DEPLOYED_CONTRACTS = {
  // Token Addresses
  TOKENS: {
    USDT: "${deployedAddresses.tokens.USDT}",
    USDC: "${deployedAddresses.tokens.USDC}",
    BEAM: "${deployedAddresses.tokens.BEAM}",
  },

  // Protocol Contracts
  AMM: "${deployedAddresses.contracts.massaBeam}",
  DCA: "${deployedAddresses.contracts.massaBeamDCA}",
  ENGINE: "${deployedAddresses.contracts.massaBeamEngine}",

  // Deployment Info
  DEPLOYER: "${deployedAddresses.deployer}",
  DEPLOYED_AT: "${deployedAddresses.timestamp}",
};

// Token Metadata
export const TOKEN_METADATA = {
  USDT: { name: "BeamUSDT", symbol: "USDT", decimals: 8 },
  USDC: { name: "BeamUSDC", symbol: "USDC", decimals: 8 },
  BEAM: { name: "BeamCoin", symbol: "BEAM", decimals: 8 },
};
`;

  fs.writeFileSync(frontendConfigPath, frontendConfig);
  console.log(`✅ Frontend config saved to: ${frontendConfigPath}\n`);

  // ═══════════════════════════════════════════════════════
  // Deployment Summary
  // ═══════════════════════════════════════════════════════
  console.log('═══════════════════════════════════════════════════════');
  console.log('🎉 DEPLOYMENT COMPLETE!');
  console.log('═══════════════════════════════════════════════════════\n');

  console.log('📋 Deployment Summary:');
  console.log('─────────────────────────────────────────────────────\n');

  console.log('🪙  Tokens:');
  Object.entries(deployedAddresses.tokens).forEach(([symbol, address]) => {
    console.log(`   ${symbol.padEnd(6)} → ${address}`);
  });

  console.log('\n📦 Contracts:');
  console.log(`   AMM    → ${deployedAddresses.contracts.massaBeam}`);
  console.log(`   DCA    → ${deployedAddresses.contracts.massaBeamDCA}`);
  console.log(`   ENGINE → ${deployedAddresses.contracts.massaBeamEngine}`);

  console.log('\n🔗 Deployer:', deployedAddresses.deployer);
  console.log('⏰ Timestamp:', deployedAddresses.timestamp);

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('📝 Next Steps:');
  console.log('═══════════════════════════════════════════════════════\n');

  console.log('1. Update your frontend contract addresses:');
  console.log('   - Check: massabeam/src/js/organisation/contracts-config.ts\n');

  console.log('2. Mint tokens to your test accounts:');
  console.log('   npm run mint-tokens\n');

  console.log('3. Create initial liquidity pools:');
  console.log('   - Use the frontend at: massabeam/app.html');
  console.log('   - Or call createPool() directly\n');

  console.log('4. Test the DCA and Arbitrage features:');
  console.log('   - Create DCA strategies');
  console.log('   - Monitor arbitrage opportunities\n');

  console.log('═══════════════════════════════════════════════════════');
  console.log('✨ Happy Building on Massa! ✨');
  console.log('═══════════════════════════════════════════════════════\n');

  // Get final balance
  const finalBalance = await provider.balanceOf([account.address.toString()]);
  const spent = balance[0].balance - finalBalance[0].balance;
  console.log('💸 Total MAS spent on deployment:', Mas.fromMas(spent), 'MAS\n');

  return deployedAddresses;
}

// Helper function
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Run deployment
main()
  .then((addresses) => {
    console.log('✅ Deployment script completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Deployment failed:', error);
    process.exit(1);
  });
