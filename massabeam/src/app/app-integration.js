/**
 * App Integration Module
 *
 * Main application initialization and integration script
 * Connects UI components with contract interactions and state management
 */

import { initProvider, getUserAddress, connectWallet } from './main.js';
import { showSuccess, showError, loadingOverlay } from './ui.js';
import { getAllTokens, populateTokenSelects, tokenService } from './token-service.js';
import { AMMContract, getProtocolStats } from './main.js';
import { callContract, readContract } from './contract-helpers.js';

// ============================================================================
// APP STATE
// ============================================================================

export const AppState = {
  isConnected: false,
  userAddress: null,
  selectedTokens: {
    swap: { from: null, to: null },
    liquidity: { tokenA: null, tokenB: null },
  },
  protocols: {
    stats: null,
    poolCount: 0,
    tvl: 0,
  },
  lastUpdate: null,
};

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the application
 */
export async function initializeApp() {
  try {
    console.log('Initializing MassaBeam application...');
    loadingOverlay.show('Initializing application...');

    // Step 1: Initialize wallet
    console.log('Step 1: Initializing wallet...');
    const provider = await initProvider();
    if (!provider) {
      throw new Error('Failed to initialize wallet provider');
    }

    AppState.isConnected = true;
    AppState.userAddress = getUserAddress();

    console.log('✓ Wallet initialized:', AppState.userAddress);

    // Step 2: Load token data
    console.log('Step 2: Loading token data...');
    const tokens = getAllTokens();
    console.log('✓ Loaded tokens:', tokens.length);

    // Step 3: Populate UI selects
    console.log('Step 3: Populating UI...');
    populateTokenSelects([
      'swapTokenIn',
      'swapTokenOut',
      'liquidityTokenA',
      'liquidityTokenB',
    ]);
    console.log('✓ UI populated');

    // Step 4: Load protocol stats
    console.log('Step 4: Loading protocol statistics...');
    await refreshProtocolStats();
    console.log('✓ Protocol stats loaded');

    // Step 5: Setup event listeners
    console.log('Step 5: Setting up event listeners...');
    setupEventListeners();
    console.log('✓ Event listeners configured');

    loadingOverlay.hide();
    showSuccess('Application initialized successfully!');

    console.log('✓ Application initialization complete');
    return true;
  } catch (error) {
    loadingOverlay.hide();
    showError(`Initialization failed: ${error.message}`);
    console.error('App initialization error:', error);
    return false;
  }
}

/**
 * Refresh protocol statistics
 */
export async function refreshProtocolStats() {
  try {
    const stats = await getProtocolStats();
    if (stats) {
      AppState.protocols.stats = stats;
      AppState.protocols.tvl = stats.tvl;
      AppState.protocols.poolCount = stats.poolCount;
      AppState.lastUpdate = new Date();

      updateProtocolStatsUI(stats);
    }
  } catch (error) {
    console.error('Failed to refresh protocol stats:', error);
  }
}

/**
 * Update protocol stats in UI
 */
function updateProtocolStatsUI(stats) {
  if (document.getElementById('protocolTVL')) {
    document.getElementById('protocolTVL').textContent = `$${(stats.tvl / 1e18).toFixed(2)}`;
  }
  if (document.getElementById('poolCount')) {
    document.getElementById('poolCount').textContent = stats.poolCount;
  }
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

/**
 * Setup all event listeners
 */
function setupEventListeners() {
  // Wallet connection
  const connectBtn = document.getElementById('walletBtn');
  if (connectBtn) {
    connectBtn.addEventListener('click', handleWalletConnection);
  }

  // Swap operations
  const executeSwapBtn = document.getElementById('swapBtn');
  if (executeSwapBtn) {
    executeSwapBtn.addEventListener('click', handleSwap);
  }

  // Token selection
  const swapTokenInSelect = document.getElementById('swapTokenIn');
  const swapTokenOutSelect = document.getElementById('swapTokenOut');
  if (swapTokenInSelect) swapTokenInSelect.addEventListener('change', onSwapTokenChanged);
  if (swapTokenOutSelect) swapTokenOutSelect.addEventListener('change', onSwapTokenChanged);

  // Swap amount input
  const fromAmountInput = document.getElementById('fromAmount');
  if (fromAmountInput) {
    fromAmountInput.addEventListener('input', handleSwapAmountChange);
  }

  // Liquidity operations
  const addLiquidityBtn = document.getElementById('addLiquidityBtn');
  if (addLiquidityBtn) {
    addLiquidityBtn.addEventListener('click', handleAddLiquidity);
  }

  // Pool creation
  const createPoolBtn = document.getElementById('createPoolBtn');
  if (createPoolBtn) {
    createPoolBtn.addEventListener('click', handleCreatePool);
  }

  // Refresh buttons
  const refreshBtn = document.querySelector('.refresh-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      loadingOverlay.show('Refreshing data...');
      setTimeout(async () => {
        await refreshProtocolStats();
        loadingOverlay.hide();
        showSuccess('Data refreshed!');
      }, 1000);
    });
  }
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

