# MassaBeam App Integration Guide

Complete guide for integrating the modular app architecture with app.html.

## Architecture Overview

```
src/app/
├── main.js                 # Core contract interactions & wallet management
├── ui.js                   # UI components & message system
├── token-service.js        # Token management & balances
├── contract-helpers.js     # Contract utilities & error handling
├── app-integration.js      # Application state & event coordination
└── README.md              # This file
```

## Module Dependencies

```
app.html
    ↓
app-integration.js (Main orchestrator)
    ↓
    ├─→ main.js (Wallet + AMM contract)
    ├─→ ui.js (Messages & UI helpers)
    ├─→ token-service.js (Token management)
    └─→ contract-helpers.js (Contract utilities)
```

## How to Integrate with app.html

### 1. Update app.html Script Reference

Replace the existing script block in `app.html` with:

```html
<script type="importmap">
{
    "imports": {
        "@massalabs/massa-web3": "https://unpkg.com/@massalabs/massa-web3@latest/dist/index.js",
        "@massalabs/wallet-provider": "https://unpkg.com/@massalabs/wallet-provider@latest/dist/index.js",
        "@dusalabs/sdk": "https://unpkg.com/@dusalabs/sdk@latest/dist/index.js"
    }
}
</script>
<script type="module" src="./src/app/app-init.js"></script>
```

### 2. Create app-init.js Entry Point

Create `src/app/app-init.js`:

```javascript
/**
 * App Initialization Entry Point
 * Loads and starts the application
 */

import { initializeApp, AppState } from './app-integration.js';

async function start() {
  console.log('🚀 MassaBeam initializing...');

  try {
    const success = await initializeApp();
    if (success) {
      console.log('✅ App ready!');
    }
  } catch (error) {
    console.error('❌ App initialization failed:', error);
  }
}

// Start app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start);
} else {
  start();
}

// Export for global access
window.AppState = AppState;
```

### 3. Required HTML Elements in app.html

Make sure your `app.html` includes these essential elements:

```html
<!-- Message Container (auto-created by ui.js, but can be pre-added) -->
<div id="messageContainer" class="message-container"></div>

<!-- Loading Overlay -->
<div id="loadingOverlay" class="loading-overlay">
  <div class="loading-spinner"></div>
  <div class="loading-text">Loading...</div>
</div>

<!-- Wallet Button (for connection) -->
<button class="wallet-btn" id="walletBtn">
  <span class="wallet-text">Connect Wallet</span>
</button>

<!-- Form Elements for Swap -->
<select id="swapTokenIn"></select>
<select id="swapTokenOut"></select>
<input type="number" id="fromAmount" placeholder="0.0">
<input type="number" id="toAmount" readonly>
<button id="swapBtn">Swap</button>

<!-- Form Elements for Liquidity -->
<select id="liquidityTokenA"></select>
<select id="liquidityTokenB"></select>
<input type="number" id="liquidityAmountA">
<input type="number" id="liquidityAmountB">
<button id="addLiquidityBtn">Add Liquidity</button>

<!-- Form Elements for Pool Creation -->
<select id="createPoolTokenA"></select>
<select id="createPoolTokenB"></select>
<input type="number" id="createPoolAmountA">
<input type="number" id="createPoolAmountB">
<button id="createPoolBtn">Create Pool</button>

<!-- Display Elements for Stats -->
<span id="protocolTVL">$0</span>
<span id="poolCount">0</span>
<span id="fromTokenBalance">0</span>
<span id="toTokenBalance">0</span>
```

## Module Usage Guide

### 1. main.js - Wallet & Contract Interaction

**Wallet Management:**
```javascript
import { initProvider, isWalletConnected, getUserAddress } from './main.js';

// Initialize wallet
const provider = await initProvider();

// Check connection status
if (isWalletConnected()) {
  const address = getUserAddress();
}
```

