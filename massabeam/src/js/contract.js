import { getWallets, WalletName } from "@massalabs/wallet-provider"
import { Args, OperationStatus } from "@massalabs/massa-web3"

// Contract addresses
const CONTRACTS = {
  AMM: "AS1hzwjwG4XAAfW7a2zcboEQhy7DYaLr9Zt86Xh5uCmkFgBxdVv5",
  ENGINE: "AS12mFfp7XA8U5QyRPBWNT5V5BLeEMxuoxHft5Ph8y9uGH2SecDXw", // Same for demo
  ADVANCED: "AS12mFfp7XA8U5QyRPBWNT5V5BLeEMxuoxHft5Ph8y9uGH2SecDXw", // Same for demo
}


const COIN_ADDRESSES = {
  MASS: "AS1hzwjwG4XAAfW7a2zcboEQhy7DYaLr9Zt86Xh5uCmkFgBxdVv5", // Massa native coin
  USDC: "AS1hzwjwG4XAAfW7a2zcboEQhy7DYaLr9Zt86Xh5uCmkFgBxdVv5", // Example USDC address
  BTC: "AS1hzwjwG4XAAfW7a2zcboEQhy7DYaLr9Zt86Xh5uCmkFgBxdVv5", // Example BTC address
  ETH: "AS1hzwjwG4XAAfW7a2zcboEQhy7DYaLr9Zt86Xh5uCmkFgBxdVv5", // Example ETH address
  BNB: "AS1hzwjwG4XAAfW7a2zcboEQhy7DYaLr9Zt86Xh5uCmkFgBxdVv5", // Example BNB address
  SOL: "AS1hzwjwG4XAAfW7a2zcboEQhy7DYaLr9Zt86Xh5uCmkFgBxdVv5", // Example SOL address
  ADA: "AS1hzwjwG4XAAfW7a2zcboEQhy7DYaLr9Zt86Xh5uCmkFgBxdVv5", // Example ADA address
}

