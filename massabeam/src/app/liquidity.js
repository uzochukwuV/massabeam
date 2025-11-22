/**
 * Liquidity Management Module
 *
 * Handles pool creation, adding/removing liquidity, and pool listing
 */

import { AMMContract, toU256, getUserAddress, isWalletConnected, showSuccess, showError } from './main.js';
import { getAllTokens } from './token-service.js';

// ============================================================================
// CREATE POOL
// ============================================================================

/**
 * Handle create pool form submission
 */
export async function handleCreatePool(event) {
  if (event) event.preventDefault();

  if (!isWalletConnected()) {
    showError('Please connect your wallet first');
    return;
  }

  try {
    const tokenA = document.getElementById('createPoolTokenA')?.value;
    const tokenB = document.getElementById('createPoolTokenB')?.value;
    const amountA = document.getElementById('createPoolAmountA')?.value;
    const amountB = document.getElementById('createPoolAmountB')?.value;

    // Validation
    if (!tokenA || !tokenB) {
      showError('Please select both tokens');
      return;
    }

    if (tokenA === tokenB) {
      showError('Cannot create pool with same token');
      return;
    }

    if (!amountA || !amountB || parseFloat(amountA) <= 0 || parseFloat(amountB) <= 0) {
      showError('Please enter valid amounts');
      return;
    }

    // Get token decimals (assuming 8 for now, should get from token contract)
    const decimalsA = 8;
    const decimalsB = 8;

    // Convert to raw amounts
    const rawAmountA = Math.floor(parseFloat(amountA) * Math.pow(10, decimalsA));
    const rawAmountB = Math.floor(parseFloat(amountB) * Math.pow(10, decimalsB));

    // Set deadline (5 minutes from now)
    const deadline = Math.floor(Date.now() / 1000) + 300;

    console.log('Creating pool:', {
      tokenA,
      tokenB,
      amountA: rawAmountA,
      amountB: rawAmountB,
      deadline
    });

    // Call contract
    await AMMContract.createPool(tokenA, tokenB, rawAmountA, rawAmountB, deadline);

    // Clear form
    document.getElementById('createPoolForm')?.reset();

    // Refresh pools
    await refreshPools();

    showSuccess('Pool created successfully!');
  } catch (error) {
    console.error('Create pool error:', error);
    showError('Failed to create pool: ' + error.message);
  }
}

// ============================================================================
// ADD LIQUIDITY
// ============================================================================

/**
 * Handle add liquidity form submission
 */
export async function handleAddLiquidity(event) {
  if (event) event.preventDefault();

  if (!isWalletConnected()) {
    showError('Please connect your wallet first');
    return;
  }

  try {
    const tokenA = document.getElementById('liquidityTokenA')?.value;
    const tokenB = document.getElementById('liquidityTokenB')?.value;
    const amountA = document.getElementById('liquidityAmountA')?.value;
    const amountB = document.getElementById('liquidityAmountB')?.value;

    // Validation
    if (!tokenA || !tokenB) {
      showError('Please select both tokens');
      return;
    }

    if (!amountA || !amountB || parseFloat(amountA) <= 0 || parseFloat(amountB) <= 0) {
      showError('Please enter valid amounts');
      return;
    }

    // Get slippage
    const slippage = getSelectedSlippage() || 0.5; // Default 0.5%

    // Get token decimals
    const decimalsA = 8;
    const decimalsB = 8;

    // Convert to raw amounts
    const rawAmountADesired = Math.floor(parseFloat(amountA) * Math.pow(10, decimalsA));
    const rawAmountBDesired = Math.floor(parseFloat(amountB) * Math.pow(10, decimalsB));

    // Calculate minimum amounts with slippage
    const rawAmountAMin = Math.floor(rawAmountADesired * (1 - slippage / 100));
    const rawAmountBMin = Math.floor(rawAmountBDesired * (1 - slippage / 100));

    // Set deadline (5 minutes from now)
    const deadline = Math.floor(Date.now() / 1000) + 300;

    console.log('Adding liquidity:', {
      tokenA,
      tokenB,
      amountADesired: rawAmountADesired,
      amountBDesired: rawAmountBDesired,
      amountAMin: rawAmountAMin,
      amountBMin: rawAmountBMin,
      deadline
    });

    // Call contract
    await AMMContract.addLiquidity(
      tokenA,
      tokenB,
      rawAmountADesired,
      rawAmountBDesired,
      rawAmountAMin,
      rawAmountBMin,
      deadline
    );

    // Clear form
    document.getElementById('addLiquidityForm')?.reset();

    // Refresh pools
    await refreshPools();

    showSuccess('Liquidity added successfully!');
  } catch (error) {
    console.error('Add liquidity error:', error);
    showError('Failed to add liquidity: ' + error.message);
  }
}

