// /**
//  * Cross-DEX Arbitrage Extension
//  *
//  * Detects and executes arbitrage between MassaBeam and Dussa DEXs
//  * Integrates with SmartRouter for price comparison and execution
//  *
//  * @version 1.0.0
//  */

// import {
//     Address,
//     Context,
//     generateEvent,
//     Storage,
//     call,
// } from "@massalabs/massa-as-sdk";
// import { Args, stringToBytes } from "@massalabs/as-types";
// import { u256 } from 'as-bignum/assembly';

// // Import base types
// import {
//     ONE_UNIT,
//     Pool,
//     getPool,
//     getAmountOut,
// } from "./massa_beam";

// import {
//     ArbitrageOpportunity,
//     MIN_PROFIT_THRESHOLD,
//     ARBITRAGE_TYPE_SIMPLE,
//     getReserve,
//     calculatePrice,
//     estimateArbitrageGas,
//     getGasPrice,
//     generateOpportunityId,
//     distributeArbitrageProfits,
// } from "./massa_beam_engine";

// // Import SmartRouter quote functionality
// import { SwapQuote } from "./SmartRouter";

// // Import Dussa interfaces
// import { IQuoter } from "./interfaces/IQuoter";
// import { IERC20 } from "./interfaces/IERC20";

// // ============================================================================
// // CONSTANTS
// // ============================================================================

// export const ARBITRAGE_TYPE_CROSS_DEX: string = "CROSS_DEX_MASSABEAM_DUSSA";
// export const MIN_CROSS_DEX_PROFIT: u64 = 5000 * ONE_UNIT; // Minimum 5000 tokens profit for cross-DEX
// export const MAX_CROSS_DEX_SLIPPAGE: u64 = 300; // 3% max slippage

// // Dussa contract addresses (buildnet)
// let DUSSA_ROUTER: Address = new Address("0x0000000000000000000000000000000000000000");
// let DUSSA_QUOTER: Address = new Address("0x0000000000000000000000000000000000000000");
// let DUSSA_FACTORY: Address = new Address("0x0000000000000000000000000000000000000000");
// let SMART_ROUTER: Address = new Address("0x0000000000000000000000000000000000000000");

// // ============================================================================
// // INITIALIZATION
// // ============================================================================

// export function initializeCrossDEXArbitrage(args: StaticArray<u8>): void {
//     const argument = new Args(args);
//     DUSSA_ROUTER = new Address(argument.nextString().unwrap());
//     DUSSA_QUOTER = new Address(argument.nextString().unwrap());
//     DUSSA_FACTORY = new Address(argument.nextString().unwrap());
//     SMART_ROUTER = new Address(argument.nextString().unwrap());

//     // Store for persistence
//     Storage.set(stringToBytes("dussa_router"), stringToBytes(DUSSA_ROUTER.toString()));
//     Storage.set(stringToBytes("dussa_quoter"), stringToBytes(DUSSA_QUOTER.toString()));
//     Storage.set(stringToBytes("dussa_factory"), stringToBytes(DUSSA_FACTORY.toString()));
//     Storage.set(stringToBytes("smart_router"), stringToBytes(SMART_ROUTER.toString()));

//     generateEvent(`CrossDEXArbitrage: Initialized with Dussa Router ${DUSSA_ROUTER.toString()}`);
// }

// function loadCrossDEXAddresses(): void {
//     if (DUSSA_ROUTER.toString() == "0x0000000000000000000000000000000000000000") {
//         const routerBytes = Storage.get<StaticArray<u8>>(stringToBytes("dussa_router"));
//         const quoterBytes = Storage.get<StaticArray<u8>>(stringToBytes("dussa_quoter"));
//         const factoryBytes = Storage.get<StaticArray<u8>>(stringToBytes("dussa_factory"));
//         const smartRouterBytes = Storage.get<StaticArray<u8>>(stringToBytes("smart_router"));

//         if (routerBytes.length > 0) {
//             const args1 = new Args(routerBytes);
//             const args2 = new Args(quoterBytes);
//             const args3 = new Args(factoryBytes);
//             const args4 = new Args(smartRouterBytes);

//             DUSSA_ROUTER = new Address(args1.nextString().unwrap());
//             DUSSA_QUOTER = new Address(args2.nextString().unwrap());
//             DUSSA_FACTORY = new Address(args3.nextString().unwrap());
//             SMART_ROUTER = new Address(args4.nextString().unwrap());
//         }
//     }
// }

