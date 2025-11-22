/**
 * Recurring Orders Page Logic
 *
 * Features:
 * - DCA (Dollar Cost Averaging) orders
 * - Trigger-based recurring orders
 * - Pause/Resume/Cancel functionality
 * - Bot status and execution monitoring
 * - Performance metrics and statistics
 */

let currentMode = 'dca'; // 'dca' or 'trigger'
let triggerOrderType = 'buy'; // 'buy' or 'sell'
let botStatusInterval = null;

// Initialize page
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Recurring Orders Page Loaded');
    initializeTokenSelectors();
    setupEventListeners();
    loadActiveRecurringOrders();
    updateRecurringBotStatus();
    startRecurringBotMonitoring();
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

    // DCA tokens
    const dcaInSelect = document.getElementById('dcaTokenIn');
    const dcaOutSelect = document.getElementById('dcaTokenOut');

    // Trigger tokens
    const triggerInSelect = document.getElementById('triggerTokenIn');
    const triggerOutSelect = document.getElementById('triggerTokenOut');

    [dcaInSelect, dcaOutSelect, triggerInSelect, triggerOutSelect].forEach(select => {
        tokens.forEach(token => {
            const option = document.createElement('option');
            option.value = token.address;
            option.textContent = token.symbol;
            select.appendChild(option);
        });
    });

    if (tokens.length >= 2) {
        dcaInSelect.value = tokens[0].address;
        dcaOutSelect.value = tokens[1].address;
        triggerInSelect.value = tokens[0].address;
        triggerOutSelect.value = tokens[1].address;
    }
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Mode tabs
    document.querySelectorAll('.mode-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            switchMode(e.target.closest('.mode-tab').dataset.mode);
        });
    });
}

/**
 * Switch between DCA and Trigger modes
 */
function switchMode(mode) {
    currentMode = mode;

    // Update tabs
    document.querySelectorAll('.mode-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.mode === mode);
    });

    // Update forms
    document.getElementById('dcaForm').style.display = mode === 'dca' ? 'block' : 'none';
    document.getElementById('triggerForm').style.display = mode === 'trigger' ? 'block' : 'none';
}

/**
 * Set trigger order type
 */
function setTriggerType(type) {
    triggerOrderType = type;
    document.querySelectorAll('[data-type]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.type === type);
    });
}

/**
 * Create DCA order
 */
async function createDCAOrder(e) {
    e.preventDefault();

    const tokenIn = document.getElementById('dcaTokenIn').value;
    const tokenOut = document.getElementById('dcaTokenOut').value;
    const amountPerExec = document.getElementById('dcaAmountPerExec').value;
    const interval = document.getElementById('dcaInterval').value;
    const maxExec = document.getElementById('dcaMaxExec').value;
    const duration = document.getElementById('dcaDuration').value;

    if (!tokenIn || !tokenOut || !amountPerExec || !maxExec) {
        showError('Please fill in all fields');
        return;
    }

    try {
        console.log('Creating DCA order:', {
            tokenIn, tokenOut, amountPerExec, interval, maxExec, duration,
            executionMode: 0 // INTERVAL mode
        });

        showSuccess('DCA order created successfully!');
        loadActiveRecurringOrders();
        // Reset form
        document.getElementById('dcaOrderForm').reset();
    } catch (error) {
        showError('Failed to create DCA order: ' + error.message);
    }
}

/**
 * Create trigger-based order
 */
async function createTriggerOrder(e) {
    e.preventDefault();

    const tokenIn = document.getElementById('triggerTokenIn').value;
    const tokenOut = document.getElementById('triggerTokenOut').value;
    const amountPerExec = document.getElementById('triggerAmountPerExec').value;
    const triggerPercent = document.getElementById('triggerPercentage').value;
    const maxExec = document.getElementById('triggerMaxExec').value;
    const duration = document.getElementById('triggerDuration').value;

    if (!tokenIn || !tokenOut || !amountPerExec || !triggerPercent || !maxExec) {
        showError('Please fill in all fields');
        return;
    }

    try {
        console.log('Creating trigger order:', {
            tokenIn, tokenOut, amountPerExec, triggerPercent, maxExec, duration,
            orderType: triggerOrderType === 'buy' ? 0 : 1,
            executionMode: 1 // TRIGGER mode
        });

        showSuccess('Trigger order created successfully!');
        loadActiveRecurringOrders();
        // Reset form
        document.getElementById('triggerOrderForm').reset();
    } catch (error) {
        showError('Failed to create trigger order: ' + error.message);
    }
}

/**
 * Load active recurring orders
 */
