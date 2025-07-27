import './style.css'
import { MassaSwapSDK, MassaSwapUtils } from './massabeam.js';






// Global variables
let massaSwap = null;
let isConnected = false;
let balanceChart = null;
let priceChart = null;
let accountAddress = null;

// Configuration
const TOKEN_ADDRESSES = {
  USDC: "AS12GKSLndMdbpiFQNbUhcWt2CZusmL4sMTh21zpymnr6jjfm4xZj", // USDC token address
  WMAS: "AS12p4qNq9ZU8XZKDomM51stC9G1qz6faaAFX4jYfpbbr4gJULL9G",// W
  Busdt: "AS1GrZXNAdVUtCbWC3FE3kajmaEg6FxiE9cxQuYBM3KQELGjEE31",
  Busdc: "AS1xs2KfX3LVeFoF3v8PQZ8TTWsFAW3UYz1Wkg8358DcakPguWs9"
};

// Initialize the application
document.addEventListener('DOMContentLoaded', function () {
  initializeUI();
  setupEventListeners();
  initializeCharts();
});

// UI Initialization
function initializeUI() {
  // Set up tab switching
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');

  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const tabName = button.dataset.tab;

      // Update button states
      tabButtons.forEach(btn => {
        btn.classList.remove('active', 'border-massa-500', 'text-massa-600');
        btn.classList.add('border-transparent', 'text-gray-500', 'hover:text-gray-700', 'hover:border-gray-300');
      });

      button.classList.add('active', 'border-massa-500', 'text-massa-600');
      button.classList.remove('border-transparent', 'text-gray-500', 'hover:text-gray-700', 'hover:border-gray-300');

      // Update content visibility
      tabContents.forEach(content => {
        content.classList.add('hidden');
      });

      document.getElementById(`${tabName}-tab`).classList.remove('hidden');
    });
  });

  // Set initial active tab
  document.querySelector('.tab-button[data-tab="swap"]').classList.add('border-massa-500', 'text-massa-600');
  document.querySelector('.tab-button[data-tab="swap"]').classList.remove('border-transparent', 'text-gray-500');
}

// Event Listeners
function setupEventListeners() {
  // Connect wallet
  document.getElementById('connect-wallet').addEventListener('click', connectWallet);

  // Swap functionality
  document.getElementById('swap-direction').addEventListener('click', swapTokenDirection);
  document.getElementById('execute-swap').addEventListener('click', executeSwap);
  document.getElementById('amount-in').addEventListener('input', calculateSwapOutput);

  // Liquidity functionality
  document.getElementById('add-liquidity').addEventListener('click', addLiquidity);
  document.getElementById('remove-liquidity').addEventListener('click', removeLiquidity);
  document.getElementById('create-pool').addEventListener('click', createPool);

  // Advanced functionality
  document.getElementById('create-dca').addEventListener('click', createDCAStrategy);
  document.getElementById('create-order').addEventListener('click', createLimitOrder);
  document.getElementById('start-autonomous').addEventListener('click', startAutonomousEngine);
  document.getElementById('stop-autonomous').addEventListener('click', stopAutonomousEngine);

  // Yield farming functionality
  document.getElementById('stake-lp').addEventListener('click', stakeLPTokens);
  document.getElementById('unstake-lp').addEventListener('click', unstakeLPTokens);
  document.getElementById('claim-rewards').addEventListener('click', claimRewards);
  document.getElementById('create-yield-pool').addEventListener('click', createYieldPool);

  // Listen for MassaSwap events
  document.addEventListener('massaswap-event', handleContractEvent);
}