// ============================================================================
// REMOVE LIQUIDITY
// ============================================================================

/**
 * Handle remove liquidity form submission
 */
export async function handleRemoveLiquidity(event) {
  if (event) event.preventDefault();

  if (!isWalletConnected()) {
    showError('Please connect your wallet first');
    return;
  }

  try {
    const poolPair = document.getElementById('removeLiquidityPool')?.value;
    const liquidityAmount = document.getElementById('removeLiquidityAmount')?.value;

    // Validation
    if (!poolPair) {
      showError('Please select a pool');
      return;
    }

    if (!liquidityAmount || parseFloat(liquidityAmount) <= 0) {
      showError('Please enter valid amount');
      return;
    }

    // Parse pool pair (format: "tokenA:tokenB")
    const [tokenA, tokenB] = poolPair.split(':');

    if (!tokenA || !tokenB) {
      showError('Invalid pool selection');
      return;
    }

    // Get slippage
    const slippage = getSelectedSlippage() || 0.5; // Default 0.5%

    // Convert liquidity amount to raw
    const rawLiquidity = Math.floor(parseFloat(liquidityAmount));

    // Get pool info to calculate minimum amounts
    const pool = await AMMContract.getPool(tokenA, tokenB);
    if (!pool) {
      showError('Pool not found');
      return;
    }

    // Calculate expected amounts based on pool reserves and LP supply
    const totalSupply = pool.totalSupply || 1;
    const expectedA = Math.floor((rawLiquidity / totalSupply) * pool.reserveA);
    const expectedB = Math.floor((rawLiquidity / totalSupply) * pool.reserveB);

    // Apply slippage
    const amountAMin = Math.floor(expectedA * (1 - slippage / 100));
    const amountBMin = Math.floor(expectedB * (1 - slippage / 100));

    // Set deadline (5 minutes from now)
    const deadline = Math.floor(Date.now() / 1000) + 300;

    console.log('Removing liquidity:', {
      tokenA,
      tokenB,
      liquidity: rawLiquidity,
      amountAMin,
      amountBMin,
      deadline
    });

    // Call contract
    await AMMContract.removeLiquidity(
      tokenA,
      tokenB,
      rawLiquidity,
      amountAMin,
      amountBMin,
      deadline
    );

    // Clear form
    document.getElementById('removeLiquidityForm')?.reset();

    // Refresh pools
    await refreshPools();

    showSuccess('Liquidity removed successfully!');
  } catch (error) {
    console.error('Remove liquidity error:', error);
    showError('Failed to remove liquidity: ' + error.message);
  }
}

// ============================================================================
// POOL LISTING
// ============================================================================

/**
 * Refresh and display all pools
 */
export async function refreshPools() {
  if (!isWalletConnected()) return;

  try {
    // Get pool count
    const poolCount = await AMMContract.getPoolCount();

    // Update UI
    updateElement('activePoolCount', poolCount);
    updateElement('poolCount', poolCount);

    // Load user pools
    await loadUserPools();

    // Load all pools
    await loadAllPools();

  } catch (error) {
    console.error('Error refreshing pools:', error);
  }
}

/**
 * Load user's liquidity positions
 */
