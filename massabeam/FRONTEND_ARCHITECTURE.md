# Massa DeFi Frontend Architecture

## Overview

The frontend has been refactored to implement **Separation of Concerns** with each feature having its own dedicated page. This approach provides better:
- **Maintainability**: Each feature is isolated and independently manageable
- **Scalability**: Easy to add new features without affecting existing ones
- **User Experience**: Focused interfaces with intuitive data displays
- **Performance**: Optimized loading and state management per page

## Pages Architecture

### 1. **AMM Trading Page** (`amm.html` + `amm-page.js`)
**Purpose**: Constant Product AMM with token swapping and pool analytics

**Features**:
- Real-time token swap interface
- Multi-token support (USDC, USDT, BEAM)
- Comprehensive price calculations
- Pool information display
- Price analysis & impact calculation
- Live price monitoring (30-second refresh)
- Slippage protection settings

**Data Displayed**:
- Current exchange rate
- Pool liquidity & reserves
- 24h estimated fees
- Price impact analysis
- Spot price vs effective price
- Token price comparison table
- Pool fee information

**Key Functions**:
```javascript
getTokenPrice(baseToken, quoteToken)         // Get current price
getMarketData(tokenA, tokenB)                // Comprehensive market data
calculatePriceImpact(tokenIn, tokenOut)     // Impact analysis
```

---

### 2. **Limit Orders Page** (`limit-orders.html` + `limit-orders-page.js`)
**Purpose**: Single-trigger limit orders with BUY/SELL support

**Features**:
- BUY/SELL order type selection
- Limit price specification
- Time expiry configuration
- Real-time price monitoring
- Order status tracking
- Bot execution control
- Order history & statistics

**Data Displayed**:
- Active orders list with:
  - Order ID & type
  - Token pair
  - Amount & limit price
  - Current price (color-coded)
  - Status & expiry
- Bot Status:
  - Enabled/Disabled indicator
  - Cycle count & total executed
  - Max iterations setting
- Order Statistics:
  - Total orders
  - Filled orders
  - Active orders
  - Expired orders

**Bot Management**:
- Start/Stop autonomous bot
- Real-time cycle monitoring
- Execution tracking

---

### 3. **Recurring Orders Page** (`recurring-orders.html` + `recurring-orders-page.js`)
**Purpose**: Time-based (DCA) and price-triggered recurring orders

**Features**:
- Two execution modes:
  1. **DCA Mode** (Dollar Cost Averaging)
     - Configurable time intervals (hourly, daily, weekly, monthly)
     - Number of executions
     - Automatic portfolio averaging

  2. **Trigger Mode** (Price-Based)
     - Percentage price change triggers
     - BUY/SELL order types
     - Reference price updates

- Pause/Resume/Cancel orders
- Progress tracking
- Performance metrics

**Data Displayed**:
- Active orders with:
  - Execution progress (X/Y executions)
  - Total amount spent & received
  - Next execution time
  - Order status
  - Progress bar visualization

- Bot Status:
  - Enabled/Disabled with indicator dot
  - Cycle counter
  - Orders executed
  - Max iterations

- Performance Metrics:
  - Average price bought
  - Total spent & received
  - Next execution countdown
  - Execution statistics

**Order Lifecycle**:
```
ACTIVE → PAUSED ↔ ACTIVE → COMPLETED
ACTIVE → CANCELLED (with refund)
```

---

### 4. **Grid Orders Page** (`grid-orders.html` + `grid-orders-page.js`)
**Purpose**: Multi-level grid trading with autonomous execution

**Features**:
- Multi-level grid setup (1-100 levels)
- Two grid types:
  1. **Buy Grid**: Levels below entry price (price decreases)
  2. **Sell Grid**: Levels above entry price (price increases)

- Grid configuration options:
  - Manual level configuration
  - Preset templates (3-level, 5-level, 10-level)
  - Exponential spacing
  - Custom spacing percentage

- Grid visualization & preview
- Per-level execution tracking
- Performance metrics

**Data Displayed**:
- Grid Preview:
  - Visual level representation
  - Price points
  - Amount per level
  - Execution status

