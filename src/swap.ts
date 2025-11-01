import 'dotenv/config';
import {
  Account,
  Args,
  Mas,
  SmartContract,
  JsonRpcProvider,
  parseCallArgs,
  bytesToArray,
  ArrayTypes,
  bytesToF64,
  bytesToStr,
  bytesToF32,
  bytesToSerializableObjectArray,
  bytes,
} from '@massalabs/massa-web3';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Get __dirname equivalent in ES modules
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
}

// Swap configuration
const SWAP_CONFIG = {
  tokenIn: 'USDC',
  tokenOut: 'USDT',
  amountIn: '9000000', // 1 BEAM
  minamountOut: "5000000",
  decimalsIn: 8,
  decimalsOut: 8, // Assuming USDT also has 8 decimals
};

function toU256(amount: string, decimals: number): bigint {
  const multiplier = BigInt(10 ** decimals);
  const [whole, decimal = '0'] = amount.split('.');
  const decimalPart = decimal.padEnd(decimals, '0').slice(0, decimals);
  return BigInt(whole) * multiplier + BigInt(decimalPart);
}

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('🔄 MassaBeam Swap Script');
  console.log('═══════════════════════════════════════════════════════\n');

  // Load deployed addresses
  const addressesPath = path.join(__dirname, '..', 'deployed-addresses.json');
  if (!fs.existsSync(addressesPath)) {
    throw new Error('❌ deployed-addresses.json not found! Run deploy-full.ts first.');
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

  const ammContract = new SmartContract(
    provider,
    deployedAddresses.contracts.massaBeam
  );

  console.log('🎯 AMM Contract:', deployedAddresses.contracts.massaBeam);
  console.log(`🔄 Performing swap...\n`);

  const tokenInAddress = deployedAddresses.tokens[SWAP_CONFIG.tokenIn];
  const tokenOutAddress = deployedAddresses.tokens[SWAP_CONFIG.tokenOut];

  if (!tokenInAddress || !tokenOutAddress) {
    console.error(`❌ Token not found: ${SWAP_CONFIG.tokenIn} or ${SWAP_CONFIG.tokenOut}\n`);
    return;
  }

  try {
    // Convert amount to u256
    const amountIn256 = toU256(SWAP_CONFIG.amountIn, SWAP_CONFIG.decimalsIn);

    console.log(`📍 Token In (${SWAP_CONFIG.tokenIn}): ${tokenInAddress}`);
    console.log(`📍 Token Out (${SWAP_CONFIG.tokenOut}): ${tokenOutAddress}`);
    console.log(`Amount In: ${SWAP_CONFIG.amountIn} ${SWAP_CONFIG.tokenIn}\n`);

    // Step 1: Approve Token In
    console.log(`🔓 Approving ${SWAP_CONFIG.tokenIn}...`);
    const tokenInContract = new SmartContract(provider, tokenInAddress);

    await tokenInContract.call(
      'increaseAllowance',
      new Args().addString(deployedAddresses.contracts.massaBeam).addU256(amountIn256),
      { coins: Mas.fromString('0.01') }
    );

    console.log(`   ✅ ${SWAP_CONFIG.tokenIn} approved\n`);
    await sleep(2000);

    // Step 2: Read pool data to calculate expected output
    console.log(`🔄 Reading pool data...`);

    const readPoolArgs = new Args()
      .addString(tokenInAddress)
      .addString(tokenOutAddress);

    const readPoolResult = await ammContract.read("readPool", readPoolArgs);
    const poolData = new Args(readPoolResult.value);

    const tokenAAddr = poolData.nextString() as string;
    const tokenBAddr = poolData.nextString() as string;
    const reserveA = poolData.nextU64() as bigint;
    const reserveB = poolData.nextU64() as bigint;
    const totalSupply = poolData.nextU64() as bigint;
    const fee = poolData.nextU64() as bigint;

    console.log(`📊 Pool Data:`);
    console.log(`   Token A: ${tokenAAddr}`);
    console.log(`   Token B: ${tokenBAddr}`);
    console.log(`   Reserve A: ${reserveA}`);
    console.log(`   Reserve B: ${reserveB}`);
    console.log(`   Fee: ${fee} (${Number(fee) / 100}%)\n`);

    // Determine which reserve is in/out based on token order
    const tokenInIsA = tokenAAddr === tokenInAddress;
    const reserveIn = tokenInIsA ? reserveA : reserveB;
    const reserveOut = tokenInIsA ? reserveB : reserveA;

    // Calculate expected output using the AMM formula
    // Need to swap a significant amount relative to pool size
    const amountIn = BigInt(100000000); // 100M units (larger to get meaningful output)

    // Manual calculation using the AMM formula for comparison
    // Formula: (amountIn * (10000 - fee) * reserveOut) / (reserveIn * 10000 + amountIn * (10000 - fee))
    const feeMultiplier = 10000n - fee;
    const amountInWithFee = amountIn * feeMultiplier;
    const numerator = amountInWithFee * reserveOut;
    const denominator = reserveIn * 10000n + amountInWithFee;
    const expectedAmountOutManual = numerator / denominator;

    console.log(`🔢 Manual Calculation Debug:`);
    console.log(`   amountInWithFee: ${amountInWithFee}`);
    console.log(`   numerator: ${numerator}`);
    console.log(`   denominator: ${denominator}`);
    console.log(`   expectedAmountOut (manual): ${expectedAmountOutManual}\n`);

    // Step 3: Call contract's readGetAmountOut function for verification
    console.log(`🔍 Calling contract's readGetAmountOut for verification...`);

    const getAmountOutArgs = new Args()
      .addU64(amountIn)
      .addU64(reserveIn)
      .addU64(reserveOut)
      .addU64(fee);

    const getAmountOutResult = await ammContract.read("readGetAmountOut", getAmountOutArgs);
    const contractAmountOut = BigInt(bytesToStr(getAmountOutResult.value));
    console.log(`   ✅ readGetAmountOut result: ${contractAmountOut}\n`);

    console.log(`📊 Contract vs Manual Calculation:`);
    console.log(`   Contract getAmountOut: ${contractAmountOut}`);
    console.log(`   Manual calculation:    ${expectedAmountOutManual}`);
    console.log(`   Difference:            ${contractAmountOut - expectedAmountOutManual}`);
    console.log(`   Match: ${contractAmountOut === expectedAmountOutManual ? '✅ YES' : '❌ NO'}\n`);

    // Use the contract's result as the expected output
    const expectedAmountOut = contractAmountOut;

    // Apply 1% slippage tolerance, but ensure amountOutMin is at least 1
    const slippage = 100n; // 1% = 100 basis points
    let amountOutMin = expectedAmountOut * (10000n - slippage) / 10000n;

    // Ensure minimum is at least 1 to pass contract validation
    if (amountOutMin === 0n && expectedAmountOut > 0n) {
      amountOutMin = 1n;
    }

    console.log(`💱 Swap Calculation:`);
    console.log(`   Amount In: ${amountIn}`);
    console.log(`   Expected Amount Out: ${expectedAmountOut}`);
    console.log(`   Min Amount Out (1% slippage): ${amountOutMin}\n`);

    const deadline = BigInt( 60 * 60 * 1000); // 1 hour from now

    const swapArgs = new Args()
      .addString(tokenInAddress)
      .addString(tokenOutAddress)
      .addU64(amountIn)
      .addU64(amountOutMin)
      .addU64(deadline);

    // Get token balances before swap
    console.log(`📊 Balances Before Swap:`);
    const tokenInContractBefore = new SmartContract(provider, tokenInAddress);
    const tokenOutContractBefore = new SmartContract(provider, tokenOutAddress);

    const balanceInBeforeResult = await tokenInContractBefore.read(
      'balanceOf',
      new Args().addString(account.address.toString())
    );
    const balanceOutBeforeResult = await tokenOutContractBefore.read(
      'balanceOf',
      new Args().addString(account.address.toString())
    );
    
    
    console.log(`🔄 Executing swap...`);

    await ammContract.call('swap', swapArgs, {
      coins: Mas.fromString('0.1'),
    });

    console.log(bytesToStr(balanceInBeforeResult.value), bytesToStr(balanceOutBeforeResult.value), balanceInBeforeResult);
    const balanceInBefore = BigInt(bytesToStr(balanceInBeforeResult.value));
    const balanceOutBefore =BigInt(bytesToStr(balanceOutBeforeResult.value)) ;
    console.log(`   ${SWAP_CONFIG.tokenIn}: ${balanceInBefore}`);
    console.log(`   ${SWAP_CONFIG.tokenOut}: ${balanceOutBefore}\n`);

    console.log(`   ✅ Swap successful!\n`);

    // Wait for balance update
    await sleep(3000);

    // Get token balances after swap
    console.log(`📊 Balances After Swap:`);
    const tokenInContractAfter = new SmartContract(provider, tokenInAddress);
    const tokenOutContractAfter = new SmartContract(provider, tokenOutAddress);

    const balanceInAfterResult = await tokenInContractAfter.read(
      'balanceOf',
      new Args().addString(account.address.toString())
    );
    const balanceOutAfterResult = await tokenOutContractAfter.read(
      'balanceOf',
      new Args().addString(account.address.toString())
    );

    const balanceInAfter = BigInt(bytesToStr(balanceInAfterResult.value)) ;
    const balanceOutAfter = BigInt(bytesToStr(balanceOutAfterResult.value));

    console.log(`   ${SWAP_CONFIG.tokenIn}: ${balanceInAfter}`);
    console.log(`   ${SWAP_CONFIG.tokenOut}: ${balanceOutAfter}\n`);

    // Calculate actual amounts
    const actualAmountIn = balanceInBefore - balanceInAfter;
    const actualAmountOut = balanceOutAfter - balanceOutBefore;

    console.log(`📈 Swap Results:`);
    console.log(`   📤 Sent: ${actualAmountIn} ${SWAP_CONFIG.tokenIn}`);
    console.log(`   📥 Received: ${actualAmountOut} ${SWAP_CONFIG.tokenOut}`);
    console.log(`   💡 Expected: ${expectedAmountOut} ${SWAP_CONFIG.tokenOut}`);
    console.log(`   📊 Difference: ${actualAmountOut - expectedAmountOut}`);
    console.log(`   ✅ Match: ${actualAmountOut >= amountOutMin ? 'YES (>= minOut)' : 'NO'}\n`);

    // Calculate effective rate
    if (actualAmountIn > 0n) {
      const rate = (Number(actualAmountOut) / Number(actualAmountIn)).toFixed(6);
      console.log(`   📊 Effective Rate: 1 ${SWAP_CONFIG.tokenIn} = ${rate} ${SWAP_CONFIG.tokenOut}\n`);
    }

  } catch (error) {
    console.error(`❌ Failed to swap:`, error);
    console.log('');
  }

  console.log('═══════════════════════════════════════════════════════');
  console.log('✨ Swap completed!');
  console.log('═══════════════════════════════════════════════════════\n');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main()
  .then(() => {
    console.log('✅ Swap script completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Swap failed:', error);
    process.exit(1);
  });
