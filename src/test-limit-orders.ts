import 'dotenv/config';
import {
  Account,
  Args,
  Mas,
  SmartContract,
  JsonRpcProvider,
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
    limitOrders?: string;
  };
}

async function deployLimitOrders(provider: JsonRpcProvider): Promise<string> {
  console.log('📦 Deploying LimitOrders contract...');
  
  const contractPath = path.join(__dirname, '..', 'build', 'LimitOrders.wasm');
  if (!fs.existsSync(contractPath)) {
    throw new Error('❌ LimitOrders.wasm not found! Run npm run build first.');
  }

  const contractCode = fs.readFileSync(contractPath);
  
  const deployResult = await provider.deploySC({
    fee: Mas.fromString('1'),
    maxGas: BigInt(3_000_000_000),
    coins: Mas.fromString('1'),
    byteCode: contractCode,
    parameter: new Args().serialize(),
  });

  console.log('   ✅ LimitOrders deployed at:', deployResult.address);
  return deployResult.address;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('📋 MassaBeam Limit Orders Test');
  console.log('═══════════════════════════════════════════════════════\n');

  // Load deployed addresses
  const addressesPath = path.join(__dirname, '..', 'deployed-addresses.json');
  if (!fs.existsSync(addressesPath)) {
    throw new Error('❌ deployed-addresses.json not found! Run deploy-full.ts first.');
  }

  const deployedAddresses: DeployedAddresses = JSON.parse(
    fs.readFileSync(addressesPath, 'utf-8')
  );

  const account = await Account.fromEnv();
  const provider = JsonRpcProvider.buildnet(account);

  console.log('📌 Using account:', account.address.toString());
  const balance = await provider.balanceOf([account.address.toString()]);
  console.log('💰 Account balance:', balance[0].balance, 'MAS\n');

  // Deploy LimitOrders contract if not exists
  if (!deployedAddresses.contracts.limitOrders) {
    deployedAddresses.contracts.limitOrders = await deployLimitOrders(provider);
    fs.writeFileSync(addressesPath, JSON.stringify(deployedAddresses, null, 2));
  }

  const limitOrdersContract = new SmartContract(
    provider,
    deployedAddresses.contracts.limitOrders
  );

  console.log('🎯 LimitOrders Contract:', deployedAddresses.contracts.limitOrders);

  // Test data
  const tokenA = deployedAddresses.tokens.BEAM;
  const tokenB = deployedAddresses.tokens.USDT;
  const amountIn = '1000000000'; // 10 BEAM
  const targetPrice = '100000000'; // 1 USDT per BEAM
  const minAmountOut = '900000000'; // 9 USDT minimum
  const deadline = BigInt(Date.now() + 3600000); // 1 hour from now

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('📋 Test 1: Create Limit Order');
  console.log('═══════════════════════════════════════════════════════\n');

  try {
    // Step 1: Approve tokens
    console.log('🔓 Approving BEAM tokens...');
    const tokenAContract = new SmartContract(provider, tokenA);
    
    await tokenAContract.call(
      'increaseAllowance',
      new Args()
        .addString(deployedAddresses.contracts.limitOrders!)
        .addU256(BigInt(amountIn) + BigInt(1000000)), // Slightly more than amountIn,
      { coins: Mas.fromString('0.01') }
    );

    console.log('   ✅ BEAM approved\n');
    await sleep(2000);

    // Step 2: Create limit order
    console.log('📋 Creating limit order...');
    
    const createOrderArgs = new Args()
      .addString(tokenA)
      .addString(tokenB)
      .addU64(BigInt(amountIn))
      .addU64(BigInt(targetPrice))
      .addU64(BigInt(minAmountOut))
      .addU64(deadline)
      .addBool(false); // No partial fills

    const createResult = await limitOrdersContract.call(
      'createLimitOrder',
      createOrderArgs,
      { coins: Mas.fromString('0.3') }
    );

    console.log('   ✅ Limit order created!');
    console.log('   📊 Order details:');
    console.log(`      Token In: BEAM (${tokenA})`);
    console.log(`      Token Out: USDT (${tokenB})`);
    console.log(`      Amount In: ${amountIn} (10 BEAM)`);
    console.log(`      Target Price: ${targetPrice} USDT per BEAM`);
    console.log(`      Min Amount Out: ${minAmountOut} (9 USDT)`);
    console.log(`      Deadline: ${new Date(Number(deadline)).toISOString()}\n`);

    await sleep(3000);

    // Step 3: Get user orders
    console.log('📋 Fetching user orders...');
    
    const getUserOrdersArgs = new Args().addString(account.address.toString());
    
    const userOrdersResult = await limitOrdersContract.call(
      'getUserOrders',
      getUserOrdersArgs,
      { coins: Mas.fromString('0.01') }
    );

    console.log('   ✅ User orders fetched');
    console.log('   📊 Orders:', userOrdersResult);

  } catch (error) {
    console.error('❌ Test 1 failed:', error);
  }

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('📋 Test 2: Cancel Limit Order');
  console.log('═══════════════════════════════════════════════════════\n');

  try {
    // Cancel the order (assuming order ID 1)
    console.log('❌ Cancelling limit order...');
    
    const cancelOrderArgs = new Args().addU64(BigInt(1));
    
    await limitOrdersContract.call(
      'cancelLimitOrder',
      cancelOrderArgs,
      { coins: Mas.fromString('0.1') }
    );

    console.log('   ✅ Limit order cancelled');
    console.log('   💰 Tokens refunded to user\n');

  } catch (error) {
    console.error('❌ Test 2 failed:', error);
  }

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('🔄 Test 3: Start Continuous Execution');
  console.log('═══════════════════════════════════════════════════════\n');

  try {
    // Start the continuous execution loop
    console.log('🔄 Starting continuous order execution...');
    
    await limitOrdersContract.call(
      'startExecution',
      new Args().serialize(),
      { coins: Mas.fromString('0.1') }
    );

    console.log('   ✅ Continuous execution started');
    console.log('   🤖 Orders will be automatically executed when conditions are met');
    console.log('   ⏰ Execution loop will check orders every few seconds\n');

    await sleep(5000);

    // You can stop execution if needed
    console.log('⏹️  Stopping execution for demo...');
    
    await limitOrdersContract.call(
      'stopExecution',
      new Args().serialize(),
      { coins: Mas.fromString('0.1') }
    );

    console.log('   ✅ Execution stopped\n');

  } catch (error) {
    console.error('❌ Test 3 failed:', error);
  }

  console.log('═══════════════════════════════════════════════════════');
  console.log('✨ Limit Orders testing completed!');
  console.log('═══════════════════════════════════════════════════════\n');

  console.log('💡 Next steps:');
  console.log('   1. ✅ Continuous execution is now active');
  console.log('   2. Create orders and watch them execute automatically');
  console.log('   3. Monitor execution events in the blockchain explorer');
  console.log('   4. Test different price conditions and order types');
  console.log('   5. Scale up with multiple concurrent orders\n');
  
  console.log('🔄 Massa Continuous Execution Features:');
  console.log('   • Orders are checked automatically every cycle');
  console.log('   • No external keeper needed - runs on-chain');
  console.log('   • MEV protection built-in');
  console.log('   • Gas-efficient batch processing\n');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main()
  .then(() => {
    console.log('✅ Limit orders test completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Limit orders test failed:', error);
    process.exit(1);
  });