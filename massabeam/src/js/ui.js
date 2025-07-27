export function initializeUI() {
    // Hide loading overlay initially
    const loadingOverlay = document.getElementById("loadingOverlay");
    if (loadingOverlay) {
        loadingOverlay.classList.add("hidden");
    }

    // Set initial network status
    const networkStatus = document.getElementById("networkStatus");
    if (networkStatus) {
        networkStatus.classList.add("online");
    }

    // Set initial gas price
    const gasPrice = document.getElementById("gasPrice");
    if (gasPrice) {
        gasPrice.textContent = "1000";
    }

    // Set up navigation active state
    const navItems = document.querySelectorAll(".nav-item");
    navItems.forEach((item) => {
        item.classList.remove("active");
        if (item.dataset.section === "dashboard") {
            item.classList.add("active");
        }
    });

    // Show dashboard section by default
    const sections = document.querySelectorAll(".section");
    sections.forEach((section) => {
        if (section.id === "dashboard") {
            section.classList.add("active");
        } else {
            section.classList.remove("active");
        }
    });
}

export function updateDashboard(appState) {
    // Update portfolio value
    const totalPortfolioValue = document.getElementById("totalPortfolioValue");
    if (totalPortfolioValue && appState && appState.portfolio) {
        totalPortfolioValue.textContent = `$${appState.portfolio.totalValue?.toFixed(2) || "0.00"}`;
    }

    // Update assets count
    const totalAssets = document.getElementById("totalAssets");
    if (totalAssets && appState && appState.portfolio) {
        totalAssets.textContent = appState.portfolio.assets?.length || 0;
    }

    // Update active positions count
    const activePositionsCount = document.getElementById("activePositionsCount");
    if (activePositionsCount && appState && appState.portfolio) {
        activePositionsCount.textContent = appState.portfolio.positions?.length || 0;
    }

    // Update protocol stats (if available)
    // You can add more updates here
    const protocolStats = document.getElementById("protocolStats");
    if (protocolStats && appState && appState.protocol) {
        protocolStats.textContent = `Total Transactions: ${appState.protocol.totalTransactions || 0}`;
    }
    // Update recent transactions
    const recentTransactions = document.getElementById("recentTransactionsList");
    if (recentTransactions && appState && appState.transactions) {
        recentTransactions.innerHTML = "";
        appState.transactions.slice(0, 5).forEach((tx) => {
            const li = document.createElement("li");
            li.textContent = `${tx.type} - ${tx.amount} ${tx.token} - ${new Date(tx.timestamp).toLocaleString()}`;
            recentTransactions.appendChild(li);
        });
    }   

    // Update active positions list
    const activePositionsList = document.getElementById("activePositionsList");
    if (activePositionsList && appState && appState.portfolio && appState.portfolio.positions) {
        activePositionsList.innerHTML = "";
        if (appState.portfolio.positions.length === 0) {
            activePositionsList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📊</div>
                    <p>No active positions</p>
                </div>
            `;
        } else {
            appState.portfolio.positions.forEach((pos) => {
                const div = document.createElement("div");
                div.className = "position-row";
                div.textContent = `${pos.type} - ${pos.amount} ${pos.token} @ ${pos.entryPrice}`;
                activePositionsList.appendChild(div);
            });
        }
    }
}