/**
 * MassaBeam App Initialization Entry Point
 *
 * This is the main script that app.html loads to start the application.
 * It coordinates initialization of all modules and sets up the UI.
 */

import { initializeApp, AppState, switchSection } from './app-integration.js';

// ============================================================================
// APPLICATION STARTUP
// ============================================================================

/**
 * Main initialization function
 */
async function startApplication() {
  console.log('%c╔════════════════════════════════════╗', 'color: #00d4ff; font-weight: bold;');
  console.log('%c║   🚀 MassaBeam DeFi Platform      ║', 'color: #00d4ff; font-weight: bold;');
  console.log('%c║   Initializing Application...      ║', 'color: #00d4ff; font-weight: bold;');
  console.log('%c╚════════════════════════════════════╝', 'color: #00d4ff; font-weight: bold;');

  try {
    // Initialize the application
    const initialized = await initializeApp();

    if (!initialized) {
      console.error('❌ Application initialization failed');
      showFatalError('Failed to initialize application');
      return;
    }

    console.log('%c✅ Application Initialized Successfully!', 'color: #00d97e; font-weight: bold; font-size: 14px;');
    console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #00d97e');

    // Setup global event handlers for inline onclick attributes
    setupGlobalHandlers();

    // Log ready state
    logReadyState();
  } catch (error) {
    console.error('%c❌ FATAL ERROR - Application Failed to Start', 'color: #ff4757; font-weight: bold; font-size: 14px;');
    console.error(error);
    showFatalError('Application failed to start. Check console for details.');
  }
}

// ============================================================================
// GLOBAL HANDLERS (For inline onclick attributes)
// ============================================================================

/**
 * Setup global handlers accessible from HTML onclick attributes
 */
function setupGlobalHandlers() {
  // Navigation handlers
  window.switchToSection = (sectionId) => {
    console.log(`Switching to section: ${sectionId}`);
    switchSection(sectionId);
  };

  // Wallet handlers
  window.connectWalletHandler = async () => {
    const { handleWalletConnection } = await import('./app-integration.js');
    await handleWalletConnection();
  };

  // Swap handlers
  window.executeSwap = async () => {
    const { handleSwap } = await import('./app-integration.js');
    await handleSwap();
  };

  window.swapTokens = async () => {
    const { onSwapTokenChanged } = await import('./app-integration.js');
    // Swap the token selections
    const tokenIn = document.getElementById('swapTokenIn');
    const tokenOut = document.getElementById('swapTokenOut');
    if (tokenIn && tokenOut) {
      [tokenIn.value, tokenOut.value] = [tokenOut.value, tokenIn.value];
      await onSwapTokenChanged();
    }
  };

  // Liquidity handlers
  window.addLiquidity = async (event) => {
    const { handleAddLiquidity } = await import('./liquidity.js');
    await handleAddLiquidity(event);
  };

  window.removeLiquidity = async (event) => {
    const { handleRemoveLiquidity } = await import('./liquidity.js');
    await handleRemoveLiquidity(event);
  };

  // Pool handlers
  window.createPool = async (event) => {
    const { handleCreatePool } = await import('./liquidity.js');
    await handleCreatePool(event);
  };

  window.refreshPools = async () => {
    const { refreshPools } = await import('./liquidity.js');
    await refreshPools();
  };

  window.switchLiquidityTab = (tab) => {
    import('./liquidity.js').then(({ switchLiquidityTab }) => {
      switchLiquidityTab(tab);
    });
  };

  window.setRemovePercent = (percent) => {
    import('./liquidity.js').then(({ setRemovePercent }) => {
      setRemovePercent(percent);
    });
  };

  window.updateRemoveLiquidityAmount = () => {
    import('./liquidity.js').then(({ updateRemoveLiquidityAmount }) => {
      updateRemoveLiquidityAmount();
    });
  };

  // Refresh handlers
  window.refreshDashboard = async () => {
    const { refreshProtocolStats } = await import('./app-integration.js');
    console.log('Refreshing dashboard...');
    await refreshProtocolStats();
  };

  console.log('✓ Global handlers registered');
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

/**
 * Show fatal error message
 */
function showFatalError(message) {
  const errorDiv = document.getElementById('errorMessage');
  if (errorDiv) {
    errorDiv.textContent = `ERROR: ${message}`;
    errorDiv.classList.add('visible');
  } else {
    alert(`FATAL ERROR: ${message}`);
  }
}

/**
 * Global error handler
 */
window.addEventListener('error', (event) => {
  console.error('❌ Uncaught error:', event.error);
  console.error(event.error.stack);
});

/**
 * Unhandled promise rejection handler
 */
window.addEventListener('unhandledrejection', (event) => {
  console.error('❌ Unhandled promise rejection:', event.reason);
});

// ============================================================================
// LOGGING & DIAGNOSTICS
// ============================================================================

/**
 * Log application ready state
 */
function logReadyState() {
  console.log('%c📊 Application State:', 'color: #00d4ff; font-weight: bold;');
  console.table({
    'Connected': AppState.isConnected,
    'User Address': AppState.userAddress || 'Not connected',
    'TVL': `$${(AppState.protocols.tvl / 1e18).toFixed(2)}`,
    'Pool Count': AppState.protocols.poolCount,
    'Last Update': AppState.lastUpdate?.toLocaleTimeString() || 'N/A',
  });

  // Log available global functions
  console.log('%c🔧 Available Global Functions:', 'color: #ffa500; font-weight: bold;');
  console.log([
    'switchToSection(sectionId)',
    'connectWalletHandler()',
    'executeSwap()',
    'swapTokens()',
    'addLiquidity()',
    'createPool()',
    'refreshDashboard()',
  ].join('\n'));

  console.log('%c💡 Tip: Use AppState to access application state', 'color: #00d97e;');
  console.log('AppState:', AppState);
}

/**
 * Log environment info
 */
function logEnvironmentInfo() {
  console.log('%c🌐 Environment Information:', 'color: #0099cc; font-weight: bold;');
  console.table({
    'Browser': navigator.userAgent.split(' ').slice(-2).join(' '),
    'Platform': navigator.platform,
    'Language': navigator.language,
    'Online': navigator.onLine ? 'Yes' : 'No',
    'DOM Ready': document.readyState,
  });
}

// ============================================================================
// INITIALIZATION TRIGGER
// ============================================================================

/**
 * Start application when DOM is ready
 */
function initializeWhenReady() {
  if (document.readyState === 'loading') {
    // DOM not yet loaded
    document.addEventListener('DOMContentLoaded', () => {
      console.log('✓ DOM ready');
      logEnvironmentInfo();
      startApplication();
    });
  } else {
    // DOM already loaded
    console.log('✓ DOM already ready');
    logEnvironmentInfo();
    startApplication();
  }
}

/**
 * Handle page unload
 */
window.addEventListener('beforeunload', () => {
  console.log('👋 Leaving application');
});

/**
 * Handle visibility change
 */
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    console.log('📱 Application hidden');
  } else {
    console.log('📱 Application visible');
    // Optionally refresh data when app becomes visible again
    // refreshProtocolStats();
  }
});

// ============================================================================
// EXPORT FOR EXTERNAL ACCESS
// ============================================================================

// Export AppState for debugging in console
window.AppState = AppState;

// Export initialization function
export { startApplication as initializeApplication };

// ============================================================================
// START APPLICATION
// ============================================================================

console.log('📍 App initialization script loaded, waiting for DOM...');
initializeWhenReady();
