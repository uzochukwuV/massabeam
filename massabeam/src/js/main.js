import { initializeContracts, connectWallet, getUserAddress, getTokens, getTokenByAddress, getProvider, AMMContract } from "./contract.js"
import { initializeUI, updateDashboard } from "./ui.js"
import { formatNumber, formatAddress, debounce } from "./utils.js"

// Global application state
const AppState = {
  currentSection: "dashboard",
  isLoading: false,
  user: {
    address: null,
    connected: false,
  },
  portfolio: {
    totalValue: 0,
    assets: [],
    positions: [],
    transactions: [],
  },
  pools: [],
  orders: [],
  dcaStrategies: [],
  yieldPositions: [],
  arbitrageOpportunities: [],
}

// Initialize application
async function initializeApp() {
  try {
    showLoading(true)
    console.log("Initializing application...")

    // Initialize UI components
    initializeUI()
    console.log("UI initialized")

    // Set up event listeners
    setupEventListeners()
    console.log("Event listeners set up")

    // Try to connect wallet automatically
    const connected = await initializeContracts()
    if (connected) {
      AppState.user.connected = true
      AppState.user.address = getUserAddress()
      await loadUserData()
      console.log("Wallet connected:", AppState.user.address)
    }

    // Load initial data
    await loadProtocolData()
    console.log("Protocol data loaded")

    // Start periodic updates
    startPeriodicUpdates()
    console.log("Periodic updates started")

    showLoading(false)
  } catch (error) {
    console.error("Failed to initialize app:", error)
    showError("Failed to initialize application")
    showLoading(false)
  }
}

// Show/hide loading overlay
function showLoading(show) {
  const loadingOverlay = document.getElementById("loadingOverlay")
  if (loadingOverlay) {
    if (show) {
      loadingOverlay.classList.remove("hidden")
    } else {
      loadingOverlay.classList.add("hidden")
    }
  }
  AppState.isLoading = show
}

// Set up event listeners
function setupEventListeners() {
  // Navigation
  const navItems = document.querySelectorAll(".nav-item")
  navItems.forEach((item) => {
    item.addEventListener("click", (e) => {
      const section = e.currentTarget.dataset.section
      if (section) {
        switchToSection(section)
      }
    })
  })

  // Wallet connection
  const walletBtn = document.getElementById("walletBtn")
  if (walletBtn) {
    walletBtn.addEventListener("click", handleWalletConnection)
  }

  // Form submissions
  setupFormListeners()

  // Window events
  window.addEventListener("resize", debounce(handleResize, 250))
  window.addEventListener("beforeunload", handleBeforeUnload)
}

// Handle wallet connection
async function handleWalletConnection() {
  if (AppState.user.connected) {
    // Already connected, show user menu or disconnect
    showUserMenu()
  } else {
    try {
      showLoading(true)
      const provider = await connectWallet()
      if (provider) {
        AppState.user.connected = true
        AppState.user.address = getUserAddress()
        await loadUserData()
        updateWalletUI()
      }
    } catch (error) {
      console.error("Wallet connection failed:", error)
    } finally {
      showLoading(false)
    }
  }
}

// Update wallet UI
function updateWalletUI() {
  const walletBtn = document.getElementById("walletBtn")
  const walletText = walletBtn?.querySelector(".wallet-text")

  if (AppState.user.connected && AppState.user.address) {
    walletBtn?.classList.add("connected")
    if (walletText) {
      walletText.textContent = formatAddress(AppState.user.address)
    }
  } else {
    walletBtn?.classList.remove("connected")
    if (walletText) {
      walletText.textContent = "Connect Wallet"
    }
  }
}

// Show user menu
function showUserMenu() {
  // Implementation for user menu dropdown
  console.log("Show user menu")
}

// Switch to section
function switchToSection(sectionName) {
  if (AppState.currentSection === sectionName) return

  // Update navigation
  const navItems = document.querySelectorAll(".nav-item")
  navItems.forEach((item) => {
    if (item.dataset.section === sectionName) {
      item.classList.add("active")
    } else {
      item.classList.remove("active")
    }
  })

  // Update sections
  const sections = document.querySelectorAll(".section")
  sections.forEach((section) => {
    if (section.id === sectionName) {
      section.classList.add("active")
    } else {
      section.classList.remove("active")
    }
  })

  AppState.currentSection = sectionName

  // Load section-specific data
  loadSectionData(sectionName)
}

