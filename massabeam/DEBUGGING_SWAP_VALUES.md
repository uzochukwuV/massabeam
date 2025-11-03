# Debugging Swap Values Issue

## Problem Summary

You're seeing incorrect values in the swap UI:
- Network Fee: `11832.000000 WETH (0.30%)` ← **WRONG** (impossibly high)
- Price Impact: `100.00%` ← **WRONG** (means pool is being drained)
- Rate: `1 WETH = 0.087508 DAI` ← **WRONG** (should be ~1000-4000 DAI per WETH)
- Output: `0.100010 DAI` ← **WRONG** (way too small)

## Root Cause Analysis

### Issue #1: Input Format Confusion

**What you're doing:**
- Entering: `3944000` (raw value in input field)
- This gets converted to: `3944000 * 10^8 = 394,400,000,000,000` (way too large!)

**What you should do:**
- Enter: `39.44` (human-readable amount)
- This converts to: `39.44 * 10^8 = 3,944,000,000` (correct!)

### Issue #2: Pool Reserve Format

The smart contract stores reserves in **smallest units** (8 decimals), but we need to verify they're being read correctly.

## How to Debug

### Step 1: Check Console Logs

Open browser console and look for this log after entering an amount:

```javascript
Pool data for swap: {
  tokenIn: "WETH",
  tokenOut: "DAI",
  reserveA: 1234567890,        // Raw value
  reserveB: 9876543210,        // Raw value
  reserveA_human: "12.345679", // Human-readable (÷ 10^8)
  reserveB_human: "98.765432", // Human-readable (÷ 10^8)
  fee: 3000,
  amountIn: "3944000000",      // Should be 39.44 * 10^8
  amountIn_human: "39.44"      // What you typed
}
```

### Step 2: Verify Your Input

**CORRECT Usage:**
```
Input field value: 39.44
Converts to: 3944000000 (smallest units)
```

**INCORRECT Usage (what you might be doing):**
```
Input field value: 3944000
Converts to: 394400000000000 (way too large!)
```

### Step 3: Check Pool Reserves

Example of a healthy WETH/DAI pool (8 decimals):

```javascript
// Pool with 100 WETH and 300,000 DAI
reserveA: 10000000000        // 100 WETH (100 * 10^8)
reserveB: 30000000000000     // 300,000 DAI (300000 * 10^8)

// Exchange rate should be:
// 1 WETH = 300,000 / 100 = 3000 DAI
```

If you see something like:
```javascript
reserveA: 100              // Only 0.000001 WETH
reserveB: 30000000         // 0.3 DAI
```

Then your pool was created with incorrect decimal handling!

## Expected Behavior

### Example Swap: 10 WETH → DAI

**Given:**
- Pool: 100 WETH, 300,000 DAI
- Fee: 0.3% (3000 basis points)
- Input: 10 WETH

**Calculation:**
```javascript
Input (human): 10
Input (smallest): 10 * 10^8 = 1000000000

reserveIn: 10000000000  (100 WETH)
reserveOut: 30000000000000  (300,000 DAI)

amountOut = (1000000000 * 9970 * 30000000000000) / (10000000000 * 10000 + 1000000000 * 9970)
          = (very large number) / (very large number)
          ≈ 2700000000000  (27,000 DAI in smallest units)

Output (human): 2700000000000 / 10^8 = 27000 DAI
```

**UI Should Show:**
- From: `10 WETH`
- To: `~27000 DAI`
- Rate: `1 WETH = 2700 DAI`
- Price Impact: `~9.1%` (reasonable for 10% of pool)
- Fee: `0.03 WETH (0.30%)`
- Min Received: `~26865 DAI` (with 0.5% slippage)

## Common Mistakes

### Mistake #1: Entering Raw Values
```
❌ DON'T: Enter 1000000000 (thinking it's 10 WETH)
✅ DO: Enter 10 (the UI converts it)
```