// Global provider instance
let provider = null
let isConnected = false
let userAddress = null

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
async function callContract(contractAddress, functionName, args = [], value = 0) {
  if (!provider) {
    throw new Error("Wallet not connected")
  }

  try {
    const operation = await provider.callSC({
      target: contractAddress,
      func: functionName,
      parameter: args.length > 0 ? new Args(...args).serialize() : new Args().serialize(),
      coins: value,
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
async function readContract(contractAddress, functionName, args = []) {
  if (!provider) {
    throw new Error("Wallet not connected")
  }

  try {
    const result = await provider.readSC({
      target: contractAddress,
      func: functionName,
      parameter: args.length > 0 ? new Args(...args).serialize() : new Args().serialize(),
    })

    return result.value
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
      const args = [tokenA, tokenB, amountA, amountB, deadline]
      const operation = await callContract(CONTRACTS.AMM, "createPool", args)
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
      const args = [tokenA, tokenB, amountADesired, amountBDesired, amountAMin, amountBMin, deadline]
      const operation = await callContract(CONTRACTS.AMM, "addLiquidity", args)
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
      const args = [tokenA, tokenB, liquidity, amountAMin, amountBMin, deadline]
      const operation = await callContract(CONTRACTS.AMM, "removeLiquidity", args)
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
      const args = [tokenIn, tokenOut, amountIn, amountOutMin, deadline]
      const operation = await callContract(CONTRACTS.AMM, "swap", args)
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
      const result = await readContract(CONTRACTS.AMM, "getPool", [tokenA, tokenB])
      return result
    } catch (error) {
      console.error("Failed to get pool info:", error)
      return null
    }
  },

  // Get amount out for swap
  async getAmountOut(amountIn, reserveIn, reserveOut, fee) {
    try {
      const result = await readContract(CONTRACTS.AMM, "getAmountOut", [amountIn, reserveIn, reserveOut, fee])
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
      const args = [tokenIn, tokenOut, amountIn, minAmountOut, expiry, orderType, partialFill, slippageTolerance]
      const operation = await callContract(CONTRACTS.ADVANCED, "createLimitOrder", args)
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
      const operation = await callContract(CONTRACTS.ADVANCED, "cancelOrder", [orderId])
      showSuccess("Order cancelled successfully!")
      return operation
    } catch (error) {
      showError(`Failed to cancel order: ${error.message}`)
      throw error
    }
  },

  // Get limit order
  async getLimitOrder(orderId) {
    try {
      const result = await readContract(CONTRACTS.ADVANCED, "getLimitOrder", [orderId])
      return result
    } catch (error) {
      console.error("Failed to get limit order:", error)
      return null
    }
  },

  // Get user orders
  async getUserOrders(userAddress) {
    try {
      const result = await readContract(CONTRACTS.ADVANCED, "getUserOrders", [userAddress])
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
      const args = [
        tokenIn,
        tokenOut,
        amountPerPeriod,
        intervalPeriods,
        totalPeriods,
        minAmountOut,
        maxSlippage,
        stopLoss,
        takeProfit,
      ]
      const operation = await callContract(CONTRACTS.ADVANCED, "createDCAStrategy", args)
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
      const result = await readContract(CONTRACTS.ADVANCED, "getDCAStrategy", [strategyId])
      return result
    } catch (error) {
      console.error("Failed to get DCA strategy:", error)
      return null
    }
  },

  // Get user DCA strategies
  async getUserDCAs(userAddress) {
    try {
      const result = await readContract(CONTRACTS.ADVANCED, "getUserDCAs", [userAddress])
      return result
    } catch (error) {
      console.error("Failed to get user DCAs:", error)
      return []
    }
  },

  // Create yield pool
  async createYieldPool(tokenA, tokenB, rewardToken, rewardRate, performanceFee, lockupPeriod, maxLeverage) {
    try {
      const args = [tokenA, tokenB, rewardToken, rewardRate, performanceFee, lockupPeriod, maxLeverage]
      const operation = await callContract(CONTRACTS.ADVANCED, "createYieldPool", args)
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
      const args = [poolId, amountA, amountB]
      const operation = await callContract(CONTRACTS.ADVANCED, "stakeInYieldPool", args)
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
      const args = [poolId, collateralAmount, leverage]
      const operation = await callContract(CONTRACTS.ADVANCED, "createLeveragedPosition", args)
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
      const result = await readContract(CONTRACTS.ADVANCED, "getYieldPool", [poolId])
      return result
    } catch (error) {
      console.error("Failed to get yield pool:", error)
      return null
    }
  },

  // Get leveraged position
  async getLeveragedPosition(positionId) {
    try {
      const result = await readContract(CONTRACTS.ADVANCED, "getLeveragedPosition", [positionId])
      return result
    } catch (error) {
      console.error("Failed to get leveraged position:", error)
      return null
    }
  },

  // Get user positions
  async getUserPositions(userAddress) {
    try {
      const result = await readContract(CONTRACTS.ADVANCED, "getUserPositions", [userAddress])
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
      const operation = await callContract(CONTRACTS.ENGINE, "executeArbitrageOpportunity", [opportunityId])
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
    const result = await readContract(CONTRACTS.ADVANCED, "getCurrentGasPrice", [])
    return result || 1000
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

// Mock token data for demo
export const MOCK_TOKENS = [
  {
    address: "AS1234567890abcdef1234567890abcdef1234567890abcdef",
    symbol: "MAS",
    name: "Massa",
    decimals: 9,
    balance: "1000000000000", // 1000 MAS
  },
  {
    address: "AS2345678901bcdef12345678901bcdef12345678901bcdef1",
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    balance: "5000000000", // 5000 USDC
  },
  {
    address: "AS3456789012cdef123456789012cdef123456789012cdef12",
    symbol: "WETH",
    name: "Wrapped Ethereum",
    decimals: 18,
    balance: "2000000000000000000", // 2 WETH
  },
  {
    address: "AS4567890123def1234567890123def1234567890123def123",
    symbol: "DAI",
    name: "Dai Stablecoin",
    decimals: 18,
    balance: "10000000000000000000000", // 10000 DAI
  },
]

// Get token by address
export function getTokenByAddress(address) {
  return MOCK_TOKENS.find((token) => token.address === address)
}



// Get token by symbol
export function getTokenBySymbol(symbol) {
  return MOCK_TOKENS.find((token) => token.symbol === symbol)
}

// Initialize contract system
export async function initializeContracts() {
  try {
    await initProvider()

    // Update gas price
    const gasPrice = await getCurrentGasPrice()
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
