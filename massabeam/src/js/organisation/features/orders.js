import { AppState } from "../state.js";
import { showLoading, showError, showSuccess } from "../ui.js";
import { AdvancedContract } from "../advanced-contract.js";
import { handleWalletConnection } from "../app.js";

// Load orders data
export async function loadOrdersData() {
  try {
    if (AppState.user.connected) {
      // Load user's orders
      console.log("Loading orders data...")
    }
  } catch (error) {
    console.error("Failed to load orders data:", error)
  }
}

// Handle order form submission
async function handleCreateOrder(event) {
    event.preventDefault();

    if (!AppState.user.connected) {
        await handleWalletConnection();
        return;
    }

    try {
        showLoading(true);

        // Get form values
        const tokenIn = document.getElementById("orderTokenIn")?.dataset.address;
        const tokenOut = document.getElementById("orderTokenOut")?.dataset.address;
        const amountIn = parseFloat(document.getElementById("orderAmountIn")?.value || "0");
        const minAmountOut = parseFloat(document.getElementById("orderMinAmountOut")?.value || "0");
        const expiry = Date.now() + 24 * 60 * 60 * 1000; // 24h expiry
        const orderType = document.getElementById("orderType")?.value || "LIMIT";
        const partialFill = document.getElementById("orderPartialFill")?.checked || false;
        const slippageTolerance = parseFloat(document.getElementById("orderSlippage")?.value || "0.5") * 100;

        if (!tokenIn || !tokenOut || !amountIn || !minAmountOut) {
            showError("Please fill in all order fields.");
            showLoading(false);
            return;
        }

        // Call contract to create order
        await AdvancedContract.createLimitOrder(
            tokenIn,
            tokenOut,
            amountIn,
            minAmountOut,
            expiry,
            orderType,
            partialFill,
            slippageTolerance
        );

        showSuccess("Order created!");
        await loadOrdersData();
    } catch (error) {
        console.error("Order creation failed:", error);
        showError("Order creation failed. Please try again.");
    } finally {
        showLoading(false);
    }
}

export function setupOrdersEventListeners() {
    const orderForm = document.getElementById("orderForm");
    if (orderForm) {
        orderForm.addEventListener("submit", handleCreateOrder);
    }
}
