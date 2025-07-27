import { getWallets, WalletName,  } from "@massalabs/wallet-provider"
import { Args, OperationStatus , WMAS, MRC20, USDCe, USDCs, USDTb, USDTbt, bytesToF64, bytesToStr} from "@massalabs/massa-web3"

// Contract addresses
const CONTRACTS = {
  AMM: "AS12oupNM6zL4mVneuHLrXEY2wVm1bibnK1sn5Ag5gqWu4995QDnc",
  ENGINE: "AS12WoA6iCq17kiGA55izZMYhdrbosGRU4hVqfk5cbYgvVstUC9Md", // Same for demo
  ADVANCED: "AS1i8UNYQdmRjB9K454UJ8DwaJmBLgu3G1UTwzFtUH9Aihgu4P1n", // Same for demo
}

const TOKENS = [
  "AS1xs2KfX3LVeFoF3v8PQZ8TTWsFAW3UYz1Wkg8358DcakPguWs9",
  "AS1GrZXNAdVUtCbWC3FE3kajmaEg6FxiE9cxQuYBM3KQELGjEE31",
  "AS12k8viVmqPtRuXzCm6rKXjLgpQWqbuMjc37YHhB452KSUUb9FgL"
]





// Global provider instance
let provider = null
let isConnected = false
let userAddress = null


export function getTokens(){
  const custom =  TOKENS.map((address) => {
    const coin = new MRC20(provider, address)
    return coin
  })
  return [ ...custom]
}


// Error handling utility
function showError(message) {
  const errorElement = document.getElementById("errorMessage")
  if (errorElement) {
    errorElement.textContent = message
    errorElement.classList.add("visible")
    setTimeout(() => {
      errorElement.classList.remove("visible")
    }, 5000)
  }
  console.error("Contract Error:", message)
}

// Success notification utility
function showSuccess(message) {
  // Create a success notification similar to error
  const successElement = document.createElement("div")
  successElement.className = "success-message visible"
  successElement.textContent = message
  successElement.style.cssText = `
        position: fixed;
        top: 24px;
        right: 24px;
        background: var(--success-green);
        color: white;
        padding: 16px 24px;
        border-radius: 12px;
        box-shadow: var(--shadow-lg);
        z-index: 1070;
        max-width: 400px;
        font-weight: 500;
    `
  document.body.appendChild(successElement)

  setTimeout(() => {
    successElement.remove()
  }, 3000)
}

// Initialize wallet provider
export async function initProvider() {
  try {
    const walletList = await getWallets()
    const wallet = walletList.find((provider) => provider.name() === WalletName.MassaWallet)

    if (!wallet) {
      throw new Error(
        "Massa Wallet not detected. Please install the Massa wallet and configure it for the Buildnet network",
      )
    }

    const accounts = await wallet.accounts()
    if (accounts.length === 0) {
      throw new Error("No accounts found. Please create an account in your Massa wallet")
    }

    provider = accounts[0]
    isConnected = true
    userAddress = provider.address

    // Update UI
    updateWalletUI()

    return provider
  } catch (error) {
    showError(error.message)
    return null
  }
}

// Update wallet UI
function updateWalletUI() {
  const walletBtn = document.getElementById("walletBtn")
  const walletText = walletBtn?.querySelector(".wallet-text")

  if (isConnected && userAddress) {
    walletBtn?.classList.add("connected")
    if (walletText) {
      walletText.textContent = `${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`
    }
  } else {
    walletBtn?.classList.remove("connected")
    if (walletText) {
      walletText.textContent = "Connect Wallet"
    }
  }
}

// Generic contract call wrapper
async function callContract(contractAddress, functionName, args) {
  if (!provider) {
    throw new Error("Wallet not connected")
  }

  try {
    const operation = await provider.callSC({
      target: contractAddress,
      func: functionName,
      parameter: args,
    })

    

    const status = await operation.waitSpeculativeExecution()
    if (status !== OperationStatus.SpeculativeSuccess) {
      throw new Error(`Transaction failed with status: ${status}`)
    }

    return operation
  } catch (error) {
    console.error(`Contract call failed: ${functionName}`, error)
    throw error
  }
}

// Generic contract read wrapper
async function readContract(contractAddress, functionName, args) {
  if (!provider) {
    throw new Error("Wallet not connected")
  }

  try {
    const result = await provider.readSC({
      target: contractAddress,
      func: functionName,
      parameter: args || new Args().serialize(),
    })
    console.log(result)
    return result.value
    // console.log(result.value)
  } catch (error) {
    console.error(`Contract read failed: ${functionName}`, error)
    throw error
  }
}

