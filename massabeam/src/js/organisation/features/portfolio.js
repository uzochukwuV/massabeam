import { AppState } from "../state.js";
import { formatNumber } from "../utils.js";

// Load portfolio data
export async function loadPortfolioData() {
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
  const portfolioTotalValue = document.getElementById("portfolioTotalValue");
  const assetsTableBody = document.getElementById("assetsTableBody");

  if (portfolioTotalValue) {
    portfolioTotalValue.textContent = formatNumber(AppState.portfolio.totalValue, "currency");
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