// // ============================================================================
// // CROSS-DEX ARBITRAGE DETECTION
// // ============================================================================

// /**
//  * Main function to detect arbitrage opportunities between MassaBeam and Dussa
//  */
// export function detectCrossDEXArbitrage(): ArbitrageOpportunity[] {
//     loadCrossDEXAddresses();

//     const opportunities: ArbitrageOpportunity[] = [];

//     // Get all MassaBeam pools
//     const poolKeys = getAllPoolKeys();

//     generateEvent(`CrossDEX: Scanning ${poolKeys.length} MassaBeam pools for Dussa arbitrage`);

//     for (let i = 0; i < poolKeys.length; i++) {
//         const pool = getPoolFromKey(poolKeys[i]);
//         if (pool == null) continue;

//         // Check if this token pair exists on Dussa
//         const opportunity = findCrossDEXOpportunity(pool);
//         if (opportunity != null && opportunity.estimatedProfit > MIN_CROSS_DEX_PROFIT) {
//             opportunities.push(opportunity);
//         }
//     }

//     generateEvent(`CrossDEX: Found ${opportunities.length} cross-DEX arbitrage opportunities`);
//     return opportunities;
// }

// /**
//  * Find arbitrage opportunity for a specific pool between MassaBeam and Dussa
//  */
// function findCrossDEXOpportunity(massaBeamPool: Pool): ArbitrageOpportunity | null {
//     const tokenA = massaBeamPool.tokenA;
//     const tokenB = massaBeamPool.tokenB;

//     // Get quotes from both DEXs
//     const massaBeamQuote = getMassaBeamQuote(tokenA, tokenB, ONE_UNIT);
//     const dussaQuote = getDussaQuote(tokenA, tokenB, ONE_UNIT);

//     if (massaBeamQuote == 0 || dussaQuote == 0) {
//         return null; // One DEX doesn't have this pair
//     }

//     // Calculate price difference
//     const massaBeamPrice = massaBeamQuote;
//     const dussaPrice = dussaQuote;

//     generateEvent(`CrossDEX: ${tokenA.toString().slice(0, 10)}/${tokenB.toString().slice(0, 10)} - MassaBeam: ${massaBeamPrice}, Dussa: ${dussaPrice}`);

//     // Check if there's a profitable arbitrage
//     const priceDifference = massaBeamPrice > dussaPrice ?
//         massaBeamPrice - dussaPrice : dussaPrice - massaBeamPrice;

//     const priceImpactPercent = u64(f64(priceDifference) * 10000.0 / f64(massaBeamPrice));

//     // Require at least 1% price difference (100 basis points)
//     if (priceImpactPercent < 100) {
//         return null; // Not profitable enough
//     }

//     // Determine arbitrage direction
//     const buyFromMassaBeam = massaBeamPrice < dussaPrice;
//     const buyDEX = buyFromMassaBeam ? "MassaBeam" : "Dussa";
//     const sellDEX = buyFromMassaBeam ? "Dussa" : "MassaBeam";

//     // Calculate optimal trade size (conservative: 5% of MassaBeam reserve)
//     const optimalAmount = massaBeamPool.reserveA / 20;

//     // Calculate expected profit
//     let amountOut1: u64;
//     let amountOut2: u64;

//     if (buyFromMassaBeam) {
//         // Buy from MassaBeam, sell on Dussa
//         amountOut1 = getMassaBeamQuote(tokenA, tokenB, optimalAmount);
//         amountOut2 = getDussaQuote(tokenB, tokenA, amountOut1);
//     } else {
//         // Buy from Dussa, sell on MassaBeam
//         amountOut1 = getDussaQuote(tokenA, tokenB, optimalAmount);
//         amountOut2 = getMassaBeamQuote(tokenB, tokenA, amountOut1);
//     }

//     const netProfit = amountOut2 > optimalAmount ? amountOut2 - optimalAmount : 0;

//     if (netProfit < MIN_CROSS_DEX_PROFIT) {
//         return null;
//     }

//     // Create arbitrage opportunity
//     const opportunityId = generateOpportunityId();
//     const opportunity = new ArbitrageOpportunity(
//         opportunityId,
//         ARBITRAGE_TYPE_CROSS_DEX,
//         [massaBeamPool], // Only MassaBeam pool (Dussa accessed via router)
//         [tokenA, tokenB, tokenA],
//         [optimalAmount, amountOut1, amountOut2],
//         netProfit
//     );