- Active Grids with:
  - Entry price
  - Number of levels & filled levels
  - Total investment
  - Progress bar (% filled)
  - Expiry countdown

- Bot Status:
  - Enabled/Disabled indicator
  - Cycles run
  - Levels filled
  - Max iterations

- Performance Metrics:
  - Total grids
  - Active levels
  - Levels filled count
  - Total fees earned

- Levels Table:
  - Level number
  - Calculated price
  - Amount per level
  - Execution status (Pending/Filled)

**Grid Calculation Example**:
```javascript
// Buy Grid at 0.50 with 5% spacing
Level 1: 0.475  (0.50 * 0.95)
Level 2: 0.4525 (0.50 * 0.90)
Level 3: 0.43   (0.50 * 0.85)
...

// Sell Grid at 0.50 with 5% spacing
Level 1: 0.525  (0.50 * 1.05)
Level 2: 0.55   (0.50 * 1.10)
Level 3: 0.575  (0.50 * 1.15)
...
```

---

## Navigation Structure

```
Navigation Bar (all pages)
├── 📊 Dashboard (index.html)
├── ⚡ AMM Trade (amm.html)
├── 🎯 Limit Orders (limit-orders.html)
├── 🔄 Recurring Orders (recurring-orders.html)
├── 📈 Grid Orders (grid-orders.html)
└── 💧 Liquidity (liquidity.html)
```

Each page:
- Has a back link to Dashboard via the Massa DeFi logo
- Maintains consistent header with wallet connection
- Shows network status and gas price
- Has persistent navigation for easy switching

---

## Data Flow Architecture

### Price Data Flow
```
Smart Contract (Pool)
    ↓
AMMContract.getPool()
    ↓
getTokenPrice() / getMarketData()
    ↓
Frontend Display (all pages)
```

### Real-Time Updates
```
Each Page Type          Update Frequency
├── AMM: Price         30 seconds
├── Limit Orders: Bot  10 seconds
├── Recurring Orders: Bot 10 seconds
└── Grid Orders: Bot   10 seconds
```

---

## Shared Utilities from `main.js`

### Price Calculation Functions
```javascript
// Get single token price
getTokenPrice(baseToken, quoteToken, baseAmount?)
→ Returns: price, pricePerUnit, priceImpact, poolData

// Get multiple prices at once
getTokenPricesBatch(tokenPairs)
→ Returns: Map of prices for all pairs

// Get comprehensive market data
getMarketData(tokenA, tokenB)
→ Returns: price, reserves, fee, estimatedDailyFees, etc.

// Calculate trade impact
calculatePriceImpact(tokenIn, tokenOut, amountIn)
→ Returns: spotPrice, effectivePrice, impactPercent, amountLost
```

### Contract Helpers
```javascript
// AMM Contract
AMMContract.getPool(tokenA, tokenB)
AMMContract.getAmountOut(amountIn, reserveIn, reserveOut, fee)
AMMContract.getAmountIn(amountOut, reserveIn, reserveOut, fee)

// Recurring Orders (import from recurring-orders-helper.js)
RecurringOrdersHelper.createDCAOrder(...)
RecurringOrdersHelper.createTriggerOrder(...)
RecurringOrdersHelper.startBot(...)

// Grid Orders (import from grid-orders-helper.js)
GridOrdersHelper.createGridOrder(...)
GridOrdersHelper.startBot(...)

// Limit Orders (import from contracts)
LimitOrdersContract.createOrder(...)
LimitOrdersContract.startBot(...)
```

---

## UI/UX Patterns

### All Pages Include:
1. **Card-Based Layout**: Consistent component structure
2. **Real-Time Status Indicators**:
   - Bot status with animated dots
   - Color-coded status badges
3. **Data Tables**: Sortable, filterable order/grid listings
4. **Progress Bars**: Visual representation of order completion
5. **Statistics Cards**: Key metrics in grid format
6. **Action Buttons**: Consistent styling for interactions
7. **Form Validation**: Client-side checks before submission
8. **Error/Success Messages**: Toast notifications (to be implemented)

