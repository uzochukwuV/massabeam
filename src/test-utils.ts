/**
 * Shared Test Utilities for MassaBeam Test Suite
 *
 * Provides:
 * - Type-safe contract interactions
 * - Retry mechanisms with exponential backoff
 * - Transaction confirmation helpers
 * - Logging utilities
 * - Token balance & allowance helpers
 * - Configuration management
 *
 * @version 2.0.0
 */

import {
  Account,
  Args,
  Mas,
  SmartContract,
  JsonRpcProvider,
  bytesToStr,
  bytesToU64,
} from '@massalabs/massa-web3';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// TYPES
// ============================================================================

export interface DeployedAddresses {
  massaBeam: string;
  smartSwap: string;
  arbitrageEngine: string;
  limitOrders: string;
  recurringOrders: string;
}

export interface TokenInfo {
  symbol: string;
  address: string;
  decimals: number;
}

export interface TestConfig {
  network: 'buildnet' | 'mainnet';
  rpcUrl?: string;
  gasLimit: number;
  confirmations: number;
  retryAttempts: number;
  retryDelay: number;
}

export interface TransactionReceipt {
  success: boolean;
  txHash: string;
  gasUsed?: number;
  error?: string;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

export const DEFAULT_CONFIG: TestConfig = {
  network: 'buildnet',
  gasLimit: 5_000_000_000,
  confirmations: 1,
  retryAttempts: 3,
  retryDelay: 2000,
};

// ============================================================================
// LOGGING UTILITIES
// ============================================================================

export class Logger {
  static log(title: string, message: string): void {
    console.log(`  ${title.padEnd(30)} ${message}`);
  }

  static section(title: string): void {
    console.log(`\n${'═'.repeat(70)}`);
    console.log(`  ${title}`);
    console.log(`${'═'.repeat(70)}`);
  }

  static success(message: string): void {
    console.log(`  ✅ ${message}`);
  }

  static error(message: string): void {
    console.log(`  ❌ ${message}`);
  }

  static info(message: string): void {
    console.log(`  ℹ️  ${message}`);
  }

  static warn(message: string): void {
    console.log(`  ⚠️  ${message}`);
  }

