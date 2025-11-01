/**
 * Verify Dussa contract addresses on Massa Buildnet
 *
 * This script tests if the Dussa Factory and Router addresses are still valid
 * and functioning on the buildnet by calling actual contract functions.
 */

import {
    Account,
    JsonRpcProvider,
    SmartContract,
    Args,
    bytesToStr
} from "@massalabs/massa-web3";
import {
  ChainId,
  IERC20,
  IRouter,
  LB_ROUTER_ADDRESS,
  LB_FACTORY_ADDRESS,
  LB_QUOTER_ADDRESS,
  LiquidityDistribution,
  PairV2,
  TokenAmount,
  WMAS as _WMAS,
  USDC as _USDC,
  parseUnits,
  Percent,
  ILBPair
} from '@dusalabs/sdk';
import dotenv from "dotenv";

dotenv.config();

// Dussa addresses to verify
const DUSSA_FACTORY = ;
const DUSSA_ROUTER = "AS1xed5qTFcsWR2Ce7VLaAEHde8bJiTrX8JHM35qkHjmnqH1GFU8";
const DUSSA_WMAS = "AS12XdqMFYx1Ghd5LRzMq9hw81hVgBAYX9zqMJVZeVyM9nRn4C2pt";

async function verifyDussaAddresses() {
    console.log("=".repeat(60));
    console.log("Verifying Dussa Contract Addresses on Massa Buildnet");
    console.log("=".repeat(60));
    console.log(LB_ROUTER_ADDRESS,
  LB_FACTORY_ADDRESS,
  LB_QUOTER_ADDRESS,)

    try {
        // Create account from env
        const account = await Account.fromEnv();
        console.log("Using account:", account.address?.toString());

        // Create provider
        const provider = JsonRpcProvider.buildnet(account);

        console.log("Connected to: Massa Buildnet");
        console.log();

        // Test 1: Call Factory contract function
        console.log("1️⃣  Testing Dussa Factory...");
        console.log("   Address:", DUSSA_FACTORY);

        const factory = new SmartContract(provider, DUSSA_FACTORY);
        const result2 = await factory.read("getAllBinSteps");
        console.log("   Raw result from getAllBinSteps:", result2);

        try {
            // Try to read a common factory function like getNumberOfLBPairs
            const result = await factory.read("getAllBinSteps");
            const args = new Args(result.value);
            const numberOfPairs = args.nextU64();

            console.log("   ✅ Factory contract is WORKING");
            console.log("   📊 Number of LB Pairs:", numberOfPairs.toString());
        } catch (error: any) {
            console.log("   ⚠️  Could not read 'getNumberOfLBPairs':", error.message);

            // Try alternative function
            try {
                await factory.read("getAllLBPairs");
                console.log("   ✅ Factory contract is WORKING (getAllLBPairs readable)");
            } catch (e2: any) {
                console.log("   ❌ Factory functions not accessible:", e2.message);
            }
        }

        console.log();

        // Test 2: Call Router contract function
        console.log("2️⃣  Testing Dussa Router...");
        console.log("   Address:", DUSSA_ROUTER);

        try {
            const router = new SmartContract(provider, DUSSA_ROUTER);

            // Try to read the factory address from router
            const result = await router.read("getFactory");
            const factoryAddr = bytesToStr(result.value);

            console.log("   ✅ Router contract is WORKING");
            console.log("   🏭 Factory Address from Router:", factoryAddr);

            // Verify it matches
            if (factoryAddr === DUSSA_FACTORY) {
                console.log("   ✅ Factory address MATCHES expected value");
            } else {
                console.log("   ⚠️  Factory address MISMATCH");
                console.log("      Expected:", DUSSA_FACTORY);
                console.log("      Got:", factoryAddr);
            }
        } catch (error: any) {
            console.log("   ⚠️  Could not read 'getFactory':", error.message);

            // Check if contract exists at all
            try {
                await provider.balanceOf([DUSSA_ROUTER]);
                console.log("   ✅ Router contract EXISTS (balance check passed)");
            } catch (e: any) {
                console.log("   ❌ Router contract verification failed:", e.message);
            }
        }

        console.log();

        // Test 3: Call WMAS token functions
        console.log("3️⃣  Testing WMAS Token...");
        console.log("   Address:", DUSSA_WMAS);

        try {
            const wmas = new SmartContract(provider, DUSSA_WMAS);

            // Read token name
            try {
                const nameResult = await wmas.read("name");
                const tokenName = bytesToStr(nameResult.value);
                console.log("   ✅ WMAS token is WORKING");
                console.log("   🏷️  Token Name:", tokenName);
            } catch (e: any) {
                console.log("   ⚠️  Could not read 'name':", e.message);
            }

            // Read token symbol
            try {
                const symbolResult = await wmas.read("symbol");
                const tokenSymbol = bytesToStr(symbolResult.value);
                console.log("   🔤 Token Symbol:", tokenSymbol);
            } catch (e: any) {
                console.log("   ⚠️  Could not read 'symbol':", e.message);
            }

            // Read total supply
            try {
                const supplyResult = await wmas.read("totalSupply");
                const args = new Args(supplyResult.value);
                const totalSupply = args.nextU256();
                console.log("   💰 Total Supply:", totalSupply.toString());
            } catch (e: any) {
                console.log("   ⚠️  Could not read 'totalSupply':", e.message);
            }

        } catch (error: any) {
            console.log("   ❌ WMAS contract error:", error.message);
        }

        console.log();
        console.log("=".repeat(60));
        console.log("Verification Complete");
        console.log("=".repeat(60));
        console.log();
        console.log("📋 Summary:");
        console.log("   • Factory: AS12EF8gYT8B6WxpWm2zWTyQmBH2T1eYakjYyfJsjyUAxWH6n6v5X");
        console.log("   • Router:  AS1ZbaNKTVMQrcV2rYC11sxm7mVYnwpnSUgr9Kb5xq2fDkZdjuXT");
        console.log("   • WMAS:    AS12XdqMFYx1Ghd5LRzMq9hw81hVgBAYX9zqMJVZeVyM9nRn4C2pt");
        console.log();
        console.log("💡 Next Steps:");
        console.log("   1. If all contracts work ✅ - Use these addresses in SmartRouter");
        console.log("   2. If any fail ❌ - Check Dussa docs for updated addresses");
        console.log("   3. Visit https://docs.dussa.finance or check their GitHub");
        console.log();

    } catch (error: any) {
        console.error("❌ Fatal error:", error.message);
        console.error(error);
    }
}

// Run verification
verifyDussaAddresses().catch(console.error);
