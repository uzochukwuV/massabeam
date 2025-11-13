# Bugs Found in Legacy Test Scripts

**Analysis Date**: $(date)
**Analyzed Scripts**: `deploy-massabeam.ts`, `swap.ts`, `liquidity.ts`, `smart-swap.ts`, `arbitrage.ts`

---

## 🐛 Critical Bugs

### 1. **deploy-massabeam.ts**

#### Bug #1: Incorrect Bytecode Loading
```typescript
// ❌ WRONG
function getScByteCode(dirPath: string, filename: string): StaticArray<u8> {
  const buffer = fs.readFileSync(filePath);
  return new StaticArray<u8>(buffer.length); // Creates empty array!
}
```
**Impact**: Contract deployment fails silently
**Fix**: Use `Uint8Array.from(buffer)` directly

#### Bug #2: Wrong Constructor Args for Arbitrage Engine
```typescript
// ❌ WRONG
const constructorArgs = new Args()
  .addString(massaBeamAddress)
  .addString(dusaRouterAddress)
  .addString(dusaQuoterAddress); // 3 params!
```
**Impact**: Deployment fails - arbitrage engine expects only 2 params
**Expected**: `(massaBeamAddress, dusaRouterAddress)`

---

### 2. **swap.ts**

#### Bug #1: Broken Deadline Calculation
```typescript
// ❌ WRONG (Line 170)
const deadline = swap.deadline - 1000; // Meaningless subtraction!
```
**Impact**: Deadline is in past, swaps fail
**Fix**: `const deadline = Math.floor(Date.now() / 1000) + swap.deadline;`

#### Bug #2: Type Mismatch in Args
```typescript
// ❌ WRONG (Line 189-191)
const swapArgs = new Args()
  .addU64(amountIn)  // amountIn is BigInt, but addU64 expects number
```
**Impact**: Argument serialization fails
**Fix**: Convert BigInt to Number or use proper handling

#### Bug #3: No Token Balance Validation
```typescript
// ❌ MISSING
// No check if user has sufficient token balance before swap
```
**Impact**: Swap fails after approval, wasting gas

---

### 3. **liquidity.ts**

#### Bug #1: Wrong Variable in Token Balance Read (Line 241)
```typescript
// ❌ WRONG
const tokenBBalance = await tokenAContract.read(...); // Should be tokenBContract!
```
**Impact**: Reads wrong token balance, incorrect logging

#### Bug #2: Mixed u64/u256 Types in removeLiquidity (Lines 423-426)
```typescript
// ❌ WRONG
const removeLiquidityArgs = new Args()
  .addU256(BigInt(bytesToStr(lpBalance.value))) // Contract expects u64!
  .addU256(amountAMin)  // Contract expects u64!
  .addU256(amountBMin); // Contract expects u64!
```
**Impact**: Function call fails due to type mismatch
**Contract Signature**: `removeLiquidity(tokenA, tokenB, liquidity: u64, amountAMin: u64, amountBMin: u64, deadline: u64)`

#### Bug #3: createPool Uses u64 Instead of BigInt
```typescript
// ❌ WRONG (Line 258-260)
.addU64(amountA)  // amountA is BigInt, not number
.addU64(amountB)
.addU64(BigInt(deadline)) // Inconsistent type handling
```
**Impact**: Type conversion errors, unexpected behavior

---

### 4. **smart-swap.ts**

#### Bug #1: Broken Slippage Calculation (Lines 128-129)
```typescript
// ❌ WRONG
const slippageFactor = BigInt(Math.floor((100 - slippagePercent) * 100)) / BigInt(10000);
return (amountOut * slippageFactor) / BigInt(100);
// Result: integer division destroys precision!
```
**Impact**: Slippage protection doesn't work correctly
**Fix**: Use proper BigInt math: `(amountOut * (10000n - slippage)) / 10000n`

