// import { getWallets, WalletName  } from "@massalabs/wallet-provider";
// import { bytesToStr, JsonRPCClient } from "@massalabs/massa-web3";

// import { SmartContract } from '@massalabs/massa-web3'



// import * as massa from "@massalabs/massa-web3";




// // setMrc20(new MRC20(provider, CONTRACT_ADDRESS));
// // uni_mass= AS12V5z8s2V6QDjrspP7CuCb67PaXmyViXX5p5CSMchwCFiYE1nZJ
// // uni_mass_dca=AS1xUUr7bPTA6HGsZL3BBjyTdmmkb8Crjt3p2bRM6H8AioGMpfap
// // uni_wmas= AS12TaZdxkbMtPpnXS9FEhM2QZ2VowBB4vg6EtfdpmcF6zwqaJhbW
// // uni_usdc= AS12TShb2g2s3hPUUUZVmiXH23DQuKGT6pcLC3ExmTjYuLHC3WSY5

// const CONFIG = {

//     // Update these addresses with your deployed contract addresses
//     MASSASWAP_CORE_ADDRESS: "AS12V5z8s2V6QDjrspP7CuCb67PaXmyViXX5p5CSMchwCFiYE1nZJ", // MassaSwap core contract address
//     ADVANCED_DEFI_ADDRESS: "AS1xUUr7bPTA6HGsZL3BBjyTdmmkb8Crjt3p2bRM6H8AioGMpfap",
//     USDC_ADDRESS: "AS12TShb2g2s3hPUUUZVmiXH23DQuKGT6pcLC3ExmTjYuLHC3WSY5", // USDC token address
//     WMAS_ADDRESS: "AS12TaZdxkbMtPpnXS9FEhM2QZ2VowBB4vg6EtfdpmcF6zwqaJhbW",// Wrapped MAS token address
    
//     // Gas limits for different operations
//     GAS_LIMITS: {
//         READ_OPERATION: 20_000_000n,
//         SWAP: 200_000_000n,
//         ADD_LIQUIDITY: 300_000_000n,
//         REMOVE_LIQUIDITY: 300_000_000n,
//         CREATE_POOL: 500_000_000n,
//         LIMIT_ORDER: 200_000_000n,
//         DCA_STRATEGY: 300_000_000n,
//         YIELD_FARMING: 400_000_000n,
//         AUTONOMOUS_ENGINE: 800_000_000n
//     }
// };

// const ONE_UNIT = BigInt(10 ** 9);
// const client = JsonRPCClient.buildnet()
// // Global variables
// let web3Client = undefined;
// let baseAccount = undefined;
// let eventPoller = undefined;
// let accountAddress = null; // Store the connected account address

// // Initialize MassaSwap client
// class MassaSwapClient {
//     account = null;
//     constructor() {
        
//         this.isInitialized = false;
//     }

//    async  initialize() {
//     try {
//         const walletList = await getWallets();
//         const wallet = walletList.find(
//         (provider) => provider.name() === WalletName.MassaWallet
//         );
//         if (!wallet) {
//         throw new Error(
//             "Wallet not detected. To proceed, please install the Massa wallet and configure it for the Buildnet network"
//         );
//         }
//         console.log(await wallet.networkInfos())

//         const accounts = await wallet.accounts();

//         if (accounts.length === 0) {
//         throw new Error("No accounts found");
//         }

//         baseAccount = accounts[0];
//         return baseAccount;
//     } catch (error) {
//        console.error("Error initializing MassaSwap client:", error);
//     }
//     }


//     onEventData(events) {
//         for (const evt of events) {
//             if (evt.data.includes("MassaSwap:")) {
//                 console.log("MassaSwap Event:", evt.data);
        
                
//                 const customEvent = new CustomEvent("massaswap-event", {
//                     detail: {
//                         data: evt.data,
//                         timestamp: new Date().toISOString()
//                     }
//                 });
//                 document.dispatchEvent(customEvent);
//             }
//         }
//     }

