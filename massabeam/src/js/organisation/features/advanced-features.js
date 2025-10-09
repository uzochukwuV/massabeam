import { AppState } from "../state.js";
import { showLoading, showError, showSuccess } from "../ui.js";
import { getTokenByAddress } from "../services/token-service.js";
import { getProvider } from "../wallet.js";
import { AdvancedFeatures } from "../advanced-contract.js";
import { TOKENS_LIST } from "../contracts-config.js";

// ============================================================================
// DCA STRATEGIES
// ============================================================================

export async function loadDCAStrategies() {
    try {
        if (!AppState.user.connected) {
            document.getElementById("dcaStrategiesList").innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📈</div>
                    <p>Connect wallet to see your DCA strategies</p>
                </div>
            `;
            return;
        }

        showLoading(true);

        // Get user's DCA strategies
        const strategyIds = await AdvancedFeatures.getUserDCAs(AppState.user.address);

        if (!strategyIds || strategyIds.length === 0) {
            document.getElementById("dcaStrategiesList").innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📈</div>
                    <p>No DCA strategies yet</p>
                    <button class="secondary-btn" onclick="focusDCAForm()">Create Your First Strategy</button>
                </div>
            `;
            return;
        }

        // Load each strategy details
        const strategies = await Promise.all(
            strategyIds.map(id => AdvancedFeatures.getDCA(Number(id)))
        );

        // Render strategies
        const strategiesList = document.getElementById("dcaStrategiesList");
        strategiesList.innerHTML = strategies
            .filter(s => s && s.isActive)
            .map(strategy => {
                const progress = (strategy.currentPeriod / strategy.totalPeriods) * 100;
                const tokenInSymbol = TOKENS_LIST.find(t => t.address === strategy.tokenIn)?.symbol || "TOKEN";
                const tokenOutSymbol = TOKENS_LIST.find(t => t.address === strategy.tokenOut)?.symbol || "TOKEN";

                return `
                    <div class="strategy-card">
                        <div class="strategy-header">
                            <div class="strategy-pair">${tokenInSymbol} → ${tokenOutSymbol}</div>
                            <div class="strategy-status ${strategy.isActive ? 'active' : 'inactive'}">
                                ${strategy.isActive ? 'Active' : 'Paused'}
                            </div>
                        </div>
                        <div class="strategy-stats">
                            <div class="stat-item">
                                <span class="stat-label">Progress</span>
                                <span class="stat-value">${strategy.currentPeriod}/${strategy.totalPeriods}</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">Per Period</span>
                                <span class="stat-value">${strategy.amountPerPeriod}</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">Avg Price</span>
                                <span class="stat-value">${strategy.averagePrice}</span>
                            </div>
                        </div>
                        <div class="strategy-progress">
                            <div class="progress-bar">
                                <div class="progress-fill" style="width: ${progress}%"></div>
                            </div>
                        </div>
                        <div class="strategy-actions">
                            <button class="secondary-btn" onclick="viewDCADetails(${strategy.id})">Details</button>
                            <button class="danger-btn" onclick="cancelDCAStrategy(${strategy.id})">Cancel</button>
                        </div>
                    </div>
                `;
            })
            .join("");

        // Update stats
        document.getElementById("activeDCACount").textContent = strategies.filter(s => s.isActive).length;
        const totalInvested = strategies.reduce((sum, s) => sum + Number(s.totalSpent), 0);
        document.getElementById("totalDCAInvested").textContent = `$${totalInvested.toLocaleString()}`;

    } catch (error) {
        console.error("Failed to load DCA strategies:", error);
        showError("Failed to load DCA strategies");
    } finally {
        showLoading(false);
    }
}

export async function createDCAStrategy(formData) {
    try {
        if (!AppState.user.connected) {
            showError("Please connect your wallet first");
            return;
        }

        showLoading(true);

        const options = {
            minPriceThreshold: formData.minPrice || 0,
            maxPriceThreshold: formData.maxPrice || 0,
            stopLoss: Math.floor((formData.stopLoss || 0) * 100), // Convert % to basis points
            takeProfit: Math.floor((formData.takeProfit || 0) * 100),
            maxSlippage: Math.floor((formData.maxSlippage || 1) * 100)
        };

        await AdvancedFeatures.createDCA(
            formData.tokenIn,
            formData.tokenOut,
            formData.amountPerPeriod,
            formData.intervalSeconds,
            formData.totalPeriods,
            options
        );

        showSuccess("DCA Strategy created successfully! 🎉");
        await loadDCAStrategies();

    } catch (error) {
        console.error("Failed to create DCA strategy:", error);
        showError(`Failed to create DCA strategy: ${error.message}`);
    } finally {
        showLoading(false);
    }
}

export async function cancelDCAStrategy(strategyId) {
    try {
        if (!confirm("Are you sure you want to cancel this DCA strategy?")) {
            return;
        }

        showLoading(true);

        await AdvancedFeatures.cancelDCA(strategyId);

        showSuccess("DCA Strategy cancelled successfully");
        await loadDCAStrategies();

    } catch (error) {
        console.error("Failed to cancel DCA strategy:", error);
        showError(`Failed to cancel DCA strategy: ${error.message}`);
    } finally {
        showLoading(false);
    }
}

