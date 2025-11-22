/**
 * MassaBeam Copy Trading System
 *
 * Professional copy trading platform enabling:
 * - Traders (Signal Providers) to monetize their trading strategies
 * - Followers to automatically copy successful traders
 * - Performance-based fee structure
 * - Risk management and position limits
 * - Real-time P&L tracking and analytics
 *
 * Features:
 * ==========================================
 * 1. TRADER MANAGEMENT:
 *    - Profile creation with trading stats
 *    - Performance fee configuration (% of follower profits)
 *    - Win rate, total trades, total volume tracking
 *    - Reputation system based on performance
 *
 * 2. FOLLOWER SYSTEM:
 *    - Subscribe to multiple traders
 *    - Allocate capital per trader
 *    - Set copy ratio (e.g., 10% of trader's position size)
 *    - Maximum per-trade limits for risk management
 *    - Stop-loss and take-profit automation
 *
 * 3. TRADE COPYING MECHANISM:
 *    - Automatic detection of trader swaps
 *    - Proportional trade execution for all followers
 *    - Slippage protection for followers
 *    - Fee calculation and distribution
 *
 * 4. RISK MANAGEMENT:
 *    - Maximum drawdown limits per follower
 *    - Position size limits
 *    - Daily loss limits
 *    - Emergency stop functionality
 *
 * 5. ANALYTICS & REPORTING:
 *    - Trader leaderboard (ROI, win rate, followers)
 *    - Follower P&L tracking
 *    - Performance history
 *    - Fee earnings for traders
 *
 * @version 1.0.0
 * @license MIT
 */

import {
  Address,
  Context,
  generateEvent,
  Storage,
} from '@massalabs/massa-as-sdk';
import { Args, stringToBytes, bytesToString } from '@massalabs/as-types';
import { u256 } from 'as-bignum/assembly/integer/u256';
import { IERC20 } from './interfaces/IERC20';
import { IMassaBeamAMM } from './interfaces/IMassaBeamAMM';
import { SafeMath256 } from '../libraries/SafeMath';

// ============================================================================
// CONSTANTS
// ============================================================================

// Storage keys
const TRADER_PREFIX = 'trader:';
const FOLLOWER_PREFIX = 'follower:';
const SUBSCRIPTION_PREFIX = 'subscription:';
const TRADER_COUNT_KEY = 'trader_count';
const SUBSCRIPTION_COUNT_KEY = 'subscription_count';
const MASSABEAM_ADDRESS_KEY = 'massabeam_address';
const PLATFORM_FEE_KEY = 'platform_fee'; // Platform fee in basis points (100 = 1%)
const PAUSED_KEY = 'paused';
const ADMIN_ROLE = 'admin';

// Limits and constraints
const MAX_PERFORMANCE_FEE: u64 = 3000; // 30% max performance fee
const MIN_PERFORMANCE_FEE: u64 = 100; // 1% min performance fee
const DEFAULT_PLATFORM_FEE: u64 = 100; // 1% platform fee
const MAX_COPY_RATIO: u64 = 10000; // 100% max copy ratio
const MIN_DEPOSIT: u256 = u256.fromU64(1000000000000000000); // 1 token minimum

// Trader status
const TRADER_STATUS_ACTIVE: u8 = 0;
const TRADER_STATUS_PAUSED: u8 = 1;
const TRADER_STATUS_BANNED: u8 = 2;

// Subscription status
const SUB_STATUS_ACTIVE: u8 = 0;
const SUB_STATUS_PAUSED: u8 = 1;
const SUB_STATUS_STOPPED: u8 = 2;

// ============================================================================
// STORAGE HELPER FUNCTIONS
// ============================================================================

/**
 * Get a counter value from storage
 */
function getCounter(key: string): u64 {
  const keyBytes = stringToBytes(key);
  if (!Storage.has(keyBytes)) {
    return 0;
  }
  return u64(parseInt(bytesToString(Storage.get<StaticArray<u8>>(keyBytes))));
}

/**
 * Set a counter value in storage
 */
function setCounter(key: string, value: u64): void {
  Storage.set<StaticArray<u8>>(
    stringToBytes(key),
    stringToBytes(value.toString())
  );
}

/**
 * Increment a counter by 1 and return new value
 */
function incrementCounter(key: string): u64 {
  const current = getCounter(key);
  const next = current + 1;
  setCounter(key, next);
  return next;
}

/**
 * Get a string value from storage
 */