// AMM Contract Functions
export const AMMContract = {
  // Create a new liquidity pool
  async createPool(tokenA, tokenB, amountA, amountB, deadline) {
    try {
      console.log(tokenA, tokenA, amountA, amountB, deadline);

     const opA =await getTokenByAddress(tokenA).increaseAllowance(
      CONTRACTS.AMM,
      BigInt(amountA)
     )

      const statusA = await opA.waitSpeculativeExecution()
      if (statusA !== OperationStatus.SpeculativeSuccess) {
        throw new Error(`Transaction failed with status: ${statusA}`)
      }

      const oB =await getTokenByAddress(tokenB).increaseAllowance(
         CONTRACTS.AMM,
        BigInt(amountB)
      )

      const statusB = await oB.waitSpeculativeExecution()
      if (statusB !== OperationStatus.SpeculativeSuccess) {
        throw new Error(`Transaction failed with status: ${statusB}`)
      }

      

      const args = new Args()
                .addString(tokenA)
                .addString(tokenB)
                .addU64(BigInt(amountA))
                .addU64(BigInt(amountB))
                .addU64(BigInt(deadline))
               ;

      const operation = await callContract(CONTRACTS.AMM, "createPool", args.serialize());
            
      showSuccess("Pool created successfully!")
      return operation
    } catch (error) {
      showError(`Failed to create pool: ${error.message}`)
      throw error
    }
  },

  // Add liquidity to existing pool
  async addLiquidity(tokenA, tokenB, amountADesired, amountBDesired, amountAMin, amountBMin, deadline) {
    try {
      const args = new Args()
                .addString(tokenA)
                .addString(tokenB)
                .addU64(amountADesired)
                .addU64(amountBDesired)
                .addU64(amountAMin)
                .addU64(amountBMin)
                .addU64(deadline)
                .serialize();
            const operation = await callContract(CONTRACTS.AMM, "addLiquidity", [], 0, args);
            
      showSuccess("Liquidity added successfully!")
      return operation
    } catch (error) {
      showError(`Failed to add liquidity: ${error.message}`)
      throw error
    }
  },

  // Remove liquidity from pool
  async removeLiquidity(tokenA, tokenB, liquidity, amountAMin, amountBMin, deadline) {
    try {
      const args = new Args()
                .addString(tokenA)
                .addString(tokenB)
                .addU64(liquidity)
                .addU64(amountAMin)
                .addU64(amountBMin)
                .addU64(deadline)
                .serialize();
            const operation = await callContract(CONTRACTS.AMM, "removeLiquidity", [], 0, args);
            
      showSuccess("Liquidity removed successfully!")
      return operation
    } catch (error) {
      showError(`Failed to remove liquidity: ${error.message}`)
      throw error
    }
  },

  // Swap tokens
  async swap(tokenIn, tokenOut, amountIn, amountOutMin, deadline) {
    try {
      
          
     const args = new Args()
                .addString(tokenIn)
                .addString(tokenOut)
                .addU64(amountIn)
                .addU64(amountOutMin)
                .addU64(deadline)
                .serialize();
            const operation = await callContract(CONTRACTS.AMM, "swap", [], 0, args);
            showSuccess("Swap completed successfully!")
      return operation
    } catch (error) {
      showError(`Failed to swap tokens: ${error.message}`)
      throw error
    }
  },

  // Get pool information
  async getPool(tokenA, tokenB) {
    try {
      const args = new Args()
          .addString(tokenA)
          .addString(tokenB)
      const result = await readContract(CONTRACTS.AMM, "getPool", args.serialize())
      return result
    } catch (error) {
      console.error("Failed to get pool info:", error)
      return null
    }
  },

  // Get amount out for swap
  async getAmountOut(amountIn, reserveIn, reserveOut, fee) {
    try {
      const args = new Args()
            .addU64(amountIn)
            .addU64(reserveIn)
            .addU64(reserveOut)
            .addU64(fee)
      const result = await readContract(CONTRACTS.AMM, "getAmountOut", args.serialize())
      return result
    } catch (error) {
      console.error("Failed to get amount out:", error)
      return 0
    }
  },
}