// ============================================================================
// LIMIT ORDERS
// ============================================================================

export async function loadLimitOrders() {
    try {
        if (!AppState.user.connected) {
            document.getElementById("activeOrdersList").innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">🎯</div>
                    <p>Connect wallet to see your limit orders</p>
                </div>
            `;
            return;
        }

        showLoading(true);

        // Get user's limit orders
        const orderIds = await AdvancedFeatures.getUserOrders(AppState.user.address);

        if (!orderIds || orderIds.length === 0) {
            document.getElementById("activeOrdersList").innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">🎯</div>
                    <p>No active orders</p>
                    <button class="secondary-btn" onclick="focusOrderForm()">Create Your First Order</button>
                </div>
            `;
            return;
        }

        // Load each order details
        const orders = await Promise.all(
            orderIds.map(id => AdvancedFeatures.getLimitOrder(Number(id)))
        );

        // Render orders
        const ordersList = document.getElementById("activeOrdersList");
        ordersList.innerHTML = orders
            .filter(o => o && o.isActive)
            .map(order => {
                const fillProgress = (order.filledAmount / order.amountIn) * 100;
                const tokenInSymbol = TOKENS_LIST.find(t => t.address === order.tokenIn)?.symbol || "TOKEN";
                const tokenOutSymbol = TOKENS_LIST.find(t => t.address === order.tokenOut)?.symbol || "TOKEN";

                return `
                    <div class="order-card">
                        <div class="order-header">
                            <div class="order-pair">${tokenInSymbol} → ${tokenOutSymbol}</div>
                            <div class="order-type">Limit Order</div>
                        </div>
                        <div class="order-details">
                            <div class="detail-row">
                                <span class="detail-label">Amount In</span>
                                <span class="detail-value">${order.amountIn} ${tokenInSymbol}</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">Target Price</span>
                                <span class="detail-value">${order.targetPrice}</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">Filled</span>
                                <span class="detail-value">${fillProgress.toFixed(2)}%</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">Expiry</span>
                                <span class="detail-value">${new Date(Number(order.expiry)).toLocaleDateString()}</span>
                            </div>
                        </div>
                        <div class="order-progress">
                            <div class="progress-bar">
                                <div class="progress-fill" style="width: ${fillProgress}%"></div>
                            </div>
                        </div>
                        <div class="order-actions">
                            <button class="secondary-btn" onclick="viewOrderDetails(${order.id})">Details</button>
                            <button class="danger-btn" onclick="cancelLimitOrder(${order.id})">Cancel</button>
                        </div>
                    </div>
                `;
            })
            .join("");

    } catch (error) {
        console.error("Failed to load limit orders:", error);
        showError("Failed to load limit orders");
    } finally {
        showLoading(false);
    }
}

export async function createLimitOrder(formData) {
    try {
        if (!AppState.user.connected) {
            showError("Please connect your wallet first");
            return;
        }

        showLoading(true);

        const expiry = Date.now() + (formData.expirySeconds * 1000);

        await AdvancedFeatures.createLimitOrder(
            formData.tokenIn,
            formData.tokenOut,
            formData.amountIn,
            formData.targetPrice,
            formData.minAmountOut,
            expiry,
            formData.partialFillAllowed || false
        );

        showSuccess("Limit Order created successfully! 🎉");
        await loadLimitOrders();

    } catch (error) {
        console.error("Failed to create limit order:", error);
        showError(`Failed to create limit order: ${error.message}`);
    } finally {
        showLoading(false);
    }
}

export async function cancelLimitOrder(orderId) {
    try {
        if (!confirm("Are you sure you want to cancel this order?")) {
            return;
        }

        showLoading(true);

        await AdvancedFeatures.cancelLimitOrder(orderId);

        showSuccess("Limit Order cancelled successfully");
        await loadLimitOrders();

    } catch (error) {
        console.error("Failed to cancel limit order:", error);
        showError(`Failed to cancel limit order: ${error.message}`);
    } finally {
        showLoading(false);
    }
}

// ============================================================================
// YIELD FARMING
// ============================================================================