// Load section-specific data
async function loadSectionData(sectionName) {
  try {
    switch (sectionName) {
      case "dashboard":
        await loadDashboardData()
        break
      case "trade":
        await loadTradeData()
        break
      case "orders":
        await loadOrdersData()
        break
      case "dca":
        await loadDCAData()
        break
      case "yield":
        await loadYieldData()
        break
      case "portfolio":
        await loadPortfolioData()
        break
      case "analytics":
        await loadAnalyticsData()
      case "liquidity":
        await loadLiquityData()
      case "createPool":
        await loadcreatePoolData()
        break
    }
  } catch (error) {
    console.error(`Failed to load ${sectionName} data:`, error)
  }
}

// Load user-specific data
async function loadUserData() {
  if (!AppState.user.connected) return

  try {
    // Load user orders, DCA strategies, positions, etc.
    // This would make actual contract calls
    console.log("Loading user data...")

    
    // Mock data for demo
    AppState.portfolio = {
      totalValue: 0,
      assets: [
      ],
      positions: [],
      transactions: [],
    }
    const tokens = getTokens()

    AppState.portfolio.assets = tokens.map(async(token) => ({
      symbol:await token.symbol(),
      balance: await token.balanceOf(AppState.user.address),
      value: await token.decimals(),
      change: await token.decimals(),
    }))

    
  } catch (error) {
    console.error("Failed to load user data:", error)
  }
}

// Load protocol data
async function loadProtocolData() {
  try {
    // Load pools, stats, etc.
    console.log("Loading protocol data...")

    // Mock data for demo
    updateProtocolStats({
      tvl: 2400000,
      volume24h: 150000,
      activeOrders: 1247,
      totalUsers: 3456,
    })
  } catch (error) {
    console.error("Failed to load protocol data:", error)
  }
}

// Update protocol statistics
function updateProtocolStats(stats) {
  const elements = {
    protocolTVL: document.getElementById("protocolTVL"),
    protocol24hVolume: document.getElementById("protocol24hVolume"),
    protocolActiveOrders: document.getElementById("protocolActiveOrders"),
    protocolUsers: document.getElementById("protocolUsers"),
  }

  if (elements.protocolTVL) {
    elements.protocolTVL.textContent = formatNumber(stats.tvl, "currency")
  }
  if (elements.protocol24hVolume) {
    elements.protocol24hVolume.textContent = formatNumber(stats.volume24h, "currency")
  }
  if (elements.protocolActiveOrders) {
    elements.protocolActiveOrders.textContent = formatNumber(stats.activeOrders)
  }
  if (elements.protocolUsers) {
    elements.protocolUsers.textContent = formatNumber(stats.totalUsers)
  }
}

// Load dashboard data
async function loadDashboardData() {
  try {
    updateDashboard(AppState)
  } catch (error) {
    console.error("Failed to load dashboard data:", error)
  }
}

// Load trade data
async function loadTradeData() {
  try {
    // Load available pools, prices, etc.
    console.log("Loading trade data...")
  } catch (error) {
    console.error("Failed to load trade data:", error)
  }
}

// Load orders data
async function loadOrdersData() {
  try {
    if (AppState.user.connected) {
      // Load user's orders
      console.log("Loading orders data...")
    }
  } catch (error) {
    console.error("Failed to load orders data:", error)
  }
}

// Load DCA data
async function loadDCAData() {
  try {
    if (AppState.user.connected) {
      // Load user's DCA strategies
      console.log("Loading DCA data...")
    }
  } catch (error) {
    console.error("Failed to load DCA data:", error)
  }
}

// Load yield farming data
async function loadYieldData() {
  try {
    // Load yield pools and user positions
    console.log("Loading yield data...")
    loadYieldPools()
  } catch (error) {
    console.error("Failed to load yield data:", error)
  }
}

// Load yield pools
function loadYieldPools() {
  const yieldPoolsGrid = document.getElementById("yieldPoolsGrid")
  if (!yieldPoolsGrid) return

  // Mock yield pools
  const mockPools = [
    {
      id: 1,
      tokenA: "MAS",
      tokenB: "USDC",
      apr: 45.2,
      tvl: 125000,
      rewards: "MAS",
      userStaked: 0,
    },
    {
      id: 2,
      tokenA: "WETH",
      tokenB: "USDC",
      apr: 32.8,
      tvl: 89000,
      rewards: "WETH",
      userStaked: 0,
    },
    {
      id: 3,
      tokenA: "DAI",
      tokenB: "USDC",
      apr: 18.5,
      tvl: 67000,
      rewards: "DAI",
      userStaked: 0,
    },
  ]

  yieldPoolsGrid.innerHTML = mockPools
    .map(
      (pool) => `
        <div class="yield-pool-card">
            <div class="pool-header">
                <div class="pool-pair">
                    <div class="pool-tokens">${pool.tokenA}/${pool.tokenB}</div>
                </div>
                <div class="pool-apr">${pool.apr}% APR</div>
            </div>
            <div class="pool-stats">
                <div class="stat-item">
                    <span class="stat-label">TVL</span>
                    <span class="stat-value">${formatNumber(pool.tvl, "currency")}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Rewards</span>
                    <span class="stat-value">${pool.rewards}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Your Stake</span>
                    <span class="stat-value">${formatNumber(pool.userStaked, "currency")}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Earned</span>
                    <span class="stat-value">$0.00</span>
                </div>
            </div>
            <div class="pool-actions">
                <button class="stake-btn" onclick="openStakeModal(${pool.id})">
                    <span>Stake</span>
                </button>
                <button class="unstake-btn" onclick="openUnstakeModal(${pool.id})">
                    <span>Unstake</span>
                </button>
            </div>
        </div>
    `,
    )
    .join("")
}

