/**
 * Grid Orders Page Logic
 *
 * Features:
 * - Multi-level grid order creation
 * - Dynamic grid level calculation
 * - Buy/Sell grid support
 * - Bot status and execution tracking
 * - Performance metrics and level visualization
 */

import { AMMContract, getTokenPrice } from './main.js';

let gridType = 'buy'; // 'buy' or 'sell'
let selectedGridTokenIn = null;
let selectedGridTokenOut = null;
let gridLevels = [];
let botStatusInterval = null;

// Initialize page
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Grid Orders Page Loaded');
    initializeTokenSelectors();
    setupEventListeners();
    loadActiveGrids();
    updateGridBotStatus();
    startGridBotMonitoring();
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

    const inSelect = document.getElementById('gridTokenIn');
    const outSelect = document.getElementById('gridTokenOut');

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
        selectedGridTokenIn = tokens[0];
        selectedGridTokenOut = tokens[1];
    }
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Grid type selection
    document.querySelectorAll('.grid-type-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.grid-type-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            gridType = e.target.dataset.type;
        });
    });

    // Token selection
    document.getElementById('gridTokenIn').addEventListener('change', (e) => {
        selectedGridTokenIn = {
            symbol: e.target.options[e.target.selectedIndex].text,
            address: e.target.value
        };
        updateGridPriceInfo();
    });

    document.getElementById('gridTokenOut').addEventListener('change', (e) => {
        selectedGridTokenOut = {
            symbol: e.target.options[e.target.selectedIndex].text,
            address: e.target.value
        };
        updateGridPriceInfo();
    });

    // Grid configuration
    document.getElementById('gridLevels').addEventListener('change', updateGridPreview);
    document.getElementById('gridSpacing').addEventListener('change', updateGridPreview);
    document.getElementById('gridTotalAmount').addEventListener('input', calculateAmountPerLevel);
    document.getElementById('gridEntryPrice').addEventListener('input', updateGridPreview);
}

/**
 * Update grid price information
 */
async function updateGridPriceInfo() {
    if (!selectedGridTokenIn || !selectedGridTokenOut) return;

    try {
        const priceData = await getTokenPrice(
            selectedGridTokenIn.address,
            selectedGridTokenOut.address
        );

        if (priceData) {
            document.getElementById('gridCurrentPrice').textContent =
                `${priceData.priceInQuote} ${selectedGridTokenOut.symbol}`;
            document.getElementById('gridEntryPrice').value = priceData.priceInQuote;
            updateGridPreview();
        }
    } catch (error) {
        console.error('Error updating price info:', error);
    }
}

/**
 * Set grid preset
 */
function setGridPreset(type, levels) {
    document.getElementById('gridLevels').value = levels;

    if (type === 'symmetric') {
        document.getElementById('gridSpacing').value = '5';
    } else if (type === 'exponential') {
        document.getElementById('gridSpacing').value = '3';
    }

    updateGridPreview();
}

/**
 * Calculate amount per level
 */
function calculateAmountPerLevel() {
    const total = Number(document.getElementById('gridTotalAmount').value);
    const levels = Number(document.getElementById('gridLevels').value);

    if (total && levels) {
        const amountPerLevel = (total / levels).toFixed(8);
        document.getElementById('gridAmountPerLevel').textContent = amountPerLevel;
    }
}

/**
 * Update grid preview and level visualization
 */
function updateGridPreview() {
    const entryPrice = Number(document.getElementById('gridEntryPrice').value);
    const levels = Number(document.getElementById('gridLevels').value);
    const spacing = Number(document.getElementById('gridSpacing').value);
    const total = Number(document.getElementById('gridTotalAmount').value);

    if (!entryPrice || !levels || !spacing) {
        document.getElementById('gridPreview').innerHTML = '<div class="preview-placeholder">Fill in all fields</div>';
        return;
    }

    // Calculate grid levels
    gridLevels = [];
    for (let i = 1; i <= levels; i++) {
        const basisPoints = spacing * 100 * i; // Convert % to basis points
        let price;

        if (gridType === 'buy') {
            // Buy grid: prices decrease
            const multiplier = (10000 - basisPoints) / 10000;
            price = entryPrice * multiplier;
        } else {
            // Sell grid: prices increase
            const multiplier = (10000 + basisPoints) / 10000;
            price = entryPrice * multiplier;
        }

        gridLevels.push({
            level: i,
            basisPoints,
            price: price.toFixed(8),
            amount: (total / levels).toFixed(8)
        });
    }

    // Update preview visualization
    renderGridPreview();
    updateLevelsTable();
    calculateAmountPerLevel();
}