async function loadUserPools() {
  const userAddress = getUserAddress();
  if (!userAddress) return;

  const container = document.getElementById('userPoolsList');
  if (!container) return;

  try {
    // Get all tokens
    const tokens = getAllTokens();
    const userPools = [];

    // Check each token pair for user LP balance
    for (let i = 0; i < tokens.length; i++) {
      for (let j = i + 1; j < tokens.length; j++) {
        const tokenA = tokens[i].address;
        const tokenB = tokens[j].address;

        try {
          const lpBalance = await AMMContract.getLPBalance(tokenA, tokenB, userAddress);

          if (lpBalance && parseFloat(lpBalance) > 0) {
            const pool = await AMMContract.getPool(tokenA, tokenB);
            if (pool && pool.isActive) {
              userPools.push({
                tokenA,
                tokenB,
                tokenASymbol: tokens[i].symbol,
                tokenBSymbol: tokens[j].symbol,
                lpBalance,
                pool
              });
            }
          }
        } catch (error) {
          // Pool doesn't exist, skip
          continue;
        }
      }
    }

    // Display user pools
    if (userPools.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">💧</div>
          <p>No liquidity positions found</p>
          <button class="secondary-btn" onclick="switchLiquidityTab('add')">Add Liquidity</button>
        </div>
      `;
    } else {
      container.innerHTML = userPools.map(position => createPoolItem(position, true)).join('');
    }

  } catch (error) {
    console.error('Error loading user pools:', error);
  }
}

/**
 * Load all available pools
 */
async function loadAllPools() {
  const container = document.getElementById('allPoolsList');
  if (!container) return;

  try {
    // Get all tokens
    const tokens = getAllTokens();
    const allPools = [];

    // Check each token pair
    for (let i = 0; i < tokens.length; i++) {
      for (let j = i + 1; j < tokens.length; j++) {
        const tokenA = tokens[i].address;
        const tokenB = tokens[j].address;

        try {
          const pool = await AMMContract.getPool(tokenA, tokenB);

          if (pool && pool.isActive) {
            allPools.push({
              tokenA,
              tokenB,
              tokenASymbol: tokens[i].symbol,
              tokenBSymbol: tokens[j].symbol,
              pool
            });
          }
        } catch (error) {
          // Pool doesn't exist, skip
          continue;
        }
      }
    }

    // Display all pools
    if (allPools.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🏊</div>
          <p>No pools available</p>
          <button class="secondary-btn" onclick="openCreatePoolModal()">Create First Pool</button>
        </div>
      `;
    } else {
      container.innerHTML = allPools.map(poolInfo => createPoolItem(poolInfo, false)).join('');
    }

  } catch (error) {
    console.error('Error loading all pools:', error);
  }
}

/**
 * Create pool item HTML
 */
function createPoolItem(poolInfo, isUserPool) {
  const { tokenASymbol, tokenBSymbol, pool, lpBalance } = poolInfo;

  const reserveA = (pool.reserveA / 1e8).toFixed(4);
  const reserveB = (pool.reserveB / 1e8).toFixed(4);
  const fee = (pool.fee / 100).toFixed(2);

  let lpSection = '';
  if (isUserPool && lpBalance) {
    lpSection = `
      <div class="pool-balance">
        <span class="balance-label">Your LP Tokens:</span>
        <span class="balance-value">${(parseFloat(lpBalance) / 1e8).toFixed(4)}</span>
      </div>
    `;
  }

  return `
    <div class="pool-item">
      <div class="pool-pair">
        <div class="token-icons">
          <span class="token-icon">${tokenASymbol[0]}</span>
          <span class="token-icon">${tokenBSymbol[0]}</span>
        </div>
        <div class="pair-info">
          <h4 class="pair-name">${tokenASymbol} / ${tokenBSymbol}</h4>
          <span class="pool-fee">${fee}% fee</span>
        </div>
      </div>
      <div class="pool-liquidity">
        <div class="liquidity-item">
          <span class="liquidity-label">${tokenASymbol}</span>
          <span class="liquidity-value">${reserveA}</span>
        </div>
        <div class="liquidity-item">
          <span class="liquidity-label">${tokenBSymbol}</span>
          <span class="liquidity-value">${reserveB}</span>
        </div>
      </div>
      ${lpSection}
      <div class="pool-actions">
        <button class="btn-small primary" onclick="selectPoolForAdd('${poolInfo.tokenA}', '${poolInfo.tokenB}')">Add</button>
        ${isUserPool ? `<button class="btn-small secondary" onclick="selectPoolForRemove('${poolInfo.tokenA}', '${poolInfo.tokenB}')">Remove</button>` : ''}
      </div>
    </div>
  `;
}

// ============================================================================
// UI HELPERS
// ============================================================================

/**
 * Get selected slippage tolerance
 */
function getSelectedSlippage() {
  const activeBtn = document.querySelector('.slippage-btn.active');
  if (activeBtn) {
    return parseFloat(activeBtn.dataset.slippage);
  }

  const customInput = document.querySelector('.slippage-input');
  if (customInput && customInput.value) {
    return parseFloat(customInput.value);
  }

  return 0.5; // Default
}

/**
 * Update element text content
 */
