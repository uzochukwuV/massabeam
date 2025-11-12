# 🚀 Phase 2 Implementation Plan - Advanced DeFi Features

## Overview
Building on Phase 1 success (Flash Loans, Advanced Orders, Native MAS), Phase 2 adds:
1. **Recurring Orders & DCA** (Already 80% complete!)
2. **Flash Loan Arbitrage Bot**
3. **Referral Rewards System**
4. **Liquidity Mining Program**
5. **Split-Order Execution**

---

## ✅ Feature 1: Recurring Orders & DCA (80% Complete)

### **Already Implemented:**
- ✅ RecurringOrder data structure
- ✅ Multiple order types (BUY_ON_INCREASE, SELL_ON_DECREASE, GRID, DCA)
- ✅ Price tracking and percentage calculations
- ✅ Time-based and price-based triggers
- ✅ Grid trading support
- ✅ Autonomous execution framework

### **What It Does:**
```typescript
// DCA: Buy $100 of ETH every day
createDCAOrder(USDC, WETH, 100e6, 3600*24) // Daily

// Grid Trading: Buy at -2%, -4%, -6% and sell at +2%, +4%, +6%
createGridOrder(WETH, USDC, [200, 400, 600], [1e18, 1e18, 1e18])

// Take Profits: Sell 25% at each +5% price increase
createRecurringOrder(
  WETH, USDC,
  ORDER_TYPE_SELL_ON_DECREASE,
  500, // 5%
  2.5e18 // 2.5 ETH per execution
)
```

### **To Complete:**
- [ ] Test autonomous execution
- [ ] Add admin controls
- [ ] Integrate with main AMM
- [ ] Add event monitoring

---

## 🔧 Feature 2: Flash Loan Arbitrage Bot

### **Concept:**
Autonomous bot that:
1. Monitors price differences between MassaBeam & Dussa
2. Detects profitable arbitrage opportunities
3. Executes flash loan arbitrage automatically
4. No human intervention needed!

### **Architecture:**
```typescript
class FlashArbitrageBot {
  // Scan for opportunities
  scan() {
    for (token pair in commonPairs) {
      priceA = getMassaBeamPrice(pair)
      priceB = getDusaPrice(pair)

      if (abs(priceA - priceB) / priceA > MIN_PROFIT_THRESHOLD) {
        executeArbitrage(pair, calculateOptimalAmount())
      }
    }
  }

  // Execute arbitrage with flash loan
  executeArbitrage(pair, amount) {
    // 1. Flash loan tokenA from MassaBeam
    flashLoan(this, tokenA, amount)

    // In callback:
    // 2. Buy tokenB cheap on DEX1
    // 3. Sell tokenB expensive on DEX2
    // 4. Repay flash loan + fee
    // 5. Keep profit!
  }

  // Autonomous execution
  advance() {
    scan()
    callNextSlot(this, 'advance', GAS_BUDGET)
  }
}
```

### **Implementation:**
```typescript
// File: assembly/contracts/flash_arbitrage_bot.ts

export class FlashArbitrageBot {
  massaBeamAddress: Address;
  dusaRouterAddress: Address;
  minProfitThreshold: u64; // 50 basis points = 0.5%

  // Token pairs to monitor
  watchlist: TokenPair[];

  // Statistics
  totalOpportunities: u64;
  totalExecuted: u64;
  totalProfit: u64;
  failedTrades: u64;

  // Autonomous execution
  isRunning: bool;
  checkInterval: u64; // seconds
  lastCheckTime: u64;
}
```

### **Key Functions:**
- `startBot()` - Begin autonomous scanning
- `stopBot()` - Pause bot
- `scanOpportunities()` - Check all pairs for arbitrage
- `executeFlashArbitrage()` - Execute profitable trade
- `onFlashLoan()` - Callback for flash loan
- `addToWatchlist()` - Add token pair to monitor
- `updateProfitThreshold()` - Set minimum profit %

### **Benefits:**
- **Passive income:** Bot runs 24/7 automatically
- **Zero capital:** Uses flash loans
- **Low risk:** Only executes if profit guaranteed
- **Transparent:** All trades on-chain

---

## 🎁 Feature 3: Referral Rewards System

### **Concept:**
Users earn rewards for referring others to the platform.

### **How It Works:**
```typescript
// Alice refers Bob
alice.shareReferralCode() // Gets code: "ALICE-1234"

// Bob signs up with Alice's code
bob.swapWithReferral("ALICE-1234", ...)

// Both earn rewards:
// - Alice: 0.05% of Bob's trading fees forever
// - Bob: 0.05% fee discount on first 30 days
```

