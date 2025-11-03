# How to Fix Your Liquidity Script

## Problem Identified

Your `liquidity.ts` script is sending **raw values** without proper decimal conversion!

### Current Code (WRONG):
```typescript
const LIQUIDITY_CONFIG = {
  create: [
    {
      name: 'DAI/USDC',
      tokenA: DAI[0],      // 18 decimals
      tokenB: USDC[0],     // 6 decimals
      amountA: '50000000', // ❌ Only 0.0000005 DAI!
      amountB: '10000000', // ❌ Only 0.01 USDC!
    }
  ]
};

// In createPool function:
.addU64(amountA)  // ❌ Sends 50000000 directly
.addU64(amountB)  // ❌ Sends 10000000 directly
```

## Solution: Use Massa's 8 Decimal Standard

Since Massa uses u64 (8 decimals max), you need to convert to 8 decimals:

### Fixed Code:

```typescript
// Update config - values in human-readable format
const LIQUIDITY_CONFIG = {
  create: [
    {
      name: 'DAI/USDC',
      tokenA: DAI[0],
      tokenB: USDC[0],
      amountA_human: '2237',    // 2237 DAI (human-readable)
      amountB_human: '448',     // 448 USDC (human-readable)
      deadline: 60 * 60 * 100,
    },
  ],
};

// In createPool function, add conversion:
async function createPool(...) {
  const MASSA_DECIMALS = 8;

  // Convert human-readable to smallest units (8 decimals)
  const amountA = BigInt(Math.floor(Number(pool.amountA_human) * Math.pow(10, MASSA_DECIMALS)));
  const amountB = BigInt(Math.floor(Number(pool.amountB_human) * Math.pow(10, MASSA_DECIMALS)));

  console.log('Amount A (smallest units):', amountA.toString()); // 223700000000
  console.log('Amount B (smallest units):', amountB.toString()); // 44800000000

  const createPoolArgs = new Args()
    .addString(pool.tokenA.address)
    .addString(pool.tokenB.address)
    .addU64(amountA)  // Now correct!
    .addU64(amountB)  // Now correct!
    .addU64(BigInt(deadline));

  // ... rest of code
}
```

## Complete Fix for liquidity.ts

Replace lines 43-68 with:

```typescript
const LIQUIDITY_CONFIG = {
  create: [
    {
      name: 'DAI/WETH',
      tokenA: DAI[0],
      tokenB: WETH[0],
      amountA_human: '1000',    // 1000 DAI
      amountB_human: '0.5',     // 0.5 WETH
      deadline: 60 * 60 * 100,
    },
    {
      name: 'USDC/WETH',
      tokenA: USDC[0],
      tokenB: WETH[0],
      amountA_human: '1000',    // 1000 USDC
      amountB_human: '0.5',     // 0.5 WETH
      deadline: 60 * 60 * 100,
    },
    {
      name: 'DAI/USDC',
      tokenA: DAI[0],
      tokenB: USDC[0],
      amountA_human: '5000',    // 5000 DAI
      amountB_human: '5000',    // 5000 USDC (1:1 ratio)
      deadline: 60 * 60 * 100,
    },
  ],
};
```

And update the createPool function (lines 198-276):

```typescript
async function createPool(
  contract: SmartContract,
  pool: (typeof LIQUIDITY_CONFIG.create)[0],
  account: Account,
  provider: JsonRpcProvider,
  contractAddress: string
): Promise<boolean> {
  logSection(`🏊 CREATING POOL: ${pool.name}`);

  try {
    const MASSA_DECIMALS = 8; // Massa uses 8 decimals for u64

    // Convert to smallest units
    const amountA = BigInt(Math.floor(parseFloat(pool.amountA_human) * Math.pow(10, MASSA_DECIMALS)));
    const amountB = BigInt(Math.floor(parseFloat(pool.amountB_human) * Math.pow(10, MASSA_DECIMALS)));

    log('Token A:', `${pool.tokenA.symbol} (${pool.tokenA.address})`);
    log('Token B:', `${pool.tokenB.symbol} (${pool.tokenB.address})`);
    log('Amount A (human):', `${pool.amountA_human} ${pool.tokenA.symbol}`);
    log('Amount B (human):', `${pool.amountB_human} ${pool.tokenB.symbol}`);
    log('Amount A (smallest):', amountA.toString());
    log('Amount B (smallest):', amountB.toString());
    log('Fee:', '0.3% (default)');

    const deadline = pool.deadline - 1000;

    // Step 1: Approve Token A
    logInfo(`Approving ${pool.tokenA.symbol}...`);
    const tokenAContract = new SmartContract(provider, pool.tokenA.address);

    await tokenAContract.call(
      'increaseAllowance',
      new Args().addString(contractAddress).addU256(amountA),
      { coins: Mas.fromString('0.01') }
    );
    logSuccess(`${pool.tokenA.symbol} approved`);
    await sleep(2000);

    // Step 2: Approve Token B
    logInfo(`Approving ${pool.tokenB.symbol}...`);
    const tokenBContract = new SmartContract(provider, pool.tokenB.address);

    await tokenBContract.call(
      'increaseAllowance',
      new Args().addString(contractAddress).addU256(amountB),
      { coins: Mas.fromString('0.01') }
    );
    logSuccess(`${pool.tokenB.symbol} approved`);
    await sleep(2000);

    // Step 3: Create pool
    logInfo('Creating pool with initial liquidity...');

    const createPoolArgs = new Args()
      .addString(pool.tokenA.address)
      .addString(pool.tokenB.address)
      .addU64(amountA)  // ✅ Now in smallest units (8 decimals)
      .addU64(amountB)  // ✅ Now in smallest units (8 decimals)
      .addU64(BigInt(deadline));

    const result = await contract.call('createPool', createPoolArgs, {
      coins: Mas.fromString('0.1'),
    });

    logSuccess(`Pool created successfully!`);
    log('Transaction:', result.toString());

    await sleep(2000);
    return true;
  } catch (error) {
    logError(`Failed to create pool: ${error}`);
    return false;
  }
}
```

## Testing Your Fix

After fixing, create a test pool:

```bash
npx ts-node src/liquidity.ts --action=create
```

Expected console output:
```
Amount A (human): 5000 DAI
Amount B (human): 5000 USDC
Amount A (smallest): 500000000000  (5000 * 10^8)
Amount B (smallest): 500000000000  (5000 * 10^8)
```

Then check the pool reserves:
```
reserveA: 500000000000  (= 5000 DAI with 8 decimals)
reserveB: 500000000000  (= 5000 USDC with 8 decimals)
```

## Verification Formula

To verify your pools are correct:

```javascript
// After creating pool
reserveA_human = reserveA / 10^8
reserveB_human = reserveB / 10^8

// Example:
500000000000 / 10^8 = 5000 DAI ✅
```

---

**TL;DR:** Your script is sending raw numbers without multiplying by 10^8. Add the conversion in lines 214-215 of the createPool function!
