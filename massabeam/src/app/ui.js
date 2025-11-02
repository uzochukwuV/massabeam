/**
 * UI Utilities Module
 *
 * Provides UI components, message handling, and DOM manipulation utilities
 * for the MassaBeam DeFi interface
 */

// ============================================================================
// MESSAGE & NOTIFICATION SYSTEM
// ============================================================================

export const MessageType = {
  SUCCESS: 'success',
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info',
  LOADING: 'loading',
};

const MessageIcons = {
  success: '✓',
  error: '✕',
  warning: '⚠',
  info: 'ℹ',
  loading: '⟳',
};

/**
 * Show a toast notification message
 *
 * @param {string} message - Message text
 * @param {string} type - Message type (success, error, warning, info, loading)
 * @param {number} duration - Duration in ms (0 = no auto-hide)
 * @returns {HTMLElement} Message element
 */
export function showMessage(message, type = MessageType.INFO, duration = 5000) {
  const container = document.getElementById('messageContainer') || createMessageContainer();

  const messageEl = document.createElement('div');
  messageEl.className = `message message-${type}`;
  messageEl.setAttribute('role', 'alert');
  messageEl.innerHTML = `
    <span class="message-icon">${MessageIcons[type] || '•'}</span>
    <span class="message-text">${message}</span>
    <button class="message-close" aria-label="Close notification">&times;</button>
  `;

  messageEl.querySelector('.message-close').addEventListener('click', () => {
    messageEl.remove();
  });

  container.appendChild(messageEl);

  if (duration > 0) {
    setTimeout(() => {
      messageEl.style.opacity = '0';
      setTimeout(() => messageEl.remove(), 300);
    }, duration);
  }

  return messageEl;
}

/**
 * Show success message
 */
export function showSuccess(message, duration = 5000) {
  return showMessage(message, MessageType.SUCCESS, duration);
}

/**
 * Show error message
 */
export function showError(message, duration = 5000) {
  return showMessage(message, MessageType.ERROR, duration);
}

/**
 * Show warning message
 */
export function showWarning(message, duration = 5000) {
  return showMessage(message, MessageType.WARNING, duration);
}

/**
 * Show info message
 */
export function showInfo(message, duration = 5000) {
  return showMessage(message, MessageType.INFO, duration);
}

/**
 * Show loading message
 */
export function showLoading(message, duration = 5000) {
  return showMessage(message, MessageType.WARNING, duration);
}

/**
 * Create message container if it doesn't exist
 */
function createMessageContainer() {
  const container = document.createElement('div');
  container.id = 'messageContainer';
  container.className = 'message-container';
  document.body.insertBefore(container, document.body.firstChild);
  return container;
}

// ============================================================================
// LOADING & OVERLAY
// ============================================================================

export class LoadingOverlay {
  constructor(element = null) {
    this.element = element || document.getElementById('loadingOverlay');
    this.isVisible = false;
  }

  show(message = 'Loading...') {
    if (this.element) {
      const textEl = this.element.querySelector('.loading-text');
      if (textEl) textEl.textContent = message;
      this.element.classList.add('visible');
      this.isVisible = true;
    }
  }

  hide() {
    if (this.element) {
      this.element.classList.remove('visible');
      this.isVisible = false;
    }
  }

  toggle() {
    this.isVisible ? this.hide() : this.show();
  }
}

// Global loading overlay instance
export const loadingOverlay = new LoadingOverlay();

// ============================================================================
// FORM UTILITIES
// ============================================================================

/**
 * Set form values from object
 */
export function setFormValues(formId, values) {
  const form = document.getElementById(formId);
  if (!form) return;

  Object.entries(values).forEach(([key, value]) => {
    const input = form.elements[key];
    if (input) {
      input.value = value;
    }
  });
}

/**
 * Get form values as object
 */
export function getFormValues(formId) {
  const form = document.getElementById(formId);
  if (!form) return {};

  const formData = new FormData(form);
  const values = {};

  formData.forEach((value, key) => {
    values[key] = value;
  });

  return values;
}

/**
 * Reset form
 */
export function resetForm(formId) {
  const form = document.getElementById(formId);
  if (form) form.reset();
}

/**
 * Validate required fields
 */
export function validateRequired(formId, fields) {
  const form = document.getElementById(formId);
  if (!form) return true;

  for (const fieldName of fields) {
    const input = form.elements[fieldName];
    if (!input || !input.value.trim()) {
      showError(`${fieldName} is required`);
      return false;
    }
  }

  return true;
}

/**
 * Disable form submission
 */
export function disableFormSubmit(formId, disable = true) {
  const form = document.getElementById(formId);
  if (!form) return;

  const submitBtn = form.querySelector('button[type="submit"]');
  if (submitBtn) {
    submitBtn.disabled = disable;
  }
}