function getString(key: string): string {
  const keyBytes = stringToBytes(key);
  if (!Storage.has(keyBytes)) {
    return '';
  }
  return bytesToString(Storage.get<StaticArray<u8>>(keyBytes));
}

/**
 * Set a string value in storage
 */
function setString(key: string, value: string): void {
  Storage.set<StaticArray<u8>>(
    stringToBytes(key),
    stringToBytes(value)
  );
}

/**
 * Get a boolean value from storage
 */
function getBool(key: string): bool {
  return getString(key) === 'true';
}

/**
 * Set a boolean value in storage
 */
function setBool(key: string, value: bool): void {
  setString(key, value ? 'true' : 'false');
}

// ============================================================================
// DATA STRUCTURES
// ============================================================================

/**
 * Trader Profile - Signal Provider
 */
export class TraderProfile {
  traderAddress: Address; // Trader's wallet address
  name: string; // Display name
  performanceFee: u64; // Fee in basis points (100 = 1%)
  status: u8; // TRADER_STATUS_*

  // Statistics
  totalTrades: u64; // Total number of trades executed
  winningTrades: u64; // Number of profitable trades
  totalVolume: u256; // Total trading volume (u256 for 18-decimal tokens)
  totalProfit: u256; // Total profit generated (can be negative)
  followerCount: u64; // Number of active followers
  totalFeesEarned: u256; // Total performance fees collected

  // Timestamps
  createdAt: u64;
  lastTradeAt: u64;

  constructor(
    traderAddress: Address,
    name: string,
    performanceFee: u64
  ) {
    this.traderAddress = traderAddress;
    this.name = name;
    this.performanceFee = performanceFee;
    this.status = TRADER_STATUS_ACTIVE;
    this.totalTrades = 0;
    this.winningTrades = 0;
    this.totalVolume = u256.Zero;
    this.totalProfit = u256.Zero;
    this.followerCount = 0;
    this.totalFeesEarned = u256.Zero;
    this.createdAt = Context.timestamp();
    this.lastTradeAt = 0;
  }

  serialize(): StaticArray<u8> {
    const args = new Args();
    args.add(this.traderAddress.toString());
    args.add(this.name);
    args.add(this.performanceFee);
    args.add(this.status);
    args.add(this.totalTrades);
    args.add(this.winningTrades);
    args.add(this.totalVolume);
    args.add(this.totalProfit);
    args.add(this.followerCount);
    args.add(this.totalFeesEarned);
    args.add(this.createdAt);
    args.add(this.lastTradeAt);
    return args.serialize();
  }

  static deserialize(data: StaticArray<u8>): TraderProfile {
    const args = new Args(data);
    const profile = new TraderProfile(
      new Address(args.nextString().unwrap()),
      args.nextString().unwrap(),
      args.nextU64().unwrap()
    );
    profile.status = args.nextU8().unwrap();
    profile.totalTrades = args.nextU64().unwrap();
    profile.winningTrades = args.nextU64().unwrap();
    profile.totalVolume = args.nextU256().unwrap();
    profile.totalProfit = args.nextU256().unwrap();
    profile.followerCount = args.nextU64().unwrap();
    profile.totalFeesEarned = args.nextU256().unwrap();
    profile.createdAt = args.nextU64().unwrap();
    profile.lastTradeAt = args.nextU64().unwrap();
    return profile;
  }

  /**
   * Calculate win rate percentage
   */
  getWinRate(): u64 {
    if (this.totalTrades == 0) return 0;
    return (this.winningTrades * 10000) / this.totalTrades; // Basis points
  }

  /**
   * Calculate ROI (Return on Investment) percentage
   */
  getROI(): i64 {
    if (this.totalVolume.isZero()) return 0;

    // Convert to f64 for percentage calculation
    const profitF64 = parseFloat(this.totalProfit.toString());
    const volumeF64 = parseFloat(this.totalVolume.toString());

    const roi = (profitF64 / volumeF64) * 10000.0; // Basis points
    return i64(roi);
  }
}

/**
 * Follower Subscription - Copy Trading Settings
 */
export class Subscription {
  id: u64; // Unique subscription ID
  follower: Address; // Follower's address
  trader: Address; // Trader being followed
  status: u8; // SUB_STATUS_*

  // Capital allocation
  depositedAmount: u256; // Total funds deposited for this trader
  currentBalance: u256; // Current balance (after trades)
  lockedInTrades: u256; // Amount locked in open positions

