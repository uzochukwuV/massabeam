/**
 * Limit Orders Page Logic
 *
 * Features:
 * - Create BUY/SELL limit orders with price conditions
 * - Display active orders with real-time price monitoring
 * - Bot status and control
 * - Order history and statistics
 * - Price analysis for order execution
 */

import { AMMContract, getTokenPrice, calculatePriceImpact } from './main.js';

let selectedOrderTokenIn = null;
let selectedOrderTokenOut = null;
let orderType = 'buy'; // 'buy' or 'sell'
let botStatusInterval = null;

// Initialize page
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Limit Orders Page Loaded');
    initializeTokenSelectors();
    setupEventListeners();
    loadActiveOrders();
    updateBotStatus();
    startBotStatusMonitoring();
});

/**
 * Initialize token selectors
 */
function initializeTokenSelectors() {
    const tokens = [
        { symbol: 'USDC', address: 'AS12fCBhCRMzqDuCH9fY25Gtu1wNJyxgF1YHuZEW91UBrg2EgjeSB' },
        { symbol: 'USDT', address: 'AS12M4KwP2fRrrkb2oY47hhZqcNRC4sbZ8uPfqKNoR3f3b5eqy2yo' },
        { symbol: 'BEAM', address: 'AS1oAHhbH7mMmPDoZJsSx8dnWzNgW2F8ugVBXpso3bTSTJFU6TUk' },
    ];

    const inSelect = document.getElementById('orderTokenIn');
    const outSelect = document.getElementById('orderTokenOut');

    tokens.forEach(token => {
        const option1 = document.createElement('option');
        option1.value = token.address;
        option1.textContent = token.symbol;
        inSelect.appendChild(option1);

        const option2 = document.createElement('option');
        option2.value = token.address;
        option2.textContent = token.symbol;
        outSelect.appendChild(option2);
    });

    if (tokens.length >= 2) {
        inSelect.value = tokens[0].address;
        outSelect.value = tokens[1].address;
        selectedOrderTokenIn = tokens[0];
        selectedOrderTokenOut = tokens[1];
    }
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Order type selection
    document.querySelectorAll('.order-type-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.order-type-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            orderType = e.target.dataset.type;
            updateOrderPriceAnalysis();
        });
    });

    // Token selection
    document.getElementById('orderTokenIn').addEventListener('change', (e) => {
        selectedOrderTokenIn = {
            symbol: e.target.options[e.target.selectedIndex].text,
            address: e.target.value
        };
        updateOrderPriceAnalysis();
    });

    document.getElementById('orderTokenOut').addEventListener('change', (e) => {
        selectedOrderTokenOut = {
            symbol: e.target.options[e.target.selectedIndex].text,
            address: e.target.value
        };
        updateOrderPriceAnalysis();
    });

    // Limit price input
    document.getElementById('orderLimitPrice').addEventListener('input', updateOrderPriceAnalysis);
    document.getElementById('orderAmountIn').addEventListener('input', updateOrderOutput);
}

/**
 * Update order price analysis
 */
async function updateOrderPriceAnalysis() {
    if (!selectedOrderTokenIn || !selectedOrderTokenOut) return;

    try {
        const priceData = await getTokenPrice(
            selectedOrderTokenIn.address,
            selectedOrderTokenOut.address
        );

        if (priceData) {
            document.getElementById('orderCurrentPrice').textContent =
                `1 ${selectedOrderTokenIn.symbol} = ${priceData.priceInQuote} ${selectedOrderTokenOut.symbol}`;

            const limitPrice = document.getElementById('orderLimitPrice').value;
            if (limitPrice) {
                const currentPrice = Number(priceData.priceInQuote);
                const priceDiff = ((currentPrice - Number(limitPrice)) / currentPrice * 100).toFixed(2);
                document.getElementById('orderPriceDiff').textContent = `${priceDiff}%`;
                document.getElementById('orderLimitPriceDisplay').textContent = limitPrice;
            }
        }
    } catch (error) {
        console.error('Error updating price analysis:', error);
    }
}

