# Limit Orders Contract Analysis & Frontend Integration Plan

## Contract Overview

The limit orders contract (`limit_orders.ts`) implements an advanced order execution system with:
- **Time-based execution** with expiry timestamps
- **Price threshold validation** using pool reserves
- **MEV protection** with configurable delays
- **Partial fill support**
- **Autonomous execution** via keeper bots or callNextSlot
- **Order lifecycle management** (active, filled, cancelled, expired)

---

## Contract Functions Analysis

### 1. Core User Functions

#### `createLimitOrder(args)` → `u64` (orderId)
**Purpose:** Create a new limit order

**Parameters:**
```typescript
- tokenIn: Address        // Token to sell
- tokenOut: Address       // Token to buy
- amountIn: u64          // Amount to sell (8 decimals)
- minAmountOut: u64      // Minimum output (price floor, 8 decimals)
- limitPrice: u64        // Target price (18 decimals)
- expiryTime: u64        // Unix timestamp (milliseconds)
- maxSlippage: u64       // Slippage tolerance (basis points, default 100 = 1%)
- partialFillAllowed: bool // Accept partial fills (default false)
```

**Returns:** Order ID (u64)

**Flow:**
1. Validates inputs (positive amounts, future expiry, valid tokens)
2. Transfers `amountIn` tokens from user to contract
3. Creates order with status = ACTIVE
4. Stores order and tracks for user
5. Returns order ID

**Frontend UI Needed:**
- Token pair selector (tokenIn/tokenOut dropdowns)
- Amount input (with balance display)
- Limit price input (target price)
- Expiry date/time picker
- Advanced options: slippage, partial fills
- "Create Order" button

---

#### `cancelLimitOrder(args)` → `bool`
**Purpose:** Cancel an active order (user or admin)

**Parameters:**
```typescript
- orderId: u64           // ID of order to cancel
```

**Returns:** Success boolean

**Flow:**
1. Validates order exists and is active
2. Checks authorization (owner or admin)
3. Refunds remaining tokens to user
4. Marks order as CANCELLED

**Frontend UI Needed:**
- Order list with "Cancel" button
- Confirmation dialog

---

#### `executeLimitOrder(args)` → `bool`
**Purpose:** Execute order when conditions met (keeper function)

**Parameters:**
```typescript
- orderId: u64           // Order to execute
- currentPrice: u64      // Current price (18 decimals)
```

**Returns:** Success boolean

**Flow:**
1. Validates order is eligible
2. Checks price condition (current >= limit)
3. Calculates expected output
4. Validates slippage
5. Executes swap via MassaBeam
6. Updates order status to FILLED

**Frontend UI Needed:**
- "Execute" button for eligible orders (admin/keeper only)
- Price display showing current vs limit

---

### 2. View Functions

#### `getOrderDetails(args)` → `StaticArray<u8>` (serialized order)
**Purpose:** Get full order information

**Parameters:**
```typescript
- orderId: u64
```

**Returns:** Serialized LimitOrder object with:
```typescript
{
  id: u64,
  user: Address,
  tokenIn: Address,
  tokenOut: Address,
  amountIn: u64,
  minAmountOut: u64,
  limitPrice: u64,
  expiryTime: u64,
  createdTime: u64,
  status: u8,              // 0=ACTIVE, 1=FILLED, 2=CANCELLED, 3=EXPIRED
  executedAmount: u64,
  remainingAmount: u64,
  maxSlippage: u64,
  partialFillAllowed: bool,
  useTWAP: bool,
  minExecutionDelay: u64,
  maxPriceImpact: u64,
  executionWindow: u64
}
```

**Frontend UI Needed:**
- Order details modal/card
- Status badge
- Progress indicator (executed vs remaining)

---

#### `getUserOrders(args)` → `StaticArray<u8>` (serialized array of order IDs)
**Purpose:** Get all order IDs for a user

**Parameters:**
```typescript
- user: Address
```

**Returns:** Array of order IDs (u64[])

**Frontend UI Needed:**
- "My Orders" tab/section
- Order list table

---

#### `isOrderEligible(args)` → `StaticArray<u8>` (bool)
**Purpose:** Check if order can be executed

**Parameters:**
```typescript
- orderId: u64
```

**Returns:** Boolean (eligible or not)

**Checks:**
- Not expired
- Status is ACTIVE
- MEV delay passed (>= minExecutionDelay)
- Has remaining amount

**Frontend UI Needed:**
- Eligible status indicator
- Countdown timer for MEV delay

---

#### `getOrderCount()` → `StaticArray<u8>` (count)
**Purpose:** Get total number of orders

**Returns:** Total order count (string)

**Frontend UI Needed:**
- Dashboard statistic

---

### 3. Admin/Keeper Functions

#### `grantKeeperRole(args)` → `void`
**Purpose:** Grant keeper role to address

**Parameters:**
```typescript
- keeper: Address
```

**Frontend UI Needed:**
- Admin panel
- Address input + "Grant" button

---

#### `revokeKeeperRole(args)` → `void`
**Purpose:** Revoke keeper role