//     onEventDataError(error) {
//         console.error("Event polling error:", error);
//     }

//     // Ensure client is initialized before operations
//     ensureInitialized() {
//         if (!this.isInitialized || !web3Client) {
//             throw new Error("MassaSwap client not initialized. Call initialize() first.");
//         }
//     }
// }


// class MassaSwapDEX {
//     constructor(client) {
//         this.client = client;
//     }

    
//     async createPool(tokenA, tokenB, amountA, amountB) {
        
        
//         try {
//             const args = new massa.Args();
//             args.addString(tokenA);
//             args.addString(tokenB);
//             args.addU64(BigInt(amountA));
//             args.addU64(BigInt(amountB));

//             const args1 = new massa.Args();
//             args1.addString(CONFIG.MASSASWAP_CORE_ADDRESS)
//             .addU64(BigInt(amountA))
//             const args2 = new massa.Args();
//             args1.addString(CONFIG.MASSASWAP_CORE_ADDRESS)
//             .addU64(BigInt(amountB))

//             const result1 = await window.bearby.contract.call(
//                 {
//                     fee: 100000000n,
//                     maxGas: CONFIG.GAS_LIMITS.CREATE_POOL,
//                     coins: massa.parseMas("1"),
//                     targetAddress: CONFIG.USDC_ADDRESS,
//                     functionName: "approve",
//                     parameter: args1.serialize(),
//                 }
//             );
//             console.log("Approval result:", result1);

//             const result2 = await window.bearby.contract.call(
//                 {
//                     fee: 100000000n,
//                     maxGas: CONFIG.GAS_LIMITS.CREATE_POOL,
//                     coins: massa.parseMas("1"),
//                     targetAddress: CONFIG.WMAS_ADDRESS,
//                     functionName: "approve",
//                     parameter: args2.serialize(),
//                 }
//             );
//             console.log("Approval result:", result2);

//             const result = await window.bearby.contract.call(
//                 {
//                     fee: 100000000n,
//                     maxGas: CONFIG.GAS_LIMITS.CREATE_POOL,
//                     coins: massa.parseMas("1"),
//                     targetAddress: CONFIG.MASSASWAP_CORE_ADDRESS,
//                     functionName: "createPool",
//                     parameter: args.serialize(),
//                 }
//             );

//             console.log("Pool creation result:", result);
//             return result;
//         } catch (error) {
//             console.error("Error creating pool:", error);
//             throw error;
//         }
//     }

//     // Add liquidity to existing pool
//     async addLiquidity(tokenA, tokenB, amountA, amountB) {
        
        
//         try {
//             const args = new massa.Args();
//             args.addString(tokenA);
//             args.addString(tokenB);
//             args.addU64(BigInt(amountA));
//             args.addU64(BigInt(amountB));

//             const result = await window.bearby.contract.call(
//                 {
//                     fee: 100000000n,
//                     maxGas: CONFIG.GAS_LIMITS.ADD_LIQUIDITY,
//                     coins: massa.parseMas("1"),
//                     targetAddress: CONFIG.MASSASWAP_CORE_ADDRESS,
//                     functionName: "addLiquidity",
//                     parameter: args.serialize(),
//                 }
//             );

//             console.log("Add liquidity result:", result);
//             return result;
//         } catch (error) {
//             console.error("Error adding liquidity:", error);
//             throw error;
//         }
//     }

//     // Remove liquidity from pool
//     async removeLiquidity(tokenA, tokenB, liquidity) {
        
        
//         try {
//             const args = new massa.Args();
//             args.addString(tokenA);
//             args.addString(tokenB);
//             args.addU64(BigInt(liquidity));