// Advanced Features Contract Functions
export const AdvancedContract = {
  // Create limit order
  async createLimitOrder(tokenIn, tokenOut, amountIn, minAmountOut, expiry, orderType, partialFill, slippageTolerance) {
    try {
       const args = new Args()
                .addString(tokenIn)
                .addString(tokenOut)
                .addU64(amountIn)
                .addU64(minAmountOut)
                .addU64(expiry)
                .addString(orderType)
                .addBool(partialFill)
                .addU64(slippageTolerance)
                .serialize();
            const operation = await callContract(CONTRACTS.ADVANCED, "createLimitOrder", [], 0, args);
            showSuccess("Limit order created successfully!")
      return operation
    } catch (error) {
      showError(`Failed to create limit order: ${error.message}`)
      throw error
    }
  },

  // Cancel limit order
  async cancelOrder(orderId) {
    try {
      const args = new Args()
                .addU64(orderId)
                .serialize();
            const operation = await callContract(CONTRACTS.ADVANCED, "cancelOrder", [], 0, args);
            return operation
    } catch (error) {
      showError(`Failed to cancel order: ${error.message}`)
      throw error
    }
  },

  // Get limit order
  async getLimitOrder(orderId) {
    try {
     const args = new Args()
                .addU64(orderId)
                .serialize();
            const result = await readContract(CONTRACTS.ADVANCED, "getLimitOrder", args);
            return result
    } catch (error) {
      console.error("Failed to get limit order:", error)
      return null
    }
  },

  // Get user orders
  async getUserOrders(userAddress) {
    try {
       const args = new Args()
                .addString(userAddress)
                .serialize();
            const result = await readContract(CONTRACTS.ADVANCED, "getUserOrders", args);
             return result
    } catch (error) {
      console.error("Failed to get user orders:", error)
      return []
    }
  },

  // Create DCA strategy
  async createDCAStrategy(
    tokenIn,
    tokenOut,
    amountPerPeriod,
    intervalPeriods,
    totalPeriods,
    minAmountOut,
    maxSlippage,
    stopLoss,
    takeProfit,
  ) {
    try {
       const args = new Args()
                .addString(tokenIn)
                .addString(tokenOut)
                .addU64(amountPerPeriod)
                .addU64(intervalPeriods)
                .addU64(totalPeriods)
                .addU64(minAmountOut)
                .addU64(maxSlippage)
                .addU64(stopLoss)
                .addU64(takeProfit)
                .serialize();
            const operation = await callContract(CONTRACTS.ADVANCED, "createDCAStrategy", [], 0, args);
            showSuccess("DCA strategy created successfully!")
      return operation
    } catch (error) {
      showError(`Failed to create DCA strategy: ${error.message}`)
      throw error
    }
  },

  // Get DCA strategy
  async getDCAStrategy(strategyId) {
    try {
     const args = new Args()
                .addU64(strategyId)
                .serialize();
            const result = await readContract(CONTRACTS.ADVANCED, "getDCAStrategy", args);
            return result
    } catch (error) {
      console.error("Failed to get DCA strategy:", error)
      return null
    }
  },

  // Get user DCA strategies
  async getUserDCAs(userAddress) {
    try {
      const args = new Args()
                .addString(userAddress)
                .serialize();
            const result = await readContract(CONTRACTS.ADVANCED, "getUserDCAs", args);
            return result
    } catch (error) {
      console.error("Failed to get user DCAs:", error)
      return []
    }
  },

  // Create yield pool
  async createYieldPool(tokenA, tokenB, rewardToken, rewardRate, performanceFee, lockupPeriod, maxLeverage) {
    try {
      const args = new Args()
                .addString(tokenA)
                .addString(tokenB)
                .addString(rewardToken)
                .addU64(rewardRate)
                .addU64(performanceFee)
                .addU64(lockupPeriod)
                .addU64(maxLeverage)
                .serialize();
            const operation = await callContract(CONTRACTS.ADVANCED, "createYieldPool", [], 0, args);
            showSuccess("Yield pool created successfully!")
      return operation
    } catch (error) {
      showError(`Failed to create yield pool: ${error.message}`)
      throw error
    }
  },

  // Stake in yield pool
  async stakeInYieldPool(poolId, amountA, amountB) {
    try {
       const args = new Args()
                .addU64(poolId)
                .addU64(amountA)
                .addU64(amountB)
                .serialize();
            const operation = await callContract(CONTRACTS.ADVANCED, "stakeInYieldPool", [], 0, args);
            showSuccess("Staked in yield pool successfully!")
      return operation
    } catch (error) {
      showError(`Failed to stake in yield pool: ${error.message}`)
      throw error
    }
  },

  // Create leveraged position
  async createLeveragedPosition(poolId, collateralAmount, leverage) {
    try {
      const args = new Args()
                .addU64(poolId)
                .addU64(collateralAmount)
                .addU64(leverage)
                .serialize();
            const operation = await callContract(CONTRACTS.ADVANCED, "createLeveragedPosition", [], 0, args);
            showSuccess("Leveraged position created successfully!")
      return operation
    } catch (error) {
      showError(`Failed to create leveraged position: ${error.message}`)
      throw error
    }
  },

  // Get yield pool
  async getYieldPool(poolId) {
    try {
      const args = new Args()
                .addU64(poolId)
                .serialize();
            const result = await readContract(CONTRACTS.ADVANCED, "getYieldPool", args);
            return result
    } catch (error) {
      console.error("Failed to get yield pool:", error)
      return null
    }
  },

  // Get leveraged position
  async getLeveragedPosition(positionId) {
    try {
      const args = new Args()
                .addU64(positionId)
                .serialize();
            const result = await readContract(CONTRACTS.ADVANCED, "getLeveragedPosition", args);
            return result
    } catch (error) {
      console.error("Failed to get leveraged position:", error)
      return null
    }
  },

  // Get user positions
  async getUserPositions(userAddress) {
    try {
   const args = new Args()
                .addString(userAddress)
                .serialize();
            const result = await readContract(CONTRACTS.ADVANCED, "getUserPositions", args);
            return result
    } catch (error) {
      console.error("Failed to get user positions:", error)
      return []
    }
  },
}

