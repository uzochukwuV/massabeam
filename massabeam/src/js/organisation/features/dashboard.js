import { AppState } from "../state.js";
import { showLoading, showError, showSuccess } from "../ui.js";
import { getProvider } from "../wallet.js";
import { AMMContract } from "../amm-contract.js";
import { getTokenByAddress } from "../services/token-service.js";
import { Args, bytesToStr } from "@massalabs/massa-web3";
import { readContract } from "../contract-helpers.js";
import { DEPLOYED_CONTRACTS, TOKENS_LIST } from "../contracts-config.js";

// Load dashboard data
export async function loadDashboardData() {
  try {
    showLoading(true);

    const provider = getProvider();

    // Load protocol stats (always visible)
    await loadProtocolStats();

    // Load user-specific data if wallet connected
    if (provider && AppState.user.connected) {
      await loadUserPortfolio(provider.address);
      await loadUserPositions(provider.address);
      await loadRecentTransactions(provider.address);
    } else {
      // Show empty states
      showEmptyStates();
    }

    showLoading(false);
  } catch (error) {
    console.error("Failed to load dashboard data:", error);
    showError("Failed to load dashboard data");
    showLoading(false);
  }
}

// Load protocol statistics
async function loadProtocolStats() {
  try {
    // Get pool count
    const poolCountBytes = await AMMContract.getPoolCount();
    console.log(bytesToStr(poolCountBytes))
    const poolCount = parseInt(bytesToStr(poolCountBytes));

    // Get total volume
    const volumeBytes = await AMMContract.getTotalVolume();
    const totalVolume = parseInt(bytesToStr(volumeBytes));

    // Get pool list
    const poolListBytes = await AMMContract.getPools();
    const poolListStr = bytesToStr(poolListBytes);
    const poolKeys = poolListStr ? poolListStr.split(",").filter(k => k) : [];

    // Calculate TVL by summing all pool reserves
    let totalTVL = 0;
    for (const poolKey of poolKeys) {
      const [tokenA, tokenB] = poolKey.split(":");

      const args = new Args()
        .addString(tokenA)
        .addString(tokenB)
        .serialize();

      const poolDataBytes = await readContract(DEPLOYED_CONTRACTS.AMM, "readPool", args);
      const poolDataStr = bytesToStr(poolDataBytes);

      if (poolDataStr !== "null") {
        // Deserialize pool data
        const poolArgs = new Args(poolDataBytes);
        const tokenAAddr = poolArgs.nextString()
        const tokenBAddr = poolArgs.nextString()
        const reserveA = Number(poolArgs.nextU64());
        const reserveB = Number(poolArgs.nextU64());

        // For now, sum raw reserves (in production, convert to USD)
        totalTVL += reserveA + reserveB;
      }
    }

    // Update UI elements
    document.getElementById("poolCount").textContent = poolCount;
    document.getElementById("protocol24hVolume").textContent = formatCurrency(totalVolume);
    document.getElementById("protocolTVL").textContent = formatCurrency(totalTVL);

    // Mock values for now (would need backend or advanced features)
    document.getElementById("protocolActiveOrders").textContent = "0";
    document.getElementById("protocolUsers").textContent = "-";

  } catch (error) {
    console.error("Failed to load protocol stats:", error);
  }
}

// Load user portfolio value
async function loadUserPortfolio(userAddress) {
  try {
    let totalValue = 0;
    let assetCount = 0;

    // Get pool list
    const poolListBytes = await AMMContract.getPools();
    const poolListStr = bytesToStr(poolListBytes);
    const poolKeys = poolListStr ? poolListStr.split(",").filter(k => k) : [];

    // Calculate portfolio value from LP positions
    for (const poolKey of poolKeys) {
      const [tokenA, tokenB] = poolKey.split(":");

      // Get user's LP balance
      const lpBalanceArgs = new Args()
        .addString(tokenA)
        .addString(tokenB)
        .addString(userAddress)
        .serialize();

      const lpBalanceBytes = await readContract(DEPLOYED_CONTRACTS.AMM, "readLPBalance", lpBalanceArgs);
      const lpBalance = parseInt(bytesToStr(lpBalanceBytes));

      if (lpBalance > 0) {
        assetCount++;

        // Get pool data to calculate user's share
        const poolArgs = new Args()
          .addString(tokenA)
          .addString(tokenB)
          .serialize();

        const poolDataBytes = await readContract(DEPLOYED_CONTRACTS.AMM, "readPool", poolArgs);
        const poolArgs2 = new Args(poolDataBytes);
        poolArgs2.nextString(); // tokenA
        poolArgs2.nextString(); // tokenB
        const reserveA = Number(poolArgs2.nextU64());
        const reserveB = Number(poolArgs2.nextU64());
        const totalSupply = Number(poolArgs2.nextU64());

        // Calculate user's share
        const userShareA = (lpBalance / totalSupply) * reserveA;
        const userShareB = (lpBalance / totalSupply) * reserveB;

        // Add to total value (in production, convert to USD)
        totalValue += userShareA + userShareB;
      }
    }

    // Add token balances to portfolio value
    for (const token of TOKENS_LIST) {
      try {
        const tokenContract = await getTokenByAddress(token.address);
        const balance = await tokenContract.balanceOf(userAddress);
        const decimals = await tokenContract.decimals();
        const balanceFormatted = Number(balance.toString()) / (10 ** Number(decimals));

        if (balanceFormatted > 0) {
          assetCount++;
          totalValue += balanceFormatted; // In production, multiply by token price
        }
      } catch (error) {
        console.error(`Error loading balance for ${token.symbol}:`, error);
      }
    }

    // Update UI
    document.getElementById("totalPortfolioValue").textContent = formatCurrency(totalValue);
    document.getElementById("totalAssets").textContent = assetCount;
    document.getElementById("portfolioChange").textContent = "+0.00%"; // Mock for now

  } catch (error) {
    console.error("Failed to load user portfolio:", error);
  }
}