//             const result = await window.bearby.contract.call(
//                 {
//                     fee: 100000000n,
//                     maxGas: CONFIG.GAS_LIMITS.REMOVE_LIQUIDITY,
//                     coins: massa.parseMas("1"),
//                     targetAddress: CONFIG.MASSASWAP_CORE_ADDRESS,
//                     functionName: "removeLiquidity",
//                     parameter: args.serialize(),
//                 }
//             );

//             console.log("Remove liquidity result:", result);
//             return result;
//         } catch (error) {
//             console.error("Error removing liquidity:", error);
//             throw error;
//         }
//     }

//     // Perform token swap
//     async swap(tokenIn, tokenOut, amountIn, minAmountOut) {
        
        
//         try {
//             const args = new massa.Args();
//             args.addString(tokenIn);
//             args.addString(tokenOut);
//             args.addU64(BigInt(amountIn));
//             args.addU64(BigInt(minAmountOut));

//             const result = await window.bearby.contract.call(
//                 {
//                     fee: 100000000n,
//                     maxGas: CONFIG.GAS_LIMITS.SWAP,
//                     coins: massa.parseMas("1"),
//                     targetAddress: CONFIG.MASSASWAP_CORE_ADDRESS,
//                     functionName: "swap",
//                     parameter: args.serialize(),
//                 }
//             );

//             console.log("Swap result:", result);
//             return result;
//         } catch (error) {
//             console.error("Error performing swap:", error);
//             throw error;
//         }
//     }

//     // Get token balance
//     async getTokenBalance(tokenAddress, userAddress) {
//         try {
           
            
//             const args = new massa.Args()
//                     .addString(userAddress)

//             const result = await baseAccount.readSC({
//                 target: tokenAddress,
//                 func: "balanceOf",
//                 parameter: args.serialize()
//             });
//             console.log(`Balance of ${userAddress} in ${tokenAddress}:`, result);

//             const balance  = massa.bytesToF64(result.value)
//             console.log(`Raw balance: ${massa.bytesToF64(result.value)}`);
//             console.log(`Balance in human-readable format: ${balance}`);
//             return balance;
//         } catch (error) {
//             console.error("Error getting token balance:", error);
//             throw error;
//         }
//     }

//     // Get LP token balance
//     async getLPBalance(tokenA, tokenB, userAddress) {
        
        
//         try {
//             // This would need to be implemented as a read function in the smart contract
//             // For now, we'll return a placeholder
//             console.log(`Getting LP balance for ${userAddress} in ${tokenA}/${tokenB} pool`);
//             return 0n;
//         } catch (error) {
//             console.error("Error getting LP balance:", error);
//             throw error;
//         }
//     }
// }

// // Advanced DeFi Features
// class MassaSwapAdvanced {
//     constructor(client) {
//         this.client = client;
//     }

//     // Create DCA (Dollar Cost Averaging) strategy
//     async createDCAStrategy(tokenIn, tokenOut, amountPerPeriod, intervalPeriods, totalPeriods, minAmountOut = 0) {
        
        
//         try {
//             const args = new massa.Args();
//             args.addString(tokenIn);
//             args.addString(tokenOut);
//             args.addU64(BigInt(amountPerPeriod));
//             args.addU64(BigInt(intervalPeriods));
//             args.addU64(BigInt(totalPeriods));
//             args.addU64(BigInt(minAmountOut));

//             const result = await window.bearby.contract.call(
//                 {
//                     fee: 100000000n,
//                     maxGas: CONFIG.GAS_LIMITS.DCA_STRATEGY,
//                     coins: massa.parseMas("1"),
//                     targetAddress: CONFIG.ADVANCED_DEFI_ADDRESS,
//                     functionName: "createDCAStrategy",
//                     parameter: args.serialize(),
//                 }
//             );

//             console.log("DCA strategy creation result:", result);
//             return result;
//         } catch (error) {
//             console.error("Error creating DCA strategy:", error);
//             throw error;
//         }
//     }