// Arbitrage Engine Contract Functions
export const ArbitrageContract = {
  // Start arbitrage engine
  async startArbitrageEngine() {
    try {
      const operation = await callContract(CONTRACTS.ENGINE, "startArbitrageEngine", [])
      showSuccess("Arbitrage engine started!")
      return operation
    } catch (error) {
      showError(`Failed to start arbitrage engine: ${error.message}`)
      throw error
    }
  },

  // Stop arbitrage engine
  async stopArbitrageEngine() {
    try {
      const operation = await callContract(CONTRACTS.ENGINE, "stopArbitrageEngine", [])
      showSuccess("Arbitrage engine stopped!")
      return operation
    } catch (error) {
      showError(`Failed to stop arbitrage engine: ${error.message}`)
      throw error
    }
  },

  // Detect arbitrage opportunities
  async detectArbitrageOpportunities() {
    try {
      const result = await readContract(CONTRACTS.ENGINE, "detectAllArbitrageOpportunities", [])
      return result
    } catch (error) {
      console.error("Failed to detect arbitrage opportunities:", error)
      return []
    }
  },

  // Execute arbitrage opportunity
  async executeArbitrageOpportunity(opportunityId) {
    try {
      const args = new Args()
      .addString(opportunityId)
      .serialize()
      const operation = await callContract(CONTRACTS.ENGINE, "executeArbitrageOpportunity", args)
      showSuccess("Arbitrage opportunity executed!")
      return operation
    } catch (error) {
      showError(`Failed to execute arbitrage: ${error.message}`)
      throw error
    }
  },
}

// Utility functions
export function getProvider() {
  return provider
}

export function isWalletConnected() {
  return isConnected
}

export function getUserAddress() {
  return userAddress
}

// Get current gas price
export async function getCurrentGasPrice() {
  try {
    const args = new Args()
    .serialize()
    const result = await readContract(CONTRACTS.ADVANCED, "getCurrentGasPrice", args)
    console.log(Uint8Array.from(result))
    return bytesToF64(result, 2) || 1000
  } catch (error) {
    console.error("Failed to get gas price:", error)
    return 1000
  }
}

// Format address for display
export function formatAddress(address) {
  if (!address) return ""
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

// Format token amount
export function formatTokenAmount(amount, decimals = 9) {
  if (!amount) return "0"
  const divisor = Math.pow(10, decimals)
  return (Number(amount) / divisor).toFixed(4)
}

// Parse token amount
export function parseTokenAmount(amount, decimals = 9) {
  if (!amount) return 0
  const multiplier = Math.pow(10, decimals)
  return Math.floor(Number(amount) * multiplier)
}

// Calculate deadline (current time + hours)
export function calculateDeadline(hours = 1) {
  return Date.now() + hours * 60 * 60 * 1000
}




// Get token by address
export function getTokenByAddress(address) {
  return getTokens().find((token) => token.address === address)
}



// Get token by symbol
export function getTokenBySymbol(symbol) {
  return getTokens().find(async (token) => await token.symbol() === symbol)
}

// Initialize contract system
export async function initializeContracts() {
  try {
    await initProvider()

    // Update gas price
    const gasPrice = await getCurrentGasPrice()
    console.log(gasPrice)
    const gasPriceElement = document.getElementById("gasPrice")
    if (gasPriceElement) {
      gasPriceElement.textContent = gasPrice
    }

    return true
  } catch (error) {
    console.error("Failed to initialize contracts:", error)
    return false
  }
}

// Export provider initialization for main app
export { initProvider as connectWallet }
