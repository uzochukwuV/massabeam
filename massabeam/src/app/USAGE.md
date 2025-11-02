# MassaBeam App - Usage Quick Reference

Quick reference for using the modular app architecture.

## 🚀 Quick Start

### 1. Setup app.html

Add to `<head>`:
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
```

Add to `</body>` (before closing tag):
```html
<script type="module" src="./src/app/app-init.js"></script>
```

### 2. Add Required HTML Elements

Essential elements that the app expects:

```html
<!-- Loading Overlay -->
<div id="loadingOverlay" class="loading-overlay">
  <div class="loading-spinner"></div>
  <div class="loading-text">Loading...</div>
</div>

<!-- Error Message -->
<div id="errorMessage" class="error-message"></div>

<!-- Wallet Connection -->
<button id="walletBtn" class="wallet-btn">
  <span class="wallet-text">Connect Wallet</span>
</button>

<!-- Token Selects -->
<select id="swapTokenIn"></select>
<select id="swapTokenOut"></select>
<select id="liquidityTokenA"></select>
<select id="liquidityTokenB"></select>
<select id="createPoolTokenA"></select>
<select id="createPoolTokenB"></select>

<!-- Amount Inputs -->
<input type="number" id="fromAmount" placeholder="0.0">
<input type="number" id="toAmount" readonly>
<input type="number" id="liquidityAmountA">
<input type="number" id="liquidityAmountB">
<input type="number" id="createPoolAmountA">
<input type="number" id="createPoolAmountB">

<!-- Action Buttons -->
<button id="swapBtn" onclick="executeSwap()">Swap</button>
<button id="addLiquidityBtn" onclick="addLiquidity()">Add Liquidity</button>
<button id="createPoolBtn" onclick="createPool()">Create Pool</button>

<!-- Display Elements -->
<span id="protocolTVL">$0</span>
<span id="poolCount">0</span>
<span id="fromTokenBalance">0</span>
<span id="toTokenBalance">0</span>
```

### 3. That's It!

The application will automatically:
- Initialize wallet connection
- Load token list
- Populate dropdowns
- Setup all event listeners
- Display protocol stats

## 📚 Common Tasks

### Show Messages

```javascript
import { showSuccess, showError, showWarning } from './src/app/ui.js';

showSuccess('Operation successful!');
showError('Something went wrong');
showWarning('Please check this');
```

### Get User's Connected Address

```javascript
import { getUserAddress } from './src/app/main.js';

const address = getUserAddress();
console.log(address); // AU...
```

### Get Token Balance

```javascript
import { tokenService } from './src/app/token-service.js';

const balance = await tokenService.getBalance('AU1234...');
console.log(balance); // BigInt value
```

### Update UI Element

```javascript
import { setText, setValue } from './src/app/ui.js';

// Update text content
setText('elementId', 'New text');

// Update input value
setValue('inputId', '100');
```

### Execute Swap Programmatically

```javascript
import { AMMContract } from './src/app/main.js';

const result = await AMMContract.swap(
  tokenIn,     // Token address
  tokenOut,    // Token address
  amountIn,    // Amount as string
  minOut,      // Minimum output as string
  deadline     // Unix timestamp
);
```

### Execute Add Liquidity

```javascript
import { AMMContract } from './src/app/main.js';

const result = await AMMContract.addLiquidity(
  tokenA,       // Token address
  tokenB,       // Token address
  amountA,      // Amount as string
  amountB,      // Amount as string
  minAmountA,   // Minimum A as string
  minMinAmountB, // Minimum B as string
  deadline      // Unix timestamp
);
```

### Create Pool

```javascript
import { AMMContract } from './src/app/main.js';

const result = await AMMContract.createPool(
  tokenA,     // Token address
  tokenB,     // Token address
  amountA,    // Initial amount A
  amountB,    // Initial amount B
  deadline    // Unix timestamp
);
```

### Get Protocol Statistics

```javascript
import { getProtocolStats } from './src/app/main.js';

const stats = await getProtocolStats();
console.log(stats);
// {
//   tvl: 1000000,
//   poolCount: 5,
//   protocolFeeRate: 3000,
//   isInitialized: true,
//   timestamp: "2024-..."
// }
```

### Get Pool Information

```javascript
import { AMMContract } from './src/app/main.js';

const pool = await AMMContract.getPool(tokenA, tokenB);
console.log(pool);
// Pool data including reserves, fees, etc.
```

### Calculate Quote

```javascript
import { AMMContract } from './src/app/main.js';

// Get amount out for exact input
const amountOut = await AMMContract.getAmountOut(
  amountIn,    // Input amount
  reserveIn,   // Pool reserve of input token
  reserveOut,  // Pool reserve of output token
  fee          // Pool fee in bps (3000 = 0.3%)
);

// Get amount in for exact output
const amountIn = await AMMContract.getAmountIn(
  amountOut,   // Desired output
  reserveIn,
  reserveOut,
  fee
);
```

### Populate Token Dropdown

```javascript
import { populateTokenSelect } from './src/app/token-service.js';

// Populate a select element with all tokens
populateTokenSelect('selectElementId');
```

### Get All Tokens

```javascript
import { getAllTokens } from './src/app/token-service.js';

const tokens = getAllTokens();
tokens.forEach(token => {
  console.log(`${token.symbol}: ${token.address}`);
});
```

### Show Loading Spinner

```javascript
import { loadingOverlay } from './src/app/ui.js';

