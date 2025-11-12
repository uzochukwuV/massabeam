# 🔢 MassaBeam Token Decimals Guide

## **Understanding Token Decimals on Massa Blockchain**

This guide explains how MassaBeam handles token decimals, why we use `u64` for calculations and `u256` for transfers, and how to work with different token standards.

---

## **📊 Token Standards on Massa**

### **Standard Token Decimals:**

| Token | Decimals | Example (1 token) | Note |
|-------|----------|-------------------|------|
| **USDC** | 6 | `1,000,000` | Stablecoin standard |
| **USDT** | 6 | `1,000,000` | Stablecoin standard |
| **DAI** | 18 | `1,000,000,000,000,000,000` | ERC20 standard |
| **WETH** | 18 | `1,000,000,000,000,000,000` | ETH standard |
| **WMAS** | 9 | `1,000,000,000` | Massa native (like MAS) |

**Key Point:** Different tokens have different decimal precision!

---

## **🔧 Contract Implementation Pattern**

### **Why u64 + u256?**

```typescript
// ✅ CORRECT Pattern (used in MassaBeam contracts):

// 1. Internal calculations: u64 (gas efficient)
const amountOut: u64 = getAmountOut(amountIn, reserveIn, reserveOut, fee);
const liquidity: u64 = safeSqrt(amountA, amountB);
const reserveA: u64 = pool.reserveA;

// 2. Token transfers: u256 (ERC20 standard)
tokenContract.transfer(to, u256.fromU64(amount));
tokenContract.transferFrom(from, to, u256.fromU64(amount));
tokenContract.balanceOf(address); // Returns u256
```

### **Why This Works:**

1. **u64 Range:** 0 to 18,446,744,073,709,551,615
   - Enough for: 18 billion tokens with 18 decimals
   - Enough for: 18 trillion USDC (6 decimals)
   - Perfect for most DeFi operations

2. **Gas Efficiency:**
   - u64 operations are faster and cheaper
   - Most AMM calculations fit comfortably in u64
   - Only convert to u256 when interacting with ERC20

3. **Safety:**
   - No precision loss in conversions
   - All internal math stays in u64
   - Token interface gets proper u256

---

## **💡 Code Examples**

### **Example 1: Adding Liquidity**

```typescript
// User wants to add 1000 USDC + 2 WETH

// USDC: 6 decimals
const amountUSDC: u64 = 1000 * 1_000_000; // = 1,000,000,000

// WETH: 18 decimals
const amountWETH: u64 = 2 * 1_000_000_000_000_000_000; // = 2e18

// Internal AMM calculation (u64)
const liquidity: u64 = safeSqrt(amountUSDC, amountWETH);

// Transfer tokens (u256)
usdcContract.transferFrom(user, pool, u256.fromU64(amountUSDC));
wethContract.transferFrom(user, pool, u256.fromU64(amountWETH));
```

### **Example 2: Swapping Tokens**

```typescript
// Swap 100 USDC for WETH

// Input: 100 USDC (6 decimals)
const amountIn: u64 = 100 * 1_000_000; // = 100,000,000

// Calculate output using AMM formula (all u64)
const reserveIn: u64 = 1_000_000 * 1_000_000; // Pool has 1M USDC
const reserveOut: u64 = 500 * 1_000_000_000_000_000_000; // Pool has 500 WETH
const fee: u64 = 30; // 0.3%

// AMM calculation (u64)
const amountOut: u64 = getAmountOut(amountIn, reserveIn, reserveOut, fee);

// Transfers (u256)
usdcContract.transferFrom(user, pool, u256.fromU64(amountIn));
wethContract.transfer(user, u256.fromU64(amountOut));
```

### **Example 3: Flash Loan**

```typescript
// Flash loan 1,000,000 DAI (18 decimals)

const loanAmount: u64 = 1_000_000 * 1_000_000_000_000_000_000; // 1M DAI
const fee: u64 = u64(f64(loanAmount) * 0.0009); // 0.09% fee

// Transfer loan (u256)
daiContract.transfer(borrower, u256.fromU64(loanAmount));

// ... borrower does arbitrage ...

// Check repayment (u256 → u64)
const balanceAfter: u256 = daiContract.balanceOf(poolAddress);
assert(balanceAfter.toU64() >= loanAmount + fee, "Not repaid");
```

---

## **⚠️ Common Mistakes to Avoid**

### **❌ WRONG: Mixing decimal scales**

```typescript
// DON'T DO THIS:
const usdcAmount = 100; // Missing decimals!
const daiAmount = 100;  // Different decimal scales!

// This creates wrong price ratios!
const price = usdcAmount / daiAmount; // ❌ Wrong!
```

### **✅ CORRECT: Always use proper decimals**

```typescript
// DO THIS:
const usdcAmount = 100 * 1_000_000;              // 100 USDC (6 decimals)
const daiAmount = 100 * 1_000_000_000_000_000_000; // 100 DAI (18 decimals)

// Now calculate price correctly
const price = (daiAmount * 1_000_000) / usdcAmount; // Normalized to USDC scale
```

### **❌ WRONG: Using u64 for token transfers**