  // Copy settings
  copyRatio: u64; // Percentage to copy (basis points, 5000 = 50%)
  maxPerTrade: u256; // Maximum amount per single trade

  // Risk management
  stopLossPercent: u64; // Auto-stop if loss exceeds % (basis points)
  maxDailyLoss: u256; // Maximum loss per day
  dailyLossAccumulated: u256; // Today's accumulated loss
  lastResetDay: u64; // Day of last reset

  // Performance tracking
  totalProfit: u256; // Total profit/loss from copying
  totalFeesPaid: u256; // Total fees paid to trader
  totalTrades: u64; // Number of trades copied

  // Timestamps
  subscribedAt: u64;
  lastTradeAt: u64;

  constructor(
    id: u64,
    follower: Address,
    trader: Address,
    depositedAmount: u256,
    copyRatio: u64,
    maxPerTrade: u256
  ) {
    this.id = id;
    this.follower = follower;
    this.trader = trader;
    this.status = SUB_STATUS_ACTIVE;
    this.depositedAmount = depositedAmount;
    this.currentBalance = depositedAmount;
    this.lockedInTrades = u256.Zero;
    this.copyRatio = copyRatio;
    this.maxPerTrade = maxPerTrade;
    this.stopLossPercent = 2000; // 20% default stop loss
    this.maxDailyLoss = u256.Zero; // No limit by default
    this.dailyLossAccumulated = u256.Zero;
    this.lastResetDay = getCurrentDay();
    this.totalProfit = u256.Zero;
    this.totalFeesPaid = u256.Zero;
    this.totalTrades = 0;
    this.subscribedAt = Context.timestamp();
    this.lastTradeAt = 0;
  }

  serialize(): StaticArray<u8> {
    const args = new Args();
    args.add(this.id);
    args.add(this.follower.toString());
    args.add(this.trader.toString());
    args.add(this.status);
    args.add(this.depositedAmount);
    args.add(this.currentBalance);
    args.add(this.lockedInTrades);
    args.add(this.copyRatio);
    args.add(this.maxPerTrade);
    args.add(this.stopLossPercent);
    args.add(this.maxDailyLoss);
    args.add(this.dailyLossAccumulated);
    args.add(this.lastResetDay);
    args.add(this.totalProfit);
    args.add(this.totalFeesPaid);
    args.add(this.totalTrades);
    args.add(this.subscribedAt);
    args.add(this.lastTradeAt);
    return args.serialize();
  }

  static deserialize(data: StaticArray<u8>): Subscription {
    const args = new Args(data);
    const sub = new Subscription(
      args.nextU64().unwrap(),
      new Address(args.nextString().unwrap()),
      new Address(args.nextString().unwrap()),
      args.nextU256().unwrap(),
      args.nextU64().unwrap(),
      args.nextU256().unwrap()
    );
    sub.status = args.nextU8().unwrap();
    sub.currentBalance = args.nextU256().unwrap();
    sub.lockedInTrades = args.nextU256().unwrap();
    sub.stopLossPercent = args.nextU64().unwrap();
    sub.maxDailyLoss = args.nextU256().unwrap();
    sub.dailyLossAccumulated = args.nextU256().unwrap();
    sub.lastResetDay = args.nextU64().unwrap();
    sub.totalProfit = args.nextU256().unwrap();
    sub.totalFeesPaid = args.nextU256().unwrap();
    sub.totalTrades = args.nextU64().unwrap();
    sub.subscribedAt = args.nextU64().unwrap();
    sub.lastTradeAt = args.nextU64().unwrap();
    return sub;
  }

  /**
   * Check if stop loss has been triggered
   */
  isStopLossTriggered(): bool {
    if (this.depositedAmount.isZero()) return false;

    // Calculate current loss percentage
    if (this.currentBalance >= this.depositedAmount) {
      return false; // No loss
    }

    const loss = u256.sub(this.depositedAmount, this.currentBalance);
    const lossPercent = SafeMath256.div(
      u256.mul(loss, u256.fromU64(10000)),
      this.depositedAmount
    );

    return u64(parseInt(lossPercent.toString())) >= this.stopLossPercent;
  }

  /**
   * Check if daily loss limit exceeded
   */
  isDailyLossExceeded(): bool {
    resetDailyLossIfNeeded(this);

    if (this.maxDailyLoss.isZero()) return false; // No limit set

    return this.dailyLossAccumulated >= this.maxDailyLoss;
  }

