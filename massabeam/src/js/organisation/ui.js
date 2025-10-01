import { AppState } from "./state.js";
import { formatNumber, formatAddress } from "./utils.js";

// Show/hide loading overlay
export function showLoading(show) {
  const loadingOverlay = document.getElementById("loadingOverlay");
  if (loadingOverlay) {
    if (show) {
      loadingOverlay.classList.remove("hidden");
    } else {
      loadingOverlay.classList.add("hidden");
    }
  }
  AppState.isLoading = show;
}

// Error handling utility
export function showError(message) {
  const errorElement = document.getElementById("errorMessage");
  if (errorElement) {
    errorElement.textContent = message;
    errorElement.classList.add("visible");
    setTimeout(() => {
      errorElement.classList.remove("visible");
    }, 5000);
  }
  console.error("Contract Error:", message);
}

// Success notification utility
export function showSuccess(message) {
  // Create a success notification similar to error
  const successElement = document.createElement("div");
  successElement.className = "success-message visible";
  successElement.textContent = message;
  successElement.style.cssText = `
        position: fixed;
        top: 24px;
        right: 24px;
        background: var(--success-green);
        color: white;
        padding: 16px 24px;
        border-radius: 12px;
        box-shadow: var(--shadow-lg);
        z-index: 1070;
        max-width: 400px;
        font-weight: 500;
    `;
  document.body.appendChild(successElement);

  setTimeout(() => {
    successElement.remove();
  }, 3000);
}

// Update wallet UI
export function updateWalletUI() {
  const walletBtn = document.getElementById("walletBtn");
  const walletText = walletBtn?.querySelector(".wallet-text");

  if (AppState.user.connected && AppState.user.address) {
    walletBtn?.classList.add("connected");
    if (walletText) {
      walletText.textContent = formatAddress(AppState.user.address);
    }
  } else {
    walletBtn?.classList.remove("connected");
    if (walletText) {
      walletText.textContent = "Connect Wallet";
    }
  }
}

// Show user menu
export function showUserMenu() {
  // Implementation for user menu dropdown
  console.log("Show user menu");
}

// Switch to section
export function switchToSection(sectionName) {
  if (AppState.currentSection === sectionName) return;

  // Update navigation
  const navItems = document.querySelectorAll(".nav-item");
  navItems.forEach((item) => {
    if (item.dataset.section === sectionName) {
      item.classList.add("active");
    } else {
      item.classList.remove("active");
    }
  });

  // Update sections
  const sections = document.querySelectorAll(".section");
  sections.forEach((section) => {
    if (section.id === sectionName) {
      section.classList.add("active");
    } else {
      section.classList.remove("active");
    }
  });

  AppState.currentSection = sectionName;

  // Load section-specific data
  // This should be handled by a routing or controller mechanism
}

// Update protocol statistics
export function updateProtocolStats(stats) {
  console.log(stats)
  const elements = {
    protocolTVL: document.getElementById("protocolTVL"),
    protocol24hVolume: document.getElementById("protocol24hVolume"),
    protocolActiveOrders: document.getElementById("protocolActiveOrders"),
    protocolUsers: document.getElementById("protocolUsers"),
    poolCount: document.getElementById("poolCount"),
  };

  if (elements.protocolTVL) {
    elements.protocolTVL.textContent = formatNumber(stats.tvl, "currency");
  }
  if (elements.protocol24hVolume) {
    elements.protocol24hVolume.textContent = formatNumber(stats.volume24h, "currency");
  }
  if (elements.protocolActiveOrders) {
    elements.protocolActiveOrders.textContent = formatNumber(stats.activeOrders);
  }
  if (elements.protocolUsers) {
    elements.protocolUsers.textContent = formatNumber(stats.totalUsers);
  }

  if (elements.poolCount) {
    elements.poolCount.textContent = formatNumber(stats.poolCount);
  }
}

export function updateDashboard(state) {
    
}

// Initialize charts
export function initializeCharts() {
  // This would initialize actual charts using a library like Chart.js
  // For now, we'll just show placeholders
  const chartContainers = document.querySelectorAll(".chart-container canvas");
  chartContainers.forEach((canvas) => {
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#1A1D29";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#00D2FF";
    ctx.font = "16px Inter";
    ctx.textAlign = "center";
    ctx.fillText("Chart Coming Soon", canvas.width / 2, canvas.height / 2);
  });
}

// Robust token select modal open/close
export function openTokenSelectModal(targetInputId) {
    try {
        const modal = document.getElementById("tokenSelectModal");
        if (!modal) throw new Error("Token select modal not found.");
        modal.classList.add("visible");
        modal.dataset.targetInput = targetInputId;
        // TODO: Populate token list dynamically if needed
    } catch (error) {
        showError("Failed to open token select modal.");
        console.error(error);
    }
}

export function closeTokenSelectModal() {
    try {
        const modal = document.getElementById("tokenSelectModal");
        if (!modal) throw new Error("Token select modal not found.");
        modal.classList.remove("visible");
    } catch (error) {
        showError("Failed to close token select modal.");
        console.error(error);
    }
}

// Initialize UI components
export function initializeUI() {
    console.log("Initializing UI components...");

    // Initialize charts
    initializeCharts();

    // Set up network status indicator
    const networkStatus = document.getElementById("networkStatus");
    if (networkStatus) {
        networkStatus.classList.add("online");
    }

    // Hide loading overlay initially
    const loadingOverlay = document.getElementById("loadingOverlay");
    if (loadingOverlay) {
        loadingOverlay.classList.add("hidden");
    }

    console.log("UI components initialized");
}
