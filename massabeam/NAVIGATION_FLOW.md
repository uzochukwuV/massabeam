# Massa DeFi - Navigation Flow & Architecture

## Application Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                      index.html (Landing)                        │
│              Marketing, Features, Stats, How-It-Works            │
│                                                                  │
│  "Launch App" Button ──→ dashboard.html                          │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                     dashboard.html (Hub)                         │
│                                                                  │
│  Portfolio Overview | Platform Stats | Feature Quick Access     │
│  Bot Status | Recent Activity | Navigation Bar                  │
│                                                                  │
│  Navigation Bar Options:                                        │
│  ├─ 📊 Dashboard (current)                                      │
│  ├─ ⚡ AMM Trade → amm.html                                     │
│  ├─ 🎯 Limit Orders → limit-orders.html                        │
│  ├─ 🔄 Recurring Orders → recurring-orders.html                 │
│  ├─ 📈 Grid Orders → grid-orders.html                           │
│  └─ 💧 Liquidity → liquidity.html                               │
│                                                                  │
│  Feature Cards also link to their respective pages              │
└─────────────────────────────────────────────────────────────────┘
        ↓ ↓ ↓ ↓ ↓
        ├─────────────────────┬─────────────┬──────────────┬──────────┬──────────┐
        ↓                     ↓             ↓              ↓          ↓          ↓
   amm.html            limit-orders.html recurring-orders.html grid-orders.html liquidity.html
   (AMM Trading)       (Limit Orders)    (DCA/Trigger)      (Grid Trading)    (LP Management)

   All have:
   - Header with wallet connection
   - Navigation bar (links back to dashboard)
   - Logo link back to landing (optional)
   - Feature-specific content
   - Real-time data displays
   - Bot management controls
```

---

## Page Navigation Details

### 1. **Landing Page** → `index.html`
**Role**: Marketing landing page
**Content**:
- Hero section with feature showcase
- Features overview grid
- Platform statistics
- How-it-works explanation
- Call-to-action sections

**Navigation Out**:
- "Launch App" buttons → `dashboard.html`

---

### 2. **Dashboard** → `dashboard.html`
**Role**: Central hub and overview
**Content**:
- Portfolio summary (total value, 24h change)
- Quick statistics (active orders, executed, fees, volume)
- Platform-wide stats (TVL, users, pools, fee rate)
- Bot status overview (all bots on one page)
- Feature card grid (quick access to all features)
- Recent activity feed

**Navigation Out**:
- Feature cards → Respective feature pages
- Navigation bar → Feature pages
- Logo → Landing page (optional enhancement)

**Features Accessible**:
```
┌─ AMM Trading (⚡)
│  ├─ Real-time price calculations
│  ├─ Pool analytics
│  └─ Swap interface
│
├─ Limit Orders (🎯)
│  ├─ BUY/SELL orders
│  ├─ Price-based execution
│  └─ Bot management
│
├─ Recurring Orders (🔄)
│  ├─ DCA mode
│  ├─ Trigger-based mode
│  └─ Pause/Resume
│
├─ Grid Orders (📈)
│  ├─ Multi-level grids
│  ├─ Price visualization
│  └─ Level tracking
│
└─ Liquidity (💧)
   ├─ Pool management
   ├─ LP tokens
   └─ Fee collection