### **Implementation:**
```typescript
class ReferralSystem {
  // User data
  referralCodes: Map<Address, string>;
  referredBy: Map<Address, Address>;
  referralCount: Map<Address, u64>;

  // Rewards
  referrerFeeShare: u64; // 500 = 5% of trading fees
  refereeFeeDiscount: u64; // 500 = 5% discount
  discountDuration: u64; // 30 days

  // Statistics
  totalReferrals: u64;
  totalRewardsDistributed: u64;
}
```

### **Key Functions:**
```typescript
// Generate referral code
function createReferralCode(): string {
  const code = generateUniqueCode(caller)
  Storage.set('referral:' + caller, code)
  return code
}

// Register referral
function registerReferral(code: string) {
  const referrer = getReferrerByCode(code)
  assert(referrer != caller, "Can't refer yourself")

  Storage.set('referred_by:' + caller, referrer)
  incrementReferralCount(referrer)

  generateEvent('Referral:Registered')
}

// Distribute rewards on each swap
function distributeReferralRewards(
  trader: Address,
  feeAmount: u64
) {
  if (hasReferrer(trader)) {
    const referrer = getReferrer(trader)
    const reward = feeAmount * referrerFeeShare / 10000

    // Send reward to referrer
    transferReward(referrer, reward)

    // Apply discount to referee
    if (isWithinDiscountPeriod(trader)) {
      const discount = feeAmount * refereeFeeDiscount / 10000
      refundFee(trader, discount)
    }
  }
}
```

### **Reward Tiers:**
```typescript
// Tier 1: 1-10 referrals → 0.05% commission
// Tier 2: 11-50 referrals → 0.10% commission
// Tier 3: 51-100 referrals → 0.15% commission
// Tier 4: 100+ referrals → 0.20% commission

function getReferrerCommission(referrer: Address): u64 {
  const count = getReferralCount(referrer)

  if (count >= 100) return 2000 // 0.20%
  if (count >= 51) return 1500  // 0.15%
  if (count >= 11) return 1000  // 0.10%
  return 500                     // 0.05%
}
```

---

## 💰 Feature 4: Liquidity Mining Program

### **Concept:**
Reward users who provide liquidity to the DEX.

### **How It Works:**
```typescript
// User adds liquidity
addLiquidity(USDC, DAI, 1000e6, 1000e18)
// Receives LP tokens

// LP tokens automatically earn:
// 1. Trading fees (0.3% of all swaps)
// 2. Mining rewards (bonus tokens)

// After 30 days:
// - Trading fees: $15 (APR: ~18%)
// - Mining rewards: 50 MAS tokens
// Total APR: ~35%!
```

### **Implementation:**
```typescript
class LiquidityMining {
  // Pool data
  totalLiquidityByPool: Map<string, u64>;
  userLiquidityByPool: Map<string, Map<Address, u64>>;

  // Rewards
  rewardTokenAddress: Address; // MAS token
  rewardRate: u64; // Tokens per second per pool
  lastUpdateTime: u64;

  // User tracking
  userRewardPerTokenPaid: Map<Address, u64>;
  userRewards: Map<Address, u64>;

  // Boost multipliers
  boostForDuration: Map<u64, u64>; // Lock days → boost %
}
```

### **Key Functions:**
```typescript
// Stake LP tokens to earn rewards
function stakeLPTokens(
  tokenA: Address,
  tokenB: Address,
  amount: u64,
  lockDuration: u64 // 0 = no lock, 30/90/365 days
) {
  // Transfer LP tokens to staking contract
  transferFrom(caller, this, amount)

  // Calculate boost
  const boost = getBoostMultiplier(lockDuration)

  // Update user stake
  updateRewards(caller, pool)
  stakes[caller][pool] += amount * boost

  generateEvent('LP:Staked')
}

// Claim accumulated rewards
function claimRewards(pool: string) {
  updateRewards(caller, pool)

  const reward = userRewards[caller][pool]
  userRewards[caller][pool] = 0

  // Transfer reward tokens
  rewardToken.transfer(caller, reward)

  generateEvent('Rewards:Claimed')
}

// Calculate pending rewards
function calculatePendingRewards(
  user: Address,
  pool: string
): u64 {
  const stake = stakes[user][pool]
  const rewardPerToken = calculateRewardPerToken(pool)
  const paid = userRewardPerTokenPaid[user][pool]

  return stake * (rewardPerToken - paid) / 1e18
}

// Update rewards for all stakers
function updatePoolRewards(pool: string) {
  const now = Context.timestamp()
  const elapsed = now - lastUpdateTime[pool]

  const totalSupply = totalLiquidityByPool[pool]
  if (totalSupply > 0) {
    const reward = elapsed * rewardRate
    rewardPerTokenStored[pool] += reward / totalSupply
  }

  lastUpdateTime[pool] = now
}
```

