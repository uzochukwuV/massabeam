import { AppState } from "../state.js";
import { showLoading, showError, showSuccess } from "../ui.js";
import { getTokenByAddress } from "../services/token-service.js";
import { getProvider } from "../wallet.js";
import { AMMContract } from "../amm-contract.js";
import { TOKENS_LIST } from "../contracts-config.js";

let selectedFromToken = null;
let selectedToToken = null;
let isInitialized = false;

// Load trade data and initialize
export async function loadTradeData() {
  try {
    showLoading(true);

    // Initialize only once
    if (!isInitialized) {
      initializeTokenSelectors();
      initializeSwapForm();
      isInitialized = true;
    }

    // Update button state based on wallet connection
    updateSwapButtonState();

    showLoading(false);
  } catch (error) {
    console.error("Failed to load trade data:", error);
    showError("Failed to load trade interface");
    showLoading(false);
  }
}

// Initialize token selector buttons
function initializeTokenSelectors() {
  const fromTokenSelect = document.getElementById("fromTokenSelect");
  const toTokenSelect = document.getElementById("toTokenSelect");

  if (!fromTokenSelect || !toTokenSelect) {
    console.error("Token select buttons not found");
    return;
  }

  // Check if already initialized
  if (fromTokenSelect.dataset.initialized === "true") {
    console.log("Token selectors already initialized");
    return;
  }

  // Click handler for "From" token
  fromTokenSelect.addEventListener("click", (e) => {
    e.preventDefault();
    console.log("From token select clicked");
    showTokenModal("from");
  });

  // Click handler for "To" token
  toTokenSelect.addEventListener("click", (e) => {
    e.preventDefault();
    console.log("To token select clicked");
    showTokenModal("to");
  });

  // Mark as initialized
  fromTokenSelect.dataset.initialized = "true";
  toTokenSelect.dataset.initialized = "true";

  console.log("Token selectors initialized");
}