/**
 * Handle wallet connection
 */
async function handleWalletConnection() {
  try {
    loadingOverlay.show('Connecting wallet...');
    const provider = await connectWallet();
    if (provider) {
      loadingOverlay.hide();
      showSuccess('Wallet connected successfully!');
      updateWalletUI();
    }
  } catch (error) {
    loadingOverlay.hide();
    showError(`Connection failed: ${error.message}`);
  }
}

/**
 * Update wallet UI
 */
function updateWalletUI() {
  const userAddress = getUserAddress();
  if (userAddress) {
    const walletText = document.querySelector('.wallet-text');
    if (walletText) {
      walletText.textContent = `${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`;
    }
  }
}

/**
 * Handle swap token selection change
 */
async function onSwapTokenChanged() {
  const tokenIn = document.getElementById('swapTokenIn')?.value;
  const tokenOut = document.getElementById('swapTokenOut')?.value;

  if (tokenIn) {
    AppState.selectedTokens.swap.from = tokenIn;
    console.log('Selected token in:', tokenIn);
    updateTokenBalance('fromTokenBalance', tokenIn);
  }
  if (tokenOut) {
    AppState.selectedTokens.swap.to = tokenOut;
    updateTokenBalance('toTokenBalance', tokenOut);
  }

  // Recalculate quote if both tokens selected and amount entered
  const amount = document.getElementById('fromAmount')?.value;
  if (amount && tokenIn && tokenOut) {
    handleSwapAmountChange();
  }
}

/**
 * Handle swap amount change
 */
async function handleSwapAmountChange() {
  const amount = document.getElementById('fromAmount')?.value;
  const tokenIn = AppState.selectedTokens.swap.from;
  const tokenOut = AppState.selectedTokens.swap.to;

  if (!amount || !tokenIn || !tokenOut) return;

  try {
    // Get quote from contract
    // This would call your price calculation function
    // For now, show placeholder
    document.getElementById('toAmount').value = '';
    document.getElementById('swapRate').textContent = '-';
  } catch (error) {
    console.error('Quote calculation failed:', error);
  }
}

/**
 * Handle swap execution
 */
async function handleSwap() {
  try {
    const tokenIn = AppState.selectedTokens.swap.from;
    const tokenOut = AppState.selectedTokens.swap.to;
    const amount = document.getElementById('fromAmount')?.value;
    const minOut = document.getElementById('toAmount')?.value;

    if (!tokenIn || !tokenOut || !amount || !minOut) {
      showError('Please fill in all required fields');
      return;
    }

    loadingOverlay.show('Executing swap...');

    const deadline = Math.floor(Date.now() / 1000) + 300; // 5 minutes
    const result = await AMMContract.swap(tokenIn, tokenOut, amount, minOut, deadline);

    loadingOverlay.hide();
    showSuccess('Swap executed successfully!');

    // Clear form
    document.getElementById('fromAmount').value = '';
    document.getElementById('toAmount').value = '';

    // Refresh balances
    await onSwapTokenChanged();
  } catch (error) {
    loadingOverlay.hide();
    showError(`Swap failed: ${error.message}`);
  }
}

