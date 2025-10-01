import { showLoading, showError, showSuccess } from "../ui.js";
import { formatNumber } from "../utils.js";

// Load yield farming data
export async function loadYieldData() {
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
  const yieldPoolsGrid = document.getElementById("yieldPoolsGrid");
  if (!yieldPoolsGrid) return;

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
