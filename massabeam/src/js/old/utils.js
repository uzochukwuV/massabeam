// Utility Functions

// Format numbers with appropriate suffixes
export function formatNumber(num, decimals = 2) {
  if (num === 0) return "0"
  if (num < 1000) return num.toFixed(decimals)
  if (num < 1000000) return (num / 1000).toFixed(1) + "K"
  if (num < 1000000000) return (num / 1000000).toFixed(1) + "M"
  return (num / 1000000000).toFixed(1) + "B"
}

// Format currency values
export function formatCurrency(amount, currency = "USD", decimals = 2) {
  if (amount === 0) return "$0.00"

  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })

  return formatter.format(amount)
}

// Format token amounts
export function formatTokenAmount(amount, decimals = 4) {
  if (amount === 0) return "0"
  if (amount < 0.0001) return "< 0.0001"

  return Number.parseFloat(amount).toFixed(decimals)
}

// Format percentage
export function formatPercentage(value, decimals = 2) {
  if (value === 0) return "0.00%"

  const sign = value > 0 ? "+" : ""
  return sign + value.toFixed(decimals) + "%"
}

// Format address for display
export function formatAddress(address, startChars = 6, endChars = 4) {
  if (!address) return ""
  if (address.length <= startChars + endChars) return address

  return `${address.slice(0, startChars)}...${address.slice(-endChars)}`
}

// Format time ago
export function formatTimeAgo(timestamp) {
  const now = Date.now()
  const diff = now - timestamp

  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return `${days}d ago`
  if (hours > 0) return `${hours}h ago`
  if (minutes > 0) return `${minutes}m ago`
  return `${seconds}s ago`
}

// Debounce function
export function debounce(func, wait) {
  let timeout
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout)
      func(...args)
    }
    clearTimeout(timeout)
    timeout = setTimeout(later, wait)
  }
}

// Throttle function
export function throttle(func, limit) {
  let inThrottle
  return function () {
    const args = arguments
    
    if (!inThrottle) {
      func.apply(this, args)
      inThrottle = true
      setTimeout(() => (inThrottle = false), limit)
    }
  }
}

// Generate unique ID
export function generateId() {
  return Math.random().toString(36).substr(2, 9)
}

// Deep clone object
export function deepClone(obj) {
  if (obj === null || typeof obj !== "object") return obj
  if (obj instanceof Date) return new Date(obj.getTime())
  if (obj instanceof Array) return obj.map((item) => deepClone(item))
  if (typeof obj === "object") {
    const clonedObj = {}
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        clonedObj[key] = deepClone(obj[key])
      }
    }
    return clonedObj
  }
}

// Validate email
export function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

// Validate Massa address
export function isValidMassaAddress(address) {
  if (!address || typeof address !== "string") return false

  // Massa addresses start with 'AS' and are 51 characters long
  const massaAddressRegex = /^AS[1-9A-HJ-NP-Za-km-z]{49}$/
  return massaAddressRegex.test(address)
}

// Calculate price impact
export function calculatePriceImpact(inputAmount, outputAmount, inputReserve, outputReserve) {
  if (!inputAmount || !outputAmount || !inputReserve || !outputReserve) return 0

  const spotPrice = outputReserve / inputReserve
  const executionPrice = outputAmount / inputAmount
  const priceImpact = ((spotPrice - executionPrice) / spotPrice) * 100

  return Math.abs(priceImpact)
}

// Calculate slippage
export function calculateSlippage(expectedAmount, actualAmount) {
  if (!expectedAmount || !actualAmount) return 0

  const slippage = ((expectedAmount - actualAmount) / expectedAmount) * 100
  return Math.abs(slippage)
}

// Get token pair key
export function getTokenPairKey(tokenA, tokenB) {
  return [tokenA, tokenB].sort().join("-")
}

// Parse token amount with decimals
export function parseTokenAmount(amount, decimals = 18) {
  if (!amount) return 0
  return Number.parseFloat(amount) * Math.pow(10, decimals)
}

// Format token amount from wei
export function formatFromWei(amount, decimals = 18) {
  if (!amount) return 0
  return Number.parseFloat(amount) / Math.pow(10, decimals)
}

// Color utilities
export function hexToRgba(hex, alpha = 1) {
  const r = Number.parseInt(hex.slice(1, 3), 16)
  const g = Number.parseInt(hex.slice(3, 5), 16)
  const b = Number.parseInt(hex.slice(5, 7), 16)

  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// Local storage utilities
export const storage = {
  get(key, defaultValue = null) {
    try {
      const item = localStorage.getItem(key)
      return item ? JSON.parse(item) : defaultValue
    } catch (error) {
      console.error("Error reading from localStorage:", error)
      return defaultValue
    }
  },

  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value))
      return true
    } catch (error) {
      console.error("Error writing to localStorage:", error)
      return false
    }
  },

  remove(key) {
    try {
      localStorage.removeItem(key)
      return true
    } catch (error) {
      console.error("Error removing from localStorage:", error)
      return false
    }
  },

  clear() {
    try {
      localStorage.clear()
      return true
    } catch (error) {
      console.error("Error clearing localStorage:", error)
      return false
    }
  },
}

// URL utilities
export function getQueryParams() {
  const params = new URLSearchParams(window.location.search)
  const result = {}
  for (const [key, value] of params) {
    result[key] = value
  }
  return result
}

export function setQueryParam(key, value) {
  const url = new URL(window.location)
  url.searchParams.set(key, value)
  window.history.replaceState({}, "", url)
}

export function removeQueryParam(key) {
  const url = new URL(window.location)
  url.searchParams.delete(key)
  window.history.replaceState({}, "", url)
}