//     // Store additional metadata
//     Storage.set(
//         stringToBytes(`cross_dex_${opportunityId}_buy_from`),
//         stringToBytes(buyDEX)
//     );
//     Storage.set(
//         stringToBytes(`cross_dex_${opportunityId}_sell_to`),
//         stringToBytes(sellDEX)
//     );

//     // Estimate gas (cross-DEX is more expensive)
//     opportunity.gasEstimate = estimateArbitrageGas(opportunity) + 200000; // Extra gas for cross-DEX
//     opportunity.profitAfterGas = netProfit - (opportunity.gasEstimate * getGasPrice());

//     // Higher confidence if price difference is larger
//     opportunity.confidence = priceImpactPercent > 500 ? 95 : 80;

//     generateEvent(`CrossDEX: Found opportunity - Buy from ${buyDEX}, sell on ${sellDEX}, profit: ${netProfit}`);

//     return opportunity;
// }

// // ============================================================================
// // PRICE QUOTES
// // ============================================================================

// /**
//  * Get quote from MassaBeam
//  */
// function getMassaBeamQuote(tokenIn: Address, tokenOut: Address, amountIn: u64): u64 {
//     const pool = getPool(tokenIn, tokenOut);
//     if (pool == null) return 0;

//     const tokenInIsA = pool.tokenA.toString() == tokenIn.toString();
//     const reserveIn = tokenInIsA ? pool.reserveA : pool.reserveB;
//     const reserveOut = tokenInIsA ? pool.reserveB : pool.reserveA;

//     return getAmountOut(amountIn, reserveIn, reserveOut, pool.fee);
// }

// /**
//  * Get quote from Dussa using their Quoter contract
//  */
// function getDussaQuote(tokenIn: Address, tokenOut: Address, amountIn: u64): u64 {
//     loadCrossDEXAddresses();

//     if (DUSSA_QUOTER.toString() == "0x0000000000000000000000000000000000000000") {
//         return 0;
//     }

//     const quoter = new IQuoter(DUSSA_QUOTER);
//     const route: Address[] = [tokenIn, tokenOut];
//     const amount256 = u256.fromU64(amountIn);

//     const quote = quoter.findBestPathFromAmountIn(route, amount256);


//     // Parse result
//     const args = new Args()
//     const route_result = args.nextStringArray().unwrap();
//     const amounts = quote.amounts
//     const fees = quote.fees
//     const virtualAmountsWithoutSlippage = quote.virtualAmountsWithoutSlippage;


//     if (amounts.length < 2) return 0;

//     // Return the final output amount
//     return amounts[amounts.length - 1].toU64();
// }

// // ============================================================================
// // CROSS-DEX EXECUTION
// // ============================================================================

// /**
//  * Execute cross-DEX arbitrage opportunity
//  */
// export function executeCrossDEXArbitrage(opportunityId: u64): void {
//     loadCrossDEXAddresses();

//     // Load opportunity metadata
//     const buyFromKey = stringToBytes(`cross_dex_${opportunityId}_buy_from`);
//     const sellToKey = stringToBytes(`cross_dex_${opportunityId}_sell_to`);

//     const buyFromBytes = Storage.get<StaticArray<u8>>(buyFromKey);
//     const sellToBytes = Storage.get<StaticArray<u8>>(sellToKey);

//     if (buyFromBytes.length == 0 || sellToBytes.length == 0) {
//         generateEvent(`CrossDEX: Opportunity ${opportunityId} metadata not found`);
//         return;
//     }

//     const buyFromArgs = new Args(buyFromBytes);
//     const sellToArgs = new Args(sellToBytes);
//     const buyFrom = buyFromArgs.nextString().unwrap();
//     const sellTo = sellToArgs.nextString().unwrap();

//     generateEvent(`CrossDEX: Executing arbitrage - Buy from ${buyFrom}, sell on ${sellTo}`);

//     // Load opportunity details
//     const opportunityKey = stringToBytes(`arbitrage_opportunity:${opportunityId}`);
//     const opportunityData = Storage.get<StaticArray<u8>>(opportunityKey);

