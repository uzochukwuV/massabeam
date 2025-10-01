import { getWallets, WalletName } from "@massalabs/wallet-provider";
import { showError } from "./ui.js";

let provider = null;
let isConnected = false;
let userAddress = null;

// Initialize wallet provider
export async function initProvider() {
  try {
    const walletList = await getWallets();
    const wallet = walletList.find((provider) => provider.name() === WalletName.MassaWallet);

    if (!wallet) {
      throw new Error(
        "Massa Wallet not detected. Please install the Massa wallet and configure it for the Buildnet network",
      );
    }

    const accounts = await wallet.accounts();
    if (accounts.length === 0) {
      throw new Error("No accounts found. Please create an account in your Massa wallet");
    }

    provider = accounts[0];
    
    isConnected = true;
    userAddress = provider.address;

    // Update UI
    updateWalletUI();

    return provider;
  } catch (error) {
    showError(error.message);
    return null;
  }
}

// Update wallet UI
function updateWalletUI() {
  const walletBtn = document.getElementById("walletBtn");
  const walletText = walletBtn?.querySelector(".wallet-text");

  if (isConnected && userAddress) {
    walletBtn?.classList.add("connected");
    if (walletText) {
      walletText.textContent = `${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`;
    }
  } else {
    walletBtn?.classList.remove("connected");
    if (walletText) {
      walletText.textContent = "Connect Wallet";
    }
  }
}

export function getProvider() {
  return provider;
}

export function isWalletConnected() {
  return isConnected;
}

export function getUserAddress() {
  return userAddress;
}

export { initProvider as connectWallet };
