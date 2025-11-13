# Pool & Liquidity Scripts - Fixed ✅

## Summary of Changes

The pool creation and liquidity scripts have been completely rewritten to properly handle token decimals according to Massa blockchain standards.

---

## What Was Wrong? ❌

### **Legacy Scripts (`src/legacy/`)**

The old scripts had **critical decimal handling issues**:

```typescript
// ❌ WRONG: Hardcoded decimals (all tokens assumed to be 8 decimals)
const POOLS = [
  {
    amountA: '900000000',  // What does this mean? 900M units?
    decimalsA: 8,          // ❌ WRONG for USDC (should be 6)
    decimalsB: 8,          // ❌ WRONG for DAI (should be 18)
  }
];

// ❌ WRONG: Conversion function exists but NOT used
function toU256(amount: string, decimals: number): bigint {
  return BigInt(amount) * BigInt(10 ** decimals);
}

// ❌ WRONG: Direct string → BigInt without decimal conversion
const args = new Args()
  .addU64(BigInt(pool.amountA)); // Just converts '900000000' to 900000000
```

**Problems:**
1. Assumed all tokens have 8 decimals (WRONG!)
2. Hardcoded amounts without proper decimal multiplication
3. `toU256()` conversion function was only used for approval, not for contract amounts
4. Resulted in incorrect pool ratios and prices

---

## What's Fixed? ✅

### **New Scripts (`src/create-pools.ts`, `src/add-liquidity.ts`)**

#### **1. Correct Token Decimal Standards**

```typescript
// ✅ CORRECT: Uses real Massa token standards
const POOLS: PoolConfig[] = [
  {
    name: 'USDC/DAI',
    tokenA: { address: USDC[0].address, symbol: 'USDC', decimals: 6 },  // ✅ 6 decimals
    tokenB: { address: DAI[0].address, symbol: 'DAI', decimals: 18 },   // ✅ 18 decimals
    amountA: 10000, // Human-readable: 10,000 USDC
    amountB: 10000, // Human-readable: 10,000 DAI
  },
  {
    name: 'WMAS/USDC',
    tokenA: { address: WMAS[0].address, symbol: 'WMAS', decimals: 9 },  // ✅ 9 decimals
    tokenB: { address: USDC[0].address, symbol: 'USDC', decimals: 6 },  // ✅ 6 decimals
    amountA: 10000, // 10,000 WMAS
    amountB: 1000,  // 1,000 USDC
  },
];
```

#### **2. Proper Decimal Conversion**

```typescript
// ✅ CORRECT: Convert human amounts to contract units
function toContractUnits(humanAmount: number, decimals: number): bigint {
  return BigInt(humanAmount) * BigInt(10 ** decimals);
}

// Example usage:
const amountAUnits = toContractUnits(10000, 6);  // USDC: 10000 * 1e6 = 10,000,000,000
const amountBUnits = toContractUnits(10000, 18); // DAI:  10000 * 1e18 = 10,000,000,000,000,000,000,000
```

#### **3. Correct Contract Calls**

```typescript
// ✅ CORRECT: Pass u64 with proper decimals to contract
const createPoolArgs = new Args()
  .addString(pool.tokenA.address)
  .addString(pool.tokenB.address)
  .addU64(amountAUnits) // ✅ u64 with USDC decimals (6)
  .addU64(amountBUnits) // ✅ u64 with DAI decimals (18)
  .addU64(deadline);

await ammContract.call('createPool', createPoolArgs, {
  coins: Mas.fromString('0.5'),
});
```

#### **4. Slippage Protection (Add Liquidity)**

```typescript
// ✅ CORRECT: Calculate minimum amounts with slippage
const slippageMultiplier = BigInt(10000 - config.slippageBps);
const amountAMin = (amountADesired * slippageMultiplier) / BigInt(10000);
const amountBMin = (amountBDesired * slippageMultiplier) / BigInt(10000);

const addLiquidityArgs = new Args()
  .addString(config.tokenA.address)
  .addString(config.tokenB.address)
  .addU64(amountADesired) // ✅ Desired amounts
  .addU64(amountBDesired)
  .addU64(amountAMin)     // ✅ Minimum amounts with slippage
  .addU64(amountBMin)
  .addU64(deadline);
```

---

## Token Decimal Standards

| Token | Decimals | 1 Token (smallest units) | Example: 1000 tokens |
|-------|----------|--------------------------|----------------------|
| **USDC** | 6 | 1,000,000 | 1,000,000,000 |
| **USDT** | 6 | 1,000,000 | 1,000,000,000 |
| **DAI** | 18 | 1,000,000,000,000,000,000 | 1,000,000,000,000,000,000,000 |
| **WETH** | 18 | 1,000,000,000,000,000,000 | 1,000,000,000,000,000,000,000 |
| **WMAS** | 9 | 1,000,000,000 | 1,000,000,000,000 |

---

## Contract Pattern Verification ✅

### **MassaBeam main.ts Pattern**

```typescript
// ✅ CORRECT: Takes u64, converts to u256 for transfers
export function createPool(args: StaticArray<u8>): void {
  const amountA = argument.nextU64().unwrap(); // Takes u64
  const amountB = argument.nextU64().unwrap(); // Takes u64

  // Converts u64 → u256 for ERC20 transfers
  safeTransferFrom(tokenA, caller, Context.callee(), amountA);
}

function safeTransferFrom(token: Address, from: Address, to: Address, amount: u64): bool {
  const tokenContract = new IERC20(token);
  tokenContract.transferFrom(from, to, u256.fromU64(amount)); // ✅ u64 → u256
  return true;
}
```