```

---

### 3. **AMM Trading** → `amm.html`
**Role**: Token swapping with comprehensive analytics
**Content**:
- Swap form (token selection, amount input)
- Price information (current rate, impact, minimum received)
- Pool information (liquidity, reserves, fee, estimated daily fees)
- Price analysis (spot price, effective price, slippage risk)
- Token price comparison table
- Chart displays

**Navigation Out**:
- Navigation bar → Dashboard + other features
- Logo → Dashboard (via brand link)

**Key Features**:
- Real-time price updates (30-second refresh)
- Slippage protection settings
- Pool data refresh button
- Token balance display
- Max amount button

---

### 4. **Limit Orders** → `limit-orders.html`
**Role**: Single-trigger limit orders with automation
**Content**:
- Order creation form (BUY/SELL, token pair, limit price, expiry)
- Active orders list (real-time status and pricing)
- Bot status indicator with controls
- Order statistics (total, filled, active, expired)
- Completed orders history
- Price analysis for pending orders

**Navigation Out**:
- Navigation bar → Dashboard + other features
- Logo → Dashboard (via brand link)

**Key Features**:
- BUY/SELL order type toggle
- Current market price display
- Price progress indicator (color-coded)
- Bot start/stop controls
- Real-time order updates (10-second refresh)

---

### 5. **Recurring Orders** → `recurring-orders.html`
**Role**: Time-based DCA and price-triggered orders
**Content**:
- Mode selector (DCA vs Trigger)
  - DCA Form: interval, amount per execution, number of executions
  - Trigger Form: price change %, amount, BUY/SELL selection
- Active orders list (progress bars, execution tracking)
- Bot status with controls
- Execution statistics (total, active, completed, paused)
- Performance metrics (avg price, total spent/received, next execution)

**Navigation Out**:
- Navigation bar → Dashboard + other features
- Logo → Dashboard (via brand link)

**Key Features**:
- Switchable execution modes
- Progress visualization (X/Y executions)
- Pause/Resume/Cancel buttons
- Auto-calculations for estimated costs
- Performance tracking

---

### 6. **Grid Orders** → `grid-orders.html`
**Role**: Multi-level grid trading automation
**Content**:
- Grid configuration (entry price, levels, spacing)
- Grid presets (3-level, 5-level, 10-level, exponential)
- Level visualization and preview
- Active grids list (progress by levels filled)
- Bot status with controls
- Performance metrics (total grids, levels, fees earned)
- Levels table (price, amount, status per level)

**Navigation Out**:
- Navigation bar → Dashboard + other features
- Logo → Dashboard (via brand link)

**Key Features**:
- Interactive grid preview
- Dynamic level calculation
- Symmetric and exponential spacing options
- Per-level execution tracking
- Visual progress indicators

---

### 7. **Liquidity** → `liquidity.html` (To be created)
**Role**: Liquidity pool management and LP token management
**Content**:
- Pool creation interface
- Add/Remove liquidity forms
- LP token balance and earnings
- Pool selection and management
- Fee collection interface
- Yield farming options (if applicable)

---

## URL Mapping

| Page | URL | Purpose |
|------|-----|---------|
| Landing | `/index.html` | Marketing, feature showcase |
| Dashboard | `/dashboard.html` | Central hub, portfolio overview |
| AMM Trading | `/amm.html` | Token swapping |
| Limit Orders | `/limit-orders.html` | Price-based orders |
| Recurring Orders | `/recurring-orders.html` | DCA & trigger orders |
| Grid Orders | `/grid-orders.html` | Multi-level grid trading |
| Liquidity | `/liquidity.html` | LP management |

---

## Navigation Bar Architecture

Present on: **All feature pages** (dashboard, amm, limit-orders, recurring-orders, grid-orders, liquidity)

```html
<nav class="app-nav">
    <button class="nav-item" data-section="dashboard">
        <span class="nav-icon">📊</span>
        <span class="nav-text">Dashboard</span>
    </button>
    <a href="amm.html" class="nav-item">⚡ AMM Trade</a>
    <a href="limit-orders.html" class="nav-item">🎯 Limit Orders</a>
    <a href="recurring-orders.html" class="nav-item">🔄 Recurring Orders</a>
    <a href="grid-orders.html" class="nav-item">📈 Grid Orders</a>
    <a href="liquidity.html" class="nav-item">💧 Liquidity</a>
</nav>
```

**Features**:
- Active state highlight on current page
- Direct links to all features
- Quick access from any page
- Persistent across all pages
- Mobile-responsive design

---

## Header Architecture

Present on: **All feature pages** (not on landing)

```html
<header class="app-header">
    <div class="header-left">
        <brand link to dashboard>
        <network status indicator>
    </div>
    <div class="header-right">
        <gas price display>
        <wallet connection button>
    </div>
</header>
```

**Features**:
- Brand logo (clickable link to dashboard)
- Network status (Buildnet indicator)
- Gas price display (for transaction estimation)
- Wallet connection button
- Account address display (when connected)

---

## User Flow Examples

### Flow 1: New User Experience
```
1. Land on index.html
   ↓
2. Read about features
   ↓
3. Click "Launch App"
   ↓
4. Arrive at dashboard.html
   ↓
5. See portfolio overview and available features
   ↓
6. Choose feature via card click or nav bar
   ↓
7. Use specific feature page
   ↓
8. Return to dashboard via nav bar or logo
```

### Flow 2: Power User - Limit Orders
```
1. Start at dashboard.html
   ↓
2. Check bot status
   ↓