//     // Create limit order
//     async createLimitOrder(tokenIn, tokenOut, amountIn, minAmountOut, expiry, orderType = "buy") {
        
        
//         try {
//             const args = new massa.Args();
//             args.addString(tokenIn);
//             args.addString(tokenOut);
//             args.addU64(BigInt(amountIn));
//             args.addU64(BigInt(minAmountOut));
//             args.addU64(BigInt(expiry));
//             args.addString(orderType);

//             const result = await window.bearby.contract.call(
//                 {
//                     fee: 100000000n,
//                     maxGas: CONFIG.GAS_LIMITS.LIMIT_ORDER,
//                     coins: massa.parseMas("1"),
//                     targetAddress: CONFIG.ADVANCED_DEFI_ADDRESS,
//                     functionName: "createLimitOrder",
//                     parameter: args.serialize(),
//                 }
//             );

//             console.log("Limit order creation result:", result);
//             return result;
//         } catch (error) {
//             console.error("Error creating limit order:", error);
//             throw error;
//         }
//     }

//     // Create yield farming pool
//     async createYieldPool(tokenA, tokenB, rewardToken, rewardRate) {
        
        
//         try {
//             const args = new massa.Args();
//             args.addString(tokenA);
//             args.addString(tokenB);
//             args.addString(rewardToken);
//             args.addU64(BigInt(rewardRate));

//             const result = await window.bearby.contract.call(
//                 {
//                     fee: 100000000n,
//                     maxGas: CONFIG.GAS_LIMITS.YIELD_FARMING,
//                     coins: massa.parseMas("1"),
//                     targetAddress: CONFIG.ADVANCED_DEFI_ADDRESS,
//                     functionName: "createYieldPool",
//                     parameter: args.serialize(),
//                 }
//             );

//             console.log("Yield pool creation result:", result);
//             return result;
//         } catch (error) {
//             console.error("Error creating yield pool:", error);
//             throw error;
//         }
//     }

//     // Stake LP tokens in yield farming pool
//     async stakeLP(yieldPoolId, amount) {
        
        
//         try {
//             const args = new massa.Args();
//             args.addU64(BigInt(yieldPoolId));
//             args.addU64(BigInt(amount));

//             const result = await window.bearby.contract.call(
//                 {
//                     fee: 100000000n,
//                     maxGas: CONFIG.GAS_LIMITS.YIELD_FARMING,
//                     coins: massa.parseMas("1"),
//                     targetAddress: CONFIG.ADVANCED_DEFI_ADDRESS,
//                     functionName: "stakeLP",
//                     parameter: args.serialize(),
//                 }
//             );

//             console.log("LP staking result:", result);
//             return result;
//         } catch (error) {
//             console.error("Error staking LP tokens:", error);
//             throw error;
//         }
//     }

//     // Unstake LP tokens from yield farming pool
//     async unstakeLP(yieldPoolId, amount) {
        
        
//         try {
//             const args = new massa.Args();
//             args.addU64(BigInt(yieldPoolId));
//             args.addU64(BigInt(amount));

//             const result = await window.bearby.contract.call(
//                 {
//                     fee: 100000000n,
//                     maxGas: CONFIG.GAS_LIMITS.YIELD_FARMING,
//                     coins: massa.parseMas("1"),
//                     targetAddress: CONFIG.ADVANCED_DEFI_ADDRESS,
//                     functionName: "unstakeLP",
//                     parameter: args.serialize(),
//                 }
//             );

//             console.log("LP unstaking result:", result);
//             return result;
//         } catch (error) {
//             console.error("Error unstaking LP tokens:", error);
//             throw error;
//         }
//     }

//     // Claim yield farming rewards
//     async claimRewards(yieldPoolId) {
        
        
//         try {
//             const args = new massa.Args();
//             args.addU64(BigInt(yieldPoolId));