// Show token selection modal
function showTokenModal(type) {
  console.log("showTokenModal called with type:", type);

  // Create modal overlay
  const existingModal = document.getElementById("tokenModal");
  if (existingModal) {
    console.log("Removing existing modal");
    existingModal.remove();
  }

  if (!TOKENS_LIST || TOKENS_LIST.length === 0) {
    console.error("TOKENS_LIST is empty or undefined");
    showError("No tokens available");
    return;
  }

  const modal = document.createElement("div");
  modal.id = "tokenModal";
  modal.className = "token-modal";
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
  `;

  modal.innerHTML = `
    <div class="modal-overlay" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); cursor: pointer;"></div>
    <div class="modal-content" style="position: relative; z-index: 10000; background: white; border-radius: 12px; padding: 20px; max-width: 400px; width: 90%; max-height: 80vh; overflow-y: auto;">
      <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <h3 style="margin: 0; color: #000;">Select a Token</h3>
        <button class="modal-close" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #666;">✖</button>
      </div>
      <div class="token-search" style="margin-bottom: 15px;">
        <input type="text" id="tokenSearch" placeholder="Search by name or address..." style="width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 8px; font-size: 14px;" />
      </div>
      <div class="token-list" id="tokenList" style="display: flex; flex-direction: column; gap: 8px;">
        ${TOKENS_LIST.map(token => `
          <div class="token-item" data-address="${token.address}" data-type="${type}" style="display: flex; justify-content: space-between; align-items: center; padding: 12px; border: 1px solid #eee; border-radius: 8px; cursor: pointer; transition: background 0.2s;" onmouseover="this.style.background='#f5f5f5'" onmouseout="this.style.background='white'">
            <div class="token-info">
              <div class="token-symbol" style="font-weight: 600; color: #000; font-size: 16px;">${token.symbol}</div>
              <div class="token-name" style="font-size: 12px; color: #666;">${token.name}</div>
            </div>
            <div class="token-balance" id="balance-${token.address}" style="font-size: 14px; color: #666;">-</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  console.log("Modal appended to body");

  // Close modal on overlay click
  const overlay = modal.querySelector('.modal-overlay');
  overlay.addEventListener('click', closeTokenModal);

  // Close modal on close button click
  const closeBtn = modal.querySelector('.modal-close');
  closeBtn.addEventListener('click', closeTokenModal);

  // Load balances if wallet connected
  if (AppState.user.connected) {
    loadTokenBalances();
  }

  // Add click handlers to token items
  document.querySelectorAll('.token-item').forEach(item => {
    item.addEventListener('click', () => {
      const address = item.dataset.address;
      const type = item.dataset.type;
      console.log("Token selected:", address, type);
      selectToken(address, type);
      closeTokenModal();
    });
  });

  // Add search functionality
  const searchInput = document.getElementById('tokenSearch');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      filterTokens(e.target.value);
    });
  }
}

// Load token balances in modal
async function loadTokenBalances() {
  const provider = getProvider();
  if (!provider) {
    console.log("Provider not available, skipping modal balance loading");
    return;
  }

  console.log("Loading token balances in modal...");

  // Load balances in parallel for better performance
  const balancePromises = TOKENS_LIST.map(async (token) => {
    try {
      const tokenContract = await getTokenByAddress(token.address);
      const balance = await tokenContract.balanceOf(provider.address);
      const decimals = await tokenContract.decimals();

      const balanceFormatted = Number(balance.toString()) / (10 ** Number(decimals));

      const balanceElement = document.getElementById(`balance-${token.address}`);
      if (balanceElement) {
        balanceElement.textContent = balanceFormatted.toFixed(4);
      }

      return { token: token.symbol, balance: balanceFormatted };
    } catch (error) {
      console.error(`Error loading balance for ${token.symbol}:`, error);
      const balanceElement = document.getElementById(`balance-${token.address}`);
      if (balanceElement) {
        balanceElement.textContent = "Error";
      }
      return { token: token.symbol, error: error.message };
    }
  });

  await Promise.all(balancePromises);
  console.log("Modal token balances loaded");
}

// Filter tokens by search
function filterTokens(searchTerm) {
  const tokenItems = document.querySelectorAll('.token-item');
  const search = searchTerm.toLowerCase();

  tokenItems.forEach(item => {
    const symbol = item.querySelector('.token-symbol').textContent.toLowerCase();
    const name = item.querySelector('.token-name').textContent.toLowerCase();
    const address = item.dataset.address.toLowerCase();

    if (symbol.includes(search) || name.includes(search) || address.includes(search)) {
      item.style.display = 'flex';
    } else {
      item.style.display = 'none';
    }
  });
}

// Select a token
async function selectToken(address, type) {
  const token = TOKENS_LIST.find(t => t.address === address);
  if (!token) {
    console.error("Token not found:", address);
    return;
  }

  console.log("Selecting token:", token.symbol, "for", type);

  if (type === "from") {
    selectedFromToken = token;

    // Update UI - query fresh element
    const fromTokenSelect = document.getElementById("fromTokenSelect");
    if (!fromTokenSelect) {
      console.error("fromTokenSelect element not found");
      return;
    }

    // Try to find the symbol element
    let symbolElement = fromTokenSelect.querySelector('.token-symbol');

    // If not found, the button might have been replaced - recreate the content
    if (!symbolElement) {
      console.warn("token-symbol element not found, recreating button content");
      fromTokenSelect.innerHTML = `
        <span class="token-symbol">${token.symbol}</span>
        <span class="dropdown-arrow">▼</span>
      `;
    } else {
      symbolElement.textContent = token.symbol;
    }

    // Load balance
    await updateTokenBalance("from", address);
  } else {
    selectedToToken = token;

    // Update UI - query fresh element
    const toTokenSelect = document.getElementById("toTokenSelect");
    if (!toTokenSelect) {
      console.error("toTokenSelect element not found");
      return;
    }

    // Try to find the symbol element
    let symbolElement = toTokenSelect.querySelector('.token-symbol');

    // If not found, the button might have been replaced - recreate the content
    if (!symbolElement) {
      console.warn("token-symbol element not found, recreating button content");
      toTokenSelect.innerHTML = `
        <span class="token-symbol">${token.symbol}</span>
        <span class="dropdown-arrow">▼</span>
      `;
    } else {
      symbolElement.textContent = token.symbol;
    }

    // Load balance
    await updateTokenBalance("to", address);
  }

  // Recalculate swap if both tokens selected
  if (selectedFromToken && selectedToToken) {
    calculateSwapOutput();
  }
}

// Update token balance display
async function updateTokenBalance(type, address) {
  const balanceId = type === "from" ? "fromTokenBalance" : "toTokenBalance";
  const balanceElement = document.getElementById(balanceId);

  if (!balanceElement) {
    console.error(`Balance element not found: ${balanceId}`);
    return;
  }

  // Show loading state
  balanceElement.textContent = "Loading...";

  const provider = getProvider();
  if (!provider) {
    console.log("Provider not available, skipping balance update");
    balanceElement.textContent = "0.0000";
    return;
  }

  if (!AppState.user.connected) {
    console.log("Wallet not connected");
    balanceElement.textContent = "0.0000";
    return;
  }

  try {
    console.log(`Updating ${type} balance for token:`, address);
    const tokenContract = await getTokenByAddress(address);
    const balance = await tokenContract.balanceOf(provider.address);
    const decimals = await tokenContract.decimals();

    const balanceFormatted = Number(balance.toString()) / (10 ** Number(decimals));
    console.log(`${type} balance:`, balanceFormatted, `(${balance.toString()} raw)`);

    balanceElement.textContent = balanceFormatted.toFixed(4);
  } catch (error) {
    console.error(`Error updating ${type} balance:`, error);
    balanceElement.textContent = "Error";
    showError(`Failed to load ${type} balance: ${error.message}`);
  }
}

// Close token modal
window.closeTokenModal = function() {
  const modal = document.getElementById("tokenModal");
  if (modal) modal.remove();
};

// Initialize swap form listeners
function initializeSwapForm() {
  const fromAmountInput = document.getElementById("fromAmount");

  if (fromAmountInput) {
    fromAmountInput.addEventListener("input", () => {
      calculateSwapOutput();
    });
  }
}

// Calculate swap output amount
async function calculateSwapOutput() {
  const fromAmount = document.getElementById("fromAmount")?.value;

  if (!fromAmount || !selectedFromToken || !selectedToToken || parseFloat(fromAmount) <= 0) {
    document.getElementById("toAmount").value = "";
    document.getElementById("swapRate").textContent = "-";
    document.getElementById("priceImpact").textContent = "-";
    document.getElementById("minimumReceived").textContent = "-";
    document.getElementById("networkFee").textContent = "-";
    return;
  }

  try {
    console.log("Calculating swap output...");

    // Get pool data from contract
    const poolDataStr = await AMMContract.getPool(selectedFromToken.address, selectedToToken.address);

    if (!poolDataStr || poolDataStr === "null") {
      showError("Pool does not exist for this pair");
      return;
    }

    // Parse pool data - deserialize the pool structure
    const { Args, bytesToStr } = await import("@massalabs/massa-web3");
    const { readContract } = await import("../contract-helpers.js");
    const { DEPLOYED_CONTRACTS } = await import("../contracts-config.js");

    const args = new Args()
      .addString(selectedFromToken.address)
      .addString(selectedToToken.address)
      .serialize();

    const poolDataBytes = await readContract(DEPLOYED_CONTRACTS.AMM, "readPool", args);
    const poolArgs = new Args(poolDataBytes);

    // Deserialize pool data
    poolArgs.nextString(); // tokenA
    poolArgs.nextString(); // tokenB
    const reserveA = Number(poolArgs.nextU64());
    const reserveB = Number(poolArgs.nextU64());
    poolArgs.nextU64(); // totalSupply
    const fee = Number(poolArgs.nextU64());

    console.log("Pool data:", { reserveA, reserveB, fee });

    // Determine which reserve is which
    const pool = await AMMContract.getPool(selectedFromToken.address, selectedToToken.address);
    const tokenInIsA = pool.includes(selectedFromToken.address.substring(0, 10));

    const reserveIn = tokenInIsA ? reserveA : reserveB;
    const reserveOut = tokenInIsA ? reserveB : reserveA;

    console.log("Reserves:", { reserveIn, reserveOut, fee });

    // Convert amount to raw value (u64)
    const amountIn = parseFloat(fromAmount);
    const amountInRaw = BigInt(Math.floor(amountIn));

    // Call contract's getAmountOut function
    const amountOutRaw = await AMMContract.getAmountOut(
      amountInRaw,
      BigInt(reserveIn),
      BigInt(reserveOut),
      BigInt(fee)
    );
    console.log(amountOutRaw)
    console.log(bytesToStr(amountOutRaw))
    const amountOut = Number(amountOutRaw);

    console.log("Amount out calculated:", amountOut);

    // Calculate slippage and minimum received
    const slippage = parseFloat(document.getElementById("currentSlippage")?.textContent?.replace('%', '') || "0.5");
    const amountOutMin = amountOut * (1 - slippage / 100);

    // Calculate price impact
    const priceWithoutFee = (amountIn * reserveOut) / reserveIn;
    const priceImpact = Math.abs((priceWithoutFee - amountOut) / priceWithoutFee) * 100;

    // Update UI
    document.getElementById("toAmount").value = amountOut.toFixed(6);
    document.getElementById("swapRate").textContent =
      `1 ${selectedFromToken.symbol} = ${(amountOut / amountIn).toFixed(6)} ${selectedToToken.symbol}`;
    document.getElementById("priceImpact").textContent =
      priceImpact < 0.01 ? "< 0.01%" : `${priceImpact.toFixed(2)}%`;
    document.getElementById("minimumReceived").textContent =
      `${amountOutMin.toFixed(6)} ${selectedToToken.symbol}`;
    document.getElementById("networkFee").textContent = "~0.001 MAS";

  } catch (error) {
    console.error("Error calculating swap:", error);
    showError("Failed to calculate swap price");
  }
}

// Set max amount
window.setMaxAmount = async function() {
  if (!selectedFromToken) {
    showError("Please select a token first");
    return;
  }

  const provider = getProvider();
  if (!provider) {
    showError("Please connect your wallet");
    return;
  }

  try {
    const tokenContract = await getTokenByAddress(selectedFromToken.address);
    const balance = await tokenContract.balanceOf(provider.address);
    const decimals = await tokenContract.decimals();

    const balanceFormatted = Number(balance.toString()) / (10 ** Number(decimals));

    document.getElementById("fromAmount").value = balanceFormatted.toFixed(6);
    calculateSwapOutput();
  } catch (error) {
    console.error("Error setting max amount:", error);
    showError("Failed to get balance");
  }
};

// Swap tokens (swap from/to)
window.swapTokens = function() {
  if (!selectedFromToken || !selectedToToken) return;

  // Swap selections
  const temp = selectedFromToken;
  selectedFromToken = selectedToToken;
  selectedToToken = temp;

  // Update UI
  const fromTokenSelect = document.getElementById("fromTokenSelect");
  const toTokenSelect = document.getElementById("toTokenSelect");

  fromTokenSelect.querySelector('.token-symbol').textContent = selectedFromToken.symbol;
  toTokenSelect.querySelector('.token-symbol').textContent = selectedToToken.symbol;

  // Update balances
  updateTokenBalance("from", selectedFromToken.address);
  updateTokenBalance("to", selectedToToken.address);

  // Recalculate
  calculateSwapOutput();
};

// Execute swap
window.executeSwap = async function() {
  if (!AppState.user.connected) {
    showError("Please connect your wallet first");
    return;
  }

  if (!selectedFromToken || !selectedToToken) {
    showError("Please select both tokens");
    return;
  }

  const fromAmount = document.getElementById("fromAmount")?.value;

  if (!fromAmount || parseFloat(fromAmount) <= 0) {
    showError("Please enter a valid amount");
    return;
  }

  try {
    showLoading(true);

    const amountIn = parseFloat(fromAmount);
    const toAmount = document.getElementById("toAmount")?.value;
    const slippage = parseFloat(document.getElementById("currentSlippage")?.textContent?.replace('%', '') || "0.5");

    const amountOutMin = parseFloat(toAmount) * (1 - slippage / 100);
    const deadline = Date.now() + (60 * 60 * 1000); // 1 hour

    console.log("Executing swap:", {
      tokenIn: selectedFromToken.address,
      tokenOut: selectedToToken.address,
      amountIn,
      amountOutMin,
      deadline
    });

    await AMMContract.swap(
      selectedFromToken.address,
      selectedToToken.address,
      amountIn,
      amountOutMin,
      deadline
    );

    showSuccess("Swap executed successfully! 🎉");

    // Reset form
    document.getElementById("fromAmount").value = "";
    document.getElementById("toAmount").value = "";

    // Clear swap info
    document.getElementById("swapRate").textContent = "-";
    document.getElementById("priceImpact").textContent = "-";
    document.getElementById("minimumReceived").textContent = "-";

    // Update balances
    console.log("Refreshing balances after swap...");
    await updateTokenBalance("from", selectedFromToken.address);
    await updateTokenBalance("to", selectedToToken.address);

    // Dispatch event for other components to update
    window.dispatchEvent(new CustomEvent('balanceUpdated', {
      detail: {
        tokens: [selectedFromToken.address, selectedToToken.address]
      }
    }));

  } catch (error) {
    console.error("Swap failed:", error);
    showError(`Swap failed: ${error.message}`);
  } finally {
    showLoading(false);
  }
};

// Update swap button state
function updateSwapButtonState() {
  const swapBtn = document.getElementById("swapBtn");
  const btnText = swapBtn?.querySelector('.btn-text');

  if (!swapBtn || !btnText) return;

  if (!AppState.user.connected) {
    btnText.textContent = "Connect Wallet";
    swapBtn.onclick = () => {
      const walletBtn = document.getElementById("walletBtn");
      if (walletBtn) walletBtn.click();
    };
  } else {
    btnText.textContent = "Swap";
    swapBtn.onclick = executeSwap;
  }
}

// Setup trade event listeners
export function setupTradeEventListeners() {
  // Already handled in loadTradeData
  console.log("Trade event listeners set up");
}

// Refresh all balances in trade view
export async function refreshTradeBalances() {
  console.log("Refreshing trade balances...");

  if (selectedFromToken) {
    await updateTokenBalance("from", selectedFromToken.address);
  }
  if (selectedToToken) {
    await updateTokenBalance("to", selectedToToken.address);
  }

  showSuccess("Balances refreshed!");
}

// Make refresh function globally accessible
window.refreshTradeBalances = refreshTradeBalances;

// Watch for wallet connection changes
window.addEventListener('walletConnected', async () => {
  console.log("Wallet connected, updating trade view...");
  updateSwapButtonState();
  await refreshTradeBalances();
});

// Watch for wallet disconnection
window.addEventListener('walletDisconnected', () => {
  console.log("Wallet disconnected, resetting trade view...");
  updateSwapButtonState();

  // Reset balances to 0
  document.getElementById("fromTokenBalance").textContent = "0";
  document.getElementById("toTokenBalance").textContent = "0";
});