  static debug(message: string, data?: any): void {
    if (process.env.DEBUG === 'true') {
      console.log(`  🔍 ${message}`, data || '');
    }
  }
}

// ============================================================================
// FILE SYSTEM UTILITIES
// ============================================================================

/**
 * Load WASM bytecode from build directory
 */
export function loadWasm(filename: string): Uint8Array {
  const possiblePaths = [
    path.join(process.cwd(), 'build', filename),
    path.join(__dirname, '..', 'build', filename),
    path.join(__dirname, '..', '..', 'build', filename),
  ];

  for (const wasmPath of possiblePaths) {
    if (fs.existsSync(wasmPath)) {
      Logger.debug(`Found WASM at: ${wasmPath}`);
      const buffer = fs.readFileSync(wasmPath);
      return Uint8Array.from(buffer);
    }
  }

  throw new Error(`WASM file not found: ${filename}. Tried: ${possiblePaths.join(', ')}`);
}

/**
 * Load deployed contract addresses
 */
export function loadDeployedAddresses(): Partial<DeployedAddresses> {
  const addressPath = path.join(process.cwd(), 'deployed-addresses.json');

  if (!fs.existsSync(addressPath)) {
    Logger.warn('deployed-addresses.json not found');
    return {};
  }

  try {
    const data = JSON.parse(fs.readFileSync(addressPath, 'utf-8'));
    return data.contracts || {};
  } catch (error) {
    Logger.error(`Failed to load addresses: ${error}`);
    return {};
  }
}

/**
 * Save deployed contract addresses
 */
export function saveDeployedAddresses(addresses: Partial<DeployedAddresses>): void {
  const addressPath = path.join(process.cwd(), 'deployed-addresses.json');

  let existing: any = {};
  if (fs.existsSync(addressPath)) {
    existing = JSON.parse(fs.readFileSync(addressPath, 'utf-8'));
  }

  const updated = {
    ...existing,
    contracts: {
      ...existing.contracts,
      ...addresses,
    },
    lastUpdated: new Date().toISOString(),
  };

  fs.writeFileSync(addressPath, JSON.stringify(updated, null, 2));
  Logger.success(`Addresses saved to ${addressPath}`);
}

// ============================================================================
// ACCOUNT & PROVIDER UTILITIES
// ============================================================================

/**
 * Initialize account and provider with validation
 */
export async function initializeAccount(config: TestConfig = DEFAULT_CONFIG): Promise<{
  account: Account;
  provider: JsonRpcProvider;
}> {
  Logger.section('🔑 ACCOUNT INITIALIZATION');

  const account = await Account.fromEnv();
  Logger.log('Address', account.address.toString());
  Logger.log('Public Key', account.publicKey.toString().slice(0, 20) + '...');

  const provider = config.network === 'buildnet'
    ? JsonRpcProvider.buildnet(account)
    : JsonRpcProvider.mainnet(account);

  // Check balance
  const balances = await provider.balanceOf([account.address.toString()]);
  const balance = balances[0].balance;
  Logger.log('Balance', `${balance.toString()} MAS`);

  if (Number(balance.toString()) < 1) {
    throw new Error('Insufficient MAS balance. Need at least 1 MAS for transactions.');
  }

  Logger.success('Account initialized');
  return { account, provider };
}

// ============================================================================
// RETRY UTILITIES
// ============================================================================

/**
 * Sleep utility
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 2000,
  context: string = 'Operation'
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      Logger.debug(`${context} - Attempt ${attempt + 1}/${maxRetries}`);
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt);
        Logger.warn(`${context} failed, retrying in ${delay}ms...`);
        await sleep(delay);
      }
    }
  }

  throw new Error(`${context} failed after ${maxRetries} attempts: ${lastError?.message}`);
}

// ============================================================================
// TOKEN UTILITIES
// ============================================================================

/**
 * Get token balance
 */
export async function getTokenBalance(
  provider: JsonRpcProvider,
  tokenAddress: string,
  accountAddress: string
): Promise<bigint> {
  const tokenContract = new SmartContract(provider, tokenAddress);
  const result = await tokenContract.read('balanceOf', new Args().addString(accountAddress));

  if (!result.value || result.value.length === 0) {
    return 0n;
  }

  return BigInt(bytesToU64(result.value));
}

/**
 * Get token allowance
 */
export async function getTokenAllowance(
  provider: JsonRpcProvider,
  tokenAddress: string,
  ownerAddress: string,
  spenderAddress: string
): Promise<bigint> {
  const tokenContract = new SmartContract(provider, tokenAddress);
  const result = await tokenContract.read(
    'allowance',
    new Args().addString(ownerAddress).addString(spenderAddress)
  );

  if (!result.value || result.value.length === 0) {
    return 0n;
  }

  return BigInt(bytesToU64(result.value));
}

/**
 * Approve token spending
 */
export async function approveToken(
  provider: JsonRpcProvider,
  tokenAddress: string,
  spenderAddress: string,
  amount: bigint,
  symbol: string = 'Token'
): Promise<boolean> {
  Logger.info(`Approving ${symbol} for ${spenderAddress.slice(0, 10)}...`);

  try {
    const tokenContract = new SmartContract(provider, tokenAddress);

    await retryWithBackoff(
      async () => {
        await tokenContract.call(
          'increaseAllowance',
          new Args().addString(spenderAddress).addU256(amount),
          { coins: Mas.fromString('0.01') }
        );
      },
      3,
      2000,
      `Approve ${symbol}`
    );

    Logger.success(`${symbol} approved`);
    await sleep(2000); // Wait for block confirmation
    return true;
  } catch (error) {
    Logger.error(`Failed to approve ${symbol}: ${error}`);
    return false;
  }
}

/**
 * Validate sufficient balance and allowance
 */
export async function validateTokenOperation(
  provider: JsonRpcProvider,
  tokenAddress: string,
  accountAddress: string,
  spenderAddress: string,
  requiredAmount: bigint,
  symbol: string = 'Token'
): Promise<{ hasBalance: boolean; hasAllowance: boolean; needsApproval: boolean }> {
  const balance = await getTokenBalance(provider, tokenAddress, accountAddress);
  const allowance = await getTokenAllowance(provider, tokenAddress, accountAddress, spenderAddress);

  const hasBalance = balance >= requiredAmount;
  const hasAllowance = allowance >= requiredAmount;
  const needsApproval = hasBalance && !hasAllowance;

  Logger.debug(`Token validation for ${symbol}:`, {
    balance: balance.toString(),
    required: requiredAmount.toString(),
    allowance: allowance.toString(),
    hasBalance,
    hasAllowance,
    needsApproval,
  });

  if (!hasBalance) {
    Logger.warn(`Insufficient ${symbol} balance. Have: ${balance}, Need: ${requiredAmount}`);
  }

  return { hasBalance, hasAllowance, needsApproval };
}

// ============================================================================
// CONTRACT INTERACTION UTILITIES
// ============================================================================

/**
 * Deploy contract with validation
 */
export async function deployContract(
  provider: JsonRpcProvider,
  wasmFilename: string,
  constructorArgs: Args,
  deploymentCost: string = '2',
  contractName: string = 'Contract'
): Promise<SmartContract> {
  Logger.section(`🚀 DEPLOYING ${contractName.toUpperCase()}`);

  // Load WASM
  Logger.info(`Loading ${wasmFilename}...`);
  const wasmBytes = loadWasm(wasmFilename);
  Logger.log('WASM Size', `${(wasmBytes.length / 1024).toFixed(2)} KB`);

  // Deploy
  Logger.info(`Deploying ${contractName}...`);
  const contract = await retryWithBackoff(
    async () => {
      return await SmartContract.deploy(
        provider,
        wasmBytes,
        constructorArgs,
        { coins: Mas.fromString(deploymentCost) }
      );
    },
    3,
    3000,
    `Deploy ${contractName}`
  );

  Logger.success(`${contractName} deployed`);
  Logger.log('Address', contract.address.toString());

  await sleep(3000); // Wait for deployment to settle

  return contract;
}

/**
 * Call contract function with validation
 */
export async function callContract(
  contract: SmartContract,
  functionName: string,
  args: Args,
  coins: string = '0.1',
  context: string = 'Contract call'
): Promise<any> {
  return await retryWithBackoff(
    async () => {
      return await contract.call(functionName, args, {
        coins: Mas.fromString(coins),
      });
    },
    3,
    2000,
    context
  );
}

/**
 * Read contract state with validation
 */
export async function readContract(
  contract: SmartContract,
  functionName: string,
  args: Args = new Args(),
  context: string = 'Contract read'
): Promise<any> {
  return await retryWithBackoff(
    async () => {
      return await contract.read(functionName, args);
    },
    2,
    1000,
    context
  );
}

// ============================================================================
// TIME UTILITIES
// ============================================================================

/**
 * Get current timestamp in seconds
 */
export function getCurrentTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Calculate deadline (timestamp in seconds)
 */
export function calculateDeadline(secondsFromNow: number): number {
  return getCurrentTimestamp() + secondsFromNow;
}

// ============================================================================
// FORMATTING UTILITIES
// ============================================================================

/**
 * Format token amount with decimals
 */
export function formatTokenAmount(amount: bigint, decimals: number, symbol: string = ''): string {
  const divisor = BigInt(10 ** decimals);
  const whole = amount / divisor;
  const remainder = amount % divisor;
  const formatted = `${whole}.${remainder.toString().padStart(decimals, '0').slice(0, 4)}`;
  return symbol ? `${formatted} ${symbol}` : formatted;
}

/**
 * Parse token amount from decimal string
 */
export function parseTokenAmount(amount: string, decimals: number): bigint {
  const [whole, decimal = '0'] = amount.split('.');
  const decimalPart = decimal.padEnd(decimals, '0').slice(0, decimals);
  return BigInt(whole) * BigInt(10 ** decimals) + BigInt(decimalPart);
}

/**
 * Calculate minimum output with slippage
 */
export function calculateMinOutput(amount: bigint, slippageBps: number): bigint {
  return (amount * BigInt(10000 - slippageBps)) / 10000n;
}

/**
 * Calculate price impact
 */
export function calculatePriceImpact(
  amountIn: bigint,
  amountOut: bigint,
  expectedRate: bigint,
  decimalsIn: number,
  decimalsOut: number
): number {
  // Price impact = (expected - actual) / expected * 100
  const expected = (amountIn * expectedRate) / BigInt(10 ** decimalsIn);
  if (expected === 0n) return 0;

  const impact = Number((expected - amountOut) * 10000n / expected) / 100;
  return impact;
}

// ============================================================================
// VALIDATION UTILITIES
// ============================================================================

/**
 * Validate address format
 */
export function isValidAddress(address: string): boolean {
  return address.startsWith('AS') && address.length > 40;
}

/**
 * Validate amount is positive
 */
export function isPositiveAmount(amount: bigint): boolean {
  return amount > 0n;
}

/**
 * Validate deadline is in future
 */
export function isValidDeadline(deadline: number): boolean {
  return deadline > getCurrentTimestamp();
}

// ============================================================================
// EXPORT ALL UTILITIES
// ============================================================================

export default {
  Logger,
  loadWasm,
  loadDeployedAddresses,
  saveDeployedAddresses,
  initializeAccount,
  sleep,
  retryWithBackoff,
  getTokenBalance,
  getTokenAllowance,
  approveToken,
  validateTokenOperation,
  deployContract,
  callContract,
  readContract,
  getCurrentTimestamp,
  calculateDeadline,
  formatTokenAmount,
  parseTokenAmount,
  calculateMinOutput,
  calculatePriceImpact,
  isValidAddress,
  isPositiveAmount,
  isValidDeadline,
  DEFAULT_CONFIG,
};
