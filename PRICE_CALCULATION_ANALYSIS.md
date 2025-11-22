# Price Calculation Analysis - Limit Orders Bot

## Problem Identified

**Current Price Mismatch:**
- Contract returns: `currentPrice = 13902`
- Test expects: `currentPrice ≈ 0.02` (from pool reserves)
- Limit Price set: `10000000000000000` (1e16)

**Result:** Price condition can never be met because:
- Contract sees: 13902 <= 10000000000000000 ✓ (condition is TRUE!)
- But orders aren't executing

## Root Cause

The contract function `readQuoteSwapExactInput()` returns **amountOut** (output amount from swap), not a price ratio!

### Pool Reserves:
```
Reserve A = 100000000 (100 tokens with 6 decimals)
Reserve B = 2000000   (2 tokens with 6 decimals)
Price = 2000000 / 100000000 = 0.02
```

### What Contract Returns:
When you call `readQuoteSwapExactInput(tokenA, tokenB, amountIn=1000000)`:
- It performs getAmountOut(1000000, reserveA, reserveB, fee)
- Returns the OUTPUT amount of tokenB you'd get for 1000000 tokenA
- NOT the price ratio!

### Correct Price Calculation:
```
Price (reserve ratio) = reserveOut / reserveIn = 2000000 / 100000000 = 0.02

Price (from swap quote) = amountOut / amountIn = 13902 / 1000000 ≈ 0.013902

These are NOT the same because:
1. One is reserve ratio
2. One is affected by fees
3. Different scaling factors
```

## Solution

The test should use **reserve-based price**, not swap quote:

```typescript
// CORRECT: Use actual pool reserves
const currentPrice = Number(reserveB) / Number(reserveA);

// Set limit price proportionally
const limitPrice = BigInt(Math.floor(currentPrice * 0.5 * 1e18));

// This gives: 0.02 * 0.5 * 1e18 = 1e16 ✓ Correct!
```

## Verification

Event shows:
```
LimitOrder:PriceCheck|currentPrice=13902|limitPrice=10000000000000000
```

- Contract is using swap quote (13902) as price
- Test set limitPrice as reserve ratio (1e16)
- Comparison: 13902 vs 10000000000000000
- Condition: 13902 <= 10000000000000000 = TRUE ✓

## Why Orders Not Executing?

The condition IS meeting (13902 <= 1e16), but orders aren't executing because:

1. **The limit_orders_autonomous contract is getting the WRONG price**
   - It's calling `readQuoteSwapExactInput()` which returns amountOut
   - Should be using reserve ratio instead

2. **The contract needs to calculate price as:**
   ```
   price = reserveOut / reserveIn (or amountOut / amountIn depending on intent)
   ```

## Recommendation

**Option A: Fix the test** (simpler)
- Don't use reserve-ratio-based limit price
- Use swap-quote-based limit price
- Set limitPrice = BigInt(Math.floor(13902 * 0.5)) instead of 1e16

**Option B: Fix the contract** (better)
- In `advance()`, calculate price using reserve ratio
- ```typescript
  const currentPrice = (reserveOut * BigInt(1e18)) / reserveIn;
  ```
- This gives consistent pricing independent of swap amounts

**Current Implementation:** Contract uses swap quote (13902) but comparison is correct.
The real issue might be in order execution logic or bot cycle detection.