3. Click "Limit Orders" nav item
   ↓
4. Create new limit order
   ↓
5. Monitor active orders
   ↓
6. Start bot
   ↓
7. Return to dashboard to check overall portfolio
```

### Flow 3: Switching Between Features
```
1. Using amm.html
   ↓
2. Click "Recurring Orders" in nav bar
   ↓
3. Immediately on recurring-orders.html
   ↓
4. Create DCA order
   ↓
5. Click "Grid Orders" in nav bar
   ↓
6. View grid trading
   ↓
7. Create grid order
   ↓
8. Click "Dashboard" in nav bar
   ↓
9. See all activity updated in real-time
```

---

## Data Flow Architecture

### Real-Time Updates
All pages maintain real-time data through:

```
┌─────────────────────────────────────────────┐
│         Smart Contracts (Backend)            │
├─────────────────────────────────────────────┤
│  AMM Pool | Limit Orders | Recurring        │
│  Orders | Grid Orders | Liquidity Pools    │
└──────────────────┬──────────────────────────┘
                   ↓
┌─────────────────────────────────────────────┐
│      Frontend Data Layer (main.js)           │
├─────────────────────────────────────────────┤
│  getTokenPrice() | getMarketData()          │
│  calculatePriceImpact() | getPoolData()     │
│  Bot status updates | Platform stats        │
└──────────────────┬──────────────────────────┘
                   ↓
        ┌──────────┴──────────┐
        ↓                     ↓
   Dashboard            Feature Pages
   (Central Hub)        (Real-time Updates)

   Dashboard Updates Every: 30 seconds
   Feature Pages Update: Based on type
   - AMM: 30 seconds
   - Limit Orders: 10 seconds
   - Recurring Orders: 10 seconds
   - Grid Orders: 10 seconds
```

---

## Active States & Indicators

### Navigation Bar
- **Active Tab**: Highlighted with darker background
- **Dashboard Tab**: Only button, no link (single page load)
- **Feature Tabs**: Links to respective pages

### Bot Status Indicators
- **Green Dot + "Active"**: Bot is running
- **Gray Dot + "Inactive"**: Bot is stopped
- **Animated Dot**: Bot is processing executions

### Order Status Badges
- **Green**: Active/Pending
- **Blue**: Completed/Filled
- **Yellow**: Paused
- **Red**: Cancelled/Expired

---

## Mobile Navigation

On mobile devices:
- Navigation bar collapses to hamburger menu
- Feature cards stack vertically
- Two-column layouts become single column
- Touch-friendly button sizes (48px minimum)
- Horizontal scroll disabled

---

## Error States & Recovery

### Lost Connection
```
User on any page → Connection lost
↓
Show error banner: "Lost connection to network"
↓
Auto-retry every 5 seconds
↓
Connection restored → Hide banner, refresh data
```

### Contract Errors
```
User action triggers contract call
↓
Contract call fails
↓
Show error toast: Specific error message
↓
Log error for debugging
↓
Option to retry or go back to dashboard
```

---

## Browser History Navigation

- Users can use browser back button
- Navigates through the sequence of visited pages
- Dashboard acts as entry point for feature pages
- Back button from feature page → previous feature or dashboard

---

## Session Persistence

**What persists between page loads**:
- Wallet connection state
- Network selection
- User preferences (slippage tolerance, etc.)
- Token pair selections

**What resets between page loads**:
- Form data (order parameters)
- Time-sensitive data (prices)
- UI state (collapsed/expanded panels)

---

## Future Navigation Enhancements

1. **Breadcrumb Navigation**
   - Show: Landing → Dashboard → Feature
   - Allow clicking to navigate back

2. **Quick Action Menu**
   - FAB (Floating Action Button)
   - Quick access to most-used features
   - Customizable based on user behavior

3. **Favorites/Bookmarks**
   - Pin frequently used features
   - Custom order in nav bar

4. **Search/Command Palette**
   - Cmd+K to search for features
   - Quick navigation to any page

5. **Activity Timeline**
   - Detailed activity history
   - Filter by feature or date
   - Export functionality

---

## Accessibility Considerations

- All navigation items have proper ARIA labels
- Keyboard navigation: Tab through all links
- Skip navigation link (optional)
- Color contrast ratios meet WCAG AA standards
- Screen reader friendly page titles
- Focus indicators visible

---

**Last Updated**: 2025-11-22
**Version**: 2.0
**Status**: Ready for implementation
