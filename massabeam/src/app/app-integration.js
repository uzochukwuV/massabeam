/**
 * App Integration Module
 *
 * Main application initialization and integration script
 * Connects UI components with contract interactions and state management
 */

import { initProvider, getUserAddress, connectWallet } from './main.js';
import { showSuccess, showError, loadingOverlay } from './ui.js';
import { getAllTokens, populateTokenSelects, tokenService } from './token-service.js';
import { AMMContract, getProtocolStats, getExchangeRate, estimateSlippage, LimitOrdersContract, ORDER_STATUS, ORDER_STATUS_NAMES, ORDER_STATUS_COLORS } from './main.js';
import { callContract, readContract } from './contract-helpers.js';
import { startPeriodicMonitoring, updateUserPerformanceMetrics, updatePlatformStatistics, checkExpiringOrders } from './analytics.js';

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
      'orderTokenIn',
      'orderTokenOut',
      'dcaTokenIn',
      'dcaTokenOut',
      'buyIncreaseTokenIn',
      'buyIncreaseTokenOut',
      'sellDecreaseTokenIn',
      'sellDecreaseTokenOut',
      'gridTokenIn',
      'gridTokenOut',
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

    // Step 6: Setup section navigation
    console.log('Step 6: Setting up section navigation...');
    setupSectionNavigation();
    console.log('✓ Section navigation configured');

    // Step 7: Start periodic monitoring for analytics
    console.log('Step 7: Starting analytics monitoring...');
    startPeriodicMonitoring(60000); // Update every minute
    console.log('✓ Analytics monitoring started');

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

    // Update analytics and monitoring
    if (AppState.isConnected) {
      await updateUserPerformanceMetrics();
      await updatePlatformStatistics();
      await checkExpiringOrders(3600); // Check orders expiring within 1 hour
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

  // Swap amount input with debouncing (wait 500ms after user stops typing)
  const fromAmountInput = document.getElementById('fromAmount');
  if (fromAmountInput) {
    let debounceTimer;
    fromAmountInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(handleSwapAmountChange, 500);
    });
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

  // Limit orders - Create order button
  const createOrderBtn = document.getElementById('createOrderBtn');
  if (createOrderBtn) {
    createOrderBtn.addEventListener('click', handleCreateLimitOrder);
  }

  // Limit orders - Form submission
  const orderForm = document.getElementById('orderForm');
  if (orderForm) {
    orderForm.addEventListener('submit', (e) => {
      e.preventDefault();
      handleCreateLimitOrder();
    });
  }

  // Limit orders - Token selection change (update current price)
  const orderTokenInSelect = document.getElementById('orderTokenIn');
  const orderTokenOutSelect = document.getElementById('orderTokenOut');
  if (orderTokenInSelect) orderTokenInSelect.addEventListener('change', onOrderTokenChanged);
  if (orderTokenOutSelect) orderTokenOutSelect.addEventListener('change', onOrderTokenChanged);
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
 * Handle swap amount change - Calculate exchange rate, fees, and output amount
 */