// Animation utilities
export function animateValue(start, end, duration, callback) {
  const startTime = performance.now()

  function animate(currentTime) {
    const elapsed = currentTime - startTime
    const progress = Math.min(elapsed / duration, 1)

    // Easing function (ease-out)
    const easeOut = 1 - Math.pow(1 - progress, 3)
    const currentValue = start + (end - start) * easeOut

    callback(currentValue)

    if (progress < 1) {
      requestAnimationFrame(animate)
    }
  }

  requestAnimationFrame(animate)
}

// Error handling utilities
export function handleError(error, context = "") {
  console.error(`Error in ${context}:`, error)

  let message = "An unexpected error occurred"

  if (error.message) {
    message = error.message
  } else if (typeof error === "string") {
    message = error
  }

  // Show error to user
  showError(message)

  return message
}

// Show error message
export function showError(message) {
  const errorElement = document.getElementById("errorMessage")
  if (errorElement) {
    errorElement.textContent = message
    errorElement.classList.add("visible")
    setTimeout(() => {
      errorElement.classList.remove("visible")
    }, 5000)
  }
}

// Show success message
export function showSuccess(message) {
  const successElement = document.getElementById("successMessage")
  if (successElement) {
    successElement.textContent = message
    successElement.classList.add("visible")
    setTimeout(() => {
      successElement.classList.remove("visible")
    }, 3000)
  }
}

// Show loading overlay
export function showLoading(message = "Processing...") {
  const loadingOverlay = document.getElementById("loadingOverlay")
  const loadingText = loadingOverlay?.querySelector(".loading-text")

  if (loadingOverlay) {
    if (loadingText) {
      loadingText.textContent = message
    }
    loadingOverlay.classList.add("visible")
  }
}

// Hide loading overlay
export function hideLoading() {
  const loadingOverlay = document.getElementById("loadingOverlay")
  if (loadingOverlay) {
    loadingOverlay.classList.remove("visible")
  }
}

// Copy to clipboard
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text)
    showSuccess("Copied to clipboard")
    return true
  } catch (error) {
    console.error("Failed to copy to clipboard:", error)
    showError("Failed to copy to clipboard")
    return false
  }
}

// Download data as file
export function downloadAsFile(data, filename, type = "application/json") {
  const blob = new Blob([data], { type })
  const url = URL.createObjectURL(blob)

  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  URL.revokeObjectURL(url)
}

// Retry function with exponential backoff
export async function retry(fn, maxAttempts = 3, baseDelay = 1000) {
  let lastError

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error

      if (attempt === maxAttempts) {
        throw lastError
      }

      const delay = baseDelay * Math.pow(2, attempt - 1)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
}

// Check if device is mobile
export function isMobile() {
  return window.innerWidth <= 768
}

// Check if device supports touch
export function isTouchDevice() {
  return "ontouchstart" in window || navigator.maxTouchPoints > 0
}

// Get device type
export function getDeviceType() {
  const width = window.innerWidth

  if (width < 768) return "mobile"
  if (width < 1024) return "tablet"
  return "desktop"
}

// Scroll to element
export function scrollToElement(elementId, offset = 0) {
  const element = document.getElementById(elementId)
  if (element) {
    const elementPosition = element.getBoundingClientRect().top
    const offsetPosition = elementPosition + window.pageYOffset - offset

    window.scrollTo({
      top: offsetPosition,
      behavior: "smooth",
    })
  }
}

// Check if element is in viewport
export function isInViewport(element) {
  const rect = element.getBoundingClientRect()
  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
    rect.right <= (window.innerWidth || document.documentElement.clientWidth)
  )
}

// Wait for element to exist
export function waitForElement(selector, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const element = document.querySelector(selector)
    if (element) {
      resolve(element)
      return
    }

    const observer = new MutationObserver((mutations, obs) => {
      const element = document.querySelector(selector)
      if (element) {
        obs.disconnect()
        resolve(element)
      }
    })

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    })

    setTimeout(() => {
      observer.disconnect()
      reject(new Error(`Element ${selector} not found within ${timeout}ms`))
    }, timeout)
  })
}

// Constants
export const CONSTANTS = {
  MASSA_DECIMALS: 9,
  USDC_DECIMALS: 6,
  DEFAULT_SLIPPAGE: 0.5,
  MAX_SLIPPAGE: 50,
  REFRESH_INTERVAL: 30000, // 30 seconds
  TRANSACTION_TIMEOUT: 60000, // 1 minute
  DEBOUNCE_DELAY: 300,
  THROTTLE_DELAY: 1000,

  // Token addresses (these would be real addresses in production)
  TOKENS: {
    MAS: "AS12mFfp7XA8U5QyRPBWNT5V5BLeEMxuoxHft5Ph8y9uGH2SecDXw",
    USDC: "AS12mFfp7XA8U5QyRPBWNT5V5BLeEMxuoxHft5Ph8y9uGH2SecDXw",
    WETH: "AS12mFfp7XA8U5QyRPBWNT5V5BLeEMxuoxHft5Ph8y9uGH2SecDXw",
    DAI: "AS12mFfp7XA8U5QyRPBWNT5V5BLeEMxuoxHft5Ph8y9uGH2SecDXw",
  },

  // Order types
  ORDER_TYPES: {
    LIMIT: "limit",
    STOP_LOSS: "stop-loss",
    TAKE_PROFIT: "take-profit",
  },

  // DCA frequencies
  DCA_FREQUENCIES: {
    "1h": 3600,
    "4h": 14400,
    "12h": 43200,
    "1d": 86400,
    "3d": 259200,
    "1w": 604800,
  },

  // Status types
  STATUS: {
    PENDING: "pending",
    ACTIVE: "active",
    COMPLETED: "completed",
    CANCELLED: "cancelled",
    FAILED: "failed",
  },
}
