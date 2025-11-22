/**
 * Analytics & Monitoring Module
 *
 * Handles order eligibility checking, performance metrics, and expiring orders alerts
 */

import { LimitOrdersContract, ORDER_STATUS_NAMES, ORDER_STATUS_COLORS } from './limit-orders.js';
import { RecurringOrdersContract, ORDER_TYPE_NAMES, ORDER_STATUS_NAMES as RECURRING_STATUS_NAMES } from './recurring-orders.js';
import { getUserAddress, isWalletConnected } from './main.js';

// ============================================================================
// EXPIRING ORDERS MONITORING
// ============================================================================

/**
 * Check for expiring orders and update dashboard
 * @param {number} timeWindow - Time window in seconds (default: 3600 = 1 hour)
 */
export async function checkExpiringOrders(timeWindow = 3600) {
  if (!isWalletConnected()) return;

  try {
    // Get expiring limit orders
    const expiringLimitOrders = await LimitOrdersContract.getExpiringLimitOrders(timeWindow);

    // Get expiring recurring orders
    const expiringRecurringOrders = await RecurringOrdersContract.getExpiringOrders(timeWindow);

    const totalExpiring = expiringLimitOrders.length + expiringRecurringOrders.length;

    if (totalExpiring > 0) {
      // Show alert
      const alertCard = document.getElementById('expiringOrdersAlert');
      const countBadge = document.getElementById('expiringOrdersCount');
      const countText = document.getElementById('expiringCountText');

      if (alertCard) alertCard.style.display = 'block';
      if (countBadge) countBadge.textContent = totalExpiring;
      if (countText) countText.textContent = totalExpiring;

      // Populate expiring orders list
      await populateExpiringOrdersList(expiringLimitOrders, expiringRecurringOrders);
    } else {
      // Hide alert if no expiring orders
      const alertCard = document.getElementById('expiringOrdersAlert');
      if (alertCard) alertCard.style.display = 'none';
    }
  } catch (error) {
    console.error('Error checking expiring orders:', error);
  }
}

/**
 * Populate the expiring orders list
 */
async function populateExpiringOrdersList(limitOrderIds, recurringOrderIds) {
  const listElement = document.getElementById('expiringOrdersList');
  if (!listElement) return;

  listElement.innerHTML = '';

  // Add limit orders
  for (const orderId of limitOrderIds) {
    try {
      const order = await LimitOrdersContract.getOrderDetails(orderId);
      if (order) {
        const timeRemaining = calculateTimeRemaining(order.expiryTime);
        const orderItem = createExpiringOrderItem(orderId, 'Limit Order', timeRemaining, 'orders');
        listElement.appendChild(orderItem);
      }
    } catch (error) {
      console.error(`Error loading limit order ${orderId}:`, error);
    }
  }

  // Add recurring orders
  for (const orderId of recurringOrderIds) {
    try {
      const order = await RecurringOrdersContract.getOrderDetails(orderId);
      if (order) {
        const timeRemaining = calculateTimeRemaining(order.expiryTime);
        const orderType = ORDER_TYPE_NAMES[order.orderType] || 'Recurring Order';
        const orderItem = createExpiringOrderItem(orderId, orderType, timeRemaining, 'recurring');
        listElement.appendChild(orderItem);
      }
    } catch (error) {
      console.error(`Error loading recurring order ${orderId}:`, error);
    }
  }
}

/**
 * Create an expiring order item element
 */
function createExpiringOrderItem(orderId, orderType, timeRemaining, section) {
  const item = document.createElement('div');
  item.className = 'expiring-order-item';
  item.innerHTML = `
    <div class="order-info">
      <span class="order-type-label">${orderType}</span>
      <span class="order-id">#${orderId}</span>
    </div>
    <div class="time-remaining ${timeRemaining.isUrgent ? 'urgent' : ''}">
      ${timeRemaining.text}
    </div>
    <button class="view-btn" onclick="viewOrder(${orderId}, '${section}')">View</button>
  `;
  return item;
}

/**
 * Calculate time remaining until expiry
 */
function calculateTimeRemaining(expiryTimestamp) {
  const now = Date.now();
  const remaining = expiryTimestamp - now;

  if (remaining <= 0) {
    return { text: 'Expired', isUrgent: true };
  }

  const minutes = Math.floor(remaining / 60000);
  const hours = Math.floor(minutes / 60);

  if (minutes < 30) {
    return { text: `${minutes}m`, isUrgent: true };
  } else if (hours < 1) {
    return { text: `${minutes}m`, isUrgent: false };
  } else {
    return { text: `${hours}h ${minutes % 60}m`, isUrgent: false };
  }
}

// ============================================================================
// USER PERFORMANCE METRICS
// ============================================================================

/**
 * Update user performance metrics on dashboard
 */