async function handleSwapAmountChange() {
  const amountInput = document.getElementById('fromAmount')?.value;
  const tokenIn = AppState.selectedTokens.swap.from;
  const tokenOut = AppState.selectedTokens.swap.to;

  // Clear outputs if no amount or tokens selected
  if (!amountInput || !tokenIn || !tokenOut) {
    clearSwapInfo();
    return;
  }

  try {
    // Convert input amount to smallest unit (8 decimals for Massa u64)
    const tokenInData = tokenService.getToken(tokenIn);
    const tokenOutData = tokenService.getToken(tokenOut);

    if (!tokenInData || !tokenOutData) {
      console.error('Token data not found');
      return;
    }

    // TEMPORARY FIX: Pool reserves are in raw format (not 8 decimals)
    // So we DON'T multiply input by 10^8
    // TODO: Recreate pools with proper 8-decimal reserves
    const DECIMALS = 0; // ⚠️ TEMPORARY: Set to 0 because pool has raw values
    const amountInSmallestUnit = BigInt(Math.floor(Number(amountInput) * Math.pow(10, DECIMALS))).toString();
    console.log('Calculating quote for swap:', {
      tokenIn: tokenInData.symbol,
      tokenOut: tokenOutData.symbol,
      amountIn: amountInput,
      amountInSmallestUnit: amountInSmallestUnit
    });
    // Get pool data and calculate output
    const pool = await AMMContract.getPool(tokenIn, tokenOut);
    if (!pool) {
      clearSwapInfo();
      document.getElementById('swapRate').textContent = 'Pool not found';
      return;
    }
    console.log(pool);

    const poolData = typeof pool === 'string' ? JSON.parse(pool) : pool;
    const fee = poolData.fee || 3000; // Default 0.3% (3000 basis points)

    // CRITICAL: Determine token order - which token is A and which is B in the pool
    const tokenInIsA = tokenIn.toLowerCase() === poolData.tokenA.toLowerCase();
    const reserveIn = tokenInIsA ? poolData.reserveA : poolData.reserveB;
    const reserveOut = tokenInIsA ? poolData.reserveB : poolData.reserveA;

    console.log('Pool data for swap:', {
      tokenIn: tokenInData.symbol,
      tokenOut: tokenOutData.symbol,
      tokenInAddress: tokenIn,
      poolTokenA: poolData.tokenA,
      poolTokenB: poolData.tokenB,
      tokenInIsA: tokenInIsA,
      reserveIn: reserveIn,
      reserveOut: reserveOut,
      reserveA: poolData.reserveA,
      reserveB: poolData.reserveB,
      fee: fee,
      amountIn: amountInSmallestUnit,
      amountIn_human: amountInput
    });

    // Calculate output amount using correct reserve order
    const amountOut = await AMMContract.getAmountOut(
      amountInSmallestUnit,
      reserveIn,   // ✅ Use reserveIn (not always reserveA)
      reserveOut,  // ✅ Use reserveOut (not always reserveB)
      fee
    );

    // Get exchange rate (1 token = X tokens)
    const oneToken = Math.pow(10, DECIMALS).toString(); // For raw format: 1
    const exchangeRate = await getExchangeRate(tokenIn, tokenOut, oneToken || '1');

    // Calculate slippage/price impact
    const slippageData = await estimateSlippage(tokenIn, tokenOut, amountInSmallestUnit);

    // Update UI with calculated values
    updateSwapUI(amountOut, exchangeRate, slippageData, fee, tokenInData, tokenOutData, amountInput);

  } catch (error) {
    console.error('Quote calculation failed:', error);
    clearSwapInfo();
    document.getElementById('swapRate').textContent = 'Error calculating quote';
  }
}

/**
 * Update swap UI with calculated values
 */
function updateSwapUI(amountOut, exchangeRate, slippageData, fee, tokenIn, tokenOut, amountInput) {
  // TEMPORARY: Pool reserves are in raw format (not 8 decimals)
  // So output is also in raw format
  const DECIMALS = 0; // ⚠️ TEMPORARY: Set to 0 because pool has raw values
  const DECIMAL_DIVISOR = Math.pow(10, DECIMALS); // 1 (no division)

  // Update output amount (already in correct format for raw pools)
  const outputAmount = (Number(amountOut) / DECIMAL_DIVISOR).toFixed(6);
  const toAmountEl = document.getElementById('toAmount');
  if (toAmountEl) {
    toAmountEl.value = outputAmount;
  }

  // Update exchange rate (e.g., "1 USDC = 0.0003 WMAS")
  const rateEl = document.getElementById('swapRate');
  if (rateEl && exchangeRate) {
    const rate = Number(exchangeRate.rate).toFixed(6);
    rateEl.textContent = `1 ${tokenIn.symbol} = ${rate} ${tokenOut.symbol}`;
  }

  // Update price impact
  const priceImpactEl = document.getElementById('priceImpact');
  if (priceImpactEl && slippageData) {
    const impact = Number(slippageData.priceImpact);
    let impactClass = 'positive';
    if (impact > 5) impactClass = 'negative';
    else if (impact > 1) impactClass = 'warning';

    priceImpactEl.textContent = `${slippageData.priceImpact}%`;
    priceImpactEl.className = `info-value ${impactClass}`;
  }

  // Calculate minimum received (with slippage tolerance - default 0.5%)
  const slippageTolerance = 0.5; // 0.5%
  const minReceived = (Number(outputAmount) * (1 - slippageTolerance / 100)).toFixed(6);
  const minReceivedEl = document.getElementById('minimumReceived');
  if (minReceivedEl) {
    minReceivedEl.textContent = `${minReceived} ${tokenOut.symbol}`;
  }

  // Calculate and display trading fee
  const feePercentage = (fee / 10000).toFixed(2); // Convert basis points to percentage
  const feeAmount = (Number(amountInput) * (fee / 10000 / 100)).toFixed(6);
  const networkFeeEl = document.getElementById('networkFee');
  if (networkFeeEl) {
    networkFeeEl.textContent = `${feeAmount} ${tokenIn.symbol} (${feePercentage}%)`;
  }

  console.log('Swap quote calculated:', {
    input: amountInput,
    output: outputAmount,
    rate: exchangeRate?.rate,
    priceImpact: slippageData?.priceImpact,
    fee: feePercentage,
    minReceived,
    decimals: DECIMALS
  });
}