async function loadActiveRecurringOrders() {
    try {
        // TODO: Fetch from contract
        const mockOrders = [
            {
                id: 1,
                type: 'DCA',
                tokenIn: 'USDC',
                tokenOut: 'BEAM',
                amountPerExec: '100',
                interval: 'Weekly',
                executionCount: 8,
                maxExecutions: 12,
                status: 'Active',
                nextExecution: '2 days',
                totalSpent: '$800',
                totalReceived: '1500 BEAM'
            },
            {
                id: 2,
                type: 'Trigger',
                tokenIn: 'BEAM',
                tokenOut: 'USDT',
                amountPerExec: '500',
                triggerPercent: '5%',
                executionCount: 3,
                maxExecutions: 10,
                status: 'Active',
                nextExecution: 'When price changes 5%',
                totalSpent: '$1500',
                totalReceived: '3000 USDT'
            }
        ];

        const list = document.getElementById('activeRecurringList');
        list.innerHTML = '';

        if (mockOrders.length === 0) {
            list.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">🔄</div>
                    <p>No active orders</p>
                </div>
            `;
        } else {
            mockOrders.forEach(order => {
                const orderEl = createRecurringOrderElement(order);
                list.appendChild(orderEl);
            });
        }

        document.getElementById('activeRecurringCount').textContent = mockOrders.length;
        document.getElementById('activeRecurringOrders').textContent = mockOrders.length;
        document.getElementById('totalRecurringOrders').textContent = mockOrders.length;

    } catch (error) {
        console.error('Error loading orders:', error);
    }
}

/**
 * Create recurring order HTML element
 */
function createRecurringOrderElement(order) {
    const div = document.createElement('div');
    div.className = 'recurring-order-item';
    div.innerHTML = `
        <div class="order-header">
            <span class="order-id">#${order.id}</span>
            <span class="order-type-badge ${order.type.toLowerCase()}">${order.type}</span>
            <span class="order-status">${order.status}</span>
        </div>
        <div class="order-details">
            <div class="detail-row">
                <span class="detail-label">Pair</span>
                <span class="detail-value">${order.tokenIn}/${order.tokenOut}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Amount/Exec</span>
                <span class="detail-value">${order.amountPerExec}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Progress</span>
                <span class="detail-value">${order.executionCount}/${order.maxExecutions}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Total Spent</span>
                <span class="detail-value">${order.totalSpent}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Total Received</span>
                <span class="detail-value">${order.totalReceived}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Next Execution</span>
                <span class="detail-value">${order.nextExecution}</span>
            </div>
        </div>
        <div class="order-progress">
            <div class="progress-bar">
                <div class="progress-fill" style="width: ${(order.executionCount / order.maxExecutions * 100).toFixed(0)}%"></div>
            </div>
            <span class="progress-text">${(order.executionCount / order.maxExecutions * 100).toFixed(0)}% Complete</span>
        </div>
        <div class="order-actions">
            <button class="action-btn pause" onclick="pauseRecurringOrder(${order.id})" title="Pause">⏸</button>
            <button class="action-btn resume" onclick="resumeRecurringOrder(${order.id})" title="Resume">▶</button>
            <button class="action-btn cancel" onclick="cancelRecurringOrder(${order.id})" title="Cancel">✕</button>
        </div>
    `;
    return div;
}

/**
 * Pause recurring order
 */
async function pauseRecurringOrder(orderId) {
    try {
        console.log('Pausing order:', orderId);
        showSuccess(`Order #${orderId} paused`);
        loadActiveRecurringOrders();
    } catch (error) {
        showError('Failed to pause order: ' + error.message);
    }
}

/**
 * Resume recurring order
 */
async function resumeRecurringOrder(orderId) {
    try {
        console.log('Resuming order:', orderId);
        showSuccess(`Order #${orderId} resumed`);
        loadActiveRecurringOrders();
    } catch (error) {
        showError('Failed to resume order: ' + error.message);
    }
}

/**
 * Cancel recurring order
 */
async function cancelRecurringOrder(orderId) {
    if (confirm(`Cancel order #${orderId}? You will receive a refund for remaining amount.`)) {
        try {
            console.log('Cancelling order:', orderId);
            showSuccess(`Order #${orderId} cancelled and refunded`);
            loadActiveRecurringOrders();
        } catch (error) {
            showError('Failed to cancel order: ' + error.message);
        }
    }
}

/**
 * Update recurring bot status
 */
async function updateRecurringBotStatus() {
    try {
        // TODO: Fetch from contract
        const botStatus = {
            enabled: true,
            cycleCounter: 42,
            totalExecuted: 85,
            maxIterations: 1000
        };

        document.getElementById('recurringBotEnabled').textContent = botStatus.enabled ? 'Yes' : 'No';
        document.getElementById('recurringBotCycles').textContent = botStatus.cycleCounter;
        document.getElementById('recurringBotExecuted').textContent = botStatus.totalExecuted;
        document.getElementById('recurringBotMaxIter').textContent = botStatus.maxIterations;

        // Update indicator
        const indicator = document.getElementById('recurringIndicatorDot');
        const statusText = document.getElementById('recurringBotStatusText');
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
 * Start recurring bot status monitoring
 */
function startRecurringBotMonitoring() {
    botStatusInterval = setInterval(updateRecurringBotStatus, 10000);
}

/**
 * Start recurring bot
 */
async function startRecurringBot() {
    try {
        console.log('Starting recurring orders bot');
        showSuccess('Bot started successfully');
        updateRecurringBotStatus();
    } catch (error) {
        showError('Failed to start bot: ' + error.message);
    }
}

/**
 * Stop recurring bot
 */
async function stopRecurringBot() {
    try {
        console.log('Stopping recurring orders bot');
        showSuccess('Bot stopped successfully');
        updateRecurringBotStatus();
    } catch (error) {
        showError('Failed to stop bot: ' + error.message);
    }
}

/**
 * Open create recurring modal
 */
function openCreateRecurringModal() {
    document.getElementById('dcaForm').scrollIntoView({ behavior: 'smooth' });
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
window.switchMode = switchMode;
window.setTriggerType = setTriggerType;
window.createDCAOrder = createDCAOrder;
window.createTriggerOrder = createTriggerOrder;
window.pauseRecurringOrder = pauseRecurringOrder;
window.resumeRecurringOrder = resumeRecurringOrder;
window.cancelRecurringOrder = cancelRecurringOrder;
window.startRecurringBot = startRecurringBot;
window.stopRecurringBot = stopRecurringBot;
window.openCreateRecurringModal = openCreateRecurringModal;

// Cleanup
window.addEventListener('beforeunload', () => {
    if (botStatusInterval) {
        clearInterval(botStatusInterval);
    }
});
