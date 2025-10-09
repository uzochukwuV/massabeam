/**
 * Global handlers for inline onclick events in app.html
 * This file exposes functions to the window object so they can be called from HTML
 */

import { switchToSection } from "./ui.js";
import { loadDashboardData } from "./features/dashboard.js";
import { openCreatePoolModal, refreshPools } from "./features/liquidity.js";

// Dashboard
window.refreshDashboard = function() {
    loadDashboardData()
        .then(() => console.log("Dashboard refreshed"))
        .catch((e) => console.error("Failed to refresh dashboard:", e));
};

// Navigation
window.switchSection = function(section) {
    switchToSection(section);
};

// Liquidity
window.openCreatePoolModal = openCreatePoolModal;
window.refreshPools = refreshPools;
window.closeCreatePoolSection = function() {
    switchToSection("liquidity");
};

// Trade
window.openTradeSettings = function() {
    console.log("Trade settings opened");
    // TODO: Implement trade settings modal
};

window.setMaxAmount = function() {
    console.log("Setting max amount");
    // TODO: Implement set max amount for trade
};

window.swapTokens = function() {
    const tokenInSelect = document.getElementById("tradeTokenIn");
    const tokenOutSelect = document.getElementById("tradeTokenOut");

    if (tokenInSelect && tokenOutSelect) {
        const temp = tokenInSelect.value;
        tokenInSelect.value = tokenOutSelect.value;
        tokenOutSelect.value = temp;
    }
};

window.executeSwap = function() {
    const swapForm = document.getElementById("swapForm");
    if (swapForm) {
        swapForm.dispatchEvent(new Event('submit'));
    }
};

// Orders
window.openCreateOrderModal = function() {
    console.log("Create order modal opened");
    switchToSection("orders");
};

window.setOrderMaxAmount = function() {
    console.log("Setting max amount for order");
    // TODO: Implement set max amount for orders
};

// DCA
window.openCreateDCAModal = function() {
    console.log("Create DCA modal opened");
    switchToSection("dca");
};

window.toggleAdvancedSettings = function() {
    const advancedSettings = document.querySelector(".advanced-settings");
    if (advancedSettings) {
        advancedSettings.classList.toggle("visible");
    }
};

// Yield
window.refreshYieldPools = function() {
    console.log("Refreshing yield pools");
    // TODO: Implement refresh yield pools
};

// Portfolio
window.exportPortfolio = function() {
    console.log("Exporting portfolio");
    // TODO: Implement portfolio export
};

window.toggleHideSmallBalances = function() {
    console.log("Toggle hide small balances");
    // TODO: Implement hide small balances
};

console.log("✅ Global handlers initialized");