// Wallet Connection
async function connectWallet() {
  try {
    showLoading(true); // AS1CGNNTfW7N5o852T7B3p25PMn2kWBtwe5ruuhLyLeJDx8nUVQg

   
   
    massaSwap = new MassaSwapSDK(null);
    const acc = await massaSwap.initialize();
    console.log(" here is the account"+ acc)
    accountAddress=acc.address;

    console.log("Connected to wallet:", acc);
    isConnected = true;
    updateConnectionStatus(true);
    updateAccountInfo(accountAddress);
    await updateBalances();

    showNotification('Success', 'Wallet connected successfully!', 'success');
  } catch (error) {
    console.error('Failed to connect wallet:', error);
    showNotification('Error', 'Failed to connect wallet: ' + error.message, 'error');
  } finally {
    showLoading(false);
  }
}

// Update UI functions
function updateConnectionStatus(connected) {
  const statusElement = document.getElementById('connection-status');
  const connectButton = document.getElementById('connect-wallet');
  const accountInfo = document.getElementById('account-info');

  if (connected) {
    statusElement.innerHTML = '<div class="w-3 h-3 bg-green-400 rounded-full mr-2"></div><span class="text-sm">Connected</span>';
    connectButton.textContent = 'Connected';
    connectButton.disabled = true;
    connectButton.classList.add('opacity-50', 'cursor-not-allowed');
    accountInfo.classList.remove('hidden');
  } else {
    statusElement.innerHTML = '<div class="w-3 h-3 bg-red-400 rounded-full mr-2"></div><span class="text-sm">Disconnected</span>';
    connectButton.textContent = 'Connect Wallet';
    connectButton.disabled = false;
    connectButton.classList.remove('opacity-50', 'cursor-not-allowed');
    accountInfo.classList.add('hidden');
  }
}

function updateAccountInfo(address) {
  document.getElementById('user-address').textContent = address;
}

async function updateBalances() {
  if (!massaSwap || !isConnected) return;

  try {
    const balances = await massaSwap.getBalances(accountAddress);
    document.getElementById('usdc-balance').textContent = balances.USDC.toFixed(2);
    document.getElementById('wmas-balance').textContent = balances.WMAS.toFixed(2);

    // Update charts
    updateBalanceChart(balances);
  } catch (error) {
    console.error('Failed to update balances:', error);
  }
}

// Swap functionality
function swapTokenDirection() {
  const tokenIn = document.getElementById('token-in');
  const tokenOut = document.getElementById('token-out');
  const amountIn = document.getElementById('amount-in');
  const amountOut = document.getElementById('amount-out');

  // Swap the token selections
  const tempValue = tokenIn.value;
  tokenIn.value = tokenOut.value;
  tokenOut.value = tempValue;

  // Clear amounts
  amountIn.value = '';
  amountOut.value = '';
}

function calculateSwapOutput() {
  // This would calculate the expected output based on current pool reserves
  // For now, we'll use a simple placeholder calculation
  const amountIn = parseFloat(document.getElementById('amount-in').value) || 0;
  const estimatedOutput = amountIn * 0.45; // Placeholder rate
  document.getElementById('amount-out').value = estimatedOutput.toFixed(6);
}

async function executeSwap() {
  if (!massaSwap || !isConnected) {
    showNotification('Error', 'Please connect your wallet first', 'error');
    return;
  }

  try {
    showLoading(true);

    const tokenInSymbol = document.getElementById('token-in').value;
    const tokenOutSymbol = document.getElementById('token-out').value;
    const amountIn = document.getElementById('amount-in').value;
    const slippage = document.getElementById('slippage').value;

    if (!amountIn || parseFloat(amountIn) <= 0) {
      throw new Error('Please enter a valid amount');
    }

    const tokenInAddress = TOKEN_ADDRESSES[tokenInSymbol];
    const tokenOutAddress = TOKEN_ADDRESSES[tokenOutSymbol];
    const amountInUnits = massaSwap.utils.toContractUnits(amountIn);

    await massaSwap.quickSwap(tokenInAddress, tokenOutAddress, amountInUnits, parseFloat(slippage));

    showNotification('Success', 'Swap executed successfully!', 'success');
    await updateBalances();
  } catch (error) {
    console.error('Swap failed:', error);
    showNotification('Error', 'Swap failed: ' + error.message, 'error');
  } finally {
    showLoading(false);
  }
}