export async function loadYieldFarming() {
    try {
        showLoading(true);

        // Load yield pools (you would need to track pool IDs)
        // For now, showing example structure
        const yieldPoolsGrid = document.getElementById("yieldPoolsGrid");

        if (!yieldPoolsGrid) return;

        // Example: Load pool 1 (you'd loop through actual pool IDs)
        const pool = await AdvancedFeatures.getYieldPool(1);

        if (!pool) {
            yieldPoolsGrid.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">🌾</div>
                    <p>No yield pools available</p>
                </div>
            `;
            return;
        }

        const tokenASymbol = TOKENS_LIST.find(t => t.address === pool.tokenA)?.symbol || "TOKEN_A";
        const tokenBSymbol = TOKENS_LIST.find(t => t.address === pool.tokenB)?.symbol || "TOKEN_B";
        const rewardSymbol = TOKENS_LIST.find(t => t.address === pool.rewardToken)?.symbol || "REWARD";

        yieldPoolsGrid.innerHTML = `
            <div class="yield-pool-card">
                <div class="pool-header">
                    <div class="pool-pair">${tokenASymbol}/${tokenBSymbol}</div>
                    <div class="pool-badge">${pool.isActive ? 'Active' : 'Inactive'}</div>
                </div>
                <div class="pool-stats">
                    <div class="stat-item">
                        <span class="stat-label">TVL</span>
                        <span class="stat-value">$${pool.totalStaked.toLocaleString()}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">APR</span>
                        <span class="stat-value">${(pool.rewardRate / 100).toFixed(2)}%</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Reward</span>
                        <span class="stat-value">${rewardSymbol}</span>
                    </div>
                </div>
                <div class="pool-actions">
                    <button class="primary-btn" onclick="openStakeModal(${pool.id})">Stake</button>
                    <button class="secondary-btn" onclick="viewPoolDetails(${pool.id})">Details</button>
                </div>
            </div>
        `;

        // Load user positions if connected
        if (AppState.user.connected) {
            const stake = await AdvancedFeatures.getUserStake(AppState.user.address, 1);
            const pendingRewards = await AdvancedFeatures.getPendingRewards(AppState.user.address, 1);

            if (stake && stake.amount > 0) {
                document.getElementById("farmingPositionsList").innerHTML = `
                    <div class="position-card">
                        <div class="position-header">
                            <div class="position-pair">${tokenASymbol}/${tokenBSymbol}</div>
                            <div class="position-value">${stake.amount} LP</div>
                        </div>
                        <div class="position-rewards">
                            <span class="rewards-label">Pending Rewards:</span>
                            <span class="rewards-value">${pendingRewards} ${rewardSymbol}</span>
                        </div>
                        <div class="position-actions">
                            <button class="primary-btn" onclick="claimRewards(${pool.id})">Claim</button>
                            <button class="secondary-btn" onclick="unstake(${pool.id})">Unstake</button>
                        </div>
                    </div>
                `;
            }
        }

    } catch (error) {
        console.error("Failed to load yield farming:", error);
        showError("Failed to load yield farming data");
    } finally {
        showLoading(false);
    }
}

export async function stakeInPool(poolId, amountA, amountB) {
    try {
        if (!AppState.user.connected) {
            showError("Please connect your wallet first");
            return;
        }

        showLoading(true);

        await AdvancedFeatures.stakeInYieldPool(poolId, amountA, amountB);

        showSuccess("Tokens staked successfully! 🎉");
        await loadYieldFarming();

    } catch (error) {
        console.error("Failed to stake:", error);
        showError(`Failed to stake: ${error.message}`);
    } finally {
        showLoading(false);
    }
}

export async function unstakeFromPool(poolId, lpAmount) {
    try {
        if (!AppState.user.connected) {
            showError("Please connect your wallet first");
            return;
        }

        showLoading(true);

        await AdvancedFeatures.unstakeFromYieldPool(poolId, lpAmount);

        showSuccess("Tokens unstaked successfully!");
        await loadYieldFarming();

    } catch (error) {
        console.error("Failed to unstake:", error);
        showError(`Failed to unstake: ${error.message}`);
    } finally {
        showLoading(false);
    }
}

export async function claimYieldRewards(poolId) {
    try {
        if (!AppState.user.connected) {
            showError("Please connect your wallet first");
            return;
        }

        showLoading(true);

        await AdvancedFeatures.claimYieldRewards(poolId);

        showSuccess("Rewards claimed successfully! 🎉");
        await loadYieldFarming();

    } catch (error) {
        console.error("Failed to claim rewards:", error);
        showError(`Failed to claim rewards: ${error.message}`);
    } finally {
        showLoading(false);
    }
}

// ============================================================================
// TWAP PRICE ORACLE
// ============================================================================

export async function getTWAPPrice(tokenA, tokenB) {
    try {
        const price = await AdvancedFeatures.getTWAPPrice(tokenA, tokenB);
        return price;
    } catch (error) {
        console.error("Failed to get TWAP price:", error);
        return 0;
    }
}

// Make functions globally available
window.focusDCAForm = () => {
    document.getElementById("dcaTokenIn")?.focus();
};

window.focusOrderForm = () => {
    document.getElementById("orderTokenIn")?.focus();
};

window.viewDCADetails = (id) => {
    console.log("View DCA details:", id);
    // TODO: Implement details modal
};

window.cancelDCAStrategy = cancelDCAStrategy;
window.viewOrderDetails = (id) => {
    console.log("View order details:", id);
    // TODO: Implement details modal
};

window.cancelLimitOrder = cancelLimitOrder;
window.viewPoolDetails = (id) => {
    console.log("View pool details:", id);
    // TODO: Implement details modal
};

window.openStakeModal = (poolId) => {
    console.log("Open stake modal for pool:", poolId);
    // TODO: Implement stake modal
};

window.claimRewards = claimYieldRewards;
window.unstake = (poolId) => {
    console.log("Unstake from pool:", poolId);
    // TODO: Implement unstake modal
};