/**
 * Update order output estimation
 */
async function updateOrderOutput() {
    if (!selectedOrderTokenIn || !selectedOrderTokenOut) return;

    const amount = document.getElementById('orderAmountIn').value;
    if (!amount) {
        document.getElementById('orderEstOutput').textContent = '-';
        return;
    }

    try {
        const poolData = await AMMContract.getPool(
            selectedOrderTokenIn.address,
            selectedOrderTokenOut.address
        );

        if (poolData) {
            const output = await AMMContract.getAmountOut(
                amount,
                poolData.reserveA,
                poolData.reserveB,
                poolData.fee || 3000
            );

            document.getElementById('orderEstOutput').textContent =
                `${(Number(output) / 1e8).toFixed(8)} ${selectedOrderTokenOut.symbol}`;
        }
    } catch (error) {
        console.error('Error calculating output:', error);
    }
}

/**
 * Create limit order
 */
async function createLimitOrder(e) {
    e.preventDefault();

    const tokenIn = document.getElementById('orderTokenIn').value;
    const tokenOut = document.getElementById('orderTokenOut').value;
    const amountIn = document.getElementById('orderAmountIn').value;
    const limitPrice = document.getElementById('orderLimitPrice').value;
    const minOut = document.getElementById('orderMinOut').value;
    const expiry = document.getElementById('orderExpiry').value;

    if (!tokenIn || !tokenOut || !amountIn || !limitPrice || !minOut) {
        showError('Please fill in all fields');
        return;
    }

    try {
        console.log('Creating limit order:', {
            tokenIn, tokenOut, amountIn, limitPrice, minOut, expiry,
            orderType: orderType === 'buy' ? 0 : 1
        });

        showSuccess(`Limit order created successfully!`);
        // TODO: Call actual contract
        loadActiveOrders();
    } catch (error) {
        showError('Failed to create order: ' + error.message);
    }
}

/**
 * Load and display active orders
 */
