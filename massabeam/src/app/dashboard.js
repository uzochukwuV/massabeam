/**
 * Dashboard Page Logic
 *
 * Central hub for monitoring all trading activities and platform metrics
 * Displays:
 * - Portfolio overview and performance
 * - Platform-wide statistics
 * - Bot status for all trading strategies
 * - Quick access to all features
 * - Recent activity and execution history
 */

import { getProtocolStats, AMMContract } from './main.js';

let refreshInterval = null;
let selectedPeriod = '24h';

// Initialize dashboard
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Dashboard Loaded');
    initializeDashboard();
    startAutoRefresh();
});

/**
 * Initialize dashboard with initial data load
 */
async function initializeDashboard() {
    await updateDashboardData();
    setupEventListeners();
}

/**
 * Setup event listeners for dashboard interactions
 */
function setupEventListeners() {
    // Time period selector
    document.querySelectorAll('.time-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            selectedPeriod = e.target.dataset.period;
            updatePortfolioData();
        });
    });

    // Feature card navigation
    document.querySelectorAll('.feature-card').forEach(card => {
        card.addEventListener('mouseenter', () => {
            card.style.transform = 'translateY(-4px)';
        });
        card.addEventListener('mouseleave', () => {
            card.style.transform = 'translateY(0)';
        });
    });
}

/**
 * Update all dashboard data
 */
async function updateDashboardData() {
    try {
        await Promise.all([
            updatePortfolioData(),
            updatePlatformStats(),
            updateBotStatus(),
            updateFeatureStats(),
            updateRecentActivity()
        ]);
    } catch (error) {
        console.error('Error updating dashboard:', error);
    }
}

/**
 * Update portfolio data
 */
async function updatePortfolioData() {
    try {
        // TODO: Fetch from user's contract data
        const portfolioData = {
            totalValue: 2500.50,
            change24h: 5.25,
            activeOrders: 4,
            totalExecuted: 23,
            feesEarned: 125.50
        };

        document.getElementById('totalValue').textContent = `$${portfolioData.totalValue.toFixed(2)}`;
        document.getElementById('portfolioChange').textContent =
            `${portfolioData.change24h > 0 ? '+' : ''}${portfolioData.change24h.toFixed(2)}%`;
        document.getElementById('activeOrdersCount').textContent = portfolioData.activeOrders;
        document.getElementById('totalExecuted').textContent = portfolioData.totalExecuted;
        document.getElementById('feesEarned').textContent = `$${portfolioData.feesEarned.toFixed(2)}`;
        document.getElementById('volumeData').textContent = '$5,234.50';

    } catch (error) {
        console.error('Error updating portfolio:', error);
    }
}

/**
 * Update platform statistics
 */
async function updatePlatformStats() {
    try {
        // TODO: Fetch from contract
        const platformStats = {
            tvl: 2400000,
            users: 1847,
            activePools: 12,
            feeRate: '0.3%'
        };

        document.getElementById('platformTVL').textContent = `$${(platformStats.tvl / 1000000).toFixed(1)}M`;
        document.getElementById('platformUsers').textContent = platformStats.users.toLocaleString();
        document.getElementById('activePools').textContent = platformStats.activePools;
        document.getElementById('protocolFee').textContent = platformStats.feeRate;

    } catch (error) {
        console.error('Error updating platform stats:', error);
    }
}

/**
 * Update bot status indicators
 */
async function updateBotStatus() {
    try {
        // TODO: Fetch from contracts
        const botStatuses = {
            limitBot: false,
            recurringBot: true,
            gridBot: false
        };

        updateBotIndicator('limitBotStatus', botStatuses.limitBot);
        updateBotIndicator('recurringBotStatus', botStatuses.recurringBot);
        updateBotIndicator('gridBotStatus', botStatuses.gridBot);

    } catch (error) {
        console.error('Error updating bot status:', error);
    }
}

/**
 * Update bot indicator element
 */
function updateBotIndicator(elementId, isActive) {
    const element = document.getElementById(elementId);
    const dot = element.querySelector('.indicator-dot');
    const text = element.querySelector('.status-text');

    if (isActive) {
        dot.classList.add('active');
        text.textContent = 'Active';
    } else {
        dot.classList.remove('active');
        text.textContent = 'Inactive';
    }
}

/**
 * Update feature statistics
 */