// Liquidity functionality
async function addLiquidity() {
  if (!massaSwap || !isConnected) {
    showNotification('Error', 'Please connect your wallet first', 'error');
    return;
  }

  try {
    showLoading(true);

    const amountA = document.getElementById('liquidity-amount-a').value;
    const amountB = document.getElementById('liquidity-amount-b').value;
    console.log(amountA, amountB);

    if (!amountA || !amountB || parseFloat(amountA) <= 0 || parseFloat(amountB) <= 0) {
      throw new Error('Please enter valid amounts for both tokens');
    }

    const amountAUnits = massaSwap.utils.toContractUnits(amountA);
    const amountBUnits = massaSwap.utils.toContractUnits(amountB);

    await massaSwap.dex.addLiquidity(
      TOKEN_ADDRESSES.USDC,
      TOKEN_ADDRESSES.WMAS,
      amountAUnits,
      amountBUnits
    );

    showNotification('Success', 'Liquidity added successfully!', 'success');
    await updateBalances();
  } catch (error) {
    console.error('Add liquidity failed:', error);
    showNotification('Error', 'Add liquidity failed: ' + error.message, 'error');
  } finally {
    showLoading(false);
  }
}

async function removeLiquidity() {
  if (!massaSwap || !isConnected) {
    showNotification('Error', 'Please connect your wallet first', 'error');
    return;
  }

  try {
    showLoading(true);

    const liquidityAmount = document.getElementById('remove-liquidity-amount').value;

    if (!liquidityAmount || parseFloat(liquidityAmount) <= 0) {
      throw new Error('Please enter a valid liquidity amount');
    }

    const liquidityUnits = massaSwap.utils.toContractUnits(liquidityAmount);

    await massaSwap.dex.removeLiquidity(
      TOKEN_ADDRESSES.USDC,
      TOKEN_ADDRESSES.WMAS,
      liquidityUnits
    );

    showNotification('Success', 'Liquidity removed successfully!', 'success');
    await updateBalances();
  } catch (error) {
    console.error('Remove liquidity failed:', error);
    showNotification('Error', 'Remove liquidity failed: ' + error.message, 'error');
  } finally {
    showLoading(false);
  }
}

async function createPool() {
  if (!massaSwap || !isConnected) {
    showNotification('Error', 'Please connect your wallet first', 'error');
    return;
  }

  console.log(accountAddress)

  try {
    showLoading(true);

    const usdcAmount = document.getElementById('pool-usdc-amount').value;
    const wmasAmount = document.getElementById('pool-wmas-amount').value;

    if (!usdcAmount || !wmasAmount || parseFloat(usdcAmount) <= 0 || parseFloat(wmasAmount) <= 0) {
      throw new Error('Please enter valid amounts for both tokens');
    }

    const usdcUnits = massaSwap.utils.toContractUnits(usdcAmount);
    const wmasUnits = massaSwap.utils.toContractUnits(wmasAmount);

    await massaSwap.dex.createPool(
      TOKEN_ADDRESSES.USDC,
      TOKEN_ADDRESSES.WMAS,
      usdcUnits,
      wmasUnits
    );

    showNotification('Success', 'Pool created successfully!', 'success');
    await updateBalances();
  } catch (error) {
    console.error('Create pool failed:', error);
    showNotification('Error', 'Create pool failed: ' + error.message, 'error');
  } finally {
    showLoading(false);
  }
}

