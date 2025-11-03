# Limit Orders - Complete Frontend Integration

## ✅ Completed: Contract Integration (main.js)

### What Was Added:

1. **LimitOrdersContract Object** (lines 1222-1434)
   - `createOrder()` - Create new limit order
   - `cancelOrder()` - Cancel active order
   - `executeOrder()` - Execute eligible order (keeper function)
   - `getOrderDetails()` - Get full order information
   - `getUserOrders()` - Get all orders for user
   - `isOrderEligible()` - Check execution eligibility
   - `getOrderCount()` - Get total orders

2. **Order Status Constants** (lines 1437-1445)
   - `ORDER_STATUS` enum
   - `ORDER_STATUS_NAMES` array
   - `ORDER_STATUS_COLORS` array

3. **Contract Address** (line 261)
   - Added `CONTRACTS.LIMIT_ORDERS`
   - Placeholder for deployed address

### Status: ✅ COMPLETE

---

## ⏳ Next Steps: UI Handlers (app-integration.js)

Add these handler functions to app-integration.js:

```javascript
// Import limit orders contract
import { LimitOrdersContract, ORDER_STATUS, ORDER_STATUS_NAMES } from './main.js';

// ============================================================================
// LIMIT ORDERS HANDLERS
// ============================================================================

/**
 * Handle create limit order
 */
async function handleCreateLimitOrder() {
  try {
    const tokenIn = document.getElementById('orderTokenIn')?.value;
    const tokenOut = document.getElementById('orderTokenOut')?.value;
    const amountInput = document.getElementById('orderAmountIn')?.value;
    const limitPrice = document.getElementById('orderLimitPrice')?.value;
    const expirySelect = document.getElementById('orderExpiry')?.value;
    const partialFill = document.getElementById('partialFill')?.checked;

    // Get slippage
    const activeSlippage = document.querySelector('.slippage-btn.active');
    const slippage = activeSlippage ? parseFloat(activeSlippage.dataset.slippage) : 1.0;
    const maxSlippage = Math.floor(slippage * 100); // Convert to basis points

    if (!tokenIn || !tokenOut || !amountInput || !limitPrice) {
      showError('Please fill in all required fields');
      return;
    }

    // TEMPORARY: Use DECIMALS = 0 for raw format pools
    const DECIMALS = 0;
    const amountIn = Math.floor(Number(amountInput) * Math.pow(10, DECIMALS));

    // Calculate min amount out based on limit price
    // limitPrice is in 18 decimals: (tokenOut per tokenIn) * 10^18
    const limitPriceScaled = BigInt(Math.floor(Number(limitPrice) * Math.pow(10, 18)));
    const minAmountOut = Math.floor(Number(amountInput) * Number(limitPrice) * (1 - slippage / 100));

    // Calculate expiry timestamp
    const now = Date.now();
    const expiryTime = expirySelect === 'custom'
      ? now + (7 * 24 * 60 * 60 * 1000) // Default 7 days
      : now + (Number(expirySelect) * 1000); // Convert seconds to ms

    console.log('Creating order:', {
      tokenIn,
      tokenOut,
      amountIn,
      minAmountOut,
      limitPrice: limitPriceScaled.toString(),
      expiryTime,
      maxSlippage,
      partialFill
    });

    loadingOverlay.show('Creating limit order...');

    const orderId = await LimitOrdersContract.createOrder(
      tokenIn,
      tokenOut,
      amountIn.toString(),
      minAmountOut.toString(),
      limitPriceScaled.toString(),
      expiryTime,
      maxSlippage,
      partialFill
    );

    loadingOverlay.hide();
    showSuccess(`Limit order created! Order ID: ${orderId}`);

    // Clear form
    document.getElementById('orderAmountIn').value = '';
    document.getElementById('orderLimitPrice').value = '';

    // Refresh orders list
    await refreshUserOrders();
  } catch (error) {
    loadingOverlay.hide();
    showError(`Failed to create order: ${error.message}`);
  }
}

/**
 * Handle cancel limit order
 */
async function handleCancelOrder(orderId) {
  try {
    if (!confirm(`Are you sure you want to cancel order #${orderId}?`)) {
      return;
    }

    loadingOverlay.show('Cancelling order...');

    await LimitOrdersContract.cancelOrder(orderId);

    loadingOverlay.hide();

    // Refresh orders list
    await refreshUserOrders();
  } catch (error) {
    loadingOverlay.hide();
    showError(`Failed to cancel order: ${error.message}`);
  }
}

/**
 * Refresh user orders
 */