// Load user's active positions
async function loadUserPositions(userAddress) {
  try {
    const positions = [];

    // Get pool list
    const poolListBytes = await AMMContract.getPools();
    const poolListStr = bytesToStr(poolListBytes);
    const poolKeys = poolListStr ? poolListStr.split(",").filter(k => k) : [];

    // Get LP positions
    for (const poolKey of poolKeys) {
      const [tokenA, tokenB] = poolKey.split(":");

      // Get user's LP balance
      const lpBalanceArgs = new Args()
        .addString(tokenA)
        .addString(tokenB)
        .addString(userAddress)
        .serialize();

      const lpBalanceBytes = await readContract(DEPLOYED_CONTRACTS.AMM, "readLPBalance", lpBalanceArgs);
      const lpBalance = parseInt(bytesToStr(lpBalanceBytes));

      if (lpBalance > 0) {
        // Get token symbols
        const tokenAContract = await getTokenByAddress(tokenA);
        const tokenBContract = await getTokenByAddress(tokenB);
        const symbolA = await tokenAContract.symbol();
        const symbolB = await tokenBContract.symbol();

        // Get pool data
        const poolArgs = new Args()
          .addString(tokenA)
          .addString(tokenB)
          .serialize();

        const poolDataBytes = await readContract(DEPLOYED_CONTRACTS.AMM, "readPool", poolArgs);
        const poolArgs2 = new Args(poolDataBytes);
        poolArgs2.nextString(); // tokenA
        poolArgs2.nextString(); // tokenB
        const reserveA = Number(poolArgs2.nextU64());
        const reserveB = Number(poolArgs2.nextU64());
        const totalSupply = Number(poolArgs2.nextU64());

        // Calculate user's share
        const sharePercent = (lpBalance / totalSupply) * 100;
        const userAmountA = (lpBalance / totalSupply) * reserveA;
        const userAmountB = (lpBalance / totalSupply) * reserveB;

        positions.push({
          type: "Liquidity Pool",
          pair: `${symbolA}/${symbolB}`,
          amount: lpBalance,
          value: userAmountA + userAmountB, // Mock USD value
          change: "+0.00%", // Mock
          sharePercent: sharePercent.toFixed(2)
        });
      }
    }

    // Update UI
    const positionsList = document.getElementById("activePositionsList");
    const positionsCount = document.getElementById("activePositionsCount");

    if (positions.length === 0) {
      positionsList.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📊</div>
          <p>No active positions</p>
        </div>
      `;
      positionsCount.textContent = "0";
    } else {
      positionsCount.textContent = positions.length;
      positionsList.innerHTML = positions.map(pos => `
        <div class="position-item">
          <div class="position-info">
            <div class="position-type">${pos.type}</div>
            <div class="position-pair">${pos.pair}</div>
            <div class="position-share">${pos.sharePercent}% of pool</div>
          </div>
          <div class="position-value">
            <div class="position-amount">${formatNumber(pos.value)}</div>
            <div class="position-change positive">${pos.change}</div>
          </div>
        </div>
      `).join('');
    }

  } catch (error) {
    console.error("Failed to load user positions:", error);
  }
}

// Load recent transactions
async function loadRecentTransactions(userAddress) {
  try {
    // Mock implementation - in production, would need event indexing or backend
    const transactions = [];

    const transactionsList = document.getElementById("recentTransactionsList");

    if (transactions.length === 0) {
      transactionsList.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📝</div>
          <p>No recent transactions</p>
        </div>
      `;
    } else {
      transactionsList.innerHTML = transactions.map(tx => `
        <div class="transaction-item">
          <div class="tx-icon">${tx.icon}</div>
          <div class="tx-info">
            <div class="tx-type">${tx.type}</div>
            <div class="tx-time">${tx.time}</div>
          </div>
          <div class="tx-amount">${tx.amount}</div>
        </div>
      `).join('');
    }

  } catch (error) {
    console.error("Failed to load recent transactions:", error);
  }
}

// Show empty states when wallet not connected
function showEmptyStates() {
  document.getElementById("totalPortfolioValue").textContent = "$0.00";
  document.getElementById("portfolioChange").textContent = "+0.00%";
  document.getElementById("totalAssets").textContent = "0";
  document.getElementById("activePositionsCount").textContent = "0";

  document.getElementById("activePositionsList").innerHTML = `
    <div class="empty-state">
      <div class="empty-icon">🔒</div>
      <p>Connect wallet to view positions</p>
    </div>
  `;

  document.getElementById("recentTransactionsList").innerHTML = `
    <div class="empty-state">
      <div class="empty-icon">🔒</div>
      <p>Connect wallet to view transactions</p>
    </div>
  `;
}

// Utility functions
function formatCurrency(value) {
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(2)}M`;
  } else if (value >= 1000) {
    return `$${(value / 1000).toFixed(2)}K`;
  }
  return `$${value.toFixed(2)}`;
}

function formatNumber(value) {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(2)}M`;
  } else if (value >= 1000) {
    return `${(value / 1000).toFixed(2)}K`;
  }
  return value.toFixed(2);
}

// Watch for wallet connection changes
window.addEventListener('walletConnected', () => {
  loadDashboardData();
});

window.addEventListener('walletDisconnected', () => {
  showEmptyStates();
});