### Responsive Design:
- Two-column layout on desktop
- Single column on mobile
- Flexible card sizing
- Touch-friendly buttons

---

## State Management

### Per-Page State:
Each page maintains its own local state:
```javascript
// AMM Page
- selectedTokenIn/Out
- priceUpdateInterval
- poolDataCache

// Limit Orders Page
- selectedOrderTokenIn/Out
- orderType ('buy'/'sell')
- botStatusInterval

// Recurring Orders Page
- currentMode ('dca'/'trigger')
- triggerOrderType ('buy'/'sell')
- botStatusInterval

// Grid Orders Page
- gridType ('buy'/'sell')
- gridLevels (array of level data)
- botStatusInterval
```

### Global State (via main.js):
- Connected wallet
- Network status
- Gas price
- Token list

---

## Bot Monitoring

All pages with bots display:
1. **Bot Indicator**: Animated dot showing enabled/disabled
2. **Cycle Counter**: Number of execution cycles
3. **Total Executed**: Orders/levels filled
4. **Max Iterations**: Configured maximum cycles
5. **Controls**: Start/Stop buttons

Bot status updates every 10 seconds via `setInterval`.

---

## Performance Optimizations

1. **Image Lazy Loading**: Charts/previews load on demand
2. **Debounced Updates**: Price inputs debounced (500ms)
3. **Cached Pool Data**: Avoid redundant contract calls
4. **Interval Cleanup**: All intervals cleared on page unload
5. **Efficient DOM Updates**: Minimal reflows/repaints

---

## File Structure

```
massabeam/
├── amm.html                          (AMM page)
├── limit-orders.html                 (Limit orders page)
├── recurring-orders.html              (Recurring orders page)
├── grid-orders.html                   (Grid orders page)
│
└── src/app/
    ├── main.js                        (Shared utilities & price calculations)
    ├── amm-page.js                    (AMM page logic)
    ├── limit-orders-page.js            (Limit orders page logic)
    ├── recurring-orders-page.js        (Recurring orders page logic)
    ├── grid-orders-page.js             (Grid orders page logic)
    │
    ├── recurring-orders-helper.js      (DCA/Trigger contract wrapper)
    └── grid-orders-helper.js           (Grid orders contract wrapper)

styles/
├── main.css                           (Core styles)
├── components.css                     (Component styles)
└── responsive.css                     (Responsive design)
```

---

## Integration Checklist

- [x] AMM page with price calculations
- [x] Limit Orders page with bot management
- [x] Recurring Orders page (DCA + Trigger modes)
- [x] Grid Orders page with level visualization
- [x] Navigation between all pages
- [x] Real-time price monitoring
- [x] Bot status display on all pages
- [x] Comprehensive data displays
- [ ] CSS styling (needs to be completed)
- [ ] Toast notifications (needs implementation)
- [ ] Smart contract integration (backend)
- [ ] Error handling & validation
- [ ] Loading states & spinners

---

## Next Steps

1. **CSS Styling**: Update `styles/*.css` to match the new page layouts
2. **Toast Notifications**: Implement `showSuccess()` and `showError()` functions
3. **Smart Contract Integration**:
   - Wire up actual contract calls
   - Implement authentication/wallet connection
4. **Data Persistence**: Save order history/preferences
5. **Analytics**: Track user interactions and metrics
6. **Mobile Optimization**: Test and refine responsive design
7. **Performance Testing**: Monitor load times and bundle sizes

---

## Key Design Principles

1. **Intuitive Data Display**: Show relevant metrics prominently
2. **Progressive Disclosure**: Hide advanced options, show basics first
3. **Real-Time Feedback**: Live updates for all critical data
4. **Consistent UX**: Same patterns across all pages
5. **Accessible**: Good contrast, readable fonts, keyboard navigation
6. **Focused Interfaces**: One feature per page, no clutter
7. **Error Prevention**: Validation and confirmations for important actions

---

**Last Updated**: 2025-11-22
**Version**: 1.0
**Status**: Ready for CSS styling and smart contract integration