loadingOverlay.show('Processing...');
// ... do something
loadingOverlay.hide();
```

### Format Values for Display

```javascript
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  formatTokenAmount,
  formatAddress
} from './src/app/ui.js';

formatCurrency(1234.56);        // "$1,234.56"
formatNumber(1234.56, 2);       // "1,234.56"
formatPercent(15.5);            // "15.50%"
formatTokenAmount(1234567, 18); // "1.234567"
formatAddress('AU123456...'); // "AU1234...56"
```

### Access Application State

```javascript
import { AppState } from './src/app/app-integration.js';

// Check if wallet connected
if (AppState.isConnected) {
  console.log('User:', AppState.userAddress);
}

// Get selected tokens
console.log(AppState.selectedTokens);
// { swap: { from: '...', to: '...' }, liquidity: { ... } }

// Get protocol stats
console.log(AppState.protocols);
// { stats: {...}, poolCount: 5, tvl: 1000000 }
```

### Switch Between Sections

```javascript
import { switchSection } from './src/app/app-integration.js';

switchSection('dashboard');
switchSection('trade');
switchSection('liquidity');
```

### Handle Contract Errors

```javascript
import { handleContractError } from './src/app/contract-helpers.js';

try {
  // contract operation
} catch (error) {
  handleContractError(error, 'Custom message');
  // Shows user-friendly error message
}
```

## 🔄 Event Flow Examples

### Swap Example

```
User Input
  ↓
User clicks "Swap"
  ↓
executeSwap() global function
  ↓
handleSwap() in app-integration.js
  ↓
showLoading()
  ↓
AMMContract.swap()
  ↓
callContract() with args
  ↓
Success → showSuccess() + refresh balances
Failure → showError()
  ↓
loadingOverlay.hide()
```

### Token Selection Example

```
User selects token
  ↓
onSwapTokenChanged()
  ↓
Update AppState
  ↓
getBalance() from tokenService
  ↓
Update UI with balance
  ↓
Recalculate quote if amount filled
```

## 🛠️ Debugging

### Check if App Initialized

```javascript
console.log(window.AppState);
// If undefined, app not initialized
```

### Check Connected Wallet

```javascript
import { isWalletConnected, getUserAddress } from './src/app/main.js';

console.log('Connected:', isWalletConnected());
console.log('Address:', getUserAddress());
```

### Check Loaded Tokens

```javascript
import { getAllTokens } from './src/app/token-service.js';
console.table(getAllTokens());
```

### Monitor Contract Calls

Open browser console - all calls logged automatically.

### Clear Cache

```javascript
import { clearStateCache } from './src/app/contract-helpers.js';
clearStateCache();
```

### View App Logs

All logs prefixed with emoji:
- 🚀 = Initialization
- ✓ = Success
- ❌ = Error
- 📊 = Data/Stats
- 🔧 = Tools/Setup
- 💡 = Tips

## ⚙️ Configuration

### Add Custom Token

Edit `token-service.js`:
```javascript
tokenService.registerToken(
  'AU1234...',      // address
  'SYMBOL',         // symbol
  'Full Name',      // name
  18,               // decimals
  '🔵'              // icon (optional)
);
```

### Change Loading Message

```javascript
import { loadingOverlay } from './src/app/ui.js';

loadingOverlay.show('Custom message...');
```

### Customize Message Duration

```javascript
import { showSuccess } from './src/app/ui.js';

showSuccess('Message', 10000); // Show for 10 seconds
```

## 📱 HTML Integration

### Using with inline onclick

```html
<!-- These work automatically -->
<button onclick="switchToSection('trade')">Trade</button>
<button onclick="executeSwap()">Swap</button>
<button onclick="addLiquidity()">Add Liquidity</button>
<button onclick="createPool()">Create Pool</button>
<button onclick="refreshDashboard()">Refresh</button>
<button onclick="connectWalletHandler()">Connect</button>
```

### Using with event listeners

```javascript
const button = document.getElementById('myButton');
button.addEventListener('click', async () => {
  await executeSwap();
});
```

## 🎨 Styling

### Message Styling

Messages automatically styled, but you can override in CSS:

```css
.message {
  /* Custom styles */
}

.message-success {
  /* Success style */
}

.message-error {
  /* Error style */
}
```

### Loading Overlay Styling

```css
.loading-overlay {
  /* Custom overlay styles */
}

.loading-spinner {
  /* Custom spinner */
}
```

## 🐛 Common Issues

### Tokens Not Loading?
1. Check internet connection
2. Verify token addresses in `token-service.js`
3. Clear cache: `clearStateCache()`

### Wallet Not Connecting?
1. Check Massa Wallet extension installed
2. Verify BUILDNET selected
3. Check browser console for errors

### Messages Not Showing?
1. Verify `messageContainer` div exists
2. Check browser console
3. Verify ui.js loaded

### Contract Calls Failing?
1. Check contract address
2. Verify function names
3. Check user balance
4. Review console errors

## 📖 More Information

- Full integration guide: [README.md](./README.md)
- Module documentation: Read comments in each `.js` file
- Examples: Check `app-integration.js` for event handlers

---

**Quick Links:**
- 📄 [Full Documentation](./README.md)
- 📁 [Module Structure](./README.md#architecture-overview)
- 🔗 [Integration Guide](./README.md#how-to-integrate-with-apphtml)

**Version:** 1.0.0 | **Updated:** November 2024