async function refreshUserOrders() {
  try {
    const userAddress = getUserAddress();
    if (!userAddress) {
      console.log('No user address, skipping order refresh');
      return;
    }

    // Get user order IDs
    const orderIds = await LimitOrdersContract.getUserOrders(userAddress);

    if (orderIds.length === 0) {
      displayEmptyOrders();
      return;
    }

    // Fetch details for each order
    const orders = [];
    for (const orderId of orderIds) {
      const order = await LimitOrdersContract.getOrderDetails(orderId);
      if (order) {
        orders.push(order);
      }
    }

    // Display orders
    displayOrders(orders);

    // Update order count in dashboard
    const orderCount = await LimitOrdersContract.getOrderCount();
    const orderCountEl = document.getElementById('protocolActiveOrders');
    if (orderCountEl) {
      orderCountEl.textContent = orderCount;
    }
  } catch (error) {
    console.error('Failed to refresh orders:', error);
  }
}

/**
 * Display orders in UI
 */
function displayOrders(orders) {
  const activeList = document.getElementById('activeOrdersList');
  const historyList = document.getElementById('orderHistoryList');

  if (!activeList || !historyList) return;

  const activeOrders = orders.filter(o => o.status === ORDER_STATUS.ACTIVE);
  const historicOrders = orders.filter(o => o.status !== ORDER_STATUS.ACTIVE);

  // Display active orders
  if (activeOrders.length === 0) {
    activeList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🎯</div>
        <p>No active orders</p>
      </div>
    `;
  } else {
    activeList.innerHTML = activeOrders.map(order => renderOrderCard(order)).join('');
  }

  // Display history
  if (historicOrders.length === 0) {
    historyList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📝</div>
        <p>No order history</p>
      </div>
    `;
  } else {
    historyList.innerHTML = historicOrders.map(order => renderOrderCard(order)).join('');
  }
}

/**
 * Render single order card
 */
function renderOrderCard(order) {
  const DECIMALS = 0; // Temporary for raw pools
  const tokenInData = tokenService.getToken(order.tokenIn);
  const tokenOutData = tokenService.getToken(order.tokenOut);

  const amountInHuman = (order.amountIn / Math.pow(10, DECIMALS)).toFixed(6);
  const minOutHuman = (order.minAmountOut / Math.pow(10, DECIMALS)).toFixed(6);
  const limitPriceHuman = (order.limitPrice / Math.pow(10, 18)).toFixed(6);

  const statusName = ORDER_STATUS_NAMES[order.status];
  const statusColor = ORDER_STATUS_COLORS[order.status];

  const now = Date.now();
  const timeLeft = order.expiryTime - now;
  const isExpired = timeLeft <= 0;
  const expiryText = isExpired ? 'Expired' : formatTimeRemaining(timeLeft);

  const progress = order.amountIn > 0
    ? ((order.executedAmount / order.amountIn) * 100).toFixed(1)
    : 0;

  return `
    <div class="order-card">
      <div class="order-header">
        <div class="order-id">Order #${order.id}</div>
        <div class="order-status status-${statusColor}">${statusName}</div>
      </div>
      <div class="order-body">
        <div class="order-pair">
          ${tokenInData?.symbol || 'TOKEN'} → ${tokenOutData?.symbol || 'TOKEN'}
        </div>
        <div class="order-details">
          <div class="detail-row">
            <span>Amount:</span>
            <span>${amountInHuman} ${tokenInData?.symbol}</span>
          </div>
          <div class="detail-row">
            <span>Min Receive:</span>
            <span>${minOutHuman} ${tokenOutData?.symbol}</span>
          </div>
          <div class="detail-row">
            <span>Limit Price:</span>
            <span>${limitPriceHuman}</span>
          </div>
          <div class="detail-row">
            <span>Expires:</span>
            <span class="${isExpired ? 'text-error' : ''}">${expiryText}</span>
          </div>
        </div>
        ${order.status === ORDER_STATUS.ACTIVE ? `
          <div class="order-progress">
            <div class="progress-bar">
              <div class="progress-fill" style="width: ${progress}%"></div>
            </div>
            <div class="progress-text">${progress}% executed</div>
          </div>
        ` : ''}
      </div>
      <div class="order-actions">
        ${order.status === ORDER_STATUS.ACTIVE ? `
          <button class="btn-cancel" onclick="handleCancelOrder(${order.id})">
            Cancel Order
          </button>
        ` : ''}
        <button class="btn-details" onclick="showOrderDetails(${order.id})">
          View Details
        </button>
      </div>
    </div>
  `;
}

/**
 * Format time remaining
 */