// Advanced DeFi functionality
async function createDCAStrategy() {
  if (!massaSwap || !isConnected) {
    showNotification('Error', 'Please connect your wallet first', 'error');
    return;
  }

  try {
    showLoading(true);

    const tokenInSymbol = document.getElementById('dca-token-in').value;
    const tokenOutSymbol = document.getElementById('dca-token-out').value;
    const amount = document.getElementById('dca-amount').value;
    const interval = document.getElementById('dca-interval').value;
    const total = document.getElementById('dca-total').value;

    if (!amount || !interval || !total) {
      throw new Error('Please fill in all DCA strategy fields');
    }

    const tokenInAddress = TOKEN_ADDRESSES[tokenInSymbol];
    const tokenOutAddress = TOKEN_ADDRESSES[tokenOutSymbol];
    const amountUnits = massaSwap.utils.toContractUnits(amount);

    await massaSwap.advanced.createDCAStrategy(
      tokenInAddress,
      tokenOutAddress,
      amountUnits,
      parseInt(interval),
      parseInt(total)
    );

    showNotification('Success', 'DCA strategy created successfully!', 'success');
  } catch (error) {
    console.error('Create DCA strategy failed:', error);
    showNotification('Error', 'Create DCA strategy failed: ' + error.message, 'error');
  } finally {
    showLoading(false);
  }
}

async function createLimitOrder() {
  if (!massaSwap || !isConnected) {
    showNotification('Error', 'Please connect your wallet first', 'error');
    return;
  }

  try {
    showLoading(true);

    const tokenInSymbol = document.getElementById('order-token-in').value;
    const tokenOutSymbol = document.getElementById('order-token-out').value;
    const amountIn = document.getElementById('order-amount-in').value;
    const minAmountOut = document.getElementById('order-min-out').value;
    const expiryHours = document.getElementById('order-expiry').value;
    const orderType = document.getElementById('order-type').value;

    if (!amountIn || !minAmountOut || !expiryHours) {
      throw new Error('Please fill in all limit order fields');
    }

    const tokenInAddress = TOKEN_ADDRESSES[tokenInSymbol];
    const tokenOutAddress = TOKEN_ADDRESSES[tokenOutSymbol];
    const amountInUnits = massaSwap.utils.toContractUnits(amountIn);
    const minAmountOutUnits = massaSwap.utils.toContractUnits(minAmountOut);
    const expiry = massaSwap.utils.getExpiryTimestamp(parseInt(expiryHours));

    await massaSwap.advanced.createLimitOrder(
      tokenInAddress,
      tokenOutAddress,
      amountInUnits,
      minAmountOutUnits,
      expiry,
      orderType
    );

    showNotification('Success', 'Limit order created successfully!', 'success');
  } catch (error) {
    console.error('Create limit order failed:', error);
    showNotification('Error', 'Create limit order failed: ' + error.message, 'error');
  } finally {
    showLoading(false);
  }
}

async function startAutonomousEngine() {
  if (!massaSwap || !isConnected) {
    showNotification('Error', 'Please connect your wallet first', 'error');
    return;
  }

  try {
    showLoading(true);

    await massaSwap.advanced.startAutonomousEngine();

    const statusElement = document.getElementById('autonomous-status');
    statusElement.innerHTML = '<div class="w-3 h-3 bg-green-400 rounded-full mr-2"></div><span class="text-sm">Running</span>';

    showNotification('Success', 'Autonomous engine started!', 'success');
  } catch (error) {
    console.error('Start autonomous engine failed:', error);
    showNotification('Error', 'Start autonomous engine failed: ' + error.message, 'error');
  } finally {
    showLoading(false);
  }
}

async function stopAutonomousEngine() {
  if (!massaSwap || !isConnected) {
    showNotification('Error', 'Please connect your wallet first', 'error');
    return;
  }

  try {
    showLoading(true);

    await massaSwap.advanced.stopAutonomousEngine();

    const statusElement = document.getElementById('autonomous-status');
    statusElement.innerHTML = '<div class="w-3 h-3 bg-gray-400 rounded-full mr-2"></div><span class="text-sm">Stopped</span>';

    showNotification('Success', 'Autonomous engine stopped!', 'success');
  } catch (error) {
    console.error('Stop autonomous engine failed:', error);
    showNotification('Error', 'Stop autonomous engine failed: ' + error.message, 'error');
  } finally {
    showLoading(false);
  }
}

