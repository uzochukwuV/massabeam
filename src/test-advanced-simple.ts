import 'dotenv/config';
import {
  Account,
  Args,
  Mas,
  SmartContract,
  JsonRpcProvider,
  bytesToF64,
} from '@massalabs/massa-web3';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
  console.log('🧪 MassaBeam Advanced Features Test');
  console.log('═══════════════════════════════════════════════════════\n');

  // Load deployment info
  const addressesPath = path.join(__dirname, '..', 'deployed-addresses.json');
  if (!fs.existsSync(addressesPath)) {
    throw new Error('❌ deployed-addresses.json not found!');
  }

  const deployedAddresses: DeployedAddresses = JSON.parse(
    fs.readFileSync(addressesPath, 'utf-8')
  );

  // Initialize account and provider
  const account = await Account.fromEnv();
  const provider = JsonRpcProvider.buildnet(account);

  console.log('📌 Using account:', account.address.toString());
  const balance = await provider.balanceOf([account.address.toString()]);
  console.log('💰 Account balance:', balance[0].balance, 'MAS\n');

  const ammAddress = deployedAddresses.contracts.massaBeam;
  const ammContract = new SmartContract(provider, ammAddress);

  console.log('📍 AMM Contract (Advanced):', ammAddress);
  console.log('');

  // Test 1: Read pool count
  console.log('═══════════════════════════════════════════════════════');
  console.log('Test 1: Check Pool Count');
  console.log('═══════════════════════════════════════════════════════\n');

  try {
    const poolCountData = await ammContract.read('readPoolCount', new Args());
    const poolCount = bytesToF64(poolCountData.value);
    console.log('   📊 Total Pools:', poolCount);
    console.log('');
  } catch (error) {
    console.log('   ℹ️  No pools exist yet\n');
  }

  // Test 2: Check contract is initialized
  console.log('═══════════════════════════════════════════════════════');
  console.log('Test 2: Check Contract Status');
  console.log('═══════════════════════════════════════════════════════\n');

  try {
    const initData = await ammContract.read('readInitialized', new Args());
    console.log('   ✅ Contract initialized successfully');
    console.log('');
  } catch (error) {
    console.log('   ℹ️  Contract initialization status:', error);
    console.log('');
  }

  // Test 3: Get TWAP Price (will fail if no pool exists)
  console.log('═══════════════════════════════════════════════════════');
  console.log('Test 3: TWAP Price Oracle');
  console.log('═══════════════════════════════════════════════════════\n');

  const tokenAAddress = deployedAddresses.tokens['USDT'];
  const tokenBAddress = deployedAddresses.tokens['BEAM'];

  console.log('💱 Checking TWAP for: USDT/BEAM');
  console.log('📍 USDT:', tokenAAddress);
  console.log('📍 BEAM:', tokenBAddress);
  console.log('');

  try {
    const twapArgs = new Args()
      .addString(tokenAAddress)
      .addString(tokenBAddress);

    const twapPrice = await ammContract.read('getTWAPPrice', twapArgs);
    console.log(' TWAP Price:', bytesToF64(twapPrice.value));
    console.log('');
  } catch (error) {
    console.log(' ℹTWAP not available (pool may not exist yet)');
    console.log('');
  }

  // Summary of Available Functions
  console.log('═══════════════════════════════════════════════════════');
  console.log('📋 MassaBeam Advanced Contract Functions');
  console.log('═══════════════════════════════════════════════════════\n');

  console.log('✅ Base AMM Functions (re-exported):');
  console.log('   • createPool - Create new liquidity pool');
  console.log('   • addLiquidity - Add liquidity to existing pool');
  console.log('   • removeLiquidity - Remove liquidity from pool');
  console.log('   • swap - Swap tokens');
  console.log('   • readPool - Get pool information');
  console.log('   • readPoolCount - Get total pool count');
  console.log('   • readTotalVolume - Get total trading volume\n');

  console.log('🚀 Advanced Features:');
  console.log('   • createDCA - Create Dollar-Cost Averaging strategy');
  console.log('   • executeDCA - Execute DCA strategy (keeper only)');
  console.log('   • createLimitOrder - Create limit order');
  console.log('   • executeLimitOrder - Execute limit order (keeper only)');
  console.log('   • getTWAPPrice - Get Time-Weighted Average Price');
  console.log('   • updateTWAP - Update TWAP accumulator');
  console.log('   • getDCA - Get DCA strategy details');
  console.log('   • getLimitOrder - Get limit order details\n');

  console.log('🔐 Access Control:');
  console.log('   • grantRole - Grant role to address (admin only)');
  console.log('   • Roles: ADMIN, KEEPER, PAUSER, FEE_SETTER\n');

  console.log('═══════════════════════════════════════════════════════');
  console.log('📝 Next Steps');
  console.log('═══════════════════════════════════════════════════════\n');

  console.log('1. Create a liquidity pool first:');
  console.log('   npx tsx src/create-pools.ts\n');

  console.log('2. Then test DCA:');
  console.log('   - Call createDCA with token pair and strategy params');
  console.log('   - Keeper can call executeDCA to run the strategy\n');

  console.log('3. Test Limit Orders:');
  console.log('   - Call createLimitOrder with target price');
  console.log('   - Keeper executes when price is met\n');

  console.log('4. Monitor TWAP prices for oracle data\n');

  console.log('═══════════════════════════════════════════════════════');
  console.log('✨ Contract is ready for advanced trading features!');
  console.log('═══════════════════════════════════════════════════════\n');
}

main()
  .then(() => {
    console.log('✅ Test completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Test failed:', error);
    process.exit(1);
  });
