import { AppState } from "../state.js";
import { showLoading, showError, showSuccess } from "../ui.js";
import { getTokens } from "../services/token-service.js";
import { AMMContract } from "../amm-contract.js";
import { handleWalletConnection } from "../app.js";

// Load trade data
export async function loadTradeData() {
  try {
    // Load available pools, prices, etc.
    const fromTokenSelect = document.getElementById("fromTokenSelect");
    const div = document.createElement("div");
    fromTokenSelect.parentElement.appendChild(div);

    fromTokenSelect.addEventListener("click", async (e)=>{
          const tokens = await getTokens()
         Promise.all(tokens.map(async t => {
                const symbol = await t.symbol();
                return `<button onclick='setSwapTokenA()' value="${t.address}">${symbol}</button>`;
              })).then(options => {
                div.innerHTML = `` + options.join("");
              });
    })
    console.log("Loading trade data...")
  } catch (error) {
    console.error("Failed to load trade data:", error)
  }
}

// Handle swap
async function handleSwap() {
    if (!AppState.user.connected) {
        await handleWalletConnection();
        return;
    }

    try {
        showLoading(true);

        // Get form values
        const fromAmount = document.getElementById('fromAmount')?.value;
        const fromToken = document.getElementById('fromTokenSelect')?.dataset.address;
        const toToken = document.getElementById('toTokenSelect')?.dataset.address;
        const slippage = document.getElementById('currentSlippage')?.textContent?.replace('%', '') || "0.5";
        const deadline = Date.now() + 60 * 60 * 1000; // 1 hour from now

        if (!fromAmount || !fromToken || !toToken) {
            showError("Please fill in all swap fields.");
            showLoading(false);
            return;
        }

        // Call contract swap
        const amountIn = parseFloat(fromAmount);
        const amountOutMin = amountIn * (1 - parseFloat(slippage) / 100); // Simple slippage calc

        await AMMContract.swap(fromToken, toToken, amountIn, amountOutMin, deadline);

        showSuccess("Swap submitted!");
        // Optionally refresh balances
        // await loadUserData();
        // await loadDashboardData();
    } catch (error) {
        console.error("Swap failed:", error);
        showError("Swap failed. Please try again.");
    } finally {
        showLoading(false);
    }
}

export function setupTradeEventListeners() {
    const swapBtn = document.getElementById("swapBtn");
    if (swapBtn) {
        swapBtn.addEventListener("click", handleSwap);
    }
}