// Yield farming functionality
async function stakeLPTokens() {
  if (!massaSwap || !isConnected) {
    showNotification('Error', 'Please connect your wallet first', 'error');
    return;
  }

  try {
    showLoading(true);

    const poolId = document.getElementById('stake-pool-id').value;
    const amount = document.getElementById('stake-amount').value;

    if (!poolId || !amount) {
      throw new Error('Please fill in all staking fields');
    }

    const amountUnits = massaSwap.utils.toContractUnits(amount);

    await massaSwap.advanced.stakeLP(parseInt(poolId), amountUnits);

    showNotification('Success', 'LP tokens staked successfully!', 'success');
  } catch (error) {
    console.error('Stake LP tokens failed:', error);
    showNotification('Error', 'Stake LP tokens failed: ' + error.message, 'error');
  } finally {
    showLoading(false);
  }
}

async function unstakeLPTokens() {
  if (!massaSwap || !isConnected) {
    showNotification('Error', 'Please connect your wallet first', 'error');
    return;
  }

  try {
    showLoading(true);

    const poolId = document.getElementById('unstake-pool-id').value;
    const amount = document.getElementById('unstake-amount').value;

    if (!poolId || !amount) {
      throw new Error('Please fill in all unstaking fields');
    }

    const amountUnits = massaSwap.utils.toContractUnits(amount);

    await massaSwap.advanced.unstakeLP(parseInt(poolId), amountUnits);

    showNotification('Success', 'LP tokens unstaked successfully!', 'success');
  } catch (error) {
    console.error('Unstake LP tokens failed:', error);
    showNotification('Error', 'Unstake LP tokens failed: ' + error.message, 'error');
  } finally {
    showLoading(false);
  }
}

async function claimRewards() {
  if (!massaSwap || !isConnected) {
    showNotification('Error', 'Please connect your wallet first', 'error');
    return;
  }

  try {
    showLoading(true);

    const poolId = document.getElementById('claim-pool-id').value;

    if (!poolId) {
      throw new Error('Please enter a pool ID');
    }

    await massaSwap.advanced.claimRewards(parseInt(poolId));

    showNotification('Success', 'Rewards claimed successfully!', 'success');
  } catch (error) {
    console.error('Claim rewards failed:', error);
    showNotification('Error', 'Claim rewards failed: ' + error.message, 'error');
  } finally {
    showLoading(false);
  }
}

async function createYieldPool() {
  if (!massaSwap || !isConnected) {
    showNotification('Error', 'Please connect your wallet first', 'error');
    return;
  }

  try {
    showLoading(true);

    const tokenASymbol = document.getElementById('yield-token-a').value;
    const tokenBSymbol = document.getElementById('yield-token-b').value;
    const rewardToken = document.getElementById('reward-token').value;
    const rewardRate = document.getElementById('reward-rate').value;

    if (!rewardToken || !rewardRate) {
      throw new Error('Please fill in all yield pool fields');
    }

    const tokenAAddress = TOKEN_ADDRESSES[tokenASymbol];
    const tokenBAddress = TOKEN_ADDRESSES[tokenBSymbol];
    const rewardRateUnits = massaSwap.utils.toContractUnits(rewardRate);

    await massaSwap.advanced.createYieldPool(
      tokenAAddress,
      tokenBAddress,
      rewardToken,
      rewardRateUnits
    );

    showNotification('Success', 'Yield pool created successfully!', 'success');
  } catch (error) {
    console.error('Create yield pool failed:', error);
    showNotification('Error', 'Create yield pool failed: ' + error.message, 'error');
  } finally {
    showLoading(false);
  }
}

