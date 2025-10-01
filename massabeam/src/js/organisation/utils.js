export function formatNumber(num, type = "decimal") {
    if (type === "currency") {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
    }
    return new Intl.NumberFormat('en-US').format(num);
}

export function formatAddress(address) {
  if (!address) return ""
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

export function debounce(func, delay) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), delay);
    };
}

// Format token amount
export function formatTokenAmount(amount, decimals = 9) {
  if (!amount) return "0"
  const divisor = Math.pow(10, decimals)
  return (Number(amount) / divisor).toFixed(4)
}

// Parse token amount
export function parseTokenAmount(amount, decimals = 9) {
  if (!amount) return 0
  const multiplier = Math.pow(10, decimals)
  return Math.floor(Number(amount) * multiplier)
}

// Calculate deadline (current time + hours)
export function calculateDeadline(hours = 1) {
  return Date.now() + hours * 60 * 60 * 1000
}

/**
 * Convert a human-readable token amount to u256 (BigInt) for contract calls
 * @param {string|number} amount - Human readable amount (e.g., "100.5")
 * @param {number} decimals - Token decimals (e.g., 8 or 18)
 * @returns {bigint} - Amount in smallest unit as BigInt
 */
export function toU256(amount, decimals = 8) {
  if (!amount || amount === 0) return 0n;
  const multiplier = BigInt(10 ** decimals);
  const amountStr = String(amount);

  // Handle decimal numbers
  if (amountStr.includes('.')) {
    const [whole, decimal] = amountStr.split('.');
    const decimalPart = decimal.padEnd(decimals, '0').slice(0, decimals);
    return BigInt(whole) * multiplier + BigInt(decimalPart);
  }

  return BigInt(amount) * multiplier;
}

/**
 * Convert u256 (BigInt) from contract to human-readable token amount
 * @param {bigint|string} amount - Amount in smallest unit
 * @param {number} decimals - Token decimals (e.g., 8 or 18)
 * @returns {string} - Human readable amount
 */
export function fromU256(amount, decimals = 8) {
  if (!amount) return "0";
  const divisor = BigInt(10 ** decimals);
  const amountBig = typeof amount === 'string' ? BigInt(amount) : amount;
  const whole = amountBig / divisor;
  const remainder = amountBig % divisor;
  const decimal = remainder.toString().padStart(decimals, '0');
  return `${whole}.${decimal}`;
}