**Parameters:**
```typescript
- keeper: Address
```

---

#### `setPaused(args)` → `void`
**Purpose:** Pause/unpause contract

**Parameters:**
```typescript
- paused: bool
```

---

#### `startBot(args)` / `stopBot(args)` / `advance(args)`
**Purpose:** Autonomous execution system

**Note:** These are for on-chain automation - frontend doesn't need direct UI for these, but can show bot status.

---

## Order Lifecycle

```
┌──────────┐
│  CREATE  │ ──► User calls createLimitOrder()
└────┬─────┘      Tokens locked in contract
     │            Status: ACTIVE
     ▼
┌──────────┐
│  ACTIVE  │ ──► Waiting for conditions
└────┬─────┘
     │
     ├──► Price condition met ──► EXECUTE ──► FILLED
     │
     ├──► User cancels ──────────────────► CANCELLED
     │
     └──► Time expires ──────────────────► EXPIRED
```

---

## Price Calculation

### Limit Price (18 decimals)
```typescript
limitPrice = (tokenOut per tokenIn) * 10^18

Example:
- Want to buy DAI with USDC
- Target: 1 USDC = 0.99 DAI
- limitPrice = 0.99 * 10^18 = 990000000000000000
```

### Current Price Calculation (from contract)
```typescript
// From getCurrentPoolPrice() in limit_orders.ts
currentPrice = (reserveOut / reserveIn) * 10^18

Example:
- Pool: 1000 USDC, 950 DAI
- currentPrice = (950 / 1000) * 10^18 = 950000000000000000 (0.95 DAI per USDC)
```

### Order Execution Condition
```typescript
order.isPriceConditionMet(currentPrice) {
  return currentPrice >= order.limitPrice;
}

// For sellers: Higher price is better
// If current >= limit, execute the order
```

---

## Frontend Architecture

### File Structure
```
massabeam/src/app/
├── main.js                    # Add LimitOrdersContract class
├── app-integration.js         # Add limit order handlers
├── limit-orders-ui.js         # NEW: UI management for orders
└── app.html                   # Add limit orders section
```

### Contract Integration (main.js)

```javascript
export const LimitOrdersContract = {
  // Core functions
  async createOrder(tokenIn, tokenOut, amountIn, minAmountOut, limitPrice, expiryTime, maxSlippage, partialFill) {
    const args = new Args()
      .addString(tokenIn)
      .addString(tokenOut)
      .addU64(toBI(amountIn))
      .addU64(toBI(minAmountOut))
      .addU64(toBI(limitPrice))
      .addU64(BigInt(expiryTime))
      .addU64(BigInt(maxSlippage || 100))
      .addBool(partialFill || false);

    return await callContract(CONTRACTS.LIMIT_ORDERS, 'createLimitOrder', args.serialize());
  },

  async cancelOrder(orderId) {
    const args = new Args().addU64(BigInt(orderId));
    return await callContract(CONTRACTS.LIMIT_ORDERS, 'cancelLimitOrder', args.serialize());
  },

  async executeOrder(orderId, currentPrice) {
    const args = new Args()
      .addU64(BigInt(orderId))
      .addU64(toBI(currentPrice));
    return await callContract(CONTRACTS.LIMIT_ORDERS, 'executeLimitOrder', args.serialize());
  },

  // View functions
  async getOrderDetails(orderId) {
    const args = new Args().addU64(BigInt(orderId));
    const result = await readContract(CONTRACTS.LIMIT_ORDERS, 'getOrderDetails', args.serialize());
    return parseOrderDetails(result);
  },

  async getUserOrders(userAddress) {
    const args = new Args().addString(userAddress);
    const result = await readContract(CONTRACTS.LIMIT_ORDERS, 'getUserOrders', args.serialize());
    return parseOrderIds(result);
  },

  async isOrderEligible(orderId) {
    const args = new Args().addU64(BigInt(orderId));
    const result = await readContract(CONTRACTS.LIMIT_ORDERS, 'isOrderEligible', args.serialize());
    return bytesToBool(result);
  },

  async getOrderCount() {
    const result = await readContract(CONTRACTS.LIMIT_ORDERS, 'getOrderCount');
    return bytesToU64(result);
  }
};
```

### UI Components Needed

#### 1. Create Order Form
```
┌─────────────────────────────────────┐
│  Create Limit Order                 │
├─────────────────────────────────────┤
│  From Token:  [▼ USDC     ]         │
│  Amount:      [____] MAX             │
│  Balance: 1000 USDC                 │
│                                     │
│  To Token:    [▼ DAI      ]         │
│  Min Receive: [____]                │
│                                     │
│  Limit Price: [____] DAI per USDC   │
│  Current: 0.99 DAI per USDC         │
│                                     │
│  Expires In:  [__] days [__] hours  │
│                                     │
│  ⚙️ Advanced:                        │
│    Max Slippage: [1.0]%             │
│    □ Allow Partial Fills            │
│                                     │
│  [Create Limit Order]               │
└─────────────────────────────────────┘
```