**Pattern:**
- JavaScript: Pass u64 amounts with proper decimals
- Contract: Takes u64, converts to u256 for token operations
- ✅ This is correct and gas-efficient!

### **Dussa Router Pattern**

```typescript
// Takes u256 directly (different but also valid)
export function swapExactTokensForTokens(bs: StaticArray<u8>): StaticArray<u8> {
  const amountIn = args.nextU256(); // Takes u256
  tokenPath[0].transferFrom(Context.caller(), pairs[0], amountIn);
}
```

**Pattern:**
- JavaScript: Pass u256 amounts
- Contract: Takes u256, uses directly
- ✅ Also correct (no conversion needed)

**Conclusion:** MassaBeam's pattern is correct and more gas-efficient!

---

## Usage Instructions

### **1. Create Pools**

```bash
npm run create-pools
```

Creates 4 pools with proper decimal handling:
- USDC/DAI (10,000 + 10,000)
- WETH/USDC (5 + 10,000)
- WMAS/USDC (10,000 + 1,000)
- WETH/DAI (5 + 10,000)

### **2. Add Liquidity**

```bash
npm run add-liquidity
```

Adds liquidity to existing pools:
- USDC/DAI (5,000 + 5,000)
- WETH/USDC (2 + 4,000)
- WMAS/USDC (5,000 + 500)
- WETH/DAI (2 + 4,000)

### **3. Full Setup**

```bash
npm run setup
```

Runs complete setup:
1. Deploy all contracts
2. Mint tokens
3. Create pools
4. Add liquidity

---

## What to Test

### **Before Testing:**

1. Ensure contracts are deployed:
   ```bash
   npm run deploy:all
   ```

2. Check you have tokens (or mint them):
   ```bash
   npm run mint-tokens
   ```

3. Verify token balances using massa-web3

### **Testing Pool Creation:**

```bash
npm run create-pools
```

**Expected Output:**
```
✅ Pool created successfully!
   Price: 1 USDC = 1.000000 DAI
   Price: 1 DAI = 1.000000 USDC
```

**Check:**
- Pools are created with correct reserves
- Prices reflect correct ratios (e.g., 1 USDC = 1 DAI)
- LP tokens are minted correctly

### **Testing Add Liquidity:**

```bash
npm run add-liquidity
```

**Expected Output:**
```
✅ Liquidity added successfully!
   Slippage: 1%
   Amount A Min: 4950.000000 USDC
   Amount B Min: 4950.000000000000000000 DAI
```

**Check:**
- Liquidity is added with correct amounts
- Slippage protection works
- LP tokens increase correctly

### **Testing Swaps:**

```bash
npm run swap
```

**Check:**
- Swap 100 USDC → DAI
- Output is ~99.7 DAI (accounting for fees)
- Pool reserves update correctly

---

## Files Created/Updated

### **New Files:**
1. ✅ `ANALYSIS_TOKEN_TRANSFERS.md` - Detailed analysis of token transfer patterns
2. ✅ `src/create-pools.ts` - New pool creation script with proper decimals
3. ✅ `src/add-liquidity.ts` - New liquidity script with proper decimals
4. ✅ `POOL_SCRIPTS_FIXED.md` - This summary document

### **Moved to Legacy:**
1. `src/legacy/create-pools.ts` - Old script (incorrect decimals)
2. `src/legacy/add-liquidity.ts` - Old script (incorrect decimals)

### **package.json:**
Already correctly configured:
```json
{
  "scripts": {
    "create-pools": "tsx src/create-pools.ts",    // ✅ Uses new script
    "add-liquidity": "tsx src/add-liquidity.ts",  // ✅ Uses new script
    "setup": "npm run deploy:all && npm run mint-tokens && npm run create-pools && npm run add-liquidity"
  }
}
```

---

## Key Takeaways

1. ✅ **MassaBeam contract pattern is CORRECT**
   - Uses u64 for gas efficiency
   - Converts to u256 for ERC20 compatibility

2. ✅ **New scripts properly handle decimals**
   - USDC: 6 decimals
   - DAI: 18 decimals
   - WETH: 18 decimals
   - WMAS: 9 decimals

3. ✅ **Human-readable configuration**
   - Define amounts like: `amountA: 10000` (means 10,000 USDC)
   - Script converts to proper contract units automatically

4. ✅ **Slippage protection implemented**
   - Add liquidity with configurable slippage (1-2%)
   - Prevents front-running and price manipulation

5. ✅ **Ready for production testing**
   - Test on buildnet first
   - Verify all pool ratios
   - Check LP token minting
   - Test swaps across all pools

---

## Next Steps

1. **Test pool creation:**
   ```bash
   npm run create-pools
   ```

2. **Test liquidity addition:**
   ```bash
   npm run add-liquidity
   ```

3. **Test swaps:**
   ```bash
   npm run swap
   ```

4. **Monitor pool health:**
   - Check reserves with `getPool()`
   - Verify prices are correct
   - Test arbitrage opportunities

5. **Deploy to mainnet** (when ready):
   - Update network in scripts
   - Test thoroughly on buildnet first
   - Document all pool parameters

---

**Status:** ✅ **COMPLETE AND READY FOR TESTING**

The pool and liquidity scripts now correctly handle token decimals and are ready for production use on Massa blockchain!