//             const result = await window.bearby.contract.call(
//                 {
//                     fee: 100000000n,
//                     maxGas: CONFIG.GAS_LIMITS.YIELD_FARMING,
//                     coins: massa.parseMas("1"),
//                     targetAddress: CONFIG.ADVANCED_DEFI_ADDRESS,
//                     functionName: "claimRewards",
//                     parameter: args.serialize(),
//                 }
//             );

//             console.log("Rewards claim result:", result);
//             return result;
//         } catch (error) {
//             console.error("Error claiming rewards:", error);
//             throw error;
//         }
//     }

//     // Start autonomous engine
//     async startAutonomousEngine() {
        
        
//         try {
//             const args = new massa.Args();

//             const result = await window.bearby.contract.call(
//                 {
//                     fee: 100000000n,
//                     maxGas: CONFIG.GAS_LIMITS.AUTONOMOUS_ENGINE,
//                     coins: massa.parseMas("1"),
//                     targetAddress: CONFIG.ADVANCED_DEFI_ADDRESS,
//                     functionName: "startAutonomousEngine",
//                     parameter: args.serialize(),
//                 }
//             );

//             console.log("Autonomous engine start result:", result);
//             return result;
//         } catch (error) {
//             console.error("Error starting autonomous engine:", error);
//             throw error;
//         }
//     }

//     // Stop autonomous engine
//     async stopAutonomousEngine() {
        
        
//         try {
//             const args = new massa.Args();

//             const result = await window.bearby.contract.call(
//                 {
//                     fee: 100000000n,
//                     maxGas: CONFIG.GAS_LIMITS.AUTONOMOUS_ENGINE,
//                     coins: massa.parseMas("1"),
//                     targetAddress: CONFIG.ADVANCED_DEFI_ADDRESS,
//                     functionName: "stopAutonomousEngine",
//                     parameter: args.serialize(),
//                 }
//             );

//             console.log("Autonomous engine stop result:", result);
//             return result;
//         } catch (error) {
//             console.error("Error stopping autonomous engine:", error);
//             throw error;
//         }
//     }
// }

// // Utility Functions
// class MassaSwapUtils {
//     // Convert human-readable amount to contract units
//     static toContractUnits(amount) {
//         return BigInt(Math.floor(parseFloat(amount) * Number(ONE_UNIT)));
//     }

//     // Convert contract units to human-readable amount
//     static fromContractUnits(amount) {
//         return Number(amount) / Number(ONE_UNIT);
//     }

//     // Calculate slippage tolerance
//     static calculateMinAmountOut(amountOut, slippagePercent) {
//         const slippage = BigInt(Math.floor(slippagePercent * 100));
//         return (amountOut * (10000n - slippage)) / 10000n;
//     }

//     // Get current timestamp in seconds
//     static getCurrentTimestamp() {
//         return Math.floor(Date.now() / 1000);
//     }

//     // Calculate expiry timestamp (current time + hours)
//     static getExpiryTimestamp(hours) {
//         return this.getCurrentTimestamp() + (hours * 3600);
//     }

//     // Format address for display
//     static formatAddress(address, length = 8) {
//         if (!address || address.length < length * 2) return address;
//         return `${address.slice(0, length)}...${address.slice(-length)}`;
//     }

//     // Validate Massa address format
//     static isValidMassaAddress(address) {
//         return /^AS[1-9A-HJ-NP-Za-km-z]{48,50}$/.test(address);
//     }
// }

// // Main MassaSwap SDK
// class MassaSwapSDK {
//     client;
//     provider;
//     constructor() {
//         this.client = new MassaSwapClient();
//         this.provider = this.client.initialize();
//         this.dex = new MassaSwapDEX(this.provider);
//         this.advanced = new MassaSwapAdvanced(this.provider);
//         this.utils = MassaSwapUtils;
//     }

//     async initialize() {
        
//         this.provider = await this.client.initialize();
//         return this.provider
        
//     }