#### 2. Orders List
```
┌──────────────────────────────────────────────────────────┐
│  My Limit Orders                         [Refresh]       │
├──────────────────────────────────────────────────────────┤
│  ID │ From │ To  │ Amount │ Price  │ Status │ Actions   │
├─────┼──────┼─────┼────────┼────────┼────────┼───────────┤
│ 1   │ USDC │ DAI │ 100    │ 0.99   │ ACTIVE │ [Cancel]  │
│ 2   │ DAI  │ USDC│ 50     │ 1.01   │ FILLED │ [View]    │
│ 3   │ USDC │ DAI │ 200    │ 0.98   │ EXPIRED│ [View]    │
└──────────────────────────────────────────────────────────┘
```

#### 3. Order Details Modal
```
┌─────────────────────────────────────┐
│  Order #123              [ACTIVE]   │
├─────────────────────────────────────┤
│  Sell: 100 USDC                     │
│  Buy:  ≥98 DAI (min)                │
│  Limit Price: 0.99 DAI per USDC     │
│  Current Price: 0.97 DAI per USDC   │
│                                     │
│  Progress: ▓▓▓░░░░░░░ 30%          │
│  Executed: 30 / 100 USDC            │
│  Remaining: 70 USDC                 │
│                                     │
│  Created: 2024-01-15 10:30          │
│  Expires: 2024-01-20 10:30          │
│  Time Left: 4d 23h 45m              │
│                                     │
│  [Cancel Order]  [Close]            │
└─────────────────────────────────────┘
```

---

## Implementation Steps

### Phase 1: Contract Integration (main.js)
1. ✅ Add CONTRACTS.LIMIT_ORDERS address
2. ✅ Create LimitOrdersContract object with all methods
3. ✅ Add parsing functions for order data
4. ✅ Add price calculation utilities

### Phase 2: UI Handlers (app-integration.js)
1. ✅ handleCreateLimitOrder()
2. ✅ handleCancelOrder()
3. ✅ handleRefreshOrders()
4. ✅ loadUserOrders()
5. ✅ updateOrderDisplay()

### Phase 3: HTML (app.html)
1. ✅ Add "Orders" navigation tab
2. ✅ Create order form section
3. ✅ Create orders list section
4. ✅ Add order details modal

### Phase 4: CSS (components.css)
1. ✅ Order form styles
2. ✅ Order list table styles
3. ✅ Status badges (active, filled, cancelled, expired)
4. ✅ Progress bars

### Phase 5: Testing
1. ⏳ Create test order
2. ⏳ View order details
3. ⏳ Cancel order
4. ⏳ Check price updates
5. ⏳ Test expiry

---

## Key Considerations

### 1. **Decimal Handling**
- **amountIn/minAmountOut**: Use 8 decimals (Massa u64)
  ```javascript
  const amountIn = Math.floor(userInput * Math.pow(10, 8));
  ```

- **limitPrice**: Use 18 decimals (standard price format)
  ```javascript
  const limitPrice = Math.floor(price * Math.pow(10, 18));
  ```

### 2. **Time Handling**
- Contract uses Unix timestamps in **milliseconds**
- JavaScript `Date.now()` returns milliseconds ✅
- Expiry validation: `expiryTime > Date.now()`

### 3. **Price Display**
- Show prices in human-readable format
- Indicate when current price meets limit
- Visual indicator: green (can execute), red (waiting)

### 4. **Status Management**
```javascript
const ORDER_STATUS = {
  ACTIVE: 0,
  FILLED: 1,
  CANCELLED: 2,
  EXPIRED: 3
};

const STATUS_NAMES = ['Active', 'Filled', 'Cancelled', 'Expired'];
const STATUS_COLORS = ['blue', 'green', 'gray', 'red'];
```

### 5. **Real-Time Updates**
- Poll `getUserOrders()` every 10 seconds
- Check eligibility for active orders
- Show countdown for expiry
- Update current prices from pools

---

## Example User Flow

### Creating an Order:
```javascript
// User wants: Buy DAI with USDC when price hits 0.99
1. Select: USDC → DAI
2. Enter: 100 USDC
3. Set limit: 0.99 DAI per USDC
4. Set expiry: 7 days
5. Click "Create Order"

Frontend calculates:
- amountIn = 100 * 10^8 = 10000000000
- limitPrice = 0.99 * 10^18 = 990000000000000000
- expiryTime = Date.now() + (7 * 24 * 60 * 60 * 1000)
- minAmountOut = 98 * 10^8 (1% slippage)

Call createLimitOrder() → Returns orderId
Show success message + order ID
```

### Monitoring Orders:
```javascript
// Every 10 seconds:
1. Fetch getUserOrders(userAddress)
2. For each orderId:
   - getOrderDetails(orderId)
   - Get current price from pool
   - Check if eligible
3. Update UI with status
4. Highlight executable orders
```

---

## Next Steps

Would you like me to:
1. ✅ Create the complete main.js integration?
2. ✅ Build the app-integration.js handlers?
3. ✅ Design the HTML UI?
4. ✅ Add the CSS styles?
5. ✅ Or do all of the above in sequence?

Let me know and I'll start building the complete limit orders frontend integration!
