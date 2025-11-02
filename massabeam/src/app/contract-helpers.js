/**
 * Contract Helpers Module
 *
 * Utility functions for interacting with smart contracts
 * Handles contract calls, reads, gas estimation, and error handling
 */

import { Args, SmartContract, Mas } from "@massalabs/massa-web3";
import { getProvider } from './main.js';
import { showError, showLoading } from './ui.js';

// ============================================================================
// CONTRACT INTERACTION
// ============================================================================

/**
 * Call a contract function (write operation)
 *
 * @param {string} contractAddress - Contract address
 * @param {string} functionName - Function name
 * @param {Uint8Array|string} args - Serialized arguments
 * @param {Object} options - Call options (coins, gasLimit, etc.)
 * @returns {Promise} Operation result
 */
export async function callContract(
  contractAddress,
  functionName,
  args,
  options = {}
) {
  try {
    showLoading(true);

    const provider = getProvider();
    if (!provider) {
      throw new Error('Provider not initialized. Please connect wallet.');
    }

    const contract = new SmartContract(provider, contractAddress);

    const defaultOptions = {
      coins: Mas.fromString('0.1'),
      gasLimit: 30_000_000,
      ...options,
    };

    console.log(`Calling ${functionName} on ${contractAddress.slice(0, 10)}...`);
    console.log('Arguments:', args);

    const result = await contract.call(
      provider,
      functionName,
      args instanceof Uint8Array ? args : new Args(args).serialize(),
      defaultOptions
    );

    console.log(`${functionName} executed:`, result);
    showLoading(false);

    return result;
  } catch (error) {
    showLoading(false);
    console.error(`Contract call failed: ${functionName}`, error);
    showError(`Failed to execute ${functionName}: ${error.message}`);
    throw error;
  }
}

/**
 * Read contract state (read-only operation)
 *
 * @param {string} contractAddress - Contract address
 * @param {string} functionName - Function name
 * @param {Uint8Array|string} args - Serialized arguments
 * @returns {Promise<Uint8Array>} Raw result data
 */
export async function readContract(
  contractAddress,
  functionName,
  args = null
) {
  try {
    const provider = getProvider();
    if (!provider) {
      throw new Error('Provider not initialized. Please connect wallet.');
    }

    const contract = new SmartContract(provider, contractAddress);

    const argsData = args instanceof Uint8Array ? args : (args ? new Args(args).serialize() : new Uint8Array());

    console.log(`Reading ${functionName} from ${contractAddress.slice(0, 10)}...`);

    const result = await contract.read(functionName, argsData);

    console.log(`${functionName} result:`, result);

    return result;
  } catch (error) {
    console.error(`Contract read failed: ${functionName}`, error);
    throw error;
  }
}

/**
 * Call contract with retry logic
 */
export async function callContractWithRetry(
  contractAddress,
  functionName,
  args,
  options = {},
  maxRetries = 3
) {
  let lastError;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await callContract(contractAddress, functionName, args, options);
    } catch (error) {
      lastError = error;
      console.warn(`Attempt ${i + 1} failed, retrying...`);
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }

  throw lastError;
}

/**
 * Batch call multiple contract functions
 */
export async function batchCallContract(calls) {
  const results = [];

  for (const call of calls) {
    try {
      const result = await callContract(
        call.address,
        call.function,
        call.args,
        call.options
      );
      results.push({ success: true, result });
    } catch (error) {
      results.push({ success: false, error: error.message });
    }
  }

  return results;
}

// ============================================================================
// GAS ESTIMATION
// ============================================================================

/**
 * Estimate gas for a contract call
 */
export async function estimateGas(
  contractAddress,
  functionName,
  args
) {
  try {
    // Note: Massa doesn't have a standard gas estimation RPC method
    // This is a placeholder that returns a reasonable estimate
    // In practice, you might use historical data or a fixed amount

    const baseGas = 10_000_000; // Base gas for any call
    const argSize = args?.length || 0;
    const perByteGas = 100;

    return baseGas + (argSize * perByteGas);
  } catch (error) {
    console.error('Gas estimation failed:', error);
    return 30_000_000; // Default fallback
  }
}

// ============================================================================
// ARGUMENT BUILDERS
// ============================================================================

/**
 * Build arguments for common operations
 */