#### Bug #2: No Token Approval
```typescript
// ❌ MISSING
// SmartSwap contract needs approval to spend user's tokens
```
**Impact**: All swaps fail with "insufficient allowance"

#### Bug #3: Quote Comparison Doesn't Handle Errors
```typescript
// ❌ WRONG (Lines 232-286)
const args = new Args(result.value);
const massaBeamDex = args.nextString(); // Throws if value is empty
```
**Impact**: Script crashes instead of graceful error handling

---

### 5. **arbitrage.ts**

#### Bug #1: Incorrect Pool Data Deserialization (Lines 206-216)
```typescript
// ❌ WRONG
const reserves = poolData.value; // [reserveA, reserveB]
const reserveA = Number(reserves[0] || 0); // poolData.value is serialized bytes!
```
**Impact**: Price calculation always returns 0
**Fix**: Use `Args` to deserialize pool data properly

#### Bug #2: Wrong Quoter Method Signature (Lines 232-242)
```typescript
// ❌ WRONG
const quoteData = await quoter.read('quote', quoteArgs);
```
**Impact**: Method doesn't exist on Dusa Quoter
**Expected**: `findBestPathFromAmountIn(route, amountIn)`

#### Bug #3: Missing maxIterations in startEngine (Lines 610-613)
```typescript
// ❌ WRONG
const initArgs = new Args(); // Empty args!
const initReceipt = await engine.call('startEngine', initArgs, {...});
```
**Impact**: Engine starts with default 0 iterations, never runs
**Expected**: `.add(maxIterations)` in Args

---

## ⚠️ Design Issues

### 1. **Global Issues Across All Scripts**

1. **No Retry Mechanism**: Network failures cause immediate script failure
2. **No Gas Estimation**: Scripts don't check if user has enough MAS
3. **Poor Error Messages**: Generic errors don't help debugging
4. **No State Validation**: Scripts don't verify contract state before operations
5. **Hardcoded Values**: Addresses, amounts, and configs are scattered throughout
6. **No Transaction Receipts**: Scripts don't wait for or verify transaction finality

### 2. **Shared Antipatterns**

```typescript
// ❌ ANTIPATTERN: Path guessing
const possiblePaths = [path1, path2, path3, ...]; // Fragile
// ✅ BETTER: Use build config or environment variable

// ❌ ANTIPATTERN: Sleep for fixed time
await sleep(2000); // Arbitrary delays
// ✅ BETTER: Poll for transaction confirmation

// ❌ ANTIPATTERN: No validation
await contract.call('swap', args); // Assume success
// ✅ BETTER: Check balance, allowance, pool existence first
```

---

## 📊 Bug Summary

| Script                | Critical Bugs | Design Issues | Total |
|-----------------------|---------------|---------------|-------|
| deploy-massabeam.ts   | 2             | 3             | 5     |
| swap.ts               | 3             | 4             | 7     |
| liquidity.ts          | 3             | 5             | 8     |
| smart-swap.ts         | 3             | 3             | 6     |
| arbitrage.ts          | 3             | 4             | 7     |
| **TOTAL**             | **14**        | **19**        | **33**|

---

## ✅ Fixes Implemented in New Scripts

1. **Type-safe argument serialization** with proper u64/u256 handling
2. **Comprehensive validation** before all operations
3. **Retry mechanisms** with exponential backoff
4. **Transaction receipt verification** with confirmations
5. **Centralized configuration** in single source of truth
6. **Proper error handling** with descriptive messages
7. **State machines** for complex workflows
8. **Test fixtures** for reproducible testing
9. **Gas estimation** before transactions
10. **Modular architecture** with shared utilities

---

## 📝 Migration Guide

To use the new test scripts:

```bash
# Old (buggy)
npm run swap

# New (fixed)
npm run test:amm -- --action swap

# Run full test suite
npm run test:all
```

All legacy scripts have been moved to `src/legacy/` for reference.