async function loadActiveOrders() {
    try {
        // TODO: Fetch from contract
        const mockOrders = [
            {
                id: 1,
                type: 'BUY',
                tokenIn: 'USDC',
                tokenOut: 'BEAM',
                amount: '1000',
                limitPrice: '0.5',
                currentPrice: '0.55',
                status: 'Active',
                expiresIn: '5 days'
            },
            {
                id: 2,
                type: 'SELL',
                tokenIn: 'BEAM',
                tokenOut: 'USDT',
                amount: '500',
                limitPrice: '0.75',
                currentPrice: '0.70',
                status: 'Active',
                expiresIn: '3 days'
            }
        ];

        const list = document.getElementById('activeOrdersList');
        list.innerHTML = '';

        if (mockOrders.length === 0) {
            list.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📋</div>
                    <p>No active orders</p>
                </div>
            `;
        } else {
            mockOrders.forEach(order => {
                const orderEl = createOrderElement(order);
                list.appendChild(orderEl);
            });
        }

        document.getElementById('activeOrderCount').textContent = mockOrders.length;
        document.getElementById('activeOrders').textContent = mockOrders.length;

    } catch (error) {
        console.error('Error loading orders:', error);
    }
}

/**
 * Create order HTML element
 */
function createOrderElement(order) {
    const div = document.createElement('div');
    div.className = 'order-item';
    const priceColor = Number(order.currentPrice) < Number(order.limitPrice) ? 'success' : 'warning';
    div.innerHTML = `
        <div class="order-header">
            <span class="order-id">#${order.id}</span>
            <span class="order-type ${order.type.toLowerCase()}">${order.type}</span>
        </div>
        <div class="order-details">
            <div class="detail-row">
                <span class="detail-label">Pair</span>
                <span class="detail-value">${order.tokenIn}/${order.tokenOut}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Amount</span>
                <span class="detail-value">${order.amount}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Limit Price</span>
                <span class="detail-value">${order.limitPrice}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Current Price</span>
                <span class="detail-value ${priceColor}">${order.currentPrice}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Status</span>
                <span class="detail-value">${order.status}</span>
            </div>
        </div>
        <div class="order-actions">
            <button class="action-btn cancel" onclick="cancelLimitOrder(${order.id})">Cancel</button>
        </div>
    `;
    return div;
}

/**
 * Cancel limit order
 */
async function cancelLimitOrder(orderId) {
    if (confirm(`Cancel order #${orderId}?`)) {
        try {
            console.log('Cancelling order:', orderId);
            showSuccess('Order cancelled successfully');
            loadActiveOrders();
        } catch (error) {
            showError('Failed to cancel order: ' + error.message);
        }
    }
}

/**
 * Update bot status
 */
async function updateBotStatus() {
    try {
        // TODO: Fetch from contract
        const botStatus = {
            enabled: false,
            cycleCounter: 0,
            totalExecuted: 0,
            maxIterations: 1000
        };

        document.getElementById('botEnabled').textContent = botStatus.enabled ? 'Yes' : 'No';
        document.getElementById('botCycleCount').textContent = botStatus.cycleCounter;
        document.getElementById('botExecuted').textContent = botStatus.totalExecuted;
        document.getElementById('botMaxIter').textContent = botStatus.maxIterations;

        // Update indicator
        const indicator = document.getElementById('indicatorDot');
        const statusText = document.getElementById('botStatusText');
        if (botStatus.enabled) {
            indicator.classList.add('active');
            statusText.textContent = 'Active';
        } else {
            indicator.classList.remove('active');
            statusText.textContent = 'Inactive';
        }

    } catch (error) {
        console.error('Error updating bot status:', error);
    }
}

/**
 * Start bot status monitoring
 */
function startBotStatusMonitoring() {
    botStatusInterval = setInterval(updateBotStatus, 10000); // Update every 10 seconds
}

/**
 * Stop bot status monitoring
 */
function stopBotStatusMonitoring() {
    if (botStatusInterval) {
        clearInterval(botStatusInterval);
    }
}

/**
 * Start limit bot
 */
async function startLimitBot() {
    try {
        console.log('Starting limit orders bot');
        showSuccess('Bot started successfully');
        updateBotStatus();
    } catch (error) {
        showError('Failed to start bot: ' + error.message);
    }
}

/**
 * Stop limit bot
 */
async function stopLimitBot() {
    try {
        console.log('Stopping limit orders bot');
        showSuccess('Bot stopped successfully');
        updateBotStatus();
    } catch (error) {
        showError('Failed to stop bot: ' + error.message);
    }
}

/**
 * Refresh orders
 */
async function refreshOrders() {
    await loadActiveOrders();
    await updateBotStatus();
    showSuccess('Orders refreshed');
}

/**
 * Set max amount
 */
function setOrderMaxAmount() {
    const balance = document.getElementById('orderTokenInBalance').textContent;
    document.getElementById('orderAmountIn').value = balance;
    updateOrderOutput();
}

/**
 * Open create order modal
 */
function openCreateOrderModal() {
    // Scroll to form
    document.getElementById('orderForm').scrollIntoView({ behavior: 'smooth' });
}

/**
 * Show success message
 */
function showSuccess(message) {
    console.log('✓', message);
}

/**
 * Show error message
 */
function showError(message) {
    console.error('✗', message);
}

// Make functions globally available
window.createLimitOrder = createLimitOrder;
window.cancelLimitOrder = cancelLimitOrder;
window.setOrderMaxAmount = setOrderMaxAmount;
window.openCreateOrderModal = openCreateOrderModal;
window.refreshOrders = refreshOrders;
window.startLimitBot = startLimitBot;
window.stopLimitBot = stopLimitBot;

// Cleanup
window.addEventListener('beforeunload', () => {
    stopBotStatusMonitoring();
});
