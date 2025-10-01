import { AppState } from "./state.js";
import { showLoading, showError, showSuccess, switchToSection, updateWalletUI, updateProtocolStats, initializeUI, showUserMenu, initializeCharts, updateDashboard } from "./ui.js";
import { debounce } from "./utils.js";
import { connectWallet, getUserAddress } from "./wallet.js";
import { getTokens } from "./services/token-service.js";
import { getProtocolStats } from "./amm-contract.js";
import { loadDashboardData } from "./features/dashboard.js";
import { loadTradeData, setupTradeEventListeners } from "./features/trade.js";
import { loadOrdersData, setupOrdersEventListeners } from "./features/orders.js";
import { loadDCAData, setupDCAEventListeners } from "./features/dca.js";
import { loadYieldData } from "./features/yield.js";
import { loadPortfolioData } from "./features/portfolio.js";
import { loadAnalyticsData } from "./features/analytics.js";
import { loadLiquityData, loadCreatePoolData, setupLiquidityEventListeners } from "./features/liquidity.js";
import { initializeContracts } from "./contract.js";
// Import global handlers for inline onclick events
import "./global-handlers.js";

// Initialize application
async function initializeApp() {
  try {
    showLoading(true);
    console.log("Initializing application...");

    // Initialize UI components
    initializeUI();
    console.log("UI initialized");

    // Set up event listeners
    setupEventListeners();
    console.log("Event listeners set up");

    // Try to connect wallet automatically
    const connected = await initializeContracts();
    if (connected) {
      AppState.user.connected = true;
      AppState.user.address = getUserAddress();
      await loadUserData();
      console.log("Wallet connected:", AppState.user.address);
    }

    // Load initial data
    await loadProtocolData();
    console.log("Protocol data loaded");

    // Start periodic updates
    startPeriodicUpdates();
    console.log("Periodic updates started");

    showLoading(false);
  } catch (error) {
    console.error("Failed to initialize app:", error);
    showError("Failed to initialize application");
    showLoading(false);
  }
}

// Set up event listeners
function setupEventListeners() {
  // Navigation
  const navItems = document.querySelectorAll(".nav-item");
  navItems.forEach((item) => {
    item.addEventListener("click", (e) => {
      const section = e.currentTarget.dataset.section;
      if (section) {
        switchToSection(section);
        loadSectionData(section);
      }
    });
  });

  // Wallet connection
  const walletBtn = document.getElementById("walletBtn");
  if (walletBtn) {
    walletBtn.addEventListener("click", handleWalletConnection);
  }

  // Form submissions
  setupTradeEventListeners();
  setupOrdersEventListeners();
  setupDCAEventListeners();
  setupLiquidityEventListeners();

  // Window events
  window.addEventListener("resize", debounce(handleResize, 250));
  window.addEventListener("beforeunload", handleBeforeUnload);
}

// Handle wallet connection
export async function handleWalletConnection() {
  if (AppState.user.connected) {
    // Already connected, show user menu or disconnect
    showUserMenu();
  } else {
    try {
      showLoading(true);
      const provider = await connectWallet();
      if (provider) {
        AppState.user.connected = true;
        AppState.user.address = getUserAddress();
        await loadUserData();
        updateWalletUI();
      }
    } catch (error) {
      console.error("Wallet connection failed:", error);
    } finally {
      showLoading(false);
    }
  }
}

// Load section-specific data
async function loadSectionData(sectionName) {
  try {
    switch (sectionName) {
      case "dashboard":
        await loadDashboardData();
        break;
      case "trade":
        await loadTradeData();
        break;
      case "orders":
        await loadOrdersData();
        break;
      case "dca":
        await loadDCAData();
        break;
      case "yield":
        await loadYieldData();
        break;
      case "portfolio":
        await loadPortfolioData();
        break;
      case "analytics":
        await loadAnalyticsData();
        break;
      case "liquidity":
        await loadLiquityData();
        break;
      case "createPool":
        await loadCreatePoolData();
        break;
    }
  } catch (error) {
    console.error(`Failed to load ${sectionName} data:`, error);
  }
}

// Load user-specific data
async function loadUserData() {
  if (!AppState.user.connected) return;

  try {
    console.log("Loading user data...");

    const tokens = await getTokens();

    AppState.portfolio.assets = await Promise.all(tokens.map(async (token) => {
      const balance = await token.contract.balanceOf(AppState.user.address);
      const decimals = await token.decimals();
      const symbol = await token.symbol();

      // Convert u256 balance to human-readable format
      // balance is u256, decimals is typically 8 or 18
      const balanceFormatted = Number(balance.toString()) / (10 ** Number(decimals));

      return {
        symbol: symbol,
        balance: balanceFormatted,
        decimals: Number(decimals),
        value: 0, // TODO: Implement price feed for USD value
        change: 0, // TODO: Implement price history for 24h change
      };
    }));

  } catch (error) {
    console.error("Failed to load user data:", error);
  }
}

// Load protocol data
async function loadProtocolData() {
  try {
    console.log("Loading protocol data...");
    const { tvl, poolCount } = await getProtocolStats();
    updateProtocolStats({
      tvl: Number(tvl),
      volume24h: 150000, // mock
      activeOrders: 1247, // mock
      totalUsers: 3456, // mock
      poolCount
    });
  } catch (error) {
    console.error("Failed to load protocol data:", error);
  }
}

let periodicUpdateInterval = null;

function startPeriodicUpdates() {
    if (periodicUpdateInterval) {
        clearInterval(periodicUpdateInterval);
    }

    const UPDATE_INTERVAL_MS = 30000;

    async function periodicUpdate() {
        try {
            await loadProtocolData();
            if (AppState.currentSection === "dashboard") {
                await loadDashboardData();
            }
            if (AppState.user.connected) {
                await loadUserData();
            }
            if (AppState.currentSection === "yield") {
                await loadYieldData();
            }
            if (AppState.currentSection === "analytics") {
                await loadAnalyticsData();
            }
            console.log("Periodic update completed.");
        } catch (error) {
            console.error("Periodic update failed:", error);
        }
    }

    periodicUpdateInterval = setInterval(periodicUpdate, UPDATE_INTERVAL_MS);

    periodicUpdate().catch((error) => {
        console.error("Initial periodic update failed:", error);
    });
}

function handleResize() {
    try {
        initializeCharts();
        updateDashboard(AppState);
        console.log("Window resized and UI updated.");
    } catch (error) {
        console.error("Error during resize handling:", error);
    }
}

function handleBeforeUnload(event) {
    try {
        localStorage.setItem("AppState", JSON.stringify(AppState));
        console.log("App state saved before unload.");
    } catch (error) {
        console.error("Error during beforeunload handling:", error);
    }
}

// App initializer
window.addEventListener("DOMContentLoaded", () => {
    initializeApp();
});