```typescript
// DON'T DO THIS:
tokenContract.transfer(to, amount); // ❌ Type error!
```

### **✅ CORRECT: Convert to u256 for transfers**

```typescript
// DO THIS:
tokenContract.transfer(to, u256.fromU64(amount)); // ✅ Correct!
```

---

## **🧮 Decimal Conversion Reference**

### **From Human-Readable to Contract:**

```typescript
// USDC (6 decimals)
1 USDC      → 1_000_000
100 USDC    → 100_000_000
1000 USDC   → 1_000_000_000

// DAI (18 decimals)
1 DAI       → 1_000_000_000_000_000_000
100 DAI     → 100_000_000_000_000_000_000
1000 DAI    → 1_000_000_000_000_000_000_000

// WMAS (9 decimals)
1 WMAS      → 1_000_000_000
100 WMAS    → 100_000_000_000
1000 WMAS   → 1_000_000_000_000
```

### **From Contract to Human-Readable:**

```typescript
function formatUSDC(amount: u64): string {
  const whole = amount / 1_000_000;
  const fraction = amount % 1_000_000;
  return `${whole}.${fraction.toString().padStart(6, '0')} USDC`;
}

function formatDAI(amount: u64): string {
  const whole = amount / 1_000_000_000_000_000_000;
  const fraction = amount % 1_000_000_000_000_000_000;
  return `${whole}.${fraction.toString().padStart(18, '0')} DAI`;
}
```

---

## **📚 SDK Usage Examples**

### **JavaScript/TypeScript (massa-web3):**

```typescript
import { Args } from '@massalabs/massa-web3';
import { USDC, DAI, WETH } from '@dusalabs/sdk';

// Add liquidity with proper decimals
const amountUSDC = BigInt(1000 * 1_000_000); // 1000 USDC
const amountDAI = BigInt(1000) * BigInt(10 ** 18); // 1000 DAI

const args = new Args()
  .addString(USDC[0].address)
  .addString(DAI[0].address)
  .addU64(amountUSDC)
  .addU64(amountDAI)
  .addU64(BigInt(950 * 1_000_000)) // Min USDC
  .addU64(BigInt(950) * BigInt(10 ** 18)) // Min DAI
  .addU64(BigInt(Date.now() + 3600000)); // Deadline

await contract.call('addLiquidity', args, { coins: Mas.fromString('0.1') });
```

---

## **🔍 Debugging Tips**

### **1. Always Log with Decimals:**

```typescript
// Bad logging
console.log('Amount:', amount); // Shows: 1000000000000000000

// Good logging
console.log('Amount:', formatDAI(amount)); // Shows: 1.0 DAI
```

### **2. Check Token Decimals:**

```typescript
// Before any calculation, verify decimals
const decimals = token.decimals; // From Dussa SDK
console.log(`Token ${token.symbol} has ${decimals} decimals`);
```

### **3. Test with Small Amounts First:**

```typescript
// Start with small amounts for testing
const testAmount = 1 * 1_000_000; // 1 USDC
// NOT: 1_000_000 * 1_000_000 (1 million USDC!)
```

---

## **✅ Best Practices**

1. **Always use constants:**
   ```typescript
   const USDC_DECIMALS = 6;
   const DAI_DECIMALS = 18;
   const WMAS_DECIMALS = 9;
   ```

2. **Create helper functions:**
   ```typescript
   function toUSDC(amount: number): u64 {
     return u64(amount * 1_000_000);
   }
   ```

3. **Validate decimal scales:**
   ```typescript
   assert(amountUSDC < u64.MAX_VALUE, "Amount too large for u64");
   ```

4. **Use BigInt in JavaScript:**
   ```typescript
   const amount = BigInt(1000) * BigInt(10 ** 18); // Correct
   // NOT: 1000 * 10 ** 18 (loses precision)
   ```

5. **Document all amounts:**
   ```typescript
   const liquidityAmount: u64 = 1_000_000; // 1 USDC (6 decimals)
   ```

---

## **🎓 Summary**

**Key Takeaways:**

1. ✅ Use **u64** for internal AMM calculations (reserves, amounts, liquidity)
2. ✅ Use **u256** for token transfers (ERC20 interface)
3. ✅ Always remember token decimals (USDC=6, DAI=18, WMAS=9)
4. ✅ Convert with `u256.fromU64(amount)` for transfers
5. ✅ Test with small amounts first
6. ✅ Document decimals in comments

**This pattern ensures:**
- ✅ Gas efficiency (u64 is cheaper)
- ✅ Compatibility (u256 for ERC20)
- ✅ Safety (proper type conversions)
- ✅ Clarity (explicit decimal handling)

---

## **📖 Further Reading**

- [Massa Smart Contracts Documentation](https://docs.massa.net/docs/build/smart-contract)
- [Dussa SDK Documentation](https://docs.dusa.io)
- [ERC20 Token Standard](https://eips.ethereum.org/EIPS/eip-20)
- [Uniswap V2 Whitepaper](https://uniswap.org/whitepaper.pdf) (AMM math reference)

---

**Questions?** Check the test scripts in `src/` for more examples!