// Chart functionality
function initializeCharts() {
  // Initialize balance chart
  const balanceData = [{
    y: [0],
    x: [new Date().toISOString()],
    name: "USDC Balance",
    type: 'scatter',
    line: { color: '#3b82f6' }
  }, {
    y: [0],
    x: [new Date().toISOString()],
    name: "WMAS Balance",
    type: 'scatter',
    line: { color: '#10b981' }
  }];

  const balanceLayout = {
    plot_bgcolor: "#f9fafb",
    paper_bgcolor: "#f9fafb",
    font: { size: 12, color: '#374151' },
    xaxis: { automargin: true },
    yaxis: { title: 'Balance' },
    margin: { t: 20, r: 20, b: 40, l: 60 }
  };

  Plotly.newPlot('balance-chart', balanceData, balanceLayout, { responsive: true });

  // Initialize price chart
  const priceData = [{
    y: [1],
    x: [new Date().toISOString()],
    name: "USDC/WMAS Price",
    type: 'scatter',
    line: { color: '#8b5cf6' }
  }];

  const priceLayout = {
    plot_bgcolor: "#f9fafb",
    paper_bgcolor: "#f9fafb",
    font: { size: 12, color: '#374151' },
    xaxis: { automargin: true },
    yaxis: { title: 'Price' },
    margin: { t: 20, r: 20, b: 40, l: 60 }
  };

  Plotly.newPlot('price-chart', priceData, priceLayout, { responsive: true });
}

function updateBalanceChart(balances) {
  const timestamp = new Date().toISOString();

  Plotly.extendTraces('balance-chart', {
    y: [[balances.USDC], [balances.WMAS]],
    x: [[timestamp], [timestamp]]
  }, [0, 1], 20);
}

// Event handling
function handleContractEvent(event) {
  const eventData = event.detail.data;
  const timestamp = event.detail.timestamp;

  // Add to event log
  const eventLog = document.getElementById('event-log');
  const listItem = document.createElement('li');
  listItem.className = 'text-sm border-b border-gray-200 pb-2';
  listItem.innerHTML = `
                <div class="flex justify-between">
                    <span class="font-medium">${eventData}</span>
                    <span class="text-gray-500 text-xs">${new Date(timestamp).toLocaleTimeString()}</span>
                </div>
            `;

  if (eventLog.firstChild.textContent.includes('No events yet')) {
    eventLog.innerHTML = '';
  }

  eventLog.insertBefore(listItem, eventLog.firstChild);

  // Keep only last 10 events
  while (eventLog.children.length > 10) {
    eventLog.removeChild(eventLog.lastChild);
  }

  // Update balances after events
  if (isConnected) {
    setTimeout(updateBalances, 1000);
  }
}

// Utility functions
function showLoading(show) {
  const overlay = document.getElementById('loading-overlay');
  if (show) {
    overlay.classList.remove('hidden');
  } else {
    overlay.classList.add('hidden');
  }
}

function showNotification(title, message, type = 'info') {
  const notification = document.getElementById('notification');
  const titleElement = document.getElementById('notification-title');
  const messageElement = document.getElementById('notification-message');
  const iconElement = document.getElementById('notification-icon');

  titleElement.textContent = title;
  messageElement.textContent = message;

  // Update colors based on type
  notification.className = 'fixed top-4 right-4 bg-white border-l-4 rounded-lg shadow-lg p-4 max-w-sm transform transition-transform duration-300 z-50';

  if (type === 'success') {
    notification.classList.add('border-green-500');
    iconElement.classList.add(['h-5','w-5','text-green-400']);
  } else if (type === 'error') {
    notification.classList.add('border-red-500');
    iconElement.classList.add(['h-5','w-5','text-red-400']);
  } else {
    notification.classList.add('border-blue-500');
    iconElement.classList.add(['h-5','w-5','text-blue-400']);
  }

  // Show notification
  notification.classList.remove('translate-x-full');

  // Hide after 5 seconds
  setTimeout(() => {
    notification.classList.add('translate-x-full');
  }, 5000);
}

// Auto-refresh balances every 30 seconds
setInterval(() => {
  if (isConnected) {
    updateBalances();
  }
}, 30000);