/**
 * Render grid preview visualization
 */
function renderGridPreview() {
    const preview = document.getElementById('gridPreview');

    if (gridLevels.length === 0) {
        preview.innerHTML = '<div class="preview-placeholder">Configure grid to see preview</div>';
        return;
    }

    let html = '<div class="grid-visualization">';

    gridLevels.forEach(level => {
        const barHeight = (20 + level.level * 10) + '%';
        html += `
            <div class="grid-level">
                <div class="level-bar" style="height: ${barHeight}">
                    <span class="level-info">
                        Level ${level.level}: ${level.price} @ ${level.amount}
                    </span>
                </div>
            </div>
        `;
    });

    html += '</div>';
    preview.innerHTML = html;
}

/**
 * Update levels table
 */
function updateLevelsTable() {
    const tbody = document.getElementById('levelsTableBody');
    tbody.innerHTML = '';

    if (gridLevels.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="empty">Configure grid to see levels</td></tr>';
        return;
    }

    gridLevels.forEach(level => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>#${level.level}</td>
            <td>${level.price}</td>
            <td>${level.amount}</td>
            <td class="status-empty">Pending</td>
        `;
        tbody.appendChild(tr);
    });
}

/**
 * Create grid order
 */
async function createGridOrder(e) {
    e.preventDefault();

    const tokenIn = document.getElementById('gridTokenIn').value;
    const tokenOut = document.getElementById('gridTokenOut').value;
    const entryPrice = document.getElementById('gridEntryPrice').value;
    const duration = document.getElementById('gridDuration').value;

    if (!tokenIn || !tokenOut || !entryPrice || gridLevels.length === 0) {
        showError('Please configure the grid completely');
        return;
    }

    try {
        console.log('Creating grid order:', {
            tokenIn, tokenOut, entryPrice, duration,
            gridLevels: gridLevels.map(l => l.basisPoints),
            gridAmounts: gridLevels.map(l => l.amount),
            orderType: gridType === 'buy' ? 0 : 1
        });

        showSuccess('Grid order created successfully!');
        loadActiveGrids();
        document.getElementById('gridForm').reset();
    } catch (error) {
        showError('Failed to create grid order: ' + error.message);
    }
}

/**
 * Load active grid orders
 */
async function loadActiveGrids() {
    try {
        // TODO: Fetch from contract
        const mockGrids = [
            {
                id: 1,
                type: 'Buy',
                tokenIn: 'USDC',
                tokenOut: 'BEAM',
                entryPrice: '0.50',
                levels: 5,
                levelsFilled: 2,
                status: 'Active',
                totalAmount: '1000',
                startDate: '2025-01-10',
                expiresIn: '11 months'
            },
            {
                id: 2,
                type: 'Sell',
                tokenIn: 'BEAM',
                tokenOut: 'USDT',
                entryPrice: '0.75',
                levels: 3,
                levelsFilled: 1,
                status: 'Active',
                totalAmount: '500',
                startDate: '2025-01-15',
                expiresIn: '10 months'
            }
        ];

        const list = document.getElementById('activeGridsList');
        list.innerHTML = '';

        if (mockGrids.length === 0) {
            list.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📊</div>
                    <p>No active grids</p>
                </div>
            `;
        } else {
            mockGrids.forEach(grid => {
                const gridEl = createGridElement(grid);
                list.appendChild(gridEl);
            });
        }

        document.getElementById('activeGridCount').textContent = mockGrids.length;
        document.getElementById('totalGrids').textContent = mockGrids.length;

    } catch (error) {
        console.error('Error loading grids:', error);
    }
}

/**
 * Create grid HTML element
 */
