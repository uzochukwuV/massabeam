/**
 * Token Service Module
 *
 * Manages token metadata, balances, and interactions
 * Supports IERC20 standard tokens on Massa blockchain
 */

import { Args, bytesToStr, MRC20 } from "@massalabs/massa-web3";
import { DAI, USDC, WETH, USDT, WBTC, WETH_B } from '@dusalabs/sdk';
import { getProvider, getUserAddress } from './main.js';

// ============================================================================
// TOKEN REGISTRY
// ============================================================================

/**
 * Token information object
 */
export class Token {
  constructor(address, symbol, name, decimals, icon = null, coingeckoId = null) {
    this.address = address;
    this.symbol = symbol;
    this.name = name;
    this.decimals = decimals;
    this.icon = icon;
    this.coingeckoId = coingeckoId;
  }

  /**
   * Get display format for amount
   */
  formatAmount(amount, showSymbol = true) {
    if (typeof amount === 'bigint') {
      amount = Number(amount) / Math.pow(10, this.decimals);
    }
    const formatted = amount.toFixed(this.decimals).replace(/\.?0+$/, '');
    return showSymbol ? `${formatted} ${this.symbol}` : formatted;
  }
}

// Initialize token registry with Dusa SDK tokens
const DEFAULT_TOKENS = [
  new Token(DAI[0].address, 'DAI', 'Dai Stablecoin', 18, '🔵', 'dai'),
  new Token(USDC[0].address, 'USDC', 'USD Coin', 6, '🟦', 'usd-coin'),
  new Token(WETH[0].address, 'WETH', 'Wrapped Ether', 18, '⟠', 'ethereum'),
  new Token(USDT[0].address, 'USDT', 'Tether', 6, '🟢', 'tether'),
  new Token(WBTC[0].address, 'WBTC', 'Wrapped Bitcoin', 8, '🟠', 'wrapped-bitcoin'),
  new Token(WETH_B[0].address, 'WETH-B', 'Wrapped Ether (Buildnet)', 18, '⟠', 'ethereum'),
];

// ============================================================================
// TOKEN MANAGEMENT
// ============================================================================

export class TokenService {
  constructor() {
    this.tokens = new Map();
    this.balances = new Map();
    this.prices = new Map();
    this.tokenCache = new Map();

    // Initialize with default tokens
    DEFAULT_TOKENS.forEach(token => {
      this.tokens.set(token.address, token);
    });
  }

  /**
   * Register a custom token
   */
  registerToken(address, symbol, name, decimals, icon = null) {
    const token = new Token(address, symbol, name, decimals, icon);
    this.tokens.set(address, token);
    this.tokens.set(token, token);
    return token;
  }

  /**
   * Get token by address
   */
  getToken(address) {
    return this.tokens.get(address);
  }

  /**
   * Get all tokens
   */
  getAllTokens() {
    return Array.from(this.tokens.values());
  }

  /**
   * Get tokens by symbol
   */
  getTokenBySymbol(symbol) {
    return Array.from(this.tokens.values()).find(t => t.symbol === symbol);
  }

  /**
   * Get token balance
   */
  async getBalance(tokenAddress, userAddress = null) {
    userAddress = userAddress || getUserAddress();
    console.log('Getting balance for', tokenAddress, 'and user', userAddress);
    if (!userAddress) throw new Error('User address required');

    try {
      const token = this.getToken(tokenAddress);
      if (!token) throw new Error(`Token ${tokenAddress} not found`);

      const provider = getProvider();
      if (!provider) throw new Error('Provider not initialized. Please connect wallet.');
      // const b = await provider.balanceOf(userAddress)
      // console.log('Balance from provider:', b);
      // Use MRC20 interface to get balance
      const mrc20 = new MRC20(provider,tokenAddress);
      const balance = await mrc20.balanceOf(userAddress);
      console.log('Token name:', balance);

      this.balances.set(`${tokenAddress}:${userAddress}`, balance);
      return balance;
    } catch (error) {
      console.error(`Failed to get balance for ${tokenAddress}:`, error);
      return 0n;
    }
  }

  /**
   * Get multiple balances
   */
  async getBalances(tokenAddresses, userAddress = null) {
    userAddress = userAddress || getUserAddress();
    const balances = {};

    for (const address of tokenAddresses) {
      balances[address] = await this.getBalance(address, userAddress);
    }

    return balances;
  }

  /**
   * Format balance for display
   */
  formatBalance(tokenAddress, balance) {
    const token = this.getToken(tokenAddress);
    if (!token) return balance.toString();
    return token.formatAmount(balance);
  }

  /**
   * Get token allowance
   */
  async getAllowance(tokenAddress, spenderAddress, userAddress = null) {
    userAddress = userAddress || getUserAddress();
    if (!userAddress) throw new Error('User address required');

    try {
      const mrc20 = new MRC20(tokenAddress);
      const allowance = await mrc20.allowance(userAddress, spenderAddress);
      return allowance;
    } catch (error) {
      console.error(`Failed to get allowance:`, error);
      return 0n;
    }
  }

  /**
   * Approve token spending
   */
  async approve(tokenAddress, spenderAddress, amount) {
    try {
      const mrc20 = new MRC20(tokenAddress);
      const result = await mrc20.increaseAllowance(spenderAddress, amount);
      return result;
    } catch (error) {
      console.error('Approval failed:', error);
      throw error;
    }
  }

