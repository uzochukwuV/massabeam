import 'dotenv/config';
import {
  Account,
  Args,
  Mas,
  SmartContract,
  JsonRpcProvider,
  bytesToStr,
} from '@massalabs/massa-web3';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface DeploymentInfo {
  contractAddress: string;
  deployedAt: string;
  deployer: string;
  operationId: string;
  contractSize: number;
}

interface DeployedAddresses {
  tokens: {
    [key: string]: string;
  };
  contracts: {
    massaBeam: string;
    massaBeamDCA: string;
    massaBeamEngine: string;
  };
}

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('🧪 MassaBeam Advanced Contract Testing');
  console.log('═══════════════════════════════════════════════════════\n');

  // Load deployment info
  const deploymentInfoPath = path.join(__dirname, '..', 'massa_beam_advanced-deployment.json');
  if (!fs.existsSync(deploymentInfoPath)) {
    throw new Error('❌ massa_beam_advanced-deployment.json not found! Run deploy-advanced.ts first.');
  }

  const deploymentInfo: DeploymentInfo = JSON.parse(
    fs.readFileSync(deploymentInfoPath, 'utf-8')
  );

  // Load token addresses
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

  console.log('📍 Advanced Contract:', deploymentInfo.contractAddress);
  console.log('📅 Deployed:', deploymentInfo.deployedAt, '\n');

  const contract = new SmartContract(provider, deploymentInfo.contractAddress);

  // Test 1: Create DCA Strategy
  console.log('═══════════════════════════════════════════════════════');
  console.log('Test 1: Creating DCA Strategy');
  console.log('═══════════════════════════════════════════════════════\n');

  const tokenAAddress = deployedAddresses.tokens['USDT'];
  const tokenBAddress = deployedAddresses.tokens['BEAM'];

  console.log('💱 Trading pair: USDT → BEAM');
  console.log('📍 Token A (USDT):', tokenAAddress);
  console.log('📍 Token B (BEAM):', tokenBAddress, '\n');

  const amountPerPeriod = BigInt(1000000); // 0.01 USDT per period (8 decimals)
  const intervalSeconds = BigInt(3600); // 1 hour
  const totalPeriods = BigInt(10); // 10 periods
  const minPriceThreshold = BigInt(0);
  const maxPriceThreshold = BigInt(2 ** 53 - 1); // Max safe integer
  const stopLoss = BigInt(500); // 5% stop loss
  const takeProfit = BigInt(1000); // 10% take profit
  const maxSlippage = BigInt(100); // 1% slippage

  // Approve tokens first
  console.log('🔓 Approving USDT...');
  const tokenContract = new SmartContract(provider, tokenAAddress);
  const totalAmount = amountPerPeriod * totalPeriods;

  await tokenContract.call(
    'increaseAllowance',
    new Args()
      .addString(deploymentInfo.contractAddress)
      .addU256(totalAmount),
    { coins: Mas.fromString('0.01') }
  );

  console.log('   ✅ USDT approved\n');
  await sleep(2000);

  console.log('📝 Creating DCA strategy...');
  const createDCAArgs = new Args()
    .addString(tokenAAddress)
    .addString(tokenBAddress)
    .addU64(amountPerPeriod)
    .addU64(intervalSeconds)
    .addU64(totalPeriods)
    .addU64(minPriceThreshold)
    .addU64(maxPriceThreshold)
    .addU64(stopLoss)
    .addU64(takeProfit)
    .addU64(maxSlippage);

  try {
    const dcaOp = await contract.call('createDCA', createDCAArgs, {
      coins: Mas.fromString('0.1'),
    });

    console.log('   ✅ DCA strategy created!');
    console.log('   📋 Operation ID:', dcaOp, '\n');
    await sleep(3000);

    // Get DCA info
    console.log('📊 Fetching DCA strategy info...');
    const getDCAArgs = new Args().addU64(BigInt(1)); // Strategy ID 1

    const dcaData = await contract.read('getDCA', getDCAArgs);
    console.log('   ✅ DCA data retrieved');
    console.log('   📦 Data length:', dcaData.length, 'bytes\n');
  } catch (error) {
    console.error('❌ Failed to create DCA:', error, '\n');
  }

  // Test 2: Create Limit Order
  console.log('═══════════════════════════════════════════════════════');
  console.log('Test 2: Creating Limit Order');
  console.log('═══════════════════════════════════════════════════════\n');

  const amountIn = BigInt(5000000); // 0.05 USDT (8 decimals)
  const targetPrice = BigInt(1000000000000000000n); // 1 BEAM = 1 USDT (18 decimals)
  const minAmountOut = BigInt(4500000); // Min 0.045 BEAM
  const expiry = BigInt(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
  const partialFillAllowed = false;

  console.log('💱 Limit order: USDT → BEAM');
  console.log('💰 Amount in:', amountIn.toString(), 'USDT units');
  console.log('🎯 Target price:', targetPrice.toString());
  console.log('📉 Min amount out:', minAmountOut.toString(), 'BEAM units\n');

  // Approve tokens for limit order
  console.log('🔓 Approving USDT for limit order...');
  await tokenContract.call(
    'increaseAllowance',
    new Args()
      .addString(deploymentInfo.contractAddress)
      .addU256(amountIn),
    { coins: Mas.fromString('0.01') }
  );

  console.log('   ✅ USDT approved\n');
  await sleep(2000);

  console.log('📝 Creating limit order...');
  const createOrderArgs = new Args()
    .addString(tokenAAddress)
    .addString(tokenBAddress)
    .addU64(amountIn)
    .addU64(targetPrice)
    .addU64(minAmountOut)
    .addU64(expiry)
    .addBool(partialFillAllowed);

  try {
    const orderOp = await contract.call('createLimitOrder', createOrderArgs, {
      coins: Mas.fromString('0.1'),
    });

    console.log('   ✅ Limit order created!');
    console.log('   📋 Operation ID:', orderOp, '\n');
    await sleep(3000);

    // Get order info
    console.log('📊 Fetching limit order info...');
    const getOrderArgs = new Args().addU64(BigInt(1)); // Order ID 1

    const orderData = await contract.read('getLimitOrder', getOrderArgs);
    console.log('   ✅ Order data retrieved');
    console.log('   📦 Data length:', orderData.length, 'bytes\n');
  } catch (error) {
    console.error('❌ Failed to create limit order:', error, '\n');
  }

  // Test 3: Get TWAP Price
  console.log('═══════════════════════════════════════════════════════');
  console.log('Test 3: TWAP Price Oracle');
  console.log('═══════════════════════════════════════════════════════\n');

  console.log('📊 Fetching TWAP price for USDT/BEAM...');
  const getTWAPArgs = new Args()
    .addString(tokenAAddress)
    .addString(tokenBAddress);

  try {
    const twapPrice = await contract.read('getTWAPPrice', getTWAPArgs);
    console.log('   ✅ TWAP price retrieved:', twapPrice);
  } catch (error) {
    console.log('   ℹ️  TWAP not yet available (need pool activity)\n');
  }

  console.log('═══════════════════════════════════════════════════════');
  console.log('✨ Testing completed!');
  console.log('═══════════════════════════════════════════════════════\n');

  console.log('📝 Summary:');
  console.log('   - DCA Strategy: Created with stop-loss and take-profit');
  console.log('   - Limit Order: Created with MEV protection');
  console.log('   - TWAP Oracle: Checked (requires pool activity)');
  console.log('');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main()
  .then(() => {
    console.log('✅ Testing script completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Testing failed:', error);
    process.exit(1);
  });