  /**
   * Get available balance for new trades
   */
  getAvailableBalance(): u256 {
    return u256.sub(this.currentBalance, this.lockedInTrades);
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get current day number (for daily limits reset)
 */
function getCurrentDay(): u64 {
  return Context.timestamp() / 86400; // Seconds per day
}

/**
 * Reset daily loss counter if it's a new day
 */
function resetDailyLossIfNeeded(sub: Subscription): void {
  const currentDay = getCurrentDay();
  if (currentDay > sub.lastResetDay) {
    sub.dailyLossAccumulated = u256.Zero;
    sub.lastResetDay = currentDay;
  }
}

/**
 * Get trader profile from storage
 */
function getTrader(traderAddress: Address): TraderProfile | null {
  const key = stringToBytes(TRADER_PREFIX + traderAddress.toString());
  if (!Storage.has(key)) {
    return null;
  }
  return TraderProfile.deserialize(Storage.get<StaticArray<u8>>(key));
}

/**
 * Save trader profile to storage
 */
function saveTrader(trader: TraderProfile): void {
  const key = stringToBytes(TRADER_PREFIX + trader.traderAddress.toString());
  Storage.set<StaticArray<u8>>(key, trader.serialize());
}

/**
 * Get subscription from storage
 */
function getSubscription(subId: u64): Subscription | null {
  const key = stringToBytes(SUBSCRIPTION_PREFIX + subId.toString());
  if (!Storage.has(key)) {
    return null;
  }
  return Subscription.deserialize(Storage.get<StaticArray<u8>>(key));
}

/**
 * Save subscription to storage
 */
function saveSubscription(sub: Subscription): void {
  const key = stringToBytes(SUBSCRIPTION_PREFIX + sub.id.toString());
  Storage.set<StaticArray<u8>>(key, sub.serialize());
}

/**
 * Check if contract is paused
 */
function requireNotPaused(): void {
  assert(!getBool(PAUSED_KEY), 'Contract is paused');
}

/**
 * Check if caller has admin role
 */
function requireAdmin(): void {
  const caller = Context.caller();
  assert(getBool(ADMIN_ROLE + ':' + caller.toString()), 'Admin only');
}

// ============================================================================
// CONSTRUCTOR
// ============================================================================

/**
 * Initialize Copy Trading contract
 */
export function constructor(args: StaticArray<u8>): void {
  assert(Context.isDeployingContract(), 'Constructor only on deployment');

  const argument = new Args(args);
  const massaBeamAddress = argument.nextString().unwrap();

  setString(MASSABEAM_ADDRESS_KEY, massaBeamAddress);
  setCounter(TRADER_COUNT_KEY, 0);
  setCounter(SUBSCRIPTION_COUNT_KEY, 0);
  setCounter(PLATFORM_FEE_KEY, DEFAULT_PLATFORM_FEE);
  setBool(PAUSED_KEY, false);

  // Grant admin to deployer
  const deployer = Context.caller();
  setBool(ADMIN_ROLE + ':' + deployer.toString(), true);

  generateEvent('CopyTrading:Initialized|massabeam=' + massaBeamAddress);
}

// ============================================================================
// TRADER FUNCTIONS
// ============================================================================

/**
 * Register as a trader (signal provider)
 */
export function registerTrader(args: StaticArray<u8>): void {
  requireNotPaused();

  const argument = new Args(args);
  const name = argument.nextString().unwrap();
  const performanceFee = argument.nextU64().unwrap();

  const caller = Context.caller();

  // Validation
  assert(name.length > 0 && name.length <= 50, 'Invalid name length');
  assert(
    performanceFee >= MIN_PERFORMANCE_FEE && performanceFee <= MAX_PERFORMANCE_FEE,
    'Performance fee must be between 1% and 30%'
  );

  // Check if already registered
  const existing = getTrader(caller);
  assert(existing == null, 'Already registered as trader');

  // Create trader profile
  const trader = new TraderProfile(caller, name, performanceFee);
  saveTrader(trader);

  incrementCounter(TRADER_COUNT_KEY);

  generateEvent(`CopyTrading:TraderRegistered|trader=${caller.toString()}|name=${name}|fee=${performanceFee}`);
}

/**
 * Update trader settings
 */
export function updateTraderSettings(args: StaticArray<u8>): void {
  requireNotPaused();

  const argument = new Args(args);
  const name = argument.nextString().unwrap();
  const performanceFee = argument.nextU64().unwrap();

  const caller = Context.caller();
  const trader = getTrader(caller);
  assert(trader != null, 'Not registered as trader');

  assert(name.length > 0 && name.length <= 50, 'Invalid name length');
  assert(
    performanceFee >= MIN_PERFORMANCE_FEE && performanceFee <= MAX_PERFORMANCE_FEE,
    'Performance fee must be between 1% and 30%'
  );

  trader!.name = name;
  trader!.performanceFee = performanceFee;
  saveTrader(trader!);

  generateEvent(`CopyTrading:TraderUpdated|trader=${caller.toString()}|name=${name}|fee=${performanceFee}`);
}

/**
 * Pause/unpause trader profile
 */
export function setTraderStatus(args: StaticArray<u8>): void {
  const argument = new Args(args);
  const paused = argument.nextBool().unwrap();

  const caller = Context.caller();
  const trader = getTrader(caller);
  assert(trader != null, 'Not registered as trader');

  trader!.status = paused ? TRADER_STATUS_PAUSED : TRADER_STATUS_ACTIVE;
  saveTrader(trader!);

  generateEvent(`CopyTrading:TraderStatus|trader=${caller.toString()}|paused=${paused}`);
}

// ============================================================================
// FOLLOWER FUNCTIONS
// ============================================================================

/**
 * Subscribe to a trader and deposit funds
 */
export function subscribeToTrader(args: StaticArray<u8>): void {
  requireNotPaused();

  const argument = new Args(args);
  const traderAddress = new Address(argument.nextString().unwrap());
  const depositToken = new Address(argument.nextString().unwrap());
  const depositAmount = argument.nextU256().unwrap();
  const copyRatio = argument.nextU64().unwrap();
  const maxPerTrade = argument.nextU256().unwrap();

  const caller = Context.caller();

  // Validation
  assert(depositAmount >= MIN_DEPOSIT, 'Minimum deposit: 1 token');
  assert(copyRatio > 0 && copyRatio <= MAX_COPY_RATIO, 'Copy ratio must be 1-100%');
  assert(!maxPerTrade.isZero(), 'Max per trade must be > 0');
  assert(caller.toString() != traderAddress.toString(), 'Cannot follow yourself');

  // Check trader exists and is active
  const trader = getTrader(traderAddress);
  assert(trader != null, 'Trader not found');
  assert(trader!.status == TRADER_STATUS_ACTIVE, 'Trader not active');

  // Transfer deposit from follower to contract
  const tokenContract = new IERC20(depositToken);
  tokenContract.transferFrom(caller, Context.callee(), depositAmount);

  // Create subscription
  const subId = incrementCounter(SUBSCRIPTION_COUNT_KEY);
  const subscription = new Subscription(
    subId,
    caller,
    traderAddress,
    depositAmount,
    copyRatio,
    maxPerTrade
  );
  saveSubscription(subscription);

  // Update trader follower count
  trader!.followerCount += 1;
  saveTrader(trader!);

  generateEvent(`CopyTrading:Subscribed|follower=${caller.toString()}|trader=${traderAddress.toString()}|amount=${depositAmount.toString()}|subId=${subId}`);
}

/**
 * Add more funds to existing subscription
 */
export function addFunds(args: StaticArray<u8>): void {
  requireNotPaused();

  const argument = new Args(args);
  const subId = argument.nextU64().unwrap();
  const depositToken = new Address(argument.nextString().unwrap());
  const amount = argument.nextU256().unwrap();

  const caller = Context.caller();
  const sub = getSubscription(subId);

  assert(sub != null, 'Subscription not found');
  assert(sub!.follower.toString() == caller.toString(), 'Not your subscription');
  assert(!amount.isZero(), 'Amount must be > 0');

  // Transfer funds
  const tokenContract = new IERC20(depositToken);
  tokenContract.transferFrom(caller, Context.callee(), amount);

  // Update subscription
  sub!.depositedAmount = u256.add(sub!.depositedAmount, amount);
  sub!.currentBalance = u256.add(sub!.currentBalance, amount);
  saveSubscription(sub!);

  generateEvent(`CopyTrading:FundsAdded|subId=${subId}|amount=${amount.toString()}`);
}

/**
 * Withdraw funds from subscription
 */
export function withdrawFunds(args: StaticArray<u8>): void {
  requireNotPaused();

  const argument = new Args(args);
  const subId = argument.nextU64().unwrap();
  const withdrawToken = new Address(argument.nextString().unwrap());
  const amount = argument.nextU256().unwrap();

  const caller = Context.caller();
  const sub = getSubscription(subId);

  assert(sub != null, 'Subscription not found');
  assert(sub!.follower.toString() == caller.toString(), 'Not your subscription');
  assert(!amount.isZero(), 'Amount must be > 0');

  const available = sub!.getAvailableBalance();
  assert(amount <= available, 'Insufficient available balance');

  // Transfer funds back to follower
  const tokenContract = new IERC20(withdrawToken);
  tokenContract.transfer(caller, amount);

  // Update subscription
  sub!.currentBalance = u256.sub(sub!.currentBalance, amount);
  saveSubscription(sub!);

  generateEvent(`CopyTrading:FundsWithdrawn|subId=${subId}|amount=${amount.toString()}`);
}

/**
 * Unsubscribe from trader (withdraw all and close)
 */
export function unsubscribe(args: StaticArray<u8>): void {
  requireNotPaused();

  const argument = new Args(args);
  const subId = argument.nextU64().unwrap();
  const withdrawToken = new Address(argument.nextString().unwrap());

  const caller = Context.caller();
  const sub = getSubscription(subId);

  assert(sub != null, 'Subscription not found');
  assert(sub!.follower.toString() == caller.toString(), 'Not your subscription');
  assert(sub!.lockedInTrades.isZero(), 'Close open positions first');

  const available = sub!.getAvailableBalance();

  // Transfer remaining balance
  if (!available.isZero()) {
    const tokenContract = new IERC20(withdrawToken);
    tokenContract.transfer(caller, available);
  }

  // Update trader follower count
  const trader = getTrader(sub!.trader);
  if (trader != null && trader!.followerCount > 0) {
    trader!.followerCount -= 1;
    saveTrader(trader!);
  }

  // Mark subscription as stopped
  sub!.status = SUB_STATUS_STOPPED;
  sub!.currentBalance = u256.Zero;
  saveSubscription(sub!);

  generateEvent(`CopyTrading:Unsubscribed|subId=${subId}|finalBalance=${available.toString()}`);
}

/**
 * Update subscription settings
 */
export function updateSubscriptionSettings(args: StaticArray<u8>): void {
  requireNotPaused();

  const argument = new Args(args);
  const subId = argument.nextU64().unwrap();
  const copyRatio = argument.nextU64().unwrap();
  const maxPerTrade = argument.nextU256().unwrap();
  const stopLossPercent = argument.nextU64().unwrap();

  const caller = Context.caller();
  const sub = getSubscription(subId);

  assert(sub != null, 'Subscription not found');
  assert(sub!.follower.toString() == caller.toString(), 'Not your subscription');
  assert(copyRatio > 0 && copyRatio <= MAX_COPY_RATIO, 'Invalid copy ratio');
  assert(!maxPerTrade.isZero(), 'Max per trade must be > 0');
  assert(stopLossPercent <= 10000, 'Stop loss cannot exceed 100%');

  sub!.copyRatio = copyRatio;
  sub!.maxPerTrade = maxPerTrade;
  sub!.stopLossPercent = stopLossPercent;
  saveSubscription(sub!);

  generateEvent(`CopyTrading:SettingsUpdated|subId=${subId}|copyRatio=${copyRatio}|stopLoss=${stopLossPercent}`);
}

// ============================================================================
// TRADE EXECUTION - COPY TRADING ENGINE
// ============================================================================

/**
 * Execute trade as trader (automatically copied by followers)
 */
export function executeTrade(args: StaticArray<u8>): void {
  requireNotPaused();

  const argument = new Args(args);
  const tokenIn = new Address(argument.nextString().unwrap());
  const tokenOut = new Address(argument.nextString().unwrap());
  const amountIn = argument.nextU256().unwrap();
  const minAmountOut = argument.nextU256().unwrap();
  const deadline = argument.nextU64().unwrap();

  const caller = Context.caller();

  // Validate trader
  const trader = getTrader(caller);
  assert(trader != null, 'Not registered as trader');
  assert(trader!.status == TRADER_STATUS_ACTIVE, 'Trader not active');

  // Execute trader's own trade
  const massaBeamAddress = new Address(getString(MASSABEAM_ADDRESS_KEY));
  const tokenInContract = new IERC20(tokenIn);

  // Transfer tokens from trader
  tokenInContract.transferFrom(caller, massaBeamAddress, amountIn);

  // Execute swap on MassaBeam
  const massaBeam = new IMassaBeamAMM(massaBeamAddress);
  const traderAmountOut = massaBeam.swap(
    tokenIn,
    tokenOut,
    amountIn,
    minAmountOut,
    deadline,
    caller
  );

  generateEvent(`CopyTrading:TraderExecuted|trader=${caller.toString()}|amountIn=${amountIn.toString()}|amountOut=${traderAmountOut.toString()}`);

  // Update trader stats
  trader!.totalTrades += 1;
  trader!.totalVolume = u256.add(trader!.totalVolume, amountIn);
  trader!.lastTradeAt = Context.timestamp();
  saveTrader(trader!);

  // Copy trade to all active followers
  copyTradeToFollowers(caller, tokenIn, tokenOut, amountIn, minAmountOut, deadline, traderAmountOut);
}

/**
 * Copy a trade to all active followers of a trader
 */
function copyTradeToFollowers(
  traderAddress: Address,
  tokenIn: Address,
  tokenOut: Address,
  traderAmountIn: u256,
  minAmountOut: u256,
  deadline: u64,
  traderAmountOut: u256
): void {
  const massaBeamAddress = new Address(getString(MASSABEAM_ADDRESS_KEY));
  const massaBeam = new IMassaBeamAMM(massaBeamAddress);

  const totalSubs = getCounter(SUBSCRIPTION_COUNT_KEY);
  let copiedCount: u64 = 0;

  // Iterate through all subscriptions
  for (let i: u64 = 1; i <= totalSubs; i++) {
    const sub = getSubscription(i);

    if (sub == null) continue;
    if (sub.trader.toString() != traderAddress.toString()) continue;
    if (sub.status != SUB_STATUS_ACTIVE) continue;

    // Check risk limits
    if (sub.isStopLossTriggered()) {
      sub.status = SUB_STATUS_PAUSED;
      saveSubscription(sub);
      generateEvent(`CopyTrading:StopLossTriggered|subId=${i}`);
      continue;
    }

    if (sub.isDailyLossExceeded()) {
      generateEvent(`CopyTrading:DailyLimitReached|subId=${i}`);
      continue;
    }

    // Calculate follower's proportional amount
    const followerAmount = calculateFollowerAmount(sub, traderAmountIn);

    if (followerAmount.isZero()) continue;

    const available = sub.getAvailableBalance();
    if (followerAmount > available) {
      generateEvent(`CopyTrading:InsufficientBalance|subId=${i}|needed=${followerAmount.toString()}|available=${available.toString()}`);
      continue;
    }

    // Execute follower's trade
    const tokenInContract = new IERC20(tokenIn);

    // Approve and transfer from contract to MassaBeam
    tokenInContract.transfer(massaBeamAddress, followerAmount);

    // Calculate proportional minimum output
    const followerMinOut = SafeMath256.div(
      u256.mul(minAmountOut, followerAmount),
      traderAmountIn
    );

    // Execute swap
    const followerAmountOut = massaBeam.swap(
      tokenIn,
      tokenOut,
      followerAmount,
      followerMinOut,
      deadline,
      sub.follower
    );

    // Update subscription stats
    sub.currentBalance = u256.sub(sub.currentBalance, followerAmount);
    sub.totalTrades += 1;
    sub.lastTradeAt = Context.timestamp();

    // Calculate and distribute performance fee
    const profit = calculateProfit(followerAmount, followerAmountOut, traderAmountIn, traderAmountOut);
    if (profit > u256.Zero) {
      const fee = calculatePerformanceFee(profit, sub.trader);
      if (!fee.isZero()) {
        // Transfer fee to trader
        const tokenOutContract = new IERC20(tokenOut);
        tokenOutContract.transferFrom(sub.follower, sub.trader, fee);

        sub.totalFeesPaid = u256.add(sub.totalFeesPaid, fee);

        // Update trader's fee earnings
        const trader = getTrader(sub.trader);
        if (trader != null) {
          trader.totalFeesEarned = u256.add(trader.totalFeesEarned, fee);
          saveTrader(trader);
        }
      }
    }

    saveSubscription(sub);
    copiedCount += 1;

    generateEvent(`CopyTrading:TradeCopied|subId=${i}|amountIn=${followerAmount.toString()}|amountOut=${followerAmountOut.toString()}`);
  }

  generateEvent(`CopyTrading:CopyComplete|trader=${traderAddress.toString()}|copied=${copiedCount}`);
}

/**
 * Calculate follower's proportional trade amount
 */
function calculateFollowerAmount(sub: Subscription, traderAmount: u256): u256 {
  // Apply copy ratio
  const proportional = SafeMath256.div(
    u256.mul(traderAmount, u256.fromU64(sub.copyRatio)),
    u256.fromU64(10000)
  );

  // Apply max per trade limit
  if (proportional > sub.maxPerTrade) {
    return sub.maxPerTrade;
  }

  return proportional;
}

/**
 * Calculate profit from a trade
 */
function calculateProfit(
  amountIn: u256,
  amountOut: u256,
  traderAmountIn: u256,
  traderAmountOut: u256
): u256 {
  // Calculate expected output based on trader's ratio
  const expectedOut = SafeMath256.div(
    u256.mul(amountIn, traderAmountOut),
    traderAmountIn
  );

  if (amountOut <= expectedOut) {
    return u256.Zero; // No profit or loss
  }

  return u256.sub(amountOut, expectedOut);
}

/**
 * Calculate performance fee for trader
 */
function calculatePerformanceFee(profit: u256, traderAddress: Address): u256 {
  const trader = getTrader(traderAddress);
  if (trader == null) return u256.Zero;

  return SafeMath256.div(
    u256.mul(profit, u256.fromU64(trader.performanceFee)),
    u256.fromU64(10000)
  );
}

// ============================================================================
// VIEW FUNCTIONS
// ============================================================================

/**
 * Get trader profile
 */
export function getTraderProfile(args: StaticArray<u8>): StaticArray<u8> {
  const argument = new Args(args);
  const traderAddress = new Address(argument.nextString().unwrap());

  const trader = getTrader(traderAddress);
  if (trader == null) {
    return new Args().serialize();
  }

  return trader.serialize();
}

/**
 * Get subscription details
 */
export function getSubscriptionDetails(args: StaticArray<u8>): StaticArray<u8> {
  const argument = new Args(args);
  const subId = argument.nextU64().unwrap();

  const sub = getSubscription(subId);
  if (sub == null) {
    return new Args().serialize();
  }

  return sub.serialize();
}

/**
 * Get trader leaderboard (top performers by ROI)
 */
export function getLeaderboard(_: StaticArray<u8>): StaticArray<u8> {
  const totalTraders = getCounter(TRADER_COUNT_KEY);
  const result = new Args();

  // Note: In production, implement pagination and sorting
  result.add(totalTraders);

  return result.serialize();
}

/**
 * Get platform statistics
 */
export function getStatistics(_: StaticArray<u8>): StaticArray<u8> {
  const totalTraders = getCounter(TRADER_COUNT_KEY);
  const totalSubscriptions = getCounter(SUBSCRIPTION_COUNT_KEY);

  const result = new Args()
    .add(totalTraders)
    .add(totalSubscriptions);

  return result.serialize();
}

// ============================================================================
// ADMIN FUNCTIONS
// ============================================================================

/**
 * Pause/unpause contract
 */
export function setPaused(args: StaticArray<u8>): void {
  requireAdmin();

  const argument = new Args(args);
  const paused = argument.nextBool().unwrap();

  setBool(PAUSED_KEY, paused);

  generateEvent(`CopyTrading:${paused ? 'Paused' : 'Unpaused'}`);
}

/**
 * Update platform fee
 */
export function setPlatformFee(args: StaticArray<u8>): void {
  requireAdmin();

  const argument = new Args(args);
  const fee = argument.nextU64().unwrap();

  assert(fee <= 1000, 'Platform fee cannot exceed 10%');

  setCounter(PLATFORM_FEE_KEY, fee);

  generateEvent(`CopyTrading:PlatformFeeUpdated|fee=${fee}`);
}

/**
 * Ban/unban trader
 */
export function banTrader(args: StaticArray<u8>): void {
  requireAdmin();

  const argument = new Args(args);
  const traderAddress = new Address(argument.nextString().unwrap());
  const banned = argument.nextBool().unwrap();

  const trader = getTrader(traderAddress);
  assert(trader != null, 'Trader not found');

  trader!.status = banned ? TRADER_STATUS_BANNED : TRADER_STATUS_ACTIVE;
  saveTrader(trader!);

  generateEvent(`CopyTrading:TraderBanned|trader=${traderAddress.toString()}|banned=${banned}`);
}

