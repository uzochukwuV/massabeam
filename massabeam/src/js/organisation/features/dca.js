import { AppState } from "../state.js";
import { showLoading, showError, showSuccess } from "../ui.js";
import { AdvancedContract } from "../advanced-contract.js";
import { handleWalletConnection } from "../app.js";

// Load DCA data
export async function loadDCAData() {
  try {
    if (AppState.user.connected) {
      // Load user's DCA strategies
      console.log("Loading DCA data...")
    }
  } catch (error) {
    console.error("Failed to load DCA data:", error)
  }
}

// Handle DCA form submission
async function handleCreateDCA(event) {
    event.preventDefault();

    if (!AppState.user.connected) {
        await handleWalletConnection();
        return;
    }

    try {
        showLoading(true);

        // Get form values
        const tokenIn = document.getElementById("dcaTokenIn")?.dataset.address;
        const tokenOut = document.getElementById("dcaTokenOut")?.dataset.address;
        const amountPerPeriod = parseFloat(document.getElementById("dcaAmountPerPeriod")?.value || "0");
        const intervalPeriods = parseInt(document.getElementById("dcaInterval")?.value || "3600");
        const totalPeriods = parseInt(document.getElementById("dcaTotalPeriods")?.value || "1");
        const minAmountOut = parseFloat(document.getElementById("dcaMinAmountOut")?.value || "0");
        const maxSlippage = parseFloat(document.getElementById("dcaSlippage")?.value || "0.5") * 100;
        const stopLoss = parseFloat(document.getElementById("dcaStopLoss")?.value || "0") * 100;
        const takeProfit = parseFloat(document.getElementById("dcaTakeProfit")?.value || "0") * 100;

        if (!tokenIn || !tokenOut || !amountPerPeriod || !intervalPeriods || !totalPeriods) {
            showError("Please fill in all DCA fields.");
            showLoading(false);
            return;
        }

        // Call contract to create DCA strategy
        await AdvancedContract.createDCAStrategy(
            tokenIn,
            tokenOut,
            amountPerPeriod,
            intervalPeriods,
            totalPeriods,
            minAmountOut,
            maxSlippage,
            stopLoss,
            takeProfit
        );

        showSuccess("DCA strategy created!");
        await loadDCAData();
    } catch (error) {
        console.error("DCA creation failed:", error);
        showError("DCA creation failed. Please try again.");
    } finally {
        showLoading(false);
    }
}

export function setupDCAEventListeners() {
    const dcaForm = document.getElementById("dcaForm");
    if (dcaForm) {
        dcaForm.addEventListener("submit", handleCreateDCA);
    }
}