export const ArgBuilders = {
  /**
   * Build swap arguments
   */
  buildSwapArgs(tokenIn, tokenOut, amountIn, minAmountOut, deadline) {
    return new Args()
      .addString(tokenIn)
      .addString(tokenOut)
      .addU64(BigInt(amountIn))
      .addU64(BigInt(minAmountOut))
      .addU64(BigInt(deadline));
  },

  /**
   * Build liquidity arguments
   */
  buildLiquidityArgs(tokenA, tokenB, amountA, amountB, minA, minB, deadline) {
    return new Args()
      .addString(tokenA)
      .addString(tokenB)
      .addU64(BigInt(amountA))
      .addU64(BigInt(amountB))
      .addU64(BigInt(minA))
      .addU64(BigInt(minB))
      .addU64(BigInt(deadline));
  },

  /**
   * Build pool creation arguments
   */
  buildPoolArgs(tokenA, tokenB, amountA, amountB, fee = 3000) {
    return new Args()
      .addString(tokenA)
      .addString(tokenB)
      .addU64(BigInt(amountA))
      .addU64(BigInt(amountB))
      .addU64(BigInt(fee));
  },

  /**
   * Build quote arguments
   */
  buildQuoteArgs(tokenIn, tokenOut, amount) {
    return new Args()
      .addString(tokenIn)
      .addString(tokenOut)
      .addU64(BigInt(amount));
  },
};

// ============================================================================
// ERROR HANDLING
// ============================================================================

/**
 * Parse contract error
 */
export function parseContractError(error) {
  if (!error) return 'Unknown error';

  if (typeof error === 'string') {
    return error;
  }

  if (error.message) {
    // Extract useful error info
    if (error.message.includes('InsufficientBalance')) {
      return 'Insufficient balance';
    }
    if (error.message.includes('Deadline')) {
      return 'Transaction expired. Please try again.';
    }
    if (error.message.includes('Slippage')) {
      return 'Slippage exceeded. Please adjust tolerance.';
    }
    if (error.message.includes('InvalidPool')) {
      return 'Pool does not exist';
    }

    return error.message;
  }

  return 'Transaction failed. Please try again.';
}

/**
 * Handle contract error with user-friendly message
 */
export function handleContractError(error, defaultMessage = 'Operation failed') {
  const message = parseContractError(error);
  showError(message || defaultMessage);
  console.error('Contract error:', error);
}

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

/**
 * Contract state cache
 */
class StateCache {
  constructor(ttl = 60000) {
    this.cache = new Map();
    this.ttl = ttl;
  }

  set(key, value) {
    this.cache.set(key, { value, timestamp: Date.now() });
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;

    const isExpired = Date.now() - item.timestamp > this.ttl;
    if (isExpired) {
      this.cache.delete(key);
      return null;
    }

    return item.value;
  }

  clear() {
    this.cache.clear();
  }

  invalidate(key) {
    this.cache.delete(key);
  }
}

export const stateCache = new StateCache();

/**
 * Get cached state or fetch it
 */
export async function getCachedState(key, fetchFn) {
  const cached = stateCache.get(key);
  if (cached !== null) {
    return cached;
  }

  const value = await fetchFn();
  stateCache.set(key, value);
  return value;
}

/**
 * Clear all cached state
 */
export function clearStateCache() {
  stateCache.clear();
}

/**
 * Invalidate specific cached state
 */
export function invalidateCache(key) {
  stateCache.invalidate(key);
}

// ============================================================================
// MONITORING
// ============================================================================

/**
 * Wait for operation to be confirmed
 */
export async function waitForConfirmation(
  operationId,
  maxAttempts = 30,
  interval = 2000
) {
  const provider = getProvider();
  if (!provider) throw new Error('Provider not initialized');

  for (let i = 0; i < maxAttempts; i++) {
    try {
      // In a real implementation, you would check the operation status
      // via the Massa RPC API
      console.log(`Checking operation ${operationId}... (${i + 1}/${maxAttempts})`);

      // For now, just wait the interval
      await new Promise(resolve => setTimeout(resolve, interval));

      // You would check actual status here:
      // const status = await provider.getOperationStatus(operationId);
      // if (status === 'confirmed') return true;
    } catch (error) {
      console.error('Failed to check operation status:', error);
    }
  }

  throw new Error('Operation confirmation timeout');
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Validate contract address
 */
export function isValidContractAddress(address) {
  if (!address) return false;
  // Massa addresses start with 'A' and are 36 characters
  return address.startsWith('A') && address.length === 36;
}

/**
 * Convert response to string
 */
export function responseToString(response) {
  if (response instanceof Uint8Array) {
    return new TextDecoder().decode(response);
  }
  return String(response);
}

/**
 * Convert response to number
 */
export function responseToNumber(response) {
  return Number(responseToString(response));
}

/**
 * Convert response to BigInt
 */
export function responseToBigInt(response) {
  return BigInt(responseToString(response));
}

export default {
  callContract,
  readContract,
  callContractWithRetry,
  batchCallContract,
  estimateGas,
  ArgBuilders,
  parseContractError,
  handleContractError,
  stateCache,
  getCachedState,
  clearStateCache,
  invalidateCache,
  waitForConfirmation,
  isValidContractAddress,
  responseToString,
  responseToNumber,
  responseToBigInt,
};