### **Boost Tiers:**
```typescript
// No lock: 1x rewards
// 30 days: 1.25x rewards (+25%)
// 90 days: 1.5x rewards (+50%)
// 180 days: 2x rewards (+100%)
// 365 days: 3x rewards (+200%)

function getBoostMultiplier(lockDays: u64): u64 {
  if (lockDays >= 365) return 30000 // 3x
  if (lockDays >= 180) return 20000 // 2x
  if (lockDays >= 90) return 15000  // 1.5x
  if (lockDays >= 30) return 12500  // 1.25x
  return 10000                      // 1x
}
```

---

## 📊 Feature 5: Split-Order Execution

### **Concept:**
Automatically split large orders across multiple DEXs for best execution.

### **How It Works:**
```typescript
// User wants to swap 1M USDC for DAI
// Smart router analyzes:
// - MassaBeam has 500K liquidity (0.5% price impact)
// - Dussa has 800K liquidity (0.3% price impact)

// Optimal split:
// - 45% (450K) via MassaBeam
// - 55% (550K) via Dussa
// Total output: 998,500 DAI

// vs single DEX:
// All on MassaBeam: 995,000 DAI (worse!)
// All on Dussa: 996,000 DAI (worse!)
```

### **Implementation:**
```typescript
class SplitOrderExecutor {
  // Calculate optimal split
  function calculateOptimalSplit(
    tokenIn: Address,
    tokenOut: Address,
    amountIn: u64
  ): SplitOrder {
    // Get quotes from both DEXs for various amounts
    const splits = [
      { massaBeam: 0.0, dusa: 1.0 },   // 100% Dussa
      { massaBeam: 0.1, dusa: 0.9 },   // 10% / 90%
      { massaBeam: 0.2, dusa: 0.8 },   // 20% / 80%
      { massaBeam: 0.3, dusa: 0.7 },   // etc...
      { massaBeam: 0.5, dusa: 0.5 },
      { massaBeam: 0.7, dusa: 0.3 },
      { massaBeam: 0.9, dusa: 0.1 },
      { massaBeam: 1.0, dusa: 0.0 },   // 100% MassaBeam
    ]

    let bestSplit = splits[0]
    let bestOutput = 0

    for (split of splits) {
      const amount1 = amountIn * split.massaBeam
      const amount2 = amountIn * split.dusa

      const out1 = getMassaBeamQuote(tokenIn, tokenOut, amount1)
      const out2 = getDusaQuote(tokenIn, tokenOut, amount2)

      const totalOut = out1 + out2 - estimateGasCost(2)

      if (totalOut > bestOutput) {
        bestOutput = totalOut
        bestSplit = split
      }
    }

    return bestSplit
  }

  // Execute split order
  function executeSplitOrder(
    tokenIn: Address,
    tokenOut: Address,
    amountIn: u64,
    minAmountOut: u64,
    to: Address
  ) {
    const split = calculateOptimalSplit(tokenIn, tokenOut, amountIn)

    // Execute on MassaBeam
    const amount1 = u64(amountIn * split.massaBeam)
    if (amount1 > 0) {
      massaBeam.swap(tokenIn, tokenOut, amount1, 0, to)
    }

    // Execute on Dussa
    const amount2 = u64(amountIn * split.dusa)
    if (amount2 > 0) {
      dusa.swap(tokenIn, tokenOut, amount2, 0, to)
    }

    // Verify total output
    assert(totalReceived >= minAmountOut, "Slippage exceeded")

    generateEvent('SplitOrder:Executed')
  }
}
```

---

## 🎯 Phase 2 Implementation Priority

### **Week 1-2: Flash Loan Arbitrage Bot**
- Highest value feature
- Generates passive income
- Showcases autonomous capabilities
- Build excitement in community

### **Week 3-4: Liquidity Mining**
- Attract liquidity providers
- Increase TVL
- Boost trading volume
- Create token utility

### **Week 5-6: Referral System**
- Viral growth mechanism
- User acquisition
- Community building
- Low development cost

### **Week 7-8: Split Orders & Polish**
- Improve execution quality
- Professional trading experience
- Final testing and audits
- Documentation

---

## 📊 Expected Impact

### **Metrics:**
- **TVL:** 10x increase (from liquidity mining)
- **Daily Volume:** 5x increase (from better execution)
- **Users:** 3x increase (from referrals)
- **Revenue:** Passive arbitrage profits

### **Competitive Advantages:**
1. **Only DEX with flash loan arbitrage bot** on Massa
2. **Best execution** via split orders
3. **Passive income** for liquidity providers
4. **Viral growth** via referrals

---

## 🚀 Ready to Build!

All Phase 1 features working:
- ✅ Build system
- ✅ Flash loans
- ✅ Advanced orders
- ✅ Native MAS support

Now building Phase 2:
- 🔧 Flash arbitrage bot
- 🔧 Liquidity mining
- 🔧 Referral rewards
- 🔧 Split orders
- 🔧 DCA enhancements

**Let's start with the Flash Loan Arbitrage Bot - the most exciting feature!** 🚀