// Load portfolio data
async function loadPortfolioData() {
  try {
    if (AppState.user.connected) {
      updatePortfolioDisplay()
    }
  } catch (error) {
    console.error("Failed to load portfolio data:", error)
  }
}

// Update portfolio display
function updatePortfolioDisplay() {
  const portfolioTotalValue = document.getElementById("portfolioTotalValue")
  const assetsTableBody = document.getElementById("assetsTableBody")

  if (portfolioTotalValue) {
    portfolioTotalValue.textContent = formatNumber(AppState.portfolio.totalValue, "currency")
  }

  if (assetsTableBody && AppState.portfolio.assets.length > 0) {
    assetsTableBody.innerHTML = AppState.portfolio.assets
      .map(
        (asset) => `
            <tr>
                <td>
                    <div class="asset-info">
                        <div class="asset-icon">${asset.symbol.charAt(0)}</div>
                        <div>
                            <div class="asset-name">${asset.symbol}</div>
                            <div class="asset-balance">${formatNumber(asset.balance, "decimal")}</div>
                        </div>
                    </div>
                </td>
                <td class="font-mono">${formatNumber(asset.balance, "decimal")}</td>
                <td class="font-mono">${formatNumber(asset.value, "currency")}</td>
                <td class="font-mono ${asset.change >= 0 ? "positive" : "negative"}">
                    ${asset.change >= 0 ? "+" : ""}${asset.change.toFixed(2)}%
                </td>
                <td>
                    <button class="secondary-btn" onclick="openTradeModal('${asset.symbol}')">
                        Trade
                    </button>
                </td>
            </tr>
        `,
      )
      .join("")
  }
}

// Load analytics data
async function loadAnalyticsData() {
  try {
    // Load analytics charts and data
    console.log("Loading analytics data...")
    initializeCharts()
  } catch (error) {
    console.error("Failed to load analytics data:", error)
  }
}

// Initialize charts
function initializeCharts() {
  // This would initialize actual charts using a library like Chart.js
  // For now, we'll just show placeholders
  const chartContainers = document.querySelectorAll(".chart-container canvas")
  chartContainers.forEach((canvas) => {
    const ctx = canvas.getContext("2d")
    ctx.fillStyle = "#1A1D29"
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = "#00D2FF"
    ctx.font = "16px Inter"
    ctx.textAlign = "center"
    ctx.fillText("Chart Coming Soon", canvas.width / 2, canvas.height / 2)
  })
}

// Set up form listeners
function setupFormListeners() {
  // Swap form
  const swapBtn = document.getElementById("swapBtn")
  if (swapBtn) {
    swapBtn.addEventListener("click", handleSwap)
  }

  // Order form
  const orderForm = document.getElementById("orderForm")
  if (orderForm) {
    orderForm.addEventListener("submit", handleCreateOrder)
  }

  // DCA form
  const dcaForm = document.getElementById("dcaForm")
  if (dcaForm) {
    dcaForm.addEventListener("submit", handleCreateDCA)
  }

  // Amount inputs
  const amountInputs = document.querySelectorAll(".amount-input")
  amountInputs.forEach((input) => {
    input.addEventListener("input", debounce(handleAmountChange, 300))
  })
}
// ...existing code...

// Handle swap
async function handleSwap() {
    if (!AppState.user.connected) {
        await handleWalletConnection();
        return;
    }

    try {
        showLoading(true);

        // Get form values
        const fromAmount = document.getElementById('fromAmount')?.value;
        const fromToken = document.getElementById('fromTokenSelect')?.dataset.address;
        const toToken = document.getElementById('toTokenSelect')?.dataset.address;
        const slippage = document.getElementById('currentSlippage')?.textContent?.replace('%', '') || "0.5";
        const deadline = Date.now() + 60 * 60 * 1000; // 1 hour from now

        if (!fromAmount || !fromToken || !toToken) {
            showError("Please fill in all swap fields.");
            showLoading(false);
            return;
        }

        // Call contract swap
        const amountIn = parseFloat(fromAmount);
        const amountOutMin = amountIn * (1 - parseFloat(slippage) / 100); // Simple slippage calc

        // You may want to use parseTokenAmount for decimals
        const { AMMContract } = await import("./contract.js");
        await AMMContract.swap(fromToken, toToken, amountIn, amountOutMin, deadline);

        showSuccess("Swap submitted!");
        // Optionally refresh balances
        await loadUserData();
        await loadDashboardData();
    } catch (error) {
        console.error("Swap failed:", error);
        showError("Swap failed. Please try again.");
    } finally {
        showLoading(false);
    }
}