// ============================================================================
// MODAL UTILITIES
// ============================================================================

export class Modal {
  constructor(element) {
    this.element = element;
    this.closeBtn = element?.querySelector('[data-close], .modal-close');

    if (this.closeBtn) {
      this.closeBtn.addEventListener('click', () => this.close());
    }

    // Close on overlay click
    element?.addEventListener('click', (e) => {
      if (e.target === this.element) this.close();
    });
  }

  open() {
    if (this.element) {
      this.element.classList.add('open');
      this.element.style.display = 'flex';
    }
  }

  close() {
    if (this.element) {
      this.element.classList.remove('open');
      this.element.style.display = 'none';
    }
  }

  toggle() {
    this.element?.classList.contains('open') ? this.close() : this.open();
  }

  isOpen() {
    return this.element?.classList.contains('open') || false;
  }
}

// ============================================================================
// TABLE UTILITIES
// ============================================================================

export class Table {
  constructor(elementId) {
    this.element = document.getElementById(elementId);
    this.tbody = this.element?.querySelector('tbody');
  }

  addRow(data, actionButtons = null) {
    if (!this.tbody) return;

    const row = document.createElement('tr');

    Object.values(data).forEach(value => {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.appendChild(cell);
    });

    // Add action buttons if provided
    if (actionButtons) {
      const actionCell = document.createElement('td');
      actionCell.className = 'action-cell';
      actionButtons.forEach(btn => {
        actionCell.appendChild(btn);
      });
      row.appendChild(actionCell);
    }

    this.tbody.appendChild(row);
  }

  clear() {
    if (this.tbody) {
      this.tbody.innerHTML = '';
    }
  }

  setEmptyState(message = 'No data found') {
    if (!this.tbody) return;

    this.clear();
    const row = document.createElement('tr');
    row.className = 'empty-state-row';
    row.innerHTML = `<td colspan="100" class="empty-state">${message}</td>`;
    this.tbody.appendChild(row);
  }

  getRowCount() {
    return this.tbody?.querySelectorAll('tr:not(.empty-state-row)').length || 0;
  }
}

// ============================================================================
// TABS
// ============================================================================

export class Tabs {
  constructor(containerElement) {
    this.container = containerElement;
    this.tabs = containerElement?.querySelectorAll('[role="tab"]') || [];
    this.panels = containerElement?.querySelectorAll('[role="tabpanel"]') || [];

    this.tabs.forEach(tab => {
      tab.addEventListener('click', () => this.selectTab(tab));
      tab.addEventListener('keydown', (e) => this.handleKeydown(e));
    });
  }

  selectTab(tab) {
    // Deactivate all tabs and panels
    this.tabs.forEach(t => {
      t.setAttribute('aria-selected', 'false');
      t.classList.remove('active');
    });
    this.panels.forEach(p => p.hidden = true);

    // Activate selected tab
    tab.setAttribute('aria-selected', 'true');
    tab.classList.add('active');
    const panelId = tab.getAttribute('aria-controls');
    document.getElementById(panelId)?.removeAttribute('hidden');
  }

  handleKeydown(e) {
    const currentIndex = Array.from(this.tabs).indexOf(e.currentTarget);
    let nextTab = null;

    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      nextTab = this.tabs[currentIndex - 1] || this.tabs[this.tabs.length - 1];
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      nextTab = this.tabs[currentIndex + 1] || this.tabs[0];
    }

    if (nextTab) {
      this.selectTab(nextTab);
      nextTab.focus();
    }
  }
}

// ============================================================================
// TOAST NOTIFICATIONS
// ============================================================================

export class Toast {
  static success(message, duration = 3000) {
    return showSuccess(message, duration);
  }

  static error(message, duration = 5000) {
    return showError(message, duration);
  }

  static warning(message, duration = 4000) {
    return showWarning(message, duration);
  }

  static info(message, duration = 3000) {
    return showInfo(message, duration);
  }
}

// ============================================================================
// DOM HELPERS
// ============================================================================

/**
 * Update element text safely
 */
export function setText(elementId, text) {
  const el = document.getElementById(elementId);
  if (el) el.textContent = text;
}

/**
 * Update element HTML safely
 */
export function setHTML(elementId, html) {
  const el = document.getElementById(elementId);
  if (el) el.innerHTML = html;
}

/**
 * Get element value
 */
export function getValue(elementId) {
  const el = document.getElementById(elementId);
  return el?.value || '';
}

/**
 * Set element value
 */
export function setValue(elementId, value) {
  const el = document.getElementById(elementId);
  if (el) el.value = value;
}