//     // Quick access methods for common operations
//     async quickSwap(tokenIn, tokenOut, amountIn, slippagePercent = 1) {
//         // This would need price calculation from the contract
//         // For now, we'll use a simplified approach
//         const minAmountOut = 0; // Should be calculated based on current price and slippage
//         return await this.dex.swap(tokenIn, tokenOut, amountIn, minAmountOut);
//     }

//     async getBalances(userAddress = null) {
//         const address = userAddress || accountAddress ;
        
//         const usdcBalance = await this.dex.getTokenBalance(CONFIG.USDC_ADDRESS, address);
//         const wmasBalance = await this.dex.getTokenBalance(CONFIG.WMAS_ADDRESS, address);
        
//         return {
//             USDC: this.utils.fromContractUnits(usdcBalance),
//             WMAS: this.utils.fromContractUnits(wmasBalance)
//         };
//     }
// }

// // Example usage and initialization
// async function initializeMassaSwap() {
//     // Example account - replace with your actual account
//     const account = {
//         address: "AU139TmwoP6w5mgUQrpF9s49VXeFGXmN1SiuX5HEtzcGmuJAoXFa",
//         secretKey: "S124xpCaad7hPhvezhHp2sSxb56Dpi2oufcp2m2NtkdPjgxFXNon",
//         publicKey: "P1zir4oncNbkuQFkZyU4TjfNzR5BotZzf4hGVE4pCNwCb6Z2Kjn",
//     };

//     const massaSwap = new MassaSwapSDK(account);
//     await massaSwap.initialize();
    
//     return massaSwap;
// }

// // Export for use in other modules
// if (typeof module !== 'undefined' && module.exports) {
//     module.exports = {
//         MassaSwapSDK,
//         MassaSwapUtils,
//         CONFIG,
//         initializeMassaSwap
//     };
// }


// export {
//     MassaSwapSDK, MassaSwapUtils, CONFIG, initializeMassaSwap, MassaSwapAdvanced, MassaSwapDEX, MassaSwapClient
// };

// // // Global access for browser usage
// // if (typeof window !== 'undefined') {
// //     window.MassaSwapSDK = MassaSwapSDK;
// //     window.MassaSwapUtils = MassaSwapUtils;
// //     window.initializeMassaSwap = initializeMassaSwap;
// // }

// // // Example usage functions for testing
// // async function exampleUsage() {
// //     try {
// //         // Initialize the SDK
// //         const massaSwap = await initializeMassaSwap();
        
// //         // Get user balances
// //         const balances = await massaSwap.getBalances();
// //         console.log("User balances:", balances);
        
// //         // Perform a swap
// //         const swapAmount = massaSwap.utils.toContractUnits("100"); // 100 tokens
// //         await massaSwap.quickSwap(
// //             CONFIG.USDC_ADDRESS,
// //             CONFIG.WMAS_ADDRESS,
// //             swapAmount,
// //             1 // 1% slippage
// //         );
        
// //         // Create a DCA strategy
// //         await massaSwap.advanced.createDCAStrategy(
// //             CONFIG.USDC_ADDRESS,
// //             CONFIG.WMAS_ADDRESS,
// //             massaSwap.utils.toContractUnits("10"), // 10 USDC per period
// //             100, // Every 100 periods
// //             10, // For 10 periods total
// //             0 // No minimum amount out
// //         );
        
// //         // Start autonomous engine
// //         await massaSwap.advanced.startAutonomousEngine();
        
// //         console.log("Example operations completed successfully");
        
// //     } catch (error) {
// //         console.error("Error in example usage:", error);
// //     }
// // }

// // // exampleUsage()

// // // Event listeners for UI integration
// // document.addEventListener('massaswap-event', (event) => {
// //     console.log('MassaSwap Event Received:', event.detail);
// //     // Handle UI updates based on contract events
// // });

// // console.log("MassaSwap JavaScript SDK loaded successfully");

// // // Start of work 



