**Contract Interactions:**
```javascript
import { AMMContract } from './main.js';

// Create pool
await AMMContract.createPool(tokenA, tokenB, amountA, amountB, deadline);

// Add liquidity
await AMMContract.addLiquidity(tokenA, tokenB, amountA, amountB, minA, minB, deadline);

// Execute swap
await AMMContract.swap(tokenIn, tokenOut, amountIn, minOut, deadline);

// Get pool info
const pool = await AMMContract.getPool(tokenA, tokenB);

// Get protocol stats
const stats = await getProtocolStats();
```

### 2. ui.js - Messages & UI Components

**Show Messages:**
```javascript
import { showSuccess, showError, showWarning, showInfo } from './ui.js';

showSuccess('Operation successful!');
showError('Something went wrong');
showWarning('Warning message');
showInfo('Informational message');
```

**Loading Overlay:**
```javascript
import { loadingOverlay } from './ui.js';

loadingOverlay.show('Processing...');
// ... do work
loadingOverlay.hide();
```

**DOM Utilities:**
```javascript
import { setText, getValue, setValue, formatCurrency, formatNumber } from './ui.js';

// Update text
setText('elementId', 'New text');

// Get/set values
const value = getValue('inputId');
setValue('inputId', 'new value');

// Format values
formatCurrency(1000); // "$1,000.00"
formatNumber(1000.5, 2); // "1,000.50"
```

### 3. token-service.js - Token Management

**Get Token Info:**
```javascript
import { tokenService, getTokenByAddress, populateTokenSelect } from './token-service.js';

// Get token by address
const token = getTokenByAddress('AU1234...');

// Populate dropdown
populateTokenSelect('selectElementId');

// Get balance
const balance = await tokenService.getBalance(tokenAddress);

// Get price
const price = await tokenService.getPrice(tokenAddress);

// Get token details
const details = await tokenService.getTokenWithDetails(tokenAddress);
// Returns: { address, symbol, name, decimals, balance, balanceFormatted, price, value }
```

### 4. contract-helpers.js - Contract Utilities

**Contract Calls:**
```javascript
import { callContract, readContract } from './contract-helpers.js';

// Write operation
const result = await callContract(
  contractAddress,
  'functionName',
  args.serialize(),
  { coins: Mas.fromString('0.1') }
);

// Read operation
const data = await readContract(contractAddress, 'functionName', args);
```

**Error Handling:**
```javascript
import { parseContractError, handleContractError } from './contract-helpers.js';

try {
  // contract operation
} catch (error) {
  handleContractError(error, 'Custom error message');
}
```

### 5. app-integration.js - Application Coordination

**Access App State:**
```javascript
import { AppState } from './app-integration.js';

console.log(AppState.isConnected);
console.log(AppState.userAddress);
console.log(AppState.selectedTokens);
console.log(AppState.protocols.stats);
```

**Refresh Data:**
```javascript
import { refreshProtocolStats } from './app-integration.js';

await refreshProtocolStats();
```

**Switch Sections:**
```javascript
import { switchSection } from './app-integration.js';

switchSection('trade');
switchSection('liquidity');
switchSection('dashboard');
```

## Event Flow Example: Swap Execution

```
User clicks "Swap" button
    ↓
handleSwap() in app-integration.js
    ↓
showLoading('Executing swap...')
    ↓
AMMContract.swap() from main.js
    ↓
callContract() from contract-helpers.js
    ↓
Contract executes on blockchain
    ↓
loadingOverlay.hide()
    ↓
showSuccess('Swap executed!')
    ↓
Update UI with new balances
```

## Common Integration Patterns

### Pattern 1: User-Initiated Action with Loading

```javascript
async function handleUserAction() {
  try {
    loadingOverlay.show('Processing...');

    // Validate inputs
    if (!validateInputs()) {
      showWarning('Please fill in all fields');
      return;
    }

    // Execute operation
    const result = await AMMContract.swap(...);

    loadingOverlay.hide();
    showSuccess('Operation successful!');

    // Update UI
    await updateTokenBalances();
  } catch (error) {
    loadingOverlay.hide();
    handleContractError(error);
  }
}
```