//     if (opportunityData.length == 0) {
//         generateEvent(`CrossDEX: Opportunity ${opportunityId} not found`);
//         return;
//     }

//     const opportunity = ArbitrageOpportunity.deserialize(opportunityData);

//     // Execute based on direction
//     if (buyFrom == "MassaBeam") {
//         executeMassaBeamToDussa(opportunity);
//     } else {
//         executeDussaToMassaBeam(opportunity);
//     }

//     // Clean up
//     Storage.del(opportunityKey);
//     Storage.del(buyFromKey);
//     Storage.del(sellToKey);
// }

// /**
//  * Execute: Buy from MassaBeam → Sell on Dussa
//  */
// function executeMassaBeamToDussa(opportunity: ArbitrageOpportunity): void {
//     const tokenIn = opportunity.path[0];
//     const tokenOut = opportunity.path[1];
//     const amountIn = opportunity.amounts[0];

//     generateEvent(`CrossDEX: Step 1 - Buying ${amountIn} ${tokenIn.toString().slice(0, 10)} on MassaBeam`);

//     // Step 1: Swap on MassaBeam
//     const swapArgs = new Args()
//         .add(tokenIn.toString())
//         .add(tokenOut.toString())
//         .add(amountIn)
//         .add(u64(0)) // Min amount (we'll handle slippage)
//         .add(Context.timestamp() + 300); // 5 min deadline

//     const result = call(
//         Context.callee(), // Call our own contract (assumes this is deployed on massa_beam)
//         "swap",
//         swapArgs,
//         0
//     );

//     const resultArgs = new Args(result);
//     const amountReceived = resultArgs.nextU64().unwrap();

//     if (amountReceived == 0) {
//         generateEvent("CrossDEX: MassaBeam swap failed");
//         return;
//     }

//     generateEvent(`CrossDEX: Received ${amountReceived} ${tokenOut.toString().slice(0, 10)}`);

//     // Step 2: Approve Dussa Router
//     const tokenOutContract = new IERC20(tokenOut);
//     tokenOutContract.increaseAllowance(DUSSA_ROUTER, u256.fromU64(amountReceived));

//     // Step 3: Swap on Dussa via Router
//     generateEvent(`CrossDEX: Step 2 - Selling ${amountReceived} ${tokenOut.toString().slice(0, 10)} on Dussa`);

//     const dussaSwapArgs = new Args()
//         .add([tokenOut, tokenIn]) // path
//         .add(u256.fromU64(amountReceived)) // amountIn
//         .add(u256.fromU64(0)) // minAmountOut
//         .add(Context.timestamp() + 300) // deadline
//         .add(Context.callee().toString()); // recipient

//     const dussaResult = call(
//         DUSSA_ROUTER,
//         "swapExactTokensForTokens",
//         dussaSwapArgs,
//         0
//     );

    

//     const actualProfit = 0  //finalAmount > amountIn ? finalAmount - amountIn : 0;

//     generateEvent(`CrossDEX: Arbitrage complete - Initial: ${amountIn}, Final: 0, Profit: ${actualProfit}`);

//     // Distribute profits
//     if (actualProfit > 0) {
//         distributeArbitrageProfits(actualProfit);
//     }
// }

// /**
//  * Execute: Buy from Dussa → Sell on MassaBeam
//  */
// function executeDussaToMassaBeam(opportunity: ArbitrageOpportunity): void {
//     const tokenIn = opportunity.path[0];
//     const tokenOut = opportunity.path[1];
//     const amountIn = opportunity.amounts[0];

//     generateEvent(`CrossDEX: Step 1 - Buying ${amountIn} ${tokenIn.toString().slice(0, 10)} on Dussa`);

//     // Step 1: Approve Dussa Router
//     const tokenInContract = new IERC20(tokenIn);
//     tokenInContract.increaseAllowance(DUSSA_ROUTER, u256.fromU64(amountIn));

//     // Step 2: Swap on Dussa
//     const dussaSwapArgs = new Args()
//         .add([tokenIn, tokenOut]) // path
//         .add(u256.fromU64(amountIn)) // amountIn
//         .add(u256.fromU64(0)) // minAmountOut
//         .add(Context.timestamp() + 300) // deadline
//         .add(Context.callee().toString()); // recipient

//     const dussaResult = call(
//         DUSSA_ROUTER,
//         "swapExactTokensForTokens",
//         dussaSwapArgs,
//         0
//     );

   
//     const amountReceived = dussaResult ? 5 : 0;

