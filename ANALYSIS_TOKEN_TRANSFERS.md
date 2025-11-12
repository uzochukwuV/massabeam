# Token Transfer Pattern Analysis

## Problem Identified

The legacy pool scripts (`src/legacy/create-pools.ts`, `src/legacy/add-liquidity.ts`) have **incorrect decimal handling** that doesn't respect real Massa token standards.

---

## Comparison: MassaBeam vs Dussa

### **MassaBeam Pattern (main.ts)**

```typescript
// Contract function signature (lines 478-492)
export function createPool(args: StaticArray<u8>): void {
  const tokenA = new Address(argument.nextString().unwrap());
  const tokenB = new Address(argument.nextString().unwrap());
  const amountA = argument.nextU64().unwrap(); // Takes u64
  const amountB = argument.nextU64().unwrap(); // Takes u64

  // Transfer tokens (lines 508-509)
  safeTransferFrom(tokenA, caller, Context.callee(), amountA); // u64 → u256 conversion
  safeTransferFrom(tokenB, caller, Context.callee(), amountB);
}

// Safe transfer function (lines 405-420)
function safeTransferFrom(token: Address, from: Address, to: Address, amount: u64): bool {
  const tokenContract = new IERC20(token);
  tokenContract.transferFrom(from, to, u256.fromU64(amount)); // ✅ Converts u64 → u256
  return true;
}
```

**Key Points:**
- ✅ Takes **u64** arguments for gas efficiency
- ✅ Converts to **u256** internally for ERC20 compatibility
- ✅ Pattern is CORRECT

### **Dussa Pattern (Router.ts)**

```typescript
// Contract function signature (lines 356-377)
export function swapExactTokensForTokens(bs: StaticArray<u8>): StaticArray<u8> {
  const amountIn = args.nextU256().expect('amountIn is missing'); // Takes u256 directly

  // Transfer tokens (line 377)
  tokenPath[0].transferFrom(Context.caller(), pairs[0], amountIn); // Direct u256 transfer
}
```

**Key Points:**
- ✅ Takes **u256** arguments directly
- ✅ No conversion needed
- ✅ Pattern is also CORRECT (different approach)

---

## The Real Problem: Legacy Scripts

### **Issue 1: Incorrect Decimal Handling**

```typescript
// legacy/create-pools.ts (lines 30-58)
const POOLS = [
  {
    name: 'BEAM/USDT',
    tokenA: 'BEAM',
    tokenB: 'USDT',
    amountA: '900000000',     // ❌ What does this mean?
    amountB: '600000000',     // ❌ What decimal standard?
    decimalsA: 8,             // ❌ Wrong! USDC = 6, DAI = 18
    decimalsB: 8,             // ❌ Hardcoded to 8 for all tokens
  },
];
```

### **Issue 2: Unused Conversion Function**

```typescript
// Has conversion function (lines 60-65)
function toU256(amount: string, decimals: number): bigint {
  const multiplier = BigInt(10 ** decimals);
  // ... proper conversion logic
}

// But ONLY uses it for approval (line 127)
await tokenAContract.call(
  'increaseAllowance',
  new Args().addU256(amountA256), // ✅ Uses toU256 result
);

// Does NOT use it for contract call (line 155)
const createPoolArgs = new Args()
  .addU64(BigInt(pool.amountA))  // ❌ Direct string → BigInt (WRONG!)
  .addU64(BigInt(pool.amountB)); // ❌ No decimal conversion!
```

### **Issue 3: Token Standard Mismatch**

**Real Massa Token Standards:**
| Token | Decimals | 1 Token (in smallest units) |
|-------|----------|----------------------------|
| USDC  | 6        | 1,000,000                  |
| USDT  | 6        | 1,000,000                  |
| DAI   | 18       | 1,000,000,000,000,000,000  |
| WETH  | 18       | 1,000,000,000,000,000,000  |
| WMAS  | 9        | 1,000,000,000              |

**Legacy Script Assumes:**
- All tokens have 8 decimals ❌
- Hardcoded amounts without proper conversion ❌

---

## Correct Implementation

### **What JavaScript Scripts Should Do:**

```typescript
// ✅ CORRECT: Proper decimal handling
const USDC_DECIMALS = 6;
const DAI_DECIMALS = 18;
const WMAS_DECIMALS = 9;

// Human-readable amounts
const humanAmount = 1000; // "1000 USDC"

// Convert to contract units (u64)
const contractAmount = BigInt(humanAmount * (10 ** USDC_DECIMALS)); // 1000000000

// Pass to contract
const args = new Args()
  .addU64(contractAmount); // Correct u64 with proper decimals

// For approval (u256)
await tokenContract.call(
  'increaseAllowance',
  new Args().addU256(BigInt(humanAmount * (10 ** USDC_DECIMALS)))
);
```

### **Example: Creating USDC/DAI Pool**

```typescript
// Want: 1000 USDC + 1000 DAI

// USDC (6 decimals)
const usdcAmount = BigInt(1000) * BigInt(10 ** 6);  // 1,000,000,000

// DAI (18 decimals)
const daiAmount = BigInt(1000) * BigInt(10 ** 18);  // 1,000,000,000,000,000,000,000

// Create pool
const args = new Args()
  .addString(USDC[0].address)
  .addString(DAI[0].address)
  .addU64(usdcAmount)   // ✅ Proper USDC decimals
  .addU64(daiAmount)    // ✅ Proper DAI decimals
  .addU64(deadline);
```

---

## Summary

### **Contract Implementation (main.ts):**
✅ **CORRECT** - Uses u64 internally, converts to u256 for transfers

### **Dussa Implementation (Router.ts):**
✅ **CORRECT** - Uses u256 directly (different but valid approach)

### **Legacy Scripts (create-pools.ts, add-liquidity.ts):**
❌ **INCORRECT** - Don't respect real token decimals (6, 18, 9)
❌ **INCORRECT** - Pass raw strings without proper conversion
❌ **INCORRECT** - Assume all tokens have 8 decimals

---

## Solution

Create new scripts that:
1. ✅ Use real token addresses from `@dusalabs/sdk`
2. ✅ Apply correct decimal conversions (USDC=6, DAI=18, WMAS=9)
3. ✅ Convert human amounts to contract units properly
4. ✅ Pass correct u64 amounts to main.ts contract

See: `src/create-pools.ts` and `src/add-liquidity.ts` (new versions)
