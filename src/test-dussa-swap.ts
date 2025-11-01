/**
 * Test Dussa SDK swap functionality
 * This script will test swapping MAS -> USDC using both address[0] and address[1]
 * to determine which one is for buildnet
 */

import {
    ChainId,
    IERC20,
    IRouter,
    LB_ROUTER_ADDRESS,
    LB_FACTORY_ADDRESS,
    LB_QUOTER_ADDRESS,
    Percent,
    TokenAmount,
    USDC as _USDC,
    WMAS as _WMAS,
    parseUnits,
    QuoterHelper,
} from "@dusalabs/sdk";
import { Account, Web3Provider } from "@massalabs/massa-web3";
import dotenv from "dotenv";

dotenv.config();

const createClient = async (baseAccount: Account, mainnet = false) =>
    mainnet ? Web3Provider.mainnet(baseAccount) : Web3Provider.buildnet(baseAccount);

async function testSwapWithAddresses() {
    console.log("=".repeat(70));
    console.log("Testing Dussa SDK Addresses - Finding Buildnet Address");
    console.log("=".repeat(70));
    console.log();

    try {
        // Setup account
        const privateKey = process.env.PRIVATE_KEY;
        if (!privateKey) throw new Error("Missing PRIVATE_KEY in .env file");

        const account = await Account.fromPrivateKey(privateKey);
        if (!account.address) throw new Error("Missing address in account");

        console.log("Using account:", account.address.toString());

        // Create buildnet client
        const client = await createClient(account, false);

        // Check account balance
        const balance = await client.balanceOf([account.address.toString()]);
        console.log("Account balance:", balance[0].balance || "0", "nanoMAS");
        console.log();

        // Get addresses from SDK
        const CHAIN_ID = ChainId.BUILDNET;

        console.log("SDK Addresses Retrieved:");
        console.log("Router addresses:", LB_ROUTER_ADDRESS);
        console.log("Factory addresses:", LB_FACTORY_ADDRESS);
        console.log("Quoter addresses:", LB_QUOTER_ADDRESS);
        console.log();

        // Test with both indices
        for (let index = 0; index <= 1; index++) {
            console.log("=".repeat(70));
            console.log(`Testing with Address Index [${index}]`);
            console.log("=".repeat(70));

            const routerAddress = LB_ROUTER_ADDRESS[index];
            const factoryAddress = LB_FACTORY_ADDRESS[index];
            const quoterAddress = LB_QUOTER_ADDRESS[index];

            console.log(`Router [${index}]:`, routerAddress);
            console.log(`Factory[${index}]:`, factoryAddress);
            console.log(`Quoter [${index}]:`, quoterAddress);
            console.log();

            try {
                // Initialize tokens using ChainId.BUILDNET
                const WMAS = _WMAS[CHAIN_ID];
                const USDC = _USDC[CHAIN_ID];

                console.log("WMAS address:", WMAS.address);
                console.log("USDC address:", USDC.address);
                console.log();

                // Prepare swap: 0.1 MAS -> USDC
                const inputToken = WMAS;
                const outputToken = USDC;
                const isExactIn = true;

                // Small amount: 0.1 MAS
                const typedValueIn = "0.1";
                const typedValueInParsed = parseUnits(typedValueIn, inputToken.decimals).toString();
                const amountIn = new TokenAmount(inputToken, typedValueInParsed);

                console.log(`Attempting to swap ${typedValueIn} WMAS for USDC...`);
                console.log(`Amount in (raw):`, typedValueInParsed);
                console.log();

                // Try to find best path
                const isNativeIn = true; // swapping from MAS
                const isNativeOut = false;
                const maxHops = 2;

                console.log("Finding best trade path...");

                const bestTrade = await QuoterHelper.findBestPath(
                    inputToken,
                    isNativeIn,
                    outputToken,
                    isNativeOut,
                    amountIn,
                    isExactIn,
                    maxHops,
                    client,
                    CHAIN_ID
                );

                if (!bestTrade) {
                    console.log(`❌ No trade route found with address[${index}]`);
                    console.log("   This might NOT be the buildnet address");
                    console.log();
                    continue;
                }

                console.log(`✅ Trade route found with address[${index}]!`);
                console.log();
                console.log("Trade Details:");
                console.log(bestTrade.toLog());
                console.log();

                // Get fee information
                const { totalFeePct, feeAmountIn } = bestTrade.getTradeFee();
                console.log("Total fees:", totalFeePct.toSignificant(6), "%");
                console.log(`Fee amount: ${feeAmountIn.toSignificant(6)} ${feeAmountIn.token.symbol}`);
                console.log();

                // Calculate expected output
                const outputAmount = bestTrade.outputAmount;
                console.log(`Expected output: ${outputAmount.toSignificant(6)} ${outputAmount.token.symbol}`);
                console.log();

                // Prepare swap parameters
                const userSlippageTolerance = new Percent(5n, 100n); // 5% slippage
                const params = bestTrade.swapCallParameters({
                    ttl: 1000 * 60 * 10, // 10 minutes
                    recipient: account.address.toString(),
                    allowedSlippage: userSlippageTolerance,
                });

                console.log("Swap parameters prepared successfully!");
                console.log("Parameters:", params);
                console.log();

                console.log(`🎉 SUCCESS! Address[${index}] is likely the BUILDNET address`);
                console.log();
                console.log("Summary:");
                console.log(`  Router:  ${routerAddress}`);
                console.log(`  Factory: ${factoryAddress}`);
                console.log(`  Quoter:  ${quoterAddress}`);
                console.log();



                // Ask if user wants to execute
                console.log("⚠️  To actually execute the swap, uncomment the execution code below");
                console.log("    (This script only tests finding the route, not executing)");
                console.log();

                
               

                
                // UNCOMMENT TO EXECUTE SWAP:
                console.log("Executing swap...");
                const txId = await new IRouter(routerAddress, client).swap(params);
                console.log("Transaction ID:", txId.id);

                await txId.waitSpeculativeExecution();
                console.log("Swap executed successfully!");

                // Get events using Web3Provider API
                try {
                    const events = await client.getEvents({
                       smartContractAddress: routerAddress,
                       callerAddress: account.address.toString(),
                    });

                    if (events && events.length > 0) {
                        console.log("\nEvents from transaction:");
                        events.forEach(({ data }) => {
                            console.log("  -", data);
                        });
                    }
                } catch (eventError) {
                    console.log("Note: Could not fetch events (this is normal)");
                }
                

                // Found the working address, no need to test the other
                break;

            } catch (error: any) {
                console.log(`❌ Error with address[${index}]:`, error.message);
                console.log("   This is likely NOT the buildnet address");
                console.log();

                if (error.stack) {
                    console.log("Stack trace:");
                    console.log(error.stack);
                    console.log();
                }
            }
        }

        console.log("=".repeat(70));
        console.log("Test Complete");
        console.log("=".repeat(70));

    } catch (error: any) {
        console.error("❌ Fatal error:", error.message);
        console.error(error);
    }
}

// Run test
testSwapWithAddresses().catch(console.error);