//     if (amountReceived == 0) {
//         generateEvent("CrossDEX: Dussa swap failed");
//         return;
//     }

//     generateEvent(`CrossDEX: Received ${amountReceived} ${tokenOut.toString().slice(0, 10)}`);

//     // Step 3: Swap on MassaBeam
//     generateEvent(`CrossDEX: Step 2 - Selling ${amountReceived} ${tokenOut.toString().slice(0, 10)} on MassaBeam`);

//     const swapArgs = new Args()
//         .add(tokenOut.toString())
//         .add(tokenIn.toString())
//         .add(amountReceived)
//         .add(u64(0)) // Min amount
//         .add(Context.timestamp() + 300); // 5 min deadline

//     const result = call(
//         Context.callee(),
//         "swap",
//         swapArgs,
//         0
//     );

//     const resultArgs = new Args(result);
//     const finalAmount = resultArgs.nextU64().unwrap();

//     const actualProfit = finalAmount > amountIn ? finalAmount - amountIn : 0;

//     generateEvent(`CrossDEX: Arbitrage complete - Initial: ${amountIn}, Final: ${finalAmount}, Profit: ${actualProfit}`);

//     // Distribute profits
//     if (actualProfit > 0) {
//         distributeArbitrageProfits(actualProfit);
//     }
// }

// // ============================================================================
// // UTILITY FUNCTIONS
// // ============================================================================

// function getAllPoolKeys(): string[] {
//     const keys: string[] = [];
//     const poolCount = u64(parseInt(Storage.has("pool_count") ? Storage.get("pool_count") : "0"));

//     for (let i: u64 = 0; i < poolCount; i++) {
//         const keyStorageKey = "pool_index:" + i.toString();
//         if (Storage.has(keyStorageKey)) {
//             keys.push(Storage.get(keyStorageKey));
//         }
//     }

//     return keys;
// }

// function getPoolFromKey(poolKey: string): Pool | null {
//     const storageKey = "pool:" + poolKey;
//     if (!Storage.has(storageKey)) return null;

//     return Pool.deserialize(stringToBytes(Storage.get(storageKey)));
// }

// // ============================================================================
// // AUTONOMOUS CROSS-DEX ARBITRAGE
// // ============================================================================

// /**
//  * Autonomous loop that continuously scans for cross-DEX arbitrage
//  */
// export function startCrossDEXArbitrageLoop(_: StaticArray<u8>): void {
//     Storage.set(stringToBytes("cross_dex_arbitrage_active"), stringToBytes("true"));
//     generateEvent("CrossDEX: Autonomous arbitrage loop started");

//     // Schedule first scan
//     scheduleNextCrossDEXScan();
// }

// export function stopCrossDEXArbitrageLoop(_: StaticArray<u8>): void {
//     Storage.set(stringToBytes("cross_dex_arbitrage_active"), stringToBytes("false"));
//     generateEvent("CrossDEX: Autonomous arbitrage loop stopped");
// }

// function scheduleNextCrossDEXScan(): void {
//     // TODO: Implement callNextSlot for autonomous scanning
//     // For now, this can be called manually or via external keeper
// }

// /**
//  * Main autonomous loop function
//  */
// export function crossDEXArbitrageLoop(_: StaticArray<u8>): void {
//     const activeBytes = Storage.get<StaticArray<u8>>(stringToBytes("cross_dex_arbitrage_active"));
//     if (activeBytes.length == 0) return;

//     const args = new Args(activeBytes);
//     const isActive = args.nextString().unwrap() == "true";

//     if (!isActive) return;

//     // Detect opportunities
//     const opportunities = detectCrossDEXArbitrage();

//     // Execute profitable opportunities
//     let executedCount = 0;
//     for (let i = 0; i < opportunities.length && executedCount < 2; i++) {
//         const opportunity = opportunities[i];

//         if (opportunity.profitAfterGas > MIN_CROSS_DEX_PROFIT) {
//             executeCrossDEXArbitrage(opportunity.id);
//             executedCount++;
//         }
//     }

//     // Schedule next scan
//     scheduleNextCrossDEXScan();
// }

// // ============================================================================
// // EXPORTS
// // ============================================================================

// export { ArbitrageOpportunity } from "./massa_beam_engine";