### Pattern 2: Data Loading with Caching

```javascript
import { getCachedState, invalidateCache } from './contract-helpers.js';

async function getPoolData(tokenA, tokenB) {
  const cacheKey = `pool:${tokenA}:${tokenB}`;

  return getCachedState(cacheKey, async () => {
    return await AMMContract.getPool(tokenA, tokenB);
  });
}

// Refresh pool data
invalidateCache(`pool:${tokenA}:${tokenB}`);
```

### Pattern 3: Token Selection with Balance Updates

```javascript
async function onTokenSelected(tokenAddress) {
  try {
    // Update selection
    AppState.selectedTokens.swap.from = tokenAddress;

    // Load balance
    const balance = await tokenService.getBalance(tokenAddress);
    const token = tokenService.getToken(tokenAddress);

    // Update UI
    setText('fromTokenBalance', token.formatAmount(balance));
  } catch (error) {
    console.error('Failed to load token data:', error);
  }
}
```

## Styling Requirements

Make sure your app.html includes CSS for message containers and loading overlays. Basic styles are injected by ui.js, but you can add custom styles:

```css
/* Custom message container styling */
.message-container {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 10000;
  max-width: 400px;
}

.message {
  padding: 15px;
  border-radius: 8px;
  margin-bottom: 10px;
  animation: slideIn 0.3s ease;
}

/* Loading overlay */
.loading-overlay {
  display: none;
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.7);
  z-index: 9999;
  justify-content: center;
  align-items: center;
}

.loading-overlay.visible {
  display: flex;
}
```

## Debugging Tips

### 1. Check App State
```javascript
console.log(AppState);
```

### 2. Monitor Contract Calls
Open browser console - all contract calls are logged with arguments and results.

### 3. Clear Cache
```javascript
import { clearStateCache } from './contract-helpers.js';
clearStateCache();
```

### 4. Test Wallet Connection
```javascript
import { isWalletConnected, getUserAddress } from './main.js';
console.log('Connected:', isWalletConnected());
console.log('Address:', getUserAddress());
```

### 5. Test Token Loading
```javascript
import { tokenService } from './token-service.js';
tokenService.getAllTokens().forEach(t => console.log(t));
```

## Configuration

### Update Token List

Edit `token-service.js` to add/remove tokens:

```javascript
const DEFAULT_TOKENS = [
  new Token(ADDRESS, 'SYMBOL', 'Name', DECIMALS, '🔵', 'coingecko-id'),
  // Add more...
];
```

### Update Contract Address

Update `DEPLOYED_CONTRACTS` in app.html or create contracts-config.js:

```javascript
export const DEPLOYED_CONTRACTS = {
  AMM: 'AU...',
  SMARTSWAP: 'AS...',
  // Add more...
};
```

## Troubleshooting

### Messages Not Showing
- Check messageContainer div exists in HTML
- Check browser console for errors
- Verify ui.js is loaded

### Wallet Not Connecting
- Ensure Massa Wallet extension is installed
- Check BUILDNET is selected in wallet
- Check browser console for connection errors

### Tokens Not Loading
- Verify token addresses in token-service.js
- Check network connection
- Try clearing cache with `clearStateCache()`

### Contract Calls Failing
- Check contract address is valid
- Verify function names match contract
- Check user has sufficient balance
- Review console for error messages

## Next Steps

1. ✅ Copy helper modules to `src/app/`
2. ✅ Create `app-init.js` entry point
3. ✅ Add required HTML elements to `app.html`
4. ✅ Update script imports in `app.html`
5. ✅ Test wallet connection
6. ✅ Test token loading
7. ✅ Test swap execution
8. ✅ Test liquidity operations

## Support

For issues or questions:
1. Check console for error messages
2. Review module documentation above
3. Check browser DevTools Network tab for failed requests
4. Verify all dependencies are installed: `npm install`

---

**Last Updated:** November 2024
**Version:** 1.0.0
