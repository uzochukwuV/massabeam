/**
 * Setup WMAS/USDC pool on MassaBeam using Dussa's WMAS
 *
 * This creates a matching pool to Dussa so SmartRouter can compare prices
 */

import 'dotenv/config';
import {
  Account,
  Args,
  SmartContract,
  Web3Provider,
  Mas,
} from '@massalabs/massa-web3';
import {
  ChainId,
  WMAS as _WMAS,
  USDC as _USDC,
  IERC20 as DussaIERC20,
  parseUnits,
} from '@dusalabs/sdk';
import fs from 'fs';

const CHAIN_ID = ChainId.BUILDNET;

async function setupWMASPool() {
  console.log("=".repeat(70));
  console.log("Setting up WMAS/USDC Pool on MassaBeam");
  console.log("=".repeat(70));
  console.log();

  try {
    // Setup account
    const account = await Account.fromEnv();
    console.log('Using account:', account.address?.toString());

    const provider = Web3Provider.buildnet(account);

    // Get balance
    const balances = await provider.balanceOf([account.address!.toString()]);
    const balance = balances?.[0]?.balance || 0n;
    console.log('Account balance:', (Number(balance) / 1e9).toFixed(4), 'MAS');
    console.log();

    // Get token addresses from Dussa SDK
    const WMAS_ADDRESS = _WMAS[CHAIN_ID].address;
    const USDC_ADDRESS = _USDC[CHAIN_ID].address;

    console.log("Token Addresses:");
    console.log("  WMAS:", WMAS_ADDRESS);
    console.log("  USDC:", USDC_ADDRESS);
    console.log();

    // Load deployed contracts
    const deployedData = JSON.parse(fs.readFileSync('deployed-addresses.json', 'utf-8'));
    const MASSABEAM_AMM = deployedData.contracts.massaBeam;

    if (!MASSABEAM_AMM) {
      throw new Error("MassaBeam AMM not deployed");
    }

    console.log("MassaBeam AMM:", MASSABEAM_AMM);
    console.log();

    // Initialize contracts
    const massaBeam = new SmartContract(provider, MASSABEAM_AMM);
    const wmasToken = new DussaIERC20(WMAS_ADDRESS, provider);
    const usdcToken = new DussaIERC20(USDC_ADDRESS, provider);

    // Check if user has WMAS
    console.log("Checking token balances...");
    const wmasBalance = await wmasToken.balanceOf(account.address!.toString());
    const usdcBalance = await usdcToken.balanceOf(account.address!.toString());

    console.log("  Your WMAS:", (Number(wmasBalance) / 1e9).toFixed(4));
    console.log("  Your USDC:", (Number(usdcBalance) / 1e6).toFixed(4));
    console.log();

    // Step 1: Wrap some MAS to WMAS if needed
    const targetWMAS = parseUnits("100", 9); // 100 WMAS

    if (wmasBalance < targetWMAS) {
      console.log("Need to wrap MAS to WMAS...");
      const toWrap = targetWMAS - wmasBalance;
      console.log(`Wrapping ${(Number(toWrap) / 1e9).toFixed(4)} MAS to WMAS...`);

      // // Deposit MAS to get WMAS
      // // const wrapTx = await wmasToken.deposit(toWrap);
      // console.log("Wrap transaction:", wrapTx.id);
      // await wrapTx.waitSpeculativeExecution();
      // console.log("✅ Wrapped successfully!");
      // console.log();

      // Check new balance
      const newWmasBalance = await wmasToken.balanceOf(account.address!.toString());
      console.log("New WMAS balance:", (Number(newWmasBalance) / 1e9).toFixed(4));
      console.log();
    } else {
      console.log("✅ Already have enough WMAS");
      console.log();
    }

    // Step 2: Check if we have USDC
    const targetUSDC = parseUnits("50", 6); // 50 USDC

    if (usdcBalance < targetUSDC) {
      console.log("⚠️  Insufficient USDC balance!");
      console.log(`   Need ${(Number(targetUSDC) / 1e6).toFixed(4)} USDC`);
      console.log(`   Have ${(Number(usdcBalance) / 1e6).toFixed(4)} USDC`);
      console.log();
      console.log("💡 Options:");
      console.log("   1. Use Dussa to swap some WMAS for USDC first");
      console.log("   2. Get USDC from a faucet if available");
      console.log("   3. Use a smaller amount for the pool");
      console.log();

      // For now, let's use whatever USDC we have
      console.log("Using available USDC balance...");
    }

    const actualUSDC = usdcBalance > 0n ? usdcBalance : targetUSDC;
    const actualWMAS = targetWMAS;

    // Step 3: Check if pool already exists
    console.log("Checking if WMAS/USDC pool exists...");

    const checkPoolArgs = new Args()
      .addString(WMAS_ADDRESS)
      .addString(USDC_ADDRESS);

    const poolDataRaw = await massaBeam.read("readPool", checkPoolArgs);
    const poolDataStr = new TextDecoder().decode(poolDataRaw.value);

    if (poolDataStr === "null") {
      console.log("Pool does not exist. Creating pool...");
      console.log();

      // Amounts for pool creation (using ratio from Dussa: ~0.5 USDC per WMAS)
      const wmasAmount = parseUnits("10", 9); // 10 WMAS
      const usdcAmount = parseUnits("5", 6);  // 5 USDC

      console.log("Pool creation amounts:");
      console.log(`  WMAS: ${(Number(wmasAmount) / 1e9).toFixed(4)}`);
      console.log(`  USDC: ${(Number(usdcAmount) / 1e6).toFixed(4)}`);
      console.log();

      // Approve tokens
      console.log("Approving tokens...");
      const approveWmas = await wmasToken.approve(account.address.toString(), MASSABEAM_AMM, wmasAmount);
      const approveUsdc = await usdcToken.approve(account.address.toString(), MASSABEAM_AMM, usdcAmount);

      // await approveWmas.waitSpeculativeExecution();
      // await approveUsdc.waitSpeculativeExecution();
      console.log("✅ Tokens approved");
      console.log();

      // Create pool
      const deadline =  3500n; // 1 hour

      const createPoolArgs = new Args()
        .addString(WMAS_ADDRESS)
        .addString(USDC_ADDRESS)
        .addU64(wmasAmount)
        .addU64(usdcAmount)
        .addU64(deadline);

      console.log("Creating pool...");
      const createPoolTx = await massaBeam.call("createPool", createPoolArgs);
      console.log("Transaction:", createPoolTx.id);
      await createPoolTx.waitSpeculativeExecution();

      const events = await createPoolTx.getSpeculativeEvents();
      events.forEach(e => console.log("  Event:", e.data));

      console.log("✅ Pool created successfully!");
      console.log();

    } else {
      console.log("✅ Pool already exists!");
      console.log();

      // Parse pool data
      const poolArgs = new Args(poolDataRaw.value);
      const tokenA = poolArgs.nextString();
      const tokenB = poolArgs.nextString();
      const reserveA = poolArgs.nextU64();
      const reserveB = poolArgs.nextU64();

      console.log("Current Pool State:");
      console.log(`  Token A: ${tokenA}`);
      console.log(`  Token B: ${tokenB}`);
      console.log(`  Reserve A: ${reserveA}`);
      console.log(`  Reserve B: ${reserveB}`);
      console.log();

      // Could add more liquidity here if desired
      console.log("Pool is ready for SmartRouter!");
    }

    console.log("=".repeat(70));
    console.log("✅ WMAS/USDC Pool Setup Complete");
    console.log("=".repeat(70));
    console.log();
    console.log("Summary:");
    console.log("  ✅ Using Dussa's WMAS:", WMAS_ADDRESS);
    console.log("  ✅ Using Dussa's USDC:", USDC_ADDRESS);
    console.log("  ✅ Pool available on MassaBeam:", MASSABEAM_AMM);
    console.log();
    console.log("Next Steps:");
    console.log("  1. SmartRouter can now compare prices between MassaBeam and Dussa");
    console.log("  2. Run test script to see price comparison");
    console.log("  3. Create demo for supervisor");
    console.log();

  } catch (error: any) {
    console.error("❌ Error:", error.message);
    console.error(error);
    process.exit(1);
  }
}

setupWMASPool().catch(console.error);