async function updateFeatureStats() {
    try {
        // TODO: Fetch from each contract
        const featureStats = {
            amm: { tvl: 1800000 },
            limit: { active: 4, executed: 8 },
            recurring: { active: 2, spent: 450.50 },
            grid: { active: 1, filled: 5 },
            liquidity: { lps: 3, fees: 245.75 }
        };

        // AMM Stats
        document.getElementById('ammTVL').textContent = `$${(featureStats.amm.tvl / 1000000).toFixed(1)}M`;

        // Limit Orders Stats
        document.getElementById('limitActive').textContent = featureStats.limit.active;
        document.getElementById('limitExecuted').textContent = featureStats.limit.executed;

        // Recurring Orders Stats
        document.getElementById('recurringActive').textContent = featureStats.recurring.active;
        document.getElementById('recurringSpent').textContent = `$${featureStats.recurring.spent.toFixed(2)}`;

        // Grid Orders Stats
        document.getElementById('gridActive').textContent = featureStats.grid.active;
        document.getElementById('gridFilled').textContent = featureStats.grid.filled;

        // Liquidity Stats
        document.getElementById('yourLPs').textContent = featureStats.liquidity.lps;
        document.getElementById('lpFees').textContent = `$${featureStats.liquidity.fees.toFixed(2)}`;

    } catch (error) {
        console.error('Error updating feature stats:', error);
    }
}

/**
 * Update recent activity feeds
 */
async function updateRecentActivity() {
    try {
        // TODO: Fetch from contract events/subgraph
        const recentTrades = [
            {
                id: 1,
                pair: 'USDC/BEAM',
                amount: '100',
                price: '0.52',
                time: '2 minutes ago',
                type: 'buy'
            },
            {
                id: 2,
                pair: 'BEAM/USDT',
                amount: '250',
                price: '0.75',
                time: '15 minutes ago',
                type: 'sell'
            }
        ];

        const recentOrders = [
            {
                id: 1,
                type: 'Limit',
                pair: 'USDC/BEAM',
                status: 'Active',
                time: '1 hour ago'
            },
            {
                id: 2,
                type: 'DCA',
                pair: 'USDT/BEAM',
                status: 'Active',
                time: '2 hours ago'
            }
        ];

        const executions = [
            {
                id: 1,
                type: 'Recurring',
                pair: 'USDC/BEAM',
                amount: '100',
                time: 'Just now'
            },
            {
                id: 2,
                type: 'Grid',
                pair: 'BEAM/USDT',
                level: '2',
                time: '5 minutes ago'
            }
        ];

        renderActivityList('recentTrades', recentTrades, 'trade');
        renderActivityList('recentOrders', recentOrders, 'order');
        renderActivityList('botExecutions', executions, 'execution');

    } catch (error) {
        console.error('Error updating activity:', error);
    }
}

/**
 * Render activity list
 */
function renderActivityList(elementId, items, type) {
    const container = document.getElementById(elementId);
    container.innerHTML = '';

    if (items.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <span class="empty-icon">${type === 'trade' ? '📊' : type === 'order' ? '🎯' : '⚙️'}</span>
                <p>No recent ${type}s</p>
            </div>
        `;
        return;
    }

    items.forEach(item => {
        const itemEl = document.createElement('div');
        itemEl.className = 'activity-item';

        if (type === 'trade') {
            itemEl.innerHTML = `
                <div class="activity-main">
                    <span class="activity-pair">${item.pair}</span>
                    <span class="activity-amount">${item.amount} @ ${item.price}</span>
                </div>
                <div class="activity-meta">
                    <span class="activity-type ${item.type}">${item.type.toUpperCase()}</span>
                    <span class="activity-time">${item.time}</span>
                </div>
            `;
        } else if (type === 'order') {
            itemEl.innerHTML = `
                <div class="activity-main">
                    <span class="activity-type-badge">${item.type}</span>
                    <span class="activity-pair">${item.pair}</span>
                </div>
                <div class="activity-meta">
                    <span class="activity-status">${item.status}</span>
                    <span class="activity-time">${item.time}</span>
                </div>
            `;
        } else {
            itemEl.innerHTML = `
                <div class="activity-main">
                    <span class="activity-type-badge">${item.type}</span>
                    <span class="activity-pair">${item.pair}</span>
                    ${item.level ? `<span class="activity-meta-text">Level ${item.level}</span>` : ''}
                </div>
                <div class="activity-meta">
                    <span class="activity-amount">${item.amount || ''}</span>
                    <span class="activity-time">${item.time}</span>
                </div>
            `;
        }

        container.appendChild(itemEl);
    });
}

/**
 * Refresh dashboard data
 */
async function refreshDashboard() {
    const refreshBtn = document.querySelector('.refresh-btn');
    if (refreshBtn) {
        refreshBtn.style.animation = 'spin 1s linear';
    }

    await updateDashboardData();

    if (refreshBtn) {
        setTimeout(() => {
            refreshBtn.style.animation = '';
        }, 1000);
    }

    console.log('Dashboard refreshed');
}

/**
 * Start auto-refresh of dashboard data
 */
function startAutoRefresh() {
    refreshInterval = setInterval(async () => {
        await updateDashboardData();
    }, 30000); // Update every 30 seconds
}

/**
 * Stop auto-refresh
 */
function stopAutoRefresh() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
    }
}

// Make functions globally available
window.refreshDashboard = refreshDashboard;

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    stopAutoRefresh();
});
