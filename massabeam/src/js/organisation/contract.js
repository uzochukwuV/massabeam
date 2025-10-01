import { initProvider } from "./wallet.js";
import { populateTokenDropdowns } from "./services/token-service.js";
import { AdvancedContract } from "./advanced-contract.js";

// Initialize contract system
export async function initializeContracts() {
  try {
     await initProvider();
     await populateTokenDropdowns();

    // Update gas price
    const gasPrice = await AdvancedContract.getCurrentGasPrice();
    console.log(gasPrice);
    const gasPriceElement = document.getElementById("gasPrice");
    if (gasPriceElement) {
      gasPriceElement.textContent = gasPrice;
    }

    return true;
  } catch (error) {
    console.error("Failed to initialize contracts:", error);
    return false;
  }
}