/**
 * Clear swap info display
 */
function clearSwapInfo() {
  const toAmountEl = document.getElementById('toAmount');
  if (toAmountEl) toAmountEl.value = '';

  const elementsToReset = ['swapRate', 'priceImpact', 'minimumReceived', 'networkFee'];
  elementsToReset.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '-';
  });
}

/**
 * Handle swap execution
 */
async function handleSwap() {
  try {
    const tokenIn = AppState.selectedTokens.swap.from;
    const tokenOut = AppState.selectedTokens.swap.to;
    const amountInput = document.getElementById('fromAmount')?.value;
    const minOutInput = document.getElementById('toAmount')?.value;

    if (!tokenIn || !tokenOut || !amountInput || !minOutInput) {
      showError('Please fill in all required fields');
      return;
    }

    // TEMPORARY: Convert amounts to raw format (DECIMALS = 0)
    // TODO: Change to DECIMALS = 8 when pools are recreated properly
    const DECIMALS = 0;
    const amountIn = Math.floor(Number(amountInput) * Math.pow(10, DECIMALS)).toString();
    const amountOutMin = Math.floor(Number(minOutInput) * Math.pow(10, DECIMALS) * 0.995).toString(); // 0.5% slippage

    console.log('Executing swap:', {
      tokenIn,
      tokenOut,
      amountIn,
      amountOutMin,
      amountInput,
      minOutInput
    });

    loadingOverlay.show('Executing swap...');

    const deadline = 60 * 60 * 5 // 5 minutes
    const result = await AMMContract.swap(tokenIn, tokenOut, amountIn, amountOutMin, deadline);

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
  // Hide all sections (remove active class)
  document.querySelectorAll('.section').forEach(section => {
    section.classList.remove('active');
  });

  // Show selected section (add active class)
  const section = document.getElementById(sectionId);
  if (section) {
    section.classList.add('active');
  }

  // Update nav items (remove active from all, add to clicked)
  document.querySelectorAll('.nav-item[data-section]').forEach(btn => {
    btn.classList.remove('active');
  });

  const activeNavBtn = document.querySelector(`.nav-item[data-section="${sectionId}"]`);
  if (activeNavBtn) {
    activeNavBtn.classList.add('active');
  }

  console.log(`Switched to section: ${sectionId}`);
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
// LIMIT ORDERS HANDLERS
// ============================================================================

/**
 * Handle order token selection change - Update current market price and balance
 */
async function onOrderTokenChanged() {
  const tokenIn = document.getElementById('orderTokenIn')?.value;
  const tokenOut = document.getElementById('orderTokenOut')?.value;
  const currentPriceEl = document.getElementById('currentMarketPrice');
  const balanceEl = document.getElementById('orderTokenInBalance');

  // Update balance for tokenIn
  if (tokenIn && balanceEl) {
    try {
      const tokenInData = tokenService.getToken(tokenIn);
      const balance = await tokenService.getBalance(tokenIn);

      if (tokenInData && balance !== undefined) {
        const formatted = tokenInData.formatAmount(balance);
        balanceEl.textContent = formatted;
      } else {
        balanceEl.textContent = '0';
      }
    } catch (error) {
      console.error('Failed to fetch token balance:', error);
      balanceEl.textContent = '0';
    }
  } else if (balanceEl) {
    balanceEl.textContent = '0';
  }

  // Update current market price
  if (!currentPriceEl) return;

  // Clear price if tokens not fully selected
  if (!tokenIn || !tokenOut) {
    currentPriceEl.textContent = '-';
    return;
  }

  try {
    // Get token data
    const tokenInData = tokenService.getToken(tokenIn);
    const tokenOutData = tokenService.getToken(tokenOut);

    if (!tokenInData || !tokenOutData) {
      currentPriceEl.textContent = '-';
      return;
    }

    // Get current exchange rate (1 tokenIn = X tokenOut)
    const DECIMALS = 0; // Temporary for raw format pools
    const oneToken = Math.pow(10, DECIMALS).toString(); // For raw: "1"
    const exchangeRate = await getExchangeRate(tokenIn, tokenOut, oneToken || '1');

    if (exchangeRate && exchangeRate.rate) {
      const rate = Number(exchangeRate.rate).toFixed(6);
      currentPriceEl.textContent = `1 ${tokenInData.symbol} = ${rate} ${tokenOutData.symbol}`;
      currentPriceEl.style.color = 'var(--text-primary)';
    } else {
      currentPriceEl.textContent = 'Pool not found';
      currentPriceEl.style.color = 'var(--text-muted)';
    }
  } catch (error) {
    console.error('Failed to fetch current price:', error);
    currentPriceEl.textContent = 'Error loading price';
    currentPriceEl.style.color = 'var(--text-muted)';
  }
}

/**
 * Set max amount for order (MAX button handler)
 */
async function setOrderMaxAmount() {
  const tokenIn = document.getElementById('orderTokenIn')?.value;
  const amountInput = document.getElementById('orderAmountIn');

  if (!tokenIn || !amountInput) return;

  try {
    const tokenInData = tokenService.getToken(tokenIn);
    const balance = await tokenService.getBalance(tokenIn);

    if (tokenInData && balance !== undefined) {
      // Convert balance to human-readable format
      const humanBalance = Number(balance) / Math.pow(10, tokenInData.decimals);
      amountInput.value = humanBalance.toFixed(tokenInData.decimals).replace(/\.?0+$/, '');
    }
  } catch (error) {
    console.error('Failed to set max amount:', error);
  }
}

/**
 * Handle create limit order
 */
async function handleCreateLimitOrder() {
  try {
    const tokenIn = document.getElementById('orderTokenIn')?.value;
    const tokenOut = document.getElementById('orderTokenOut')?.value;
    const amountInput = document.getElementById('orderAmountIn')?.value;
    const limitPrice = document.getElementById('orderLimitPrice')?.value;
    const expirySelect = document.getElementById('orderExpiry')?.value;
    const partialFill = document.getElementById('partialFill')?.checked;

    // Get slippage
    const activeSlippage = document.querySelector('.slippage-btn.active');
    const slippage = activeSlippage ? parseFloat(activeSlippage.dataset.slippage) : 1.0;
    const maxSlippage = Math.floor(slippage * 100); // Convert to basis points

    if (!tokenIn || !tokenOut || !amountInput || !limitPrice) {
      showError('Please fill in all required fields');
      return;
    }

    // TEMPORARY: Use DECIMALS = 0 for raw format pools
    const DECIMALS = 0;
    const amountIn = Math.floor(Number(amountInput) * Math.pow(10, DECIMALS));

    // Calculate min amount out based on limit price
    // IMPORTANT: Use 8 decimals for price to avoid u64 overflow
    // u64 max = 18,446,744,073,709,551,615 (~18.4 * 10^18)
    // With 8 decimals: max price = 184,467,440,737 (plenty of room)
    const PRICE_DECIMALS = 8;
    const limitPriceScaled = BigInt(Math.floor(Number(limitPrice) * Math.pow(10, PRICE_DECIMALS)));
    const minAmountOut = Math.floor(Number(amountInput) * Number(limitPrice) * (1 - slippage / 100));

    // Calculate expiry timestamp
    const now = Date.now();
    const expiryTime = expirySelect === 'custom'
      ? now + (7 * 24 * 60 * 60 * 1000) // Default 7 days
      : now + (Number(expirySelect) * 1000); // Convert seconds to ms

    console.log('Creating order:', {
      tokenIn,
      tokenOut,
      amountIn,
      minAmountOut,
      limitPrice: limitPriceScaled.toString(),
      expiryTime,
      maxSlippage,
      partialFill
    });

    loadingOverlay.show('Creating limit order...');

    const orderId = await LimitOrdersContract.createOrder(
      tokenIn,
      tokenOut,
      amountIn.toString(),
      minAmountOut.toString(),
      limitPriceScaled.toString(),
      expiryTime,
      maxSlippage,
      partialFill
    );

    loadingOverlay.hide();
    showSuccess(`Limit order created! Order ID: ${orderId}`);

    // Clear form
    document.getElementById('orderAmountIn').value = '';
    document.getElementById('orderLimitPrice').value = '';

    // Refresh orders list
    await refreshUserOrders();
  } catch (error) {
    loadingOverlay.hide();
    showError(`Failed to create order: ${error.message}`);
  }
}

/**
 * Handle cancel limit order
 */
async function handleCancelOrder(orderId) {
  try {
    if (!confirm(`Are you sure you want to cancel order #${orderId}?`)) {
      return;
    }

    loadingOverlay.show('Cancelling order...');

    await LimitOrdersContract.cancelOrder(orderId);

    loadingOverlay.hide();
    showSuccess('Order cancelled successfully!');

    // Refresh orders list
    await refreshUserOrders();
  } catch (error) {
    loadingOverlay.hide();
    showError(`Failed to cancel order: ${error.message}`);
  }
}

/**
 * Refresh user orders
 */
async function refreshUserOrders() {
  try {
    const userAddress = getUserAddress();
    if (!userAddress) {
      console.log('No user address, skipping order refresh');
      return;
    }

    // Get user order IDs
    const orderIds = await LimitOrdersContract.getUserOrders(userAddress);

    if (orderIds.length === 0) {
      displayEmptyOrders();
      return;
    }

    // Fetch details for each order
    const orders = [];
    for (const orderId of orderIds) {
      const order = await LimitOrdersContract.getOrderDetails(orderId);
      if (order) {
        orders.push(order);
      }
    }

    // Display orders
    displayOrders(orders);

    // Update order count in dashboard
    const orderCount = await LimitOrdersContract.getOrderCount();
    const orderCountEl = document.getElementById('protocolActiveOrders');
    if (orderCountEl) {
      orderCountEl.textContent = orderCount;
    }
  } catch (error) {
    console.error('Failed to refresh orders:', error);
  }
}

/**
 * Display orders in UI
 */
function displayOrders(orders) {
  const activeList = document.getElementById('activeOrdersList');
  const historyList = document.getElementById('orderHistoryList');

  if (!activeList || !historyList) return;

  const activeOrders = orders.filter(o => o.status === ORDER_STATUS.ACTIVE);
  const historicOrders = orders.filter(o => o.status !== ORDER_STATUS.ACTIVE);

  // Display active orders
  if (activeOrders.length === 0) {
    activeList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🎯</div>
        <p>No active orders</p>
      </div>
    `;
  } else {
    activeList.innerHTML = activeOrders.map(order => renderOrderCard(order)).join('');
  }

  // Display history
  if (historicOrders.length === 0) {
    historyList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📝</div>
        <p>No order history</p>
      </div>
    `;
  } else {
    historyList.innerHTML = historicOrders.map(order => renderOrderCard(order)).join('');
  }
}

/**
 * Render single order card
 */
function renderOrderCard(order) {
  const DECIMALS = 0; // Temporary for raw pools
  const PRICE_DECIMALS = 8; // Price uses 8 decimals
  const tokenInData = tokenService.getToken(order.tokenIn);
  const tokenOutData = tokenService.getToken(order.tokenOut);

  const amountInHuman = (order.amountIn / Math.pow(10, DECIMALS)).toFixed(6);
  const minOutHuman = (order.minAmountOut / Math.pow(10, DECIMALS)).toFixed(6);
  const limitPriceHuman = (order.limitPrice / Math.pow(10, PRICE_DECIMALS)).toFixed(6);

  const statusName = ORDER_STATUS_NAMES[order.status];
  const statusColor = ORDER_STATUS_COLORS[order.status];

  const now = Date.now();
  const timeLeft = order.expiryTime - now;
  const isExpired = timeLeft <= 0;
  const expiryText = isExpired ? 'Expired' : formatTimeRemaining(timeLeft);

  const progress = order.amountIn > 0
    ? ((order.executedAmount / order.amountIn) * 100).toFixed(1)
    : 0;

  return `
    <div class="order-card">
      <div class="order-header">
        <div class="order-id">Order #${order.id}</div>
        <div class="order-status status-${statusColor}">${statusName}</div>
      </div>
      <div class="order-body">
        <div class="order-pair">
          ${tokenInData?.symbol || 'TOKEN'} → ${tokenOutData?.symbol || 'TOKEN'}
        </div>
        <div class="order-details">
          <div class="detail-row">
            <span>Amount:</span>
            <span>${amountInHuman} ${tokenInData?.symbol}</span>
          </div>
          <div class="detail-row">
            <span>Min Receive:</span>
            <span>${minOutHuman} ${tokenOutData?.symbol}</span>
          </div>
          <div class="detail-row">
            <span>Limit Price:</span>
            <span>${limitPriceHuman}</span>
          </div>
          <div class="detail-row">
            <span>Expires:</span>
            <span class="${isExpired ? 'text-error' : ''}">${expiryText}</span>
          </div>
        </div>
        ${order.status === ORDER_STATUS.ACTIVE ? `
          <div class="order-progress">
            <div class="progress-bar">
              <div class="progress-fill" style="width: ${progress}%"></div>
            </div>
            <div class="progress-text">${progress}% executed</div>
          </div>
        ` : ''}
      </div>
      <div class="order-actions">
        ${order.status === ORDER_STATUS.ACTIVE ? `
          <button class="btn-cancel" onclick="handleCancelOrder(${order.id})">
            Cancel Order
          </button>
        ` : ''}
        <button class="btn-details" onclick="showOrderDetails(${order.id})">
          View Details
        </button>
      </div>
    </div>
  `;
}

/**
 * Format time remaining
 */
function formatTimeRemaining(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

/**
 * Show order details modal
 */
async function showOrderDetails(orderId) {
  try {
    const order = await LimitOrdersContract.getOrderDetails(orderId);
    if (!order) {
      showError('Order not found');
      return;
    }

    // TODO: Create and show modal with full order details
    console.log('Order details:', order);
    alert(`Order #${orderId} details:\n${JSON.stringify(order, null, 2)}`);
  } catch (error) {
    showError(`Failed to load order details: ${error.message}`);
  }
}

/**
 * Display empty orders
 */
function displayEmptyOrders() {
  const activeList = document.getElementById('activeOrdersList');
  const historyList = document.getElementById('orderHistoryList');

  if (activeList) {
    activeList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🎯</div>
        <p>No active orders</p>
        <button class="secondary-btn" onclick="switchSection('orders')">Create Your First Order</button>
      </div>
    `;
  }

  if (historyList) {
    historyList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📝</div>
        <p>No order history</p>
      </div>
    `;
  }
}

// ============================================================================
// RECURRING ORDERS HANDLERS
// ============================================================================

/**
 * Switch between recurring order types (DCA, Buy on Increase, Sell on Decrease, Grid)
 */
window.switchRecurringOrderType = function(type) {
  console.log('Switching to recurring order type:', type);

  // Update tab buttons
  document.querySelectorAll('.tab-btn[data-order-type]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.orderType === type);
  });

  // Hide all form cards
  document.getElementById('dcaFormCard')?.classList.add('hidden');
  document.getElementById('buyIncreaseFormCard')?.classList.add('hidden');
  document.getElementById('sellDecreaseFormCard')?.classList.add('hidden');
  document.getElementById('gridFormCard')?.classList.add('hidden');

  // Show selected form
  const formMap = {
    'dca': 'dcaFormCard',
    'buy-increase': 'buyIncreaseFormCard',
    'sell-decrease': 'sellDecreaseFormCard',
    'grid': 'gridFormCard'
  };

  const formId = formMap[type];
  if (formId) {
    document.getElementById(formId)?.classList.remove('hidden');
  }

  // Update title
  const titleMap = {
    'dca': 'Your DCA Strategies',
    'buy-increase': 'Your Buy on Rise Orders',
    'sell-decrease': 'Your Sell on Drop Orders',
    'grid': 'Your Grid Trading Orders'
  };

  const titleEl = document.getElementById('recurringOrdersTitle');
  if (titleEl && titleMap[type]) {
    titleEl.textContent = titleMap[type];
  }
};

/**
 * Handle DCA order creation
 */
window.handleCreateDCA = async function(event) {
  if (event) event.preventDefault();

  try {
    const tokenIn = document.getElementById('dcaTokenIn')?.value;
    const tokenOut = document.getElementById('dcaTokenOut')?.value;
    const amountPerPeriod = document.getElementById('dcaAmountPerPeriod')?.value;
    const frequency = document.getElementById('dcaFrequency')?.value;
    const totalPeriods = document.getElementById('dcaTotalPeriods')?.value;

    if (!tokenIn || !tokenOut || !amountPerPeriod || !frequency || !totalPeriods) {
      showError('Please fill in all required fields');
      return;
    }

    // Import RecurringOrdersContract
    const { RecurringOrdersContract } = await import('./recurring-orders.js');

    loadingOverlay.show('Creating DCA order...');

    // Call contract (minAmountOut should be calculated based on slippage)
    const minAmountOut = parseFloat(amountPerPeriod) * 0.95; // 5% slippage tolerance

    await RecurringOrdersContract.createDCA(
      tokenIn,
      tokenOut,
      parseInt(frequency),
      amountPerPeriod,
      minAmountOut.toString(),
      parseInt(totalPeriods)
    );

    loadingOverlay.hide();
    showSuccess('DCA order created successfully!');

    // Refresh orders list
    await refreshRecurringOrders();

    // Reset form
    document.getElementById('dcaForm')?.reset();
  } catch (error) {
    loadingOverlay.hide();
    showError(`Failed to create DCA order: ${error.message}`);
    console.error('Create DCA error:', error);
  }
};

/**
 * Handle Buy on Increase order creation
 */
window.handleCreateBuyIncrease = async function(event) {
  if (event) event.preventDefault();

  try {
    const tokenIn = document.getElementById('buyIncreaseTokenIn')?.value;
    const tokenOut = document.getElementById('buyIncreaseTokenOut')?.value;
    const trigger = document.getElementById('buyIncreaseTrigger')?.value;
    const amount = document.getElementById('buyIncreaseAmount')?.value;
    const maxExec = document.getElementById('buyIncreaseMaxExec')?.value;
    const minOut = document.getElementById('buyIncreaseMinOut')?.value;

    if (!tokenIn || !tokenOut || !trigger || !amount || !minOut) {
      showError('Please fill in all required fields');
      return;
    }

    const { RecurringOrdersContract } = await import('./recurring-orders.js');

    loadingOverlay.show('Creating Buy on Increase order...');

    // Convert percentage to basis points (2% = 200 basis points)
    const triggerBps = Math.floor(parseFloat(trigger) * 100);

    await RecurringOrdersContract.createBuyOnIncrease(
      tokenIn,
      tokenOut,
      triggerBps,
      amount,
      minOut,
      parseInt(maxExec) || 0
    );

    loadingOverlay.hide();
    showSuccess('Buy on Increase order created successfully!');

    await refreshRecurringOrders();
    document.getElementById('buyIncreaseForm')?.reset();
  } catch (error) {
    loadingOverlay.hide();
    showError(`Failed to create order: ${error.message}`);
    console.error('Create Buy on Increase error:', error);
  }
};

/**
 * Handle Sell on Decrease order creation
 */
window.handleCreateSellDecrease = async function(event) {
  if (event) event.preventDefault();

  try {
    const tokenIn = document.getElementById('sellDecreaseTokenIn')?.value;
    const tokenOut = document.getElementById('sellDecreaseTokenOut')?.value;
    const trigger = document.getElementById('sellDecreaseTrigger')?.value;
    const amount = document.getElementById('sellDecreaseAmount')?.value;
    const minOut = document.getElementById('sellDecreaseMinOut')?.value;

    if (!tokenIn || !tokenOut || !trigger || !amount || !minOut) {
      showError('Please fill in all required fields');
      return;
    }

    const { RecurringOrdersContract } = await import('./recurring-orders.js');

    loadingOverlay.show('Creating Sell on Decrease order...');

    const triggerBps = Math.floor(parseFloat(trigger) * 100);

    // Sell on Decrease doesn't have maxExecutions parameter in the simplified version
    await RecurringOrdersContract.createSellOnDecrease?.(
      tokenIn,
      tokenOut,
      triggerBps,
      amount,
      minOut
    );

    loadingOverlay.hide();
    showSuccess('Sell on Decrease order created successfully!');

    await refreshRecurringOrders();
    document.getElementById('sellDecreaseForm')?.reset();
  } catch (error) {
    loadingOverlay.hide();
    showError(`Failed to create order: ${error.message}`);
    console.error('Create Sell on Decrease error:', error);
  }
};

/**
 * Generate grid level inputs dynamically
 */
window.generateGridLevels = function() {
  const levelCount = parseInt(document.getElementById('gridLevelCount')?.value || 0);

  if (levelCount < 1 || levelCount > 10) {
    showError('Please enter a valid number of grid levels (1-10)');
    return;
  }

  const container = document.getElementById('gridLevelsContainer');
  if (!container) return;

  container.innerHTML = '';

  for (let i = 0; i < levelCount; i++) {
    const levelDiv = document.createElement('div');
    levelDiv.className = 'form-row';
    levelDiv.style.marginBottom = '1rem';
    levelDiv.innerHTML = `
      <div class="form-group">
        <label class="form-label">Level ${i + 1} - Percentage (%)</label>
        <input type="number" id="gridLevel${i}Pct" placeholder="${(i + 1) * 2}" step="0.1" class="form-input grid-level-pct">
        <div class="input-hint">Price change percentage (e.g., ${(i + 1) * 2}% = ±${(i + 1) * 2}%)</div>
      </div>
      <div class="form-group">
        <label class="form-label">Level ${i + 1} - Amount</label>
        <input type="number" id="gridLevel${i}Amount" placeholder="100" class="form-input grid-level-amount">
        <div class="input-hint">Amount to trade at this level</div>
      </div>
    `;
    container.appendChild(levelDiv);
  }

  showSuccess(`Generated ${levelCount} grid levels`);
};

/**
 * Handle Grid order creation
 */
window.handleCreateGrid = async function(event) {
  if (event) event.preventDefault();

  try {
    const tokenIn = document.getElementById('gridTokenIn')?.value;
    const tokenOut = document.getElementById('gridTokenOut')?.value;
    const minOut = document.getElementById('gridMinOut')?.value;
    const levelCount = parseInt(document.getElementById('gridLevelCount')?.value || 0);

    if (!tokenIn || !tokenOut || !minOut || levelCount < 1) {
      showError('Please fill in all required fields and generate grid levels');
      return;
    }

    // Collect grid levels and amounts
    const gridLevels = [];
    const gridAmounts = [];

    for (let i = 0; i < levelCount; i++) {
      const pct = document.getElementById(`gridLevel${i}Pct`)?.value;
      const amount = document.getElementById(`gridLevel${i}Amount`)?.value;

      if (!pct || !amount) {
        showError(`Please fill in all grid level fields`);
        return;
      }

      // Convert percentage to basis points
      gridLevels.push(Math.floor(parseFloat(pct) * 100));
      gridAmounts.push(amount);
    }

    const { RecurringOrdersContract } = await import('./recurring-orders.js');

    loadingOverlay.show('Creating Grid order...');

    await RecurringOrdersContract.createGrid?.(
      tokenIn,
      tokenOut,
      gridLevels,
      gridAmounts,
      minOut
    );

    loadingOverlay.hide();
    showSuccess(`Grid order created with ${levelCount} levels!`);

    await refreshRecurringOrders();
    document.getElementById('gridForm')?.reset();
    document.getElementById('gridLevelsContainer').innerHTML = '';
  } catch (error) {
    loadingOverlay.hide();
    showError(`Failed to create grid order: ${error.message}`);
    console.error('Create Grid error:', error);
  }
};

/**
 * Refresh recurring orders list
 */
window.refreshRecurringOrders = async function() {
  try {
    if (!getUserAddress()) {
      console.log('User not connected');
      return;
    }

    const { RecurringOrdersContract } = await import('./recurring-orders.js');

    // Get user orders
    const orderIds = await RecurringOrdersContract.getUserOrders(getUserAddress());

    console.log('User recurring orders:', orderIds);

    // TODO: Display orders in the list
    // For now, just update the count
    const countEl = document.getElementById('activeDCACount');
    if (countEl) {
      countEl.textContent = orderIds.length.toString();
    }

    // If no orders, show empty state
    if (orderIds.length === 0) {
      const listEl = document.getElementById('dcaStrategiesList');
      if (listEl) {
        listEl.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">📈</div>
            <p>No recurring orders yet</p>
            <button class="secondary-btn" onclick="switchRecurringOrderType('dca')">Create Your First Order</button>
          </div>
        `;
      }
    } else {
      // TODO: Fetch and display each order
      console.log('TODO: Display recurring orders');
    }
  } catch (error) {
    console.error('Failed to refresh recurring orders:', error);
  }
};

/**
 * Handle cancel recurring order
 */
window.handleCancelRecurringOrder = async function(orderId) {
  if (!confirm(`Are you sure you want to cancel order #${orderId}?`)) {
    return;
  }

  try {
    const { RecurringOrdersContract } = await import('./recurring-orders.js');

    loadingOverlay.show('Cancelling order...');

    await RecurringOrdersContract.cancelOrder(orderId);

    loadingOverlay.hide();
    showSuccess(`Order #${orderId} cancelled successfully!`);

    await refreshRecurringOrders();
  } catch (error) {
    loadingOverlay.hide();
    showError(`Failed to cancel order: ${error.message}`);
  }
};

// ============================================================================
// EXPORT FOR GLOBAL ACCESS
// ============================================================================

// Export individual functions for dynamic imports
export {
  setupSectionNavigation,
  handleWalletConnection,
  handleSwap,
  handleAddLiquidity,
  handleCreatePool,
  onSwapTokenChanged,
  onOrderTokenChanged,
  handleCreateLimitOrder,
  handleCancelOrder,
  refreshUserOrders,
  showOrderDetails,
};


/**
 * Export functions for inline onclick handlers (if needed)
 */
window.refreshDashboard = refreshProtocolStats;
window.switchSection = switchSection;
window.handleCancelOrder = handleCancelOrder;
window.showOrderDetails = showOrderDetails;
window.setOrderMaxAmount = setOrderMaxAmount;