function formatTimeRemaining(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

/**
 * Show order details modal
 */
async function showOrderDetails(orderId) {
  try {
    const order = await LimitOrdersContract.getOrderDetails(orderId);
    if (!order) {
      showError('Order not found');
      return;
    }

    // TODO: Create and show modal with full order details
    console.log('Order details:', order);
    alert(`Order #${orderId} details:\n${JSON.stringify(order, null, 2)}`);
  } catch (error) {
    showError(`Failed to load order details: ${error.message}`);
  }
}

/**
 * Display empty orders
 */
function displayEmptyOrders() {
  const activeList = document.getElementById('activeOrdersList');
  const historyList = document.getElementById('orderHistoryList');

  if (activeList) {
    activeList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🎯</div>
        <p>No active orders</p>
        <button class="secondary-btn" onclick="switchSection('orders')">Create Your First Order</button>
      </div>
    `;
  }

  if (historyList) {
    historyList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📝</div>
        <p>No order history</p>
      </div>
    `;
  }
}

// Export functions
export {
  handleCreateLimitOrder,
  handleCancelOrder,
  refreshUserOrders,
  showOrderDetails
};
```

---

## ⏳ Next: Update HTML Element IDs

The HTML in app.html already has the structure, but ensure these element IDs match:

### Form Elements:
- ✅ `orderTokenIn` - Token in dropdown
- ✅ `orderTokenOut` - Token out dropdown
- ✅ `orderAmountIn` - Amount input
- ✅ `orderLimitPrice` - Limit price input
- ✅ `orderExpiry` - Expiry select
- ✅ `partialFill` - Partial fill checkbox
- ✅ `createOrderBtn` - Submit button

### Display Elements:
- ✅ `orderTokenInBalance` - Balance display
- ✅ `currentMarketPrice` - Current price display
- ✅ `orderSummaryPay` - Summary: you pay
- ✅ `orderSummaryReceive` - Summary: you receive
- ✅ `orderSummaryFee` - Summary: network fee
- ✅ `activeOrdersList` - Active orders container
- ✅ `orderHistoryList` - History container
- ✅ `protocolActiveOrders` - Dashboard stat

### Update form submit handler:
```html
<form class="order-form" id="orderForm" onsubmit="event.preventDefault(); handleCreateLimitOrder();">
```

---

## ⏳ Next: Add CSS Styles

Add to `components.css`:

```css
/* Order Cards */
.order-card {
  background: var(--surface-light);
  border: 1px solid var(--surface-dark);
  border-radius: var(--radius-lg);
  padding: var(--space-lg);
  margin-bottom: var(--space-md);
}

.order-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-md);
}

.order-id {
  font-weight: var(--font-semibold);
  color: var(--text-primary);
}

.order-status {
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-md);
  font-size: var(--text-xs);
  font-weight: var(--font-semibold);
}

.status-blue {
  background: rgba(0, 210, 255, 0.1);
  color: var(--primary-blue);
}

.status-green {
  background: rgba(74, 222, 128, 0.1);
  color: #4ade80;
}

.status-gray {
  background: rgba(156, 163, 175, 0.1);
  color: #9ca3af;
}

.status-red {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

.order-pair {
  font-size: var(--text-lg);
  font-weight: var(--font-semibold);
  color: var(--text-primary);
  margin-bottom: var(--space-sm);
}

.order-details {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  margin-bottom: var(--space-md);
}

.detail-row {
  display: flex;
  justify-content: space-between;
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.order-progress {
  margin: var(--space-md) 0;
}

.progress-bar {
  width: 100%;
  height: 8px;
  background: var(--surface-dark);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--primary-blue);
  transition: width 0.3s ease;
}

.progress-text {
  font-size: var(--text-xs);
  color: var(--text-muted);
  margin-top: var(--space-xs);
}

.order-actions {
  display: flex;
  gap: var(--space-sm);
}

.btn-cancel,
.btn-details {
  flex: 1;
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.btn-cancel {
  background: transparent;
  border: 1px solid var(--error-red, #ef4444);
  color: var(--error-red, #ef4444);
}

.btn-cancel:hover {
  background: rgba(239, 68, 68, 0.1);
}

.btn-details {
  background: var(--surface-dark);
  border: 1px solid var(--surface-dark);
  color: var(--text-primary);
}

.btn-details:hover {
  background: var(--primary-blue);
  border-color: var(--primary-blue);
  color: white;
}
```

---

## Summary

### ✅ Completed:
1. Contract integration in main.js
2. All contract functions implemented
3. Order status constants defined
4. Contract address placeholder added

### ⏳ To Do:
1. Add handlers to app-integration.js (code provided above)
2. Update HTML form submit handler
3. Add CSS styles (code provided above)
4. Add order details modal
5. Set up auto-refresh (poll every 10s)
6. Add deployed contract address

### 📝 Testing Checklist:
- [ ] Create order form validation
- [ ] Create order execution
- [ ] Orders list displays correctly
- [ ] Order status updates
- [ ] Cancel order works
- [ ] Time remaining countdown
- [ ] Price updates
- [ ] Progress bars
- [ ] Empty states

---

**Ready for deployment after adding handlers and deploying limit orders contract!** 🚀