/**
 * Handle add liquidity
 */
async function handleAddLiquidity() {
  try {
    const tokenA = document.getElementById('liquidityTokenA')?.value;
    const tokenB = document.getElementById('liquidityTokenB')?.value;
    const amountA = document.getElementById('liquidityAmountA')?.value;
    const amountB = document.getElementById('liquidityAmountB')?.value;

    if (!tokenA || !tokenB || !amountA || !amountB) {
      showError('Please fill in all required fields');
      return;
    }

    loadingOverlay.show('Adding liquidity...');

    const deadline = Math.floor(Date.now() / 1000) + 300;
    const minA = Number(amountA) * 0.99; // 1% slippage
    const minB = Number(amountB) * 0.99;

    const result = await AMMContract.addLiquidity(
      tokenA,
      tokenB,
      amountA,
      amountB,
      minA,
      minB,
      deadline
    );

    loadingOverlay.hide();
    showSuccess('Liquidity added successfully!');

    // Clear form
    document.getElementById('liquidityAmountA').value = '';
    document.getElementById('liquidityAmountB').value = '';
  } catch (error) {
    loadingOverlay.hide();
    showError(`Add liquidity failed: ${error.message}`);
  }
}

/**
 * Handle pool creation
 */
async function handleCreatePool() {
  try {
    const tokenA = document.getElementById('createPoolTokenA')?.value;
    const tokenB = document.getElementById('createPoolTokenB')?.value;
    const amountA = document.getElementById('createPoolAmountA')?.value;
    const amountB = document.getElementById('createPoolAmountB')?.value;

    if (!tokenA || !tokenB || !amountA || !amountB) {
      showError('Please fill in all required fields');
      return;
    }

    loadingOverlay.show('Creating pool...');

    const deadline = Math.floor(Date.now() / 1000) + 300;

    const result = await AMMContract.createPool(
      tokenA,
      tokenB,
      amountA,
      amountB,
      deadline
    );

    loadingOverlay.hide();
    showSuccess('Pool created successfully!');

    // Clear form and refresh stats
    document.getElementById('createPoolAmountA').value = '';
    document.getElementById('createPoolAmountB').value = '';
    await refreshProtocolStats();
  } catch (error) {
    loadingOverlay.hide();
    showError(`Pool creation failed: ${error.message}`);
  }
}

/**
 * Update token balance in UI
 */
async function updateTokenBalance(elementId, tokenAddress) {
  try {
    const balance = await tokenService.getBalance(tokenAddress);
    const token = tokenService.getToken(tokenAddress);
    const formatted = token ? token.formatAmount(balance) : balance.toString();

    const element = document.getElementById(elementId);
    if (element) {
      element.textContent = formatted;
    }
  } catch (error) {
    console.error(`Failed to update balance for ${elementId}:`, error);
  }
}

// ============================================================================
// SECTION NAVIGATION
// ============================================================================

/**
 * Switch between sections/tabs
 */
export function switchSection(sectionId) {
  // Hide all sections
  document.querySelectorAll('section').forEach(section => {
    section.classList.remove('active');
  });

  // Show selected section
  const section = document.getElementById(sectionId);
  if (section) {
    section.classList.add('active');
  }

  // Update nav items
  document.querySelectorAll('[data-section]').forEach(btn => {
    btn.classList.remove('active');
    if (btn.getAttribute('data-section') === sectionId) {
      btn.classList.add('active');
    }
  });
}

/**
 * Setup section navigation
 */
function setupSectionNavigation() {
  document.querySelectorAll('[data-section]').forEach(btn => {
    btn.addEventListener('click', () => {
      switchSection(btn.getAttribute('data-section'));
    });
  });
}

// ============================================================================
// EXPORT FOR GLOBAL ACCESS
// ============================================================================

export default {
  AppState,
  initializeApp,
  refreshProtocolStats,
  switchSection,
  setupSectionNavigation,
};

/**
 * Export functions for inline onclick handlers (if needed)
 */
window.refreshDashboard = refreshProtocolStats;
window.switchSection = switchSection;
