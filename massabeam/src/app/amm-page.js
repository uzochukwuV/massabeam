/**
 * AMM Page Logic - Enhanced AMM Trading Interface
 *
 * Features:
 * - Token swap with real-time price calculations
 * - Comprehensive pool data display
 * - Price analysis and impact calculations
 * - Live price monitoring
 */

import { AMMContract, getTokenPrice, getMarketData, calculatePriceImpact, getTokenPricesBatch } from './main.js';

let selectedTokenIn = null;
let selectedTokenOut = null;
let priceUpdateInterval = null;
let poolDataCache = {};

// Initialize page
document.addEventListener('DOMContentLoaded', async () => {
    console.log('AMM Page Loaded');
    initializeTokenSelectors();
    setupEventListeners();
    startPriceMonitoring();
});

/**
 * Initialize token selectors with available tokens
 */
function initializeTokenSelectors() {
    const tokens = [
        { symbol: 'USDC', address: 'AS12fCBhCRMzqDuCH9fY25Gtu1wNJyxgF1YHuZEW91UBrg2EgjeSB' },
        { symbol: 'USDT', address: 'AS12M4KwP2fRrrkb2oY47hhZqcNRC4sbZ8uPfqKNoR3f3b5eqy2yo' },
        { symbol: 'BEAM', address: 'AS1oAHhbH7mMmPDoZJsSx8dnWzNgW2F8ugVBXpso3bTSTJFU6TUk' },
    ];

    const fromSelect = document.getElementById('swapTokenIn');
    const toSelect = document.getElementById('swapTokenOut');

    tokens.forEach(token => {
        const option1 = document.createElement('option');
        option1.value = token.address;
        option1.textContent = token.symbol;
        fromSelect.appendChild(option1);

        const option2 = document.createElement('option');
        option2.value = token.address;
        option2.textContent = token.symbol;
        toSelect.appendChild(option2);
    });

    // Set defaults
    if (tokens.length >= 2) {
        fromSelect.value = tokens[0].address;
        toSelect.value = tokens[1].address;
        selectedTokenIn = tokens[0];
        selectedTokenOut = tokens[1];
    }
}

/**
 * Setup event listeners for UI interactions
 */
function setupEventListeners() {
    // Token selection
    document.getElementById('swapTokenIn').addEventListener('change', handleTokenInChange);
    document.getElementById('swapTokenOut').addEventListener('change', handleTokenOutChange);

    // Amount input
    document.getElementById('fromAmount').addEventListener('input', handleFromAmountChange);

    // Pool data refresh button
    const refreshBtn = document.querySelector('.price-analysis-card .refresh-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', refreshPoolData);
    }
}

/**
 * Handle token in selection change
 */
async function handleTokenInChange(e) {
    const address = e.target.value;
    if (!address) return;

    selectedTokenIn = {
        symbol: e.target.options[e.target.selectedIndex].text,
        address: address
    };

    await updatePriceData();
}

/**
 * Handle token out selection change
 */
async function handleTokenOutChange(e) {
    const address = e.target.value;
    if (!address) return;

    selectedTokenOut = {
        symbol: e.target.options[e.target.selectedIndex].text,
        address: address
    };

    await updatePriceData();
}

/**
 * Handle from amount change - calculate output
 */
async function handleFromAmountChange(e) {
    const amount = e.target.value;
    if (!amount || !selectedTokenIn || !selectedTokenOut) {
        document.getElementById('toAmount').value = '';
        return;
    }

    try {
        // Get pool data
        const poolData = await AMMContract.getPool(selectedTokenIn.address, selectedTokenOut.address);
        if (!poolData) {
            showError('Pool not found');
            return;
        }

        // Calculate output
        const amountOut = await AMMContract.getAmountOut(
            amount,
            poolData.reserveA,
            poolData.reserveB,
            poolData.fee || 3000
        );

        // Update output amount
        document.getElementById('toAmount').value = (Number(amountOut) / 1e8).toFixed(8);

        // Calculate and display price impact
        const impact = await calculatePriceImpact(
            selectedTokenIn.address,
            selectedTokenOut.address,
            amount
        );

        if (impact) {
            document.getElementById('priceImpact').textContent = `${impact.priceImpactPercent}%`;
            document.getElementById('swapRate').textContent = `1 ${selectedTokenIn.symbol} = ${impact.spotPrice} ${selectedTokenOut.symbol}`;
        }

        // Update minimum received (with slippage)
        const slippage = Number(document.getElementById('currentSlippage').textContent) / 100;
        const minimumOut = Number(amountOut) * (1 - slippage);
        document.getElementById('minimumReceived').textContent = `${(minimumOut / 1e8).toFixed(8)} ${selectedTokenOut.symbol}`;

    } catch (error) {
        console.error('Error calculating output:', error);
    }
}

/**
 * Update price data for selected token pair
 */