function updateElement(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

/**
 * Switch liquidity tab
 */
export function switchLiquidityTab(tab) {
  // Update tab buttons
  document.querySelectorAll('.liquidity-tabs .tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });

  // Show/hide cards
  const addCard = document.getElementById('addLiquidityCard');
  const removeCard = document.getElementById('removeLiquidityCard');

  if (addCard && removeCard) {
    if (tab === 'add') {
      addCard.classList.remove('hidden');
      removeCard.classList.add('hidden');
    } else {
      addCard.classList.add('hidden');
      removeCard.classList.remove('hidden');

      // Load user pools for removal
      loadUserPoolsForRemoval();
    }
  }
}

/**
 * Load user pools into removal dropdown
 */
async function loadUserPoolsForRemoval() {
  const select = document.getElementById('removeLiquidityPool');
  if (!select) return;

  const userAddress = getUserAddress();
  if (!userAddress) return;

  try {
    const tokens = getAllTokens();
    const userPools = [];

    // Find user's pools
    for (let i = 0; i < tokens.length; i++) {
      for (let j = i + 1; j < tokens.length; j++) {
        const tokenA = tokens[i].address;
        const tokenB = tokens[j].address;

        try {
          const lpBalance = await AMMContract.getLPBalance(tokenA, tokenB, userAddress);

          if (lpBalance && parseFloat(lpBalance) > 0) {
            userPools.push({
              value: `${tokenA}:${tokenB}`,
              label: `${tokens[i].symbol} / ${tokens[j].symbol}`,
              lpBalance
            });
          }
        } catch (error) {
          continue;
        }
      }
    }

    // Populate select
    select.innerHTML = '<option value="">Select Pool</option>' +
      userPools.map(pool => `<option value="${pool.value}">${pool.label}</option>`).join('');

  } catch (error) {
    console.error('Error loading pools for removal:', error);
  }
}

/**
 * Update remove liquidity amount based on percentage
 */
export function updateRemoveLiquidityAmount() {
  const percentSlider = document.getElementById('removeLiquidityPercent');
  const percentDisplay = document.getElementById('removeLiquidityPercentDisplay');
  const amountInput = document.getElementById('removeLiquidityAmount');
  const balanceSpan = document.getElementById('lpTokenBalance');

  if (percentSlider && percentDisplay) {
    const percent = percentSlider.value;
    percentDisplay.textContent = percent + '%';

    if (balanceSpan && amountInput) {
      const totalBalance = parseFloat(balanceSpan.textContent) || 0;
      const amount = (totalBalance * percent / 100).toFixed(8);
      amountInput.value = amount;
    }
  }
}

/**
 * Set remove percentage
 */
export function setRemovePercent(percent) {
  const slider = document.getElementById('removeLiquidityPercent');
  if (slider) {
    slider.value = percent;
    updateRemoveLiquidityAmount();
  }
}

/**
 * Select pool for adding liquidity
 */
window.selectPoolForAdd = function(tokenA, tokenB) {
  switchLiquidityTab('add');

  const tokenASelect = document.getElementById('liquidityTokenA');
  const tokenBSelect = document.getElementById('liquidityTokenB');

  if (tokenASelect) tokenASelect.value = tokenA;
  if (tokenBSelect) tokenBSelect.value = tokenB;
};

/**
 * Select pool for removing liquidity
 */
window.selectPoolForRemove = async function(tokenA, tokenB) {
  switchLiquidityTab('remove');

  const poolSelect = document.getElementById('removeLiquidityPool');
  if (poolSelect) {
    poolSelect.value = `${tokenA}:${tokenB}`;

    // Load LP balance
    const userAddress = getUserAddress();
    if (userAddress) {
      const lpBalance = await AMMContract.getLPBalance(tokenA, tokenB, userAddress);
      updateElement('lpTokenBalance', (parseFloat(lpBalance) / 1e8).toFixed(8));
      updateRemoveLiquidityAmount();
    }
  }
};

/**
 * Open create pool modal/section
 */
window.openCreatePoolModal = function() {
  // Switch to create pool section
  const sections = document.querySelectorAll('.section');
  sections.forEach(s => s.classList.remove('active'));

  const createPoolSection = document.getElementById('createPool');
  if (createPoolSection) {
    createPoolSection.classList.add('active');
  }
};

/**
 * Close create pool section
 */
window.closeCreatePoolSection = function() {
  const createPoolSection = document.getElementById('createPool');
  if (createPoolSection) {
    createPoolSection.classList.remove('active');
  }

  // Return to liquidity section
  const liquiditySection = document.getElementById('liquidity');
  if (liquiditySection) {
    liquiditySection.classList.add('active');
  }
};

// Export all functions
export default {
  handleCreatePool,
  handleAddLiquidity,
  handleRemoveLiquidity,
  refreshPools,
  switchLiquidityTab,
  setRemovePercent,
  updateRemoveLiquidityAmount,
};