  /**
   * Transfer token
   */
  async transfer(tokenAddress, recipientAddress, amount) {
    try {
      const mrc20 = new MRC20(tokenAddress);
      const result = await mrc20.transfer(recipientAddress, amount);
      return result;
    } catch (error) {
      console.error('Transfer failed:', error);
      throw error;
    }
  }

  /**
   * Get token total supply
   */
  async getTotalSupply(tokenAddress) {
    try {
      const mrc20 = new MRC20(tokenAddress);
      const supply = await mrc20.totalSupply();
      return supply;
    } catch (error) {
      console.error(`Failed to get total supply:`, error);
      return 0n;
    }
  }

  /**
   * Get token decimals
   */
  async getDecimals(tokenAddress) {
    const token = this.getToken(tokenAddress);
    if (token) return token.decimals;

    try {
      const mrc20 = new MRC20(tokenAddress);
      const decimals = await mrc20.decimals();
      return decimals;
    } catch (error) {
      console.error(`Failed to get decimals:`, error);
      return 18; // Default to 18
    }
  }

  /**
   * Check if token is valid (can be interacted with)
   */
  async isValidToken(tokenAddress) {
    try {
      const mrc20 = new MRC20(tokenAddress);
      await mrc20.totalSupply();
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get token price (from cache or CoinGecko)
   */
  async getPrice(tokenAddress) {
    const cached = this.prices.get(tokenAddress);
    if (cached && cached.timestamp > Date.now() - 60000) { // Cache for 1 minute
      return cached.price;
    }

    const token = this.getToken(tokenAddress);
    if (!token || !token.coingeckoId) {
      return null;
    }

    try {
      const response = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${token.coingeckoId}&vs_currencies=usd`
      );
      const data = await response.json();
      const price = data[token.coingeckoId]?.usd;

      if (price) {
        this.prices.set(tokenAddress, { price, timestamp: Date.now() });
      }

      return price;
    } catch (error) {
      console.error(`Failed to get price for ${token.symbol}:`, error);
      return null;
    }
  }

  /**
   * Get multiple token prices
   */
  async getPrices(tokenAddresses) {
    const prices = {};

    for (const address of tokenAddresses) {
      prices[address] = await this.getPrice(address);
    }

    return prices;
  }

  /**
   * Get token with balance and price
   */
  async getTokenWithDetails(address, userAddress = null) {
    const token = this.getToken(address);
    if (!token) return null;

    const [balance, price] = await Promise.all([
      this.getBalance(address, userAddress),
      this.getPrice(address),
    ]);

    return {
      ...token,
      balance,
      balanceFormatted: token.formatAmount(balance),
      price,
      value: price ? (Number(balance) / Math.pow(10, token.decimals)) * price : 0,
    };
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

export const tokenService = new TokenService();

/**
 * Quick access functions
 */

export async function getTokenBalance(tokenAddress) {
  return tokenService.getBalance(tokenAddress);
}

export async function getTokenPrices(tokenAddresses) {
  return tokenService.getPrices(tokenAddresses);
}

export function getTokenByAddress(address) {
  return tokenService.getToken(address);
}

export function getAllTokens() {
  return tokenService.getAllTokens();
}

export function formatTokenAmount(tokenAddress, amount) {
  return tokenService.formatBalance(tokenAddress, amount);
}

// ============================================================================
// TOKEN SELECTOR HELPER
// ============================================================================

/**
 * Populate token select dropdown
 */
export function populateTokenSelect(selectElementId, selectedAddress = null) {
  const select = document.getElementById(selectElementId);
  if (!select) return;

  const tokens = tokenService.getAllTokens();
  select.innerHTML = '';

  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = 'Select Token';
  select.appendChild(defaultOption);

  tokens.forEach(token => {
    const option = document.createElement('option');
    console.log(token);
    option.value = token.address;
    option.textContent = `${token.icon || ''} ${token.symbol} - ${token.name}`;
    select.appendChild(option);

    if (selectedAddress && token.address === selectedAddress) {
      option.selected = true;
    }
  });
}

/**
 * Populate multiple token selects
 */
export function populateTokenSelects(selectIds, exclude = null) {
  selectIds.forEach(id => {
    populateTokenSelect(id, exclude);
  });
}

// ============================================================================
// TOKEN SEARCH & FILTER
// ============================================================================

/**
 * Search tokens by query
 */
export function searchTokens(query) {
  const lower = query.toLowerCase();
  return tokenService.getAllTokens().filter(token => {
    return (
      token.symbol.toLowerCase().includes(lower) ||
      token.name.toLowerCase().includes(lower) ||
      token.address.toLowerCase().includes(lower)
    );
  });
}

/**
 * Get common token pairs
 */
export function getCommonPairs() {
  const tokens = tokenService.getAllTokens();
  const pairs = [];

  for (let i = 0; i < tokens.length; i++) {
    for (let j = i + 1; j < tokens.length; j++) {
      pairs.push({
        tokenA: tokens[i],
        tokenB: tokens[j],
        pair: `${tokens[i].symbol}/${tokens[j].symbol}`,
      });
    }
  }

  return pairs;
}

export default {
  Token,
  TokenService,
  tokenService,
  getTokenBalance,
  getTokenPrices,
  getTokenByAddress,
  getAllTokens,
  formatTokenAmount,
  populateTokenSelect,
  populateTokenSelects,
  searchTokens,
  getCommonPairs,
};