function createGridElement(grid) {
    const div = document.createElement('div');
    div.className = 'grid-item';
    const fillPercent = (grid.levelsFilled / grid.levels * 100).toFixed(0);

    div.innerHTML = `
        <div class="grid-header">
            <span class="grid-id">#${grid.id}</span>
            <span class="grid-type ${grid.type.toLowerCase()}">${grid.type} Grid</span>
            <span class="grid-status">${grid.status}</span>
        </div>
        <div class="grid-details">
            <div class="detail-row">
                <span class="detail-label">Pair</span>
                <span class="detail-value">${grid.tokenIn}/${grid.tokenOut}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Entry Price</span>
                <span class="detail-value">${grid.entryPrice}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Levels</span>
                <span class="detail-value">${grid.levelsFilled}/${grid.levels}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Total Amount</span>
                <span class="detail-value">${grid.totalAmount}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Expires</span>
                <span class="detail-value">${grid.expiresIn}</span>
            </div>
        </div>
        <div class="grid-progress">
            <div class="progress-bar">
                <div class="progress-fill" style="width: ${fillPercent}%"></div>
            </div>
            <span class="progress-text">${fillPercent}% Filled</span>
        </div>
        <div class="grid-actions">
            <button class="action-btn view" onclick="viewGridDetails(${grid.id})" title="View Details">👁</button>
            <button class="action-btn cancel" onclick="cancelGrid(${grid.id})" title="Cancel">✕</button>
        </div>
    `;
    return div;
}

/**
 * View grid details
 */
function viewGridDetails(gridId) {
    console.log('Viewing grid details:', gridId);
    showSuccess(`Grid #${gridId} details`);
}

/**
 * Cancel grid order
 */
async function cancelGrid(gridId) {
    if (confirm(`Cancel grid #${gridId}? Unfilled levels will be refunded.`)) {
        try {
            console.log('Cancelling grid:', gridId);
            showSuccess(`Grid #${gridId} cancelled`);
            loadActiveGrids();
        } catch (error) {
            showError('Failed to cancel grid: ' + error.message);
        }
    }
}

/**
 * Update grid bot status
 */
async function updateGridBotStatus() {
    try {
        // TODO: Fetch from contract
        const botStatus = {
            enabled: false,
            cycleCounter: 15,
            totalExecuted: 8,
            maxIterations: 1000
        };

        document.getElementById('gridBotEnabled').textContent = botStatus.enabled ? 'Yes' : 'No';
        document.getElementById('gridBotCycles').textContent = botStatus.cycleCounter;
        document.getElementById('gridBotFilled').textContent = botStatus.totalExecuted;
        document.getElementById('gridBotMaxIter').textContent = botStatus.maxIterations;

        // Update indicator
        const indicator = document.getElementById('gridIndicatorDot');
        const statusText = document.getElementById('gridBotStatusText');
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
 * Start grid bot status monitoring
 */
function startGridBotMonitoring() {
    botStatusInterval = setInterval(updateGridBotStatus, 10000);
}

/**
 * Start grid bot
 */
async function startGridBot() {
    try {
        console.log('Starting grid bot');
        showSuccess('Grid bot started successfully');
        updateGridBotStatus();
    } catch (error) {
        showError('Failed to start grid bot: ' + error.message);
    }
}

/**
 * Stop grid bot
 */
async function stopGridBot() {
    try {
        console.log('Stopping grid bot');
        showSuccess('Grid bot stopped successfully');
        updateGridBotStatus();
    } catch (error) {
        showError('Failed to stop grid bot: ' + error.message);
    }
}

/**
 * Open create grid modal
 */
function openCreateGridModal() {
    document.getElementById('gridForm').scrollIntoView({ behavior: 'smooth' });
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
window.setGridPreset = setGridPreset;
window.createGridOrder = createGridOrder;
window.viewGridDetails = viewGridDetails;
window.cancelGrid = cancelGrid;
window.startGridBot = startGridBot;
window.stopGridBot = stopGridBot;
window.openCreateGridModal = openCreateGridModal;

// Cleanup
window.addEventListener('beforeunload', () => {
    if (botStatusInterval) {
        clearInterval(botStatusInterval);
    }
});