// Utility to show error messages
function showError(message) {
    const errorElement = document.getElementById("errorMessage");
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.classList.add("visible");
        setTimeout(() => {
            errorElement.classList.remove("visible");
        }, 5000);
    }
    console.error(message);
}

// Utility to show success messages
function showSuccess(message) {
    const successElement = document.createElement("div");
    successElement.className = "success-message visible";
    successElement.textContent = message;
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
    `;
    document.body.appendChild(successElement);

    setTimeout(() => {
        successElement.remove();
    }, 3000);
}

// App initializer
window.addEventListener("DOMContentLoaded", () => {
    initializeApp();
});

// Expose section switch for HTML onclicks
window.switchSection = switchToSection;

// Expose refreshDashboard for HTML refresh button
window.refreshDashboard = async function () {
    await loadDashboardData();
    showSuccess("Dashboard refreshed!");
};

// Expose trade modal openers for HTML
window.openTradeModal = function (symbol) {
    // Implementation for opening trade modal for asset
    showSuccess(`Trade modal opened for ${symbol}`);
};

// Expose stake/unstake modal openers for yield pools
window.openStakeModal = function (poolId) {
    showSuccess(`Stake modal opened for pool ${poolId}`);
};
window.openUnstakeModal = function (poolId) {
    showSuccess(`Unstake modal opened for pool ${poolId}`);
};

// ...existing

// Handle order form submission
async function handleCreateOrder(event) {
    event.preventDefault();

    if (!AppState.user.connected) {
        await handleWalletConnection();
        return;
    }

    try {
        showLoading(true);

        // Get form values
        const tokenIn = document.getElementById("orderTokenIn")?.dataset.address;
        const tokenOut = document.getElementById("orderTokenOut")?.dataset.address;
        const amountIn = parseFloat(document.getElementById("orderAmountIn")?.value || "0");
        const minAmountOut = parseFloat(document.getElementById("orderMinAmountOut")?.value || "0");
        const expiry = Date.now() + 24 * 60 * 60 * 1000; // 24h expiry
        const orderType = document.getElementById("orderType")?.value || "LIMIT";
        const partialFill = document.getElementById("orderPartialFill")?.checked || false;
        const slippageTolerance = parseFloat(document.getElementById("orderSlippage")?.value || "0.5") * 100;

        if (!tokenIn || !tokenOut || !amountIn || !minAmountOut) {
            showError("Please fill in all order fields.");
            showLoading(false);
            return;
        }

        // Call contract to create order
        const { AdvancedContract } = await import("./contract.js");
        await AdvancedContract.createLimitOrder(
            tokenIn,
            tokenOut,
            amountIn,
            minAmountOut,
            expiry,
            orderType,
            partialFill,
            slippageTolerance
        );

        showSuccess("Order created!");
        await loadOrdersData();
    } catch (error) {
        console.error("Order creation failed:", error);
        showError("Order creation failed. Please try again.");
    } finally {
        showLoading(false);
    }
}

// Handle DCA form submission
async function handleCreateDCA(event) {
    event.preventDefault();

    if (!AppState.user.connected) {
        await handleWalletConnection();
        return;
    }

    try {
        showLoading(true);

        // Get form values
        const tokenIn = document.getElementById("dcaTokenIn")?.dataset.address;
        const tokenOut = document.getElementById("dcaTokenOut")?.dataset.address;
        const amountPerPeriod = parseFloat(document.getElementById("dcaAmountPerPeriod")?.value || "0");
        const intervalPeriods = parseInt(document.getElementById("dcaInterval")?.value || "3600");
        const totalPeriods = parseInt(document.getElementById("dcaTotalPeriods")?.value || "1");
        const minAmountOut = parseFloat(document.getElementById("dcaMinAmountOut")?.value || "0");
        const maxSlippage = parseFloat(document.getElementById("dcaSlippage")?.value || "0.5") * 100;
        const stopLoss = parseFloat(document.getElementById("dcaStopLoss")?.value || "0") * 100;
        const takeProfit = parseFloat(document.getElementById("dcaTakeProfit")?.value || "0") * 100;

        if (!tokenIn || !tokenOut || !amountPerPeriod || !intervalPeriods || !totalPeriods) {
            showError("Please fill in all DCA fields.");
            showLoading(false);
            return;
        }

        // Call contract to create DCA strategy
        const { AdvancedContract } = await import("./contract.js");
        await AdvancedContract.createDCAStrategy(
            tokenIn,
            tokenOut,
            amountPerPeriod,
            intervalPeriods,
            totalPeriods,
            minAmountOut,
            maxSlippage,
            stopLoss,
            takeProfit
        );

        showSuccess("DCA strategy created!");
        await loadDCAData();
    } catch (error) {
        console.error("DCA creation failed:", error);
        showError("DCA creation failed. Please try again.");
    } finally {
        showLoading(false);
    }
}

// Handle amount input changes (for swap, order, DCA forms)
function handleAmountChange(event) {
    const input = event.target;
    const value = parseFloat(input.value || "0");
    const preview = input.closest(".form-group")?.querySelector(".amount-preview");

    if (preview) {
        preview.textContent = value > 0 ? `≈ $${(value * getCurrentPrice(input)).toFixed(2)}` : "";
    }
}

window.refreshYieldPools = async function () {
    await loadYieldData();
    showSuccess("Yield pools refreshed!");
};

window.openTokenSelectModal = function (targetInputId) {
    const modal = document.getElementById("tokenSelectModal");
    modal.classList.add("visible");
    modal.dataset.targetInput = targetInputId;
    // Populate token list here
};

window.closeTokenSelectModal = function () {
    const modal = document.getElementById("tokenSelectModal");
    modal.classList.remove("visible");
};

window.setMaxAmount = function () {
    // Example: set max balance for swap input
    const input = document.getElementById("fromAmount");
    const balance = parseFloat(document.getElementById("fromTokenBalance")?.textContent || "0");
    if (input) input.value = balance;
    handleAmountChange({ target: input });
};

window.setOrderMaxAmount = function () {
    const input = document.getElementById("orderAmountIn");
    const balance = parseFloat(document.getElementById("orderTokenInBalance")?.textContent || "0");
    if (input) input.value = balance;
    handleAmountChange({ target: input });
};

window.swapTokens = function () {
    // Swap selected tokens in the swap form
    const fromSelect = document.getElementById("fromTokenSelect");
    const toSelect = document.getElementById("toTokenSelect");
    if (fromSelect && toSelect) {
        const temp = fromSelect.dataset.address;
        fromSelect.dataset.address = toSelect.dataset.address;
        toSelect.dataset.address = temp;
        // Optionally update UI
    }
};

window.exportPortfolio = function () {
    // Implement CSV or JSON export
    showSuccess("Portfolio exported!");
};
window.toggleHideSmallBalances = function () {
    // Implement filtering logic
    showSuccess("Small balances toggled!");
};

window.toggleAdvancedSettings = function () {
    const settings = document.getElementById("dcaAdvancedSettings");
    if (settings) settings.classList.toggle("hidden");
};

window.openTradeSettings = function () {
    showSuccess("Trade settings opened!");
};

window.openCreateOrderModal = function () {
    showSuccess("Order modal opened!");
};

window.openCreateDCAModal = function () {
    showSuccess("DCA modal opened!");
};


// Handle window resize event
function handleResize() {
    // Responsive layout adjustments
    try {
        // Example: Redraw charts, adjust grid layouts, recalculate element sizes
        initializeCharts();
        // Optionally update dashboard or other UI elements
        updateDashboard(AppState);
        // Log for debugging
        console.log("Window resized and UI updated.");
    } catch (error) {
        console.error("Error during resize handling:", error);
    }
}

// Handle beforeunload event (cleanup, save state, etc.)
function handleBeforeUnload(event) {
    try {
        // Save critical app state to localStorage/sessionStorage if needed
        localStorage.setItem("AppState", JSON.stringify(AppState));
        // Optionally prompt user before leaving (uncomment below for prompt)
        // event.preventDefault();
        // event.returnValue = "";
        console.log("App state saved before unload.");
    } catch (error) {
        console.error("Error during beforeunload handling:", error);
    }
}

// // Robust error notification
// function showError(message) {
//     try {
//         const errorElement = document.getElementById("errorMessage");
//         if (errorElement) {
//             errorElement.textContent = message;
//             errorElement.classList.add("visible");
//             setTimeout(() => {
//                 errorElement.classList.remove("visible");
//             }, 5000);
//         } else {
//             alert(message);
//         }
//         console.error(message);
//     } catch (error) {
//         alert(message);
//         console.error("Error in showError:", error);
//     }
// }

// // Robust success notification
// function showSuccess(message) {
//     try {
//         const successElement = document.createElement("div");
//         successElement.className = "success-message visible";
//         successElement.textContent = message;
//         successElement.style.cssText = `
//             position: fixed;
//             top: 24px;
//             right: 24px;
//             background: var(--success-green, #28a745);
//             color: white;
//             padding: 16px 24px;
//             border-radius: 12px;
//             box-shadow: var(--shadow-lg, 0 4px 24px rgba(0,0,0,0.15));
//             z-index: 1070;
//             max-width: 400px;
//             font-weight: 500;
//         `;
//         document.body.appendChild(successElement);

//         setTimeout(() => {
//             successElement.remove();
//         }, 3000);
//     } catch (error) {
//         alert(message);
//         console.error("Error in showSuccess:", error);
//     }
// }

// Robust token select modal open/close
window.openTokenSelectModal = function (targetInputId) {
    try {
        const modal = document.getElementById("tokenSelectModal");
        if (!modal) throw new Error("Token select modal not found.");
        modal.classList.add("visible");
        modal.dataset.targetInput = targetInputId;
        // TODO: Populate token list dynamically if needed
    } catch (error) {
        showError("Failed to open token select modal.");
        console.error(error);
    }
};

window.closeTokenSelectModal = function () {
    try {
        const modal = document.getElementById("tokenSelectModal");
        if (!modal) throw new Error("Token select modal not found.");
        modal.classList.remove("visible");
    } catch (error) {
        showError("Failed to close token select modal.");
        console.error(error);
    }
};

// Robust set max amount for swap/order
window.setMaxAmount = function () {
    try {
        const input = document.getElementById("fromAmount");
        const balance = parseFloat(document.getElementById("fromTokenBalance")?.textContent || "0");
        if (input) {
            input.value = balance;
            handleAmountChange({ target: input });
        } else {
            showError("Swap amount input not found.");
        }
    } catch (error) {
        showError("Failed to set max amount.");
        console.error(error);
    }
};

window.setOrderMaxAmount = function () {
    try {
        const input = document.getElementById("orderAmountIn");
        const balance = parseFloat(document.getElementById("orderTokenInBalance")?.textContent || "0");
        if (input) {
            input.value = balance;
            handleAmountChange({ target: input });
        } else {
            showError("Order amount input not found.");
        }
    } catch (error) {
        showError("Failed to set order max amount.");
        console.error(error);
    }
};

// Robust swap tokens in swap form
window.swapTokens = function () {
    try {
        const fromSelect = document.getElementById("fromTokenSelect");
        const toSelect = document.getElementById("toTokenSelect");
        if (fromSelect && toSelect) {
            const temp = fromSelect.dataset.address;
            fromSelect.dataset.address = toSelect.dataset.address;
            toSelect.dataset.address = temp;
            // Optionally update UI
            handleAmountChange({ target: fromSelect });
            handleAmountChange({ target: toSelect });
        } else {
            showError("Token select elements not found.");
        }
    } catch (error) {
        showError("Failed to swap tokens.");
        console.error(error);
    }
};

// Robust portfolio export
window.exportPortfolio = function () {
    try {
        const dataStr = JSON.stringify(AppState.portfolio, null, 2);
        const blob = new Blob([dataStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "portfolio.json";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        showSuccess("Portfolio exported!");
    } catch (error) {
        showError("Failed to export portfolio.");
        console.error(error);
    }
};

// Robust toggle hide small balances
window.toggleHideSmallBalances = function () {
    try {
        // Example: filter assets with value < $1
        const assetsTableBody = document.getElementById("assetsTableBody");
        if (!assetsTableBody) throw new Error("Assets table not found.");
        const showSmall = assetsTableBody.dataset.showSmall === "true";
        assetsTableBody.dataset.showSmall = (!showSmall).toString();
        // Re-render assets table with/without small balances
        updatePortfolioDisplay();
        showSuccess("Small balances toggled!");
    } catch (error) {
        showError("Failed to toggle small balances.");
        console.error(error);
    }
};

// Robust advanced settings toggle (DCA)
window.toggleAdvancedSettings = function () {
    try {
        const settings = document.getElementById("dcaAdvancedSettings");
        if (settings) {
            settings.classList.toggle("hidden");
        } else {
            showError("Advanced settings section not found.");
        }
    } catch (error) {
        showError("Failed to toggle advanced settings.");
        console.error(error);
    }
};

// Robust trade settings modal
window.openTradeSettings = function () {
    try {
        showSuccess("Trade settings opened!");
        // TODO: Implement modal logic if needed
    } catch (error) {
        showError("Failed to open trade settings.");
        console.error(error);
    }
};

// Robust order modal
window.openCreateOrderModal = function () {
    try {
        showSuccess("Order modal opened!");
        // TODO: Implement modal logic if needed
    } catch (error) {
        showError("Failed to open order modal.");
        console.error(error);
    }
};

// Robust DCA modal
window.openCreateDCAModal = function () {
    try {
        showSuccess("DCA modal opened!");
        // TODO: Implement modal logic if needed
    } catch (error) {
        showError("Failed to open DCA modal.");
        console.error(error);
    }
}

// Utility to get current price for a token (mock/demo)
function getCurrentPrice(input) {
    try {
        // You can implement actual price lookup here
        // For now, return 1 for demo
        return 1;
    } catch (error) {
        console.error("Error getting current price:", error);
        return 1;
    }
}

// Attach robust event listeners
window.addEventListener("resize", debounce(handleResize, 250));
window.addEventListener("beforeunload", handleBeforeUnload);


let periodicUpdateInterval = null;

function startPeriodicUpdates() {
    // Clear any existing interval to avoid duplicates
    if (periodicUpdateInterval) {
        clearInterval(periodicUpdateInterval);
    }

    // Define update frequency (e.g., every 30 seconds)
    const UPDATE_INTERVAL_MS = 30000;

    // Periodic update function
    async function periodicUpdate() {
        try {
            // Refresh protocol stats
            await loadProtocolData();
            // Refresh dashboard if user is on dashboard
            if (AppState.currentSection === "dashboard") {
                await loadDashboardData();
            }
            // Optionally refresh user data if wallet is connected
            if (AppState.user.connected) {
                await loadUserData();
            }
            // Optionally refresh yield pools
            if (AppState.currentSection === "yield") {
                await loadYieldData();
            }
            // Optionally refresh analytics
            if (AppState.currentSection === "analytics") {
                await loadAnalyticsData();
            }
            // Log for debugging
            console.log("Periodic update completed.");
        } catch (error) {
            console.error("Periodic update failed:", error);
        }
    }

    // Start interval
    periodicUpdateInterval = setInterval(periodicUpdate, UPDATE_INTERVAL_MS);

    // Run once immediately on start
    periodicUpdate().catch((error) => {
        console.error("Initial periodic update failed:", error);
    });
}


// Load liquidity management data (your pools, all pools, etc.)
async function loadLiquityData() {
    try {
        showLoading(true);

        // Fetch user's pools (mock/demo)
        const userPoolsList = document.getElementById("userPoolsList");
        if (userPoolsList) {
            // Example mock data
            const userPools = [
                { id: 1, pair: "MAS/USDC", liquidity: 12000, rewards: "MAS", apr: 45.2 },
                { id: 2, pair: "WETH/USDC", liquidity: 8000, rewards: "WETH", apr: 32.8 },
            ];
            if (userPools.length === 0) {
                userPoolsList.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-icon">💧</div>
                        <p>No liquidity positions found</p>
                        <button class="secondary-btn" onclick="openCreatePoolModal()">Add Liquidity</button>
                    </div>
                `;
            } else {
                userPoolsList.innerHTML = userPools.map(pool => `
                    <div class="pool-row">
                        <div class="pool-pair">${pool.pair}</div>
                        <div class="pool-liquidity">Liquidity: $${pool.liquidity.toLocaleString()}</div>
                        <div class="pool-apr">APR: ${pool.apr}%</div>
                        <div class="pool-rewards">Rewards: ${pool.rewards}</div>
                        <button class="secondary-btn" onclick="openStakeModal(${pool.id})">Stake</button>
                        <button class="secondary-btn" onclick="openUnstakeModal(${pool.id})">Unstake</button>
                    </div>
                `).join("");
            }
        }

        // Fetch all pools (mock/demo)
        const allPoolsList = document.getElementById("allPoolsList");
        if (allPoolsList) {
            const allPools = [
                { pair: "MAS/USDC", liquidity: 125000, apr: 45.2 },
                { pair: "WETH/USDC", liquidity: 89000, apr: 32.8 },
                { pair: "DAI/USDC", liquidity: 67000, apr: 18.5 },
            ];
            if (allPools.length === 0) {
                allPoolsList.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-icon">🏊</div>
                        <p>No pools available</p>
                    </div>
                `;
            } else {
                allPoolsList.innerHTML = allPools.map(pool => `
                    <div class="pool-row">
                        <div class="pool-pair">${pool.pair}</div>
                        <div class="pool-liquidity">Liquidity: $${pool.liquidity.toLocaleString()}</div>
                        <div class="pool-apr">APR: ${pool.apr}%</div>
                        <button class="primary-btn" onclick="openCreatePoolModal()">Add Liquidity</button>
                    </div>
                `).join("");
            }
        }

        // Update pool stats
        const activePoolCount = document.getElementById("activePoolCount");
        const totalLiquidityProvided = document.getElementById("totalLiquidityProvided");
        if (activePoolCount) activePoolCount.textContent = "2"; // mock
        if (totalLiquidityProvided) totalLiquidityProvided.textContent = "$20,000"; // mock

        showSuccess("Liquidity data loaded!");
    } catch (error) {
        showError("Failed to load liquidity data.");
        console.error(error);
    } finally {
        showLoading(false);
    }
}

// Load create pool section data (populate token dropdowns, etc.)
async function loadcreatePoolData() {
    try {
        showLoading(true);

        console.log("loading create pool")

        // Populate token dropdowns (mock/demo)
        const tokens = getTokens()
        const tokenASelect = document.getElementById("createPoolTokenA");
        const tokenBSelect = document.getElementById("createPoolTokenB");
        if (tokenASelect) {
            
              // Populate tokenASelect with token options (handle async symbols)
              Promise.all(tokens.map(async t => {
                const symbol = await t.symbol();
                return `<option value="${t.address}">${symbol}</option>`;
              })).then(options => {
                tokenASelect.innerHTML = `<option value="">Select Token</option>` + options.join("");
              });
              
        }
        if (tokenBSelect) {
           Promise.all(tokens.map(async t => {
                const symbol = await t.symbol();
                return `<option value="${t.address}">${symbol}</option>`;
              })).then(options => {
                tokenBSelect.innerHTML = `<option value="">Select Token</option>` + options.join("");
              });
        }

        // Reset balances and summary
        document.getElementById("createPoolTokenABalance").textContent = (await getTokenByAddress(document.getElementById("createPoolTokenA").value)?.balanceOf(getProvider().address))?.toString() || "0";
        document.getElementById("createPoolTokenBBalance").textContent = "0";
        document.getElementById("createPoolPair").textContent = "-";
        document.getElementById("createPoolInitialPrice").textContent = "-";
        document.getElementById("createPoolFee").textContent = "~0.001 MAS";

        tokenASelect.addEventListener("change", async (e)=>{
                document.getElementById("createPoolTokenABalance").textContent = (await getTokenByAddress(document.getElementById("createPoolTokenA").value)?.balanceOf(getProvider().address))?.toString() || "0";
        })

        tokenBSelect.addEventListener("change", async (e)=>{
                document.getElementById("createPoolTokenBBalance").textContent = (await getTokenByAddress(document.getElementById("createPoolTokenB").value)?.balanceOf(getProvider().address))?.toString() || "0";
        })


       

        // Attach event listeners for UI interactivity
        const amountAInput = document.getElementById("createPoolAmountA");
        const amountBInput = document.getElementById("createPoolAmountB");
        const feeTierSelect = document.getElementById("createPoolFeeTier");
        if (amountAInput && amountBInput && feeTierSelect) {
            amountAInput.addEventListener("input", updateCreatePoolSummary);
            amountBInput.addEventListener("input", updateCreatePoolSummary);
            feeTierSelect.addEventListener("change", updateCreatePoolSummary);
        }


         document.getElementById("createPoolForm").addEventListener("submit", async (e)=>{
          e.preventDefault()

          AMMContract.createPool(
            tokenASelect.value,
            tokenBSelect.value,
            amountAInput.value,
            amountBInput.value,
            "100"
          )
          
        })

        showSuccess("Create Pool UI ready!");
    } catch (error) {
        showError("Failed to load create pool data.");
        console.error(error);
    } finally {
        showLoading(false);
    }
}

// Helper to update create pool summary UI
function updateCreatePoolSummary() {
    const tokenA = document.getElementById("createPoolTokenA")?.value || "-";
    const tokenB = document.getElementById("createPoolTokenB")?.value || "-";
    const amountA = parseFloat(document.getElementById("createPoolAmountA")?.value || "0");
    const amountB = parseFloat(document.getElementById("createPoolAmountB")?.value || "0");
    const feeTier = document.getElementById("createPoolFeeTier")?.value || "-";

    document.getElementById("createPoolPair").textContent = `${tokenA.slice(0,4)}/${tokenB.slice(0,4)}`;
    document.getElementById("createPoolInitialPrice").textContent =
        amountB > 0 ? (amountA / amountB).toFixed(4) : "-";
    document.getElementById("createPoolFee").textContent = `~0.001 MAS (${feeTier}%)`;
}

window.openCreatePoolModal = function () {
    // Switch to the createPool section and load its data
    switchToSection("createPool");
    loadcreatePoolData()
      .then(()=> console.log("done"))
      .catch((e)=> console.log(e))
    showSuccess("Create Pool section opened!");
};