### Mistake #2: Creating Pool with Wrong Decimals
```javascript
// ❌ WRONG - Pool creation
await createPool(
  tokenA,
  tokenB,
  100,        // Only 0.000001 WETH!
  300000      // Only 0.003 DAI!
);

// ✅ CORRECT - Pool creation
const DECIMALS = 8;
await createPool(
  tokenA,
  tokenB,
  100 * Math.pow(10, DECIMALS),        // 100 WETH
  300000 * Math.pow(10, DECIMALS)      // 300,000 DAI
);
```

### Mistake #3: Reading Reserves Wrong
```javascript
// ❌ WRONG - Treating reserves as human values
const rate = reserveB / reserveA;  // Both are in smallest units!

// ✅ CORRECT - Convert to human first OR keep as ratio
const rate = (reserveB / Math.pow(10, 8)) / (reserveA / Math.pow(10, 8));
// OR simply:
const rate = reserveB / reserveA;  // Ratio is same regardless of decimals
```

## How to Fix

### If Pool Was Created Incorrectly:

You need to recreate the pool with correct decimal values:

```javascript
// Use the pool creation form with HUMAN-READABLE values
Token A Amount: 100        // Not 10000000000
Token B Amount: 300000     // Not 30000000000000

// The frontend should convert these automatically
```

### If Input Is Wrong:

Simply enter human-readable amounts:

```javascript
// In the swap input field
From: 10         // Not 1000000000
To: (calculated) // Will show correct output
```

## Debugging Checklist

Run through this checklist:

1. **Check Pool Reserves in Console**
   ```javascript
   // After loading the swap page, check:
   reserveA_human: "???"  // Should be reasonable (e.g., 100, not 0.000001)
   reserveB_human: "???"  // Should be reasonable (e.g., 300000, not 0.3)
   ```

2. **Check Your Input**
   ```javascript
   amountIn_human: "???"  // Should match what you typed (e.g., "10")
   amountIn: "???"        // Should be typed * 10^8 (e.g., "1000000000")
   ```

3. **Check Exchange Rate**
   ```javascript
   // For WETH/DAI, rate should be ~1000-4000
   // NOT 0.087 (that's backwards!)
   ```

4. **Check Price Impact**
   ```javascript
   // Should be:
   // < 1% for small swaps (< 1% of pool)
   // 1-5% for medium swaps
   // > 5% for large swaps (> 10% of pool)
   // NOT 100% unless you're literally draining the pool
   ```

5. **Check Fee Calculation**
   ```javascript
   // For 10 WETH swap at 0.3% fee:
   // Fee = 10 * 0.003 = 0.03 WETH
   // NOT 11832 WETH!
   ```

## Quick Test Values

To verify everything works, try these test values:

### Small Swap Test
```
Input: 1 WETH
Expected Output: ~2970 DAI (if pool is 100:300000)
Expected Fee: 0.003 WETH
Expected Impact: ~1%
```

### Medium Swap Test
```
Input: 10 WETH
Expected Output: ~27000 DAI
Expected Fee: 0.03 WETH
Expected Impact: ~9%
```

### Large Swap Test
```
Input: 50 WETH
Expected Output: ~100000 DAI
Expected Fee: 0.15 WETH
Expected Impact: ~33%
```

## Solution Summary

**Most Likely Issue:** You entered `3944000` when you should have entered `39.44`

**How to Fix:**
1. Clear the input field
2. Enter: `39.44` (or whatever human-readable amount you want)
3. The UI will automatically convert to `3944000000` (with 8 decimals)
4. You should now see correct values

**If That Doesn't Work:**

Your pool reserves are probably wrong. Check the console log for:
```javascript
reserveA_human: "???"
reserveB_human: "???"
```

If these show tiny values (like `0.000001`), you need to recreate the pool with correct decimal handling.

---

**To Confirm:** Please share the console log output showing the "Pool data for swap" section, and I can tell you exactly what's wrong!