/**
 * Toggle element visibility
 */
export function toggleVisibility(elementId, show = null) {
  const el = document.getElementById(elementId);
  if (!el) return;

  if (show === null) {
    el.classList.toggle('hidden');
  } else {
    show ? el.classList.remove('hidden') : el.classList.add('hidden');
  }
}

/**
 * Add class to element
 */
export function addClass(elementId, className) {
  const el = document.getElementById(elementId);
  if (el) el.classList.add(className);
}

/**
 * Remove class from element
 */
export function removeClass(elementId, className) {
  const el = document.getElementById(elementId);
  if (el) el.classList.remove(className);
}

/**
 * Toggle class on element
 */
export function toggleClass(elementId, className) {
  const el = document.getElementById(elementId);
  if (el) el.classList.toggle(className);
}

/**
 * Enable/disable element
 */
export function setEnabled(elementId, enabled = true) {
  const el = document.getElementById(elementId);
  if (el) el.disabled = !enabled;
}

// ============================================================================
// FORMATTING
// ============================================================================

/**
 * Format number with commas
 */
export function formatNumber(num, decimals = 2) {
  if (typeof num !== 'number') num = parseFloat(num);
  return num.toLocaleString('en-US', { maximumFractionDigits: decimals });
}

/**
 * Format as currency
 */
export function formatCurrency(amount, currency = 'USD') {
  if (typeof amount !== 'number') amount = parseFloat(amount);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amount);
}

/**
 * Format as percentage
 */
export function formatPercent(value, decimals = 2) {
  if (typeof value !== 'number') value = parseFloat(value);
  return `${value.toFixed(decimals)}%`;
}

/**
 * Format token amount
 */
export function formatTokenAmount(amount, decimals = 8) {
  if (typeof amount !== 'number') amount = parseFloat(amount);
  return amount.toFixed(decimals).replace(/\.?0+$/, '');
}

/**
 * Format address (short form)
 */
export function formatAddress(address) {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Format timestamp
 */
export function formatTime(timestamp) {
  return new Date(timestamp * 1000).toLocaleString();
}

/**
 * Format time ago
 */
export function formatTimeAgo(timestamp) {
  const seconds = Math.floor((Date.now() - timestamp * 1000) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

// ============================================================================
// CSS INJECTION
// ============================================================================

/**
 * Inject CSS dynamically
 */
export function injectCSS(css) {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
}

/**
 * Inject message container styles
 */
export function injectMessageStyles() {
  const css = `
    .message-container {
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 10000;
      max-width: 400px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .message {
      padding: 15px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 14px;
      animation: slideIn 0.3s ease;
      backdrop-filter: blur(10px);
      border: 1px solid;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    }

    @keyframes slideIn {
      from {
        transform: translateX(400px);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }

    .message-success {
      background: rgba(0, 217, 126, 0.1);
      border-color: #00d97e;
      color: #00d97e;
    }

    .message-error {
      background: rgba(255, 71, 87, 0.1);
      border-color: #ff4757;
      color: #ff4757;
    }

    .message-warning {
      background: rgba(255, 165, 0, 0.1);
      border-color: #ffa500;
      color: #ffa500;
    }

    .message-info {
      background: rgba(0, 212, 255, 0.1);
      border-color: #00d4ff;
      color: #00d4ff;
    }

    .message-loading {
      background: rgba(0, 212, 255, 0.1);
      border-color: #00d4ff;
      color: #00d4ff;
    }

    .message-icon {
      font-weight: bold;
      font-size: 16px;
      flex-shrink: 0;
    }

    .message-text {
      flex: 1;
    }

    .message-close {
      background: none;
      border: none;
      color: inherit;
      cursor: pointer;
      font-size: 20px;
      padding: 0;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0.7;
      transition: opacity 0.2s;
    }

    .message-close:hover {
      opacity: 1;
    }

    @media (max-width: 768px) {
      .message-container {
        left: 20px;
        right: 20px;
        max-width: none;
      }
    }
  `;

  injectCSS(css);
}

// Initialize message styles on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectMessageStyles);
} else {
  injectMessageStyles();
}

export default {
  showMessage,
  showSuccess,
  showError,
  showWarning,
  showInfo,
  loadingOverlay,
  LoadingOverlay,
  Modal,
  Table,
  Tabs,
  Toast,
  setText,
  setHTML,
  getValue,
  setValue,
  toggleVisibility,
  addClass,
  removeClass,
  toggleClass,
  setEnabled,
  formatNumber,
  formatCurrency,
  formatPercent,
  formatTokenAmount,
  formatAddress,
  formatTime,
  formatTimeAgo,
  injectCSS,
};