export async function updateUserPerformanceMetrics() {
  if (!isWalletConnected()) return;

  const userAddress = getUserAddress();
  if (!userAddress) return;

  try {
    // Get limit orders performance
    const limitPerf = await LimitOrdersContract.getUserPerformance(userAddress);

    // Get recurring orders performance
    const recurringPerf = await RecurringOrdersContract.getUserPerformanceSummary(userAddress);

    // Update limit orders metrics
    updateElement('userLimitOrdersTotal', limitPerf.totalOrders);
    updateElement('userLimitOrdersFilled', `${limitPerf.filledOrders} filled`);
    updateElement('userLimitOrdersActive', `${limitPerf.activeOrders} active`);
    updateElement('userLimitFillRate', `${(limitPerf.fillRate / 100).toFixed(1)}%`);

    // Update recurring orders metrics
    updateElement('userRecurringOrdersTotal', recurringPerf.totalOrders);
    updateElement('userRecurringExecutions', `${recurringPerf.totalExecutions} executions`);
    updateElement('userRecurringActive', `${recurringPerf.activeOrders} active`);
    updateElement('userRecurringSuccessRate', `${(recurringPerf.successRate / 100).toFixed(1)}%`);

  } catch (error) {
    console.error('Error updating user performance metrics:', error);
  }
}

/**
 * Helper to update element text content
 */
function updateElement(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

// ============================================================================
// ORDER ELIGIBILITY CHECKING
// ============================================================================

/**
 * Check and display order eligibility status
 * @param {number} orderId - Order ID
 * @param {string} orderType - 'limit' or 'recurring'
 * @param {HTMLElement} container - Container to display status
 */
export async function displayOrderEligibility(orderId, orderType, container) {
  if (!container) return;

  try {
    let eligibility;

    if (orderType === 'limit') {
      eligibility = await LimitOrdersContract.isOrderEligible(orderId);
    } else if (orderType === 'recurring') {
      eligibility = await RecurringOrdersContract.isRecurringOrderEligible(orderId);
    } else {
      return;
    }

    // Create eligibility badge
    const badge = document.createElement('div');
    badge.className = `eligibility-badge ${eligibility.eligible ? 'eligible' : 'not-eligible'}`;
    badge.innerHTML = `
      <span class="badge-icon">${eligibility.eligible ? '✓' : '⚠'}</span>
      <span class="badge-text">${eligibility.eligible ? 'Ready to Execute' : 'Not Eligible'}</span>
      <span class="badge-reason">${eligibility.reason}</span>
    `;

    container.appendChild(badge);
  } catch (error) {
    console.error('Error checking order eligibility:', error);
  }
}

// ============================================================================
// PLATFORM STATISTICS
// ============================================================================

/**
 * Update platform statistics on dashboard
 */
export async function updatePlatformStatistics() {
  try {
    // Get limit orders platform stats
    const limitStats = await LimitOrdersContract.getPlatformStatistics();

    // Get recurring orders platform stats
    const recurringStats = await RecurringOrdersContract.getPlatformStatistics();

    // Update protocol stats
    const totalActiveOrders = limitStats.activeOrders + recurringStats.activeOrders;
    updateElement('protocolActiveOrders', totalActiveOrders);

  } catch (error) {
    console.error('Error updating platform statistics:', error);
  }
}

// ============================================================================
// PERIODIC UPDATES
// ============================================================================

/**
 * Start periodic monitoring
 * @param {number} interval - Update interval in milliseconds (default: 60000 = 1 minute)
 */
export function startPeriodicMonitoring(interval = 60000) {
  // Initial update
  updateDashboardMetrics();

  // Periodic updates
  setInterval(() => {
    updateDashboardMetrics();
  }, interval);

  console.log('✓ Periodic monitoring started');
}

/**
 * Update all dashboard metrics
 */
async function updateDashboardMetrics() {
  if (!isWalletConnected()) return;

  try {
    await Promise.all([
      checkExpiringOrders(3600), // Check orders expiring within 1 hour
      updateUserPerformanceMetrics(),
      updatePlatformStatistics(),
    ]);
  } catch (error) {
    console.error('Error updating dashboard metrics:', error);
  }
}

// ============================================================================
// ORDER LIST ENHANCEMENTS
// ============================================================================

/**
 * Enhance order item with eligibility status
 * @param {HTMLElement} orderElement - Order item element
 * @param {number} orderId - Order ID
 * @param {string} orderType - 'limit' or 'recurring'
 */
export async function enhanceOrderItem(orderElement, orderId, orderType) {
  if (!orderElement) return;

  // Add eligibility container
  const eligibilityContainer = document.createElement('div');
  eligibilityContainer.className = 'order-eligibility-container';
  orderElement.appendChild(eligibilityContainer);

  // Display eligibility status
  await displayOrderEligibility(orderId, orderType, eligibilityContainer);
}

// ============================================================================
// GLOBAL HANDLERS
// ============================================================================

/**
 * View order details
 */
window.viewOrder = function(orderId, section) {
  console.log(`Viewing order ${orderId} in section ${section}`);
  // Switch to appropriate section
  if (section === 'orders') {
    window.switchSection?.('orders');
  } else if (section === 'recurring') {
    window.switchSection?.('recurring');
  }

  // Scroll to order (implement as needed)
  // You can add highlighting or modal display here
};

// Export all functions
export default {
  checkExpiringOrders,
  updateUserPerformanceMetrics,
  displayOrderEligibility,
  updatePlatformStatistics,
  startPeriodicMonitoring,
  enhanceOrderItem,
};