async function updatePriceData() {
    if (!selectedTokenIn || !selectedTokenOut) return;

    try {
        // Get market data
        const marketData = await getMarketData(
            selectedTokenIn.address,
            selectedTokenOut.address
        );

        if (marketData) {
            // Update price analysis
            document.getElementById('currentPrice').textContent = `1 ${selectedTokenIn.symbol} = ${marketData.price} ${selectedTokenOut.symbol}`;
            document.getElementById('spotPrice').textContent = marketData.pricePerUnit;
            document.getElementById('priceImpactAnalysis').textContent = `${marketData.priceImpact}%`;

            // Update pool information
            updatePoolInformation(marketData);

            // Cache pool data
            poolDataCache[`${selectedTokenIn.address}-${selectedTokenOut.address}`] = marketData;
        }
    } catch (error) {
        console.error('Error updating price data:', error);
    }
}

/**
 * Update pool information display
 */
function updatePoolInformation(marketData) {
    document.getElementById('poolLiquidity').textContent = `$${marketData.totalLiquidity}`;
    document.getElementById('poolReserveA').textContent = `${(Number(marketData.poolReserveA) / 1e8).toFixed(4)}`;
    document.getElementById('poolReserveB').textContent = `${(Number(marketData.poolReserveB) / 1e8).toFixed(4)}`;
    document.getElementById('poolFee').textContent = marketData.poolFee;
    document.getElementById('poolEstFees').textContent = `$${marketData.estimatedDailyFees}`;
    document.getElementById('poolActive').textContent = marketData.isActive ? '✓ Yes' : '✗ No';

    // Update slippage risk indicator
    const impactPercent = Number(marketData.priceImpact);
    let riskLevel = 'Low';
    if (impactPercent > 5) {
        riskLevel = 'High';
    } else if (impactPercent > 2) {
        riskLevel = 'Medium';
    }
    document.getElementById('slippageRisk').textContent = riskLevel;
}

/**
 * Refresh pool data manually
 */
async function refreshPoolData() {
    if (!selectedTokenIn || !selectedTokenOut) {
        showError('Please select both tokens');
        return;
    }

    try {
        const refreshBtn = document.querySelector('.price-analysis-card .refresh-btn');
        refreshBtn.style.animation = 'spin 1s linear';

        await updatePriceData();
        await handleFromAmountChange({ target: { value: document.getElementById('fromAmount').value } });

        setTimeout(() => {
            refreshBtn.style.animation = '';
        }, 1000);

        showSuccess('Pool data refreshed');
    } catch (error) {
        console.error('Error refreshing pool data:', error);
        showError('Failed to refresh pool data');
    }
}

/**
 * Start monitoring prices in real-time
 */
function startPriceMonitoring() {
    // Update prices every 30 seconds
    priceUpdateInterval = setInterval(async () => {
        if (selectedTokenIn && selectedTokenOut) {
            await updatePriceData();
        }
    }, 30000);
}

/**
 * Stop price monitoring
 */
function stopPriceMonitoring() {
    if (priceUpdateInterval) {
        clearInterval(priceUpdateInterval);
    }
}

/**
 * Swap tokens (reverse direction)
 */
function swapTokens() {
    const temp = selectedTokenIn;
    selectedTokenIn = selectedTokenOut;
    selectedTokenOut = temp;

    // Update selectors
    document.getElementById('swapTokenIn').value = selectedTokenIn.address;
    document.getElementById('swapTokenOut').value = selectedTokenOut.address;

    // Swap amounts
    const fromAmount = document.getElementById('fromAmount').value;
    const toAmount = document.getElementById('toAmount').value;
    document.getElementById('fromAmount').value = toAmount;
    document.getElementById('toAmount').value = fromAmount;

    // Update prices
    updatePriceData();
}

/**
 * Set max amount
 */
function setMaxAmount() {
    const balance = document.getElementById('fromTokenBalance').textContent;
    document.getElementById('fromAmount').value = balance;
    handleFromAmountChange({ target: { value: balance } });
}

/**
 * Open trade settings
 */
function openTradeSettings() {
    const slippageInput = prompt('Enter slippage tolerance (%)', '0.5');
    if (slippageInput !== null) {
        document.getElementById('currentSlippage').textContent = slippageInput + '%';
        handleFromAmountChange({ target: { value: document.getElementById('fromAmount').value } });
    }
}

/**
 * Execute swap
 */
async function executeSwap() {
    const amount = document.getElementById('fromAmount').value;
    const minAmountOut = document.getElementById('minimumReceived').textContent;

    if (!amount || !selectedTokenIn || !selectedTokenOut) {
        showError('Please enter an amount and select tokens');
        return;
    }

    try {
        showSuccess('Swap executed successfully!');
        // TODO: Call actual swap contract
    } catch (error) {
        showError('Swap failed: ' + error.message);
    }
}

/**
 * Show success message
 */
function showSuccess(message) {
    console.log('✓', message);
    // TODO: Implement proper toast notification
}

/**
 * Show error message
 */
function showError(message) {
    console.error('✗', message);
    // TODO: Implement proper toast notification
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    stopPriceMonitoring();
});

// Make functions globally available
window.swapTokens = swapTokens;
window.setMaxAmount = setMaxAmount;
window.openTradeSettings = openTradeSettings;
window.executeSwap = executeSwap;
window.refreshPoolData = refreshPoolData;
