# MassaBeam Protocol - Deployment Guide

Complete deployment guide for the MassaBeam DeFi Protocol on Massa Buildnet.

---

## 📋 Prerequisites

1. **Node.js & npm** installed (v16+)
2. **Massa Wallet** with sufficient MAS balance (~10 MAS for full deployment)
3. **Environment Variables** configured

### Setup Environment

Create a `.env` file in the `testDir` directory:

```env
WALLET_SECRET_KEY=your_wallet_secret_key_here
```

To get your wallet secret key:
1. Open Massa Station
2. Go to your wallet
3. Export private key
4. Copy the secret key

---

## 🚀 Quick Start - Full Deployment

Deploy everything with one command:

```bash
npm run setup
```

This runs:
1. `npm run deploy:full` - Deploys 3 tokens + 3 main contracts
2. `npm run mint-tokens` - Mints test tokens to your account
3. `npm run create-pools` - Creates initial liquidity pools

**Total time:** ~5-10 minutes
**Total cost:** ~8-10 MAS

---

## 📦 Step-by-Step Deployment

### Step 1: Build Contracts

```bash
npm run build
```

**Output:** Compiled `.wasm` files in `build/` directory:
- `Token.wasm` - ERC20 token template
- `massa_beam.wasm` - AMM/DEX contract
- `massa_beam_dca.wasm` - DCA & advanced features
- `massa_beam_engine.wasm` - Arbitrage engine

---

### Step 2: Deploy All Contracts

```bash
npm run deploy:full
```

**This deploys:**

#### Tokens:
1. **BeamUSDT (USDT)** - 1 billion supply, 8 decimals
2. **BeamUSDC (USDC)** - 1 billion supply, 8 decimals
3. **BeamCoin (BEAM)** - 50 trillion supply, 8 decimals

#### Contracts:
1. **MassaBeam AMM** - Uniswap V2 style DEX with enhanced features
2. **MassaBeam DCA** - Dollar-cost averaging, limit orders, yield farming
3. **MassaBeam Engine** - Arbitrage engine with flash loans

**Output files:**
- `deployed-addresses.json` - All contract addresses
- `massabeam/src/js/organisation/contracts-config.ts` - Frontend config

**Example output:**
```
═══════════════════════════════════════════════════════
🎉 DEPLOYMENT COMPLETE!
═══════════════════════════════════════════════════════

📋 Deployment Summary:
─────────────────────────────────────────────────────

🪙  Tokens:
   USDT   → AS1abc...xyz
   USDC   → AS1def...uvw
   BEAM   → AS1ghi...rst

📦 Contracts:
   AMM    → AS12abc...xyz
   DCA    → AS1def...uvw
   ENGINE → AS12ghi...rst
```

**Cost:** ~5-7 MAS

---

### Step 3: Mint Test Tokens

```bash
npm run mint-tokens
```

**Mints to your account:**
- 100,000 USDT
- 100,000 USDC
- 1,000,000 BEAM

Edit `src/mint-tokens.ts` to add more test accounts:

```typescript
const TEST_ACCOUNTS = [
  'AU12YourTestAccount1...',
  'AU12YourTestAccount2...',
];
```

**Cost:** ~0.5 MAS

---

### Step 4: Create Liquidity Pools

```bash
npm run create-pools
```

**Creates 3 pools:**

1. **BEAM/USDT**
   - 10,000 BEAM : 1,000 USDT
   - Initial price: 1 BEAM = 0.1 USDT

2. **BEAM/USDC**
   - 10,000 BEAM : 1,000 USDC
   - Initial price: 1 BEAM = 0.1 USDC

3. **USDT/USDC**
   - 5,000 USDT : 5,000 USDC
   - Initial price: 1:1

**Process:**
1. Approves tokens for AMM contract
2. Calls `createPool()` with initial liquidity
3. Locks minimum liquidity (1000 units) permanently

**Cost:** ~1-2 MAS

---

## 📁 Deployment Artifacts

### 1. `deployed-addresses.json`

```json
{
  "tokens": {
    "USDT": "AS1abc...xyz",
    "USDC": "AS1def...uvw",
    "BEAM": "AS1ghi...rst"
  },
  "contracts": {
    "massaBeam": "AS12abc...xyz",
    "massaBeamDCA": "AS1def...uvw",
    "massaBeamEngine": "AS12ghi...rst"
  },
  "deployer": "AU12YourAddress...",
  "timestamp": "2025-10-01T10:00:00.000Z"
}
```

### 2. `contracts-config.ts` (Auto-generated)

Frontend configuration file with all contract addresses.

```typescript
export const DEPLOYED_CONTRACTS = {
  TOKENS: {
    USDT: "AS1abc...xyz",
    USDC: "AS1def...uvw",
    BEAM: "AS1ghi...rst",
  },
  AMM: "AS12abc...xyz",
  DCA: "AS1def...uvw",
  ENGINE: "AS12ghi...rst",
};
```

---

## 🧪 Testing Your Deployment

### 1. Check Token Balances

```bash
# Use Massa Station or massa-web3
tsx src/check-balance.ts
```

### 2. Verify Pool Creation

Open the frontend and check the Liquidity section:

```bash
cd massabeam
open app.html  # or your preferred browser
```

### 3. Test Swap

1. Connect wallet in frontend
2. Go to Trade section
3. Try swapping BEAM for USDT
4. Verify transaction on Massa Explorer

### 4. Create DCA Strategy

1. Go to DCA Strategies section
2. Create a test DCA:
   - From: USDT
   - To: BEAM
   - Amount per period: 10 USDT
   - Frequency: Every hour
   - Total periods: 10

3. Monitor autonomous execution

---

## 🔧 Manual Deployment (Advanced)

### Deploy Single Token

```typescript
import { SmartContract, Args, Mas } from '@massalabs/massa-web3';

const byteCode = getScByteCode('build', 'Token.wasm');

const args = new Args()
  .addString('MyToken')
  .addString('MTK')
  .addU8(8)
  .addU256(Mas.fromString('1000000'));

const token = await SmartContract.deploy(
  provider,
  byteCode,
  args,
  { coins: Mas.fromString('2') }
);

console.log('Token deployed at:', token.address);
```

### Deploy AMM Contract

```typescript
const ammByteCode = getScByteCode('build', 'massa_beam.wasm');
const ammArgs = new Args(); // No constructor args

const amm = await SmartContract.deploy(
  provider,
  ammByteCode,
  ammArgs,
  { coins: Mas.fromString('2') }
);

console.log('AMM deployed at:', amm.address);
```

### Deploy DCA Contract

```typescript
const dcaByteCode = getScByteCode('build', 'massa_beam_dca.wasm');

// DCA needs AMM contract address
const dcaArgs = new Args().addString(ammAddress);

const dca = await SmartContract.deploy(
  provider,
  dcaByteCode,
  dcaArgs,
  { coins: Mas.fromString('2') }
);

console.log('DCA deployed at:', dca.address);
```

---

## 🐛 Troubleshooting

### Error: "Insufficient balance"

**Solution:** Get more MAS from faucet:
- Visit: https://discord.gg/massa
- Request testnet MAS in #faucet channel

### Error: "Nonce too low"

**Solution:** Wait a few seconds between transactions:

```typescript
await sleep(2000); // Wait 2 seconds
```

### Error: "Contract call failed"

**Solution:** Check gas limit and coins:

```typescript
await contract.call('function', args, {
  coins: Mas.fromString('0.1'),
  maxGas: 4_000_000_000n,
});
```

### Deployment hangs

**Solution:**
1. Check Massa node status: https://buildnet.massa.net
2. Verify wallet has sufficient balance
3. Try increasing timeout in `utils.ts`

---

## 📊 Cost Breakdown

| Step | Item | Cost (MAS) |
|------|------|-----------|
| 1 | Deploy 3 Tokens | ~6 MAS |
| 2 | Deploy AMM Contract | ~2 MAS |
| 3 | Deploy DCA Contract | ~2 MAS |
| 4 | Deploy Engine Contract | ~2 MAS |
| 5 | Mint Tokens | ~0.5 MAS |
| 6 | Create 3 Pools | ~1.5 MAS |
| **Total** | **Full Setup** | **~14 MAS** |

**Recommended wallet balance:** 20 MAS (for safety margin)

---

## 🔄 Redeployment

To redeploy after contract changes:

```bash
# 1. Clean old builds
npm run clean

# 2. Rebuild contracts
npm run build

# 3. Deploy fresh instance
npm run deploy:full

# 4. Mint new tokens (optional)
npm run mint-tokens

# 5. Create new pools (optional)
npm run create-pools
```

**Note:** Old contract addresses will be overwritten in `deployed-addresses.json`

---

## 📝 Next Steps After Deployment

1. **Update Frontend Config**
   - Verify `contracts-config.ts` is updated
   - Restart dev server if running

2. **Test Core Features**
   - ✅ Token swaps
   - ✅ Add/remove liquidity
   - ✅ Create limit orders
   - ✅ Create DCA strategies
   - ✅ Stake in yield farms

3. **Monitor Autonomous Execution**
   - Check DCA executions in console
   - Monitor arbitrage opportunities
   - Watch liquidations (if any)

4. **Prepare for Hackathon Demo**
   - Record video of autonomous features
   - Prepare slide deck showing on-chain execution
   - Document unique Massa ASC usage

---

## 🎯 Hackathon Submission Checklist

- [ ] All contracts deployed successfully
- [ ] Frontend connected to deployed contracts
- [ ] At least 3 liquidity pools created
- [ ] DCA strategy tested and executing autonomously
- [ ] Limit orders created and executing
- [ ] Demo video recorded (max 5 min)
- [ ] README.md updated with:
  - [ ] Project description
  - [ ] Setup instructions
  - [ ] Architecture diagram
  - [ ] ASC usage explanation
- [ ] GitHub repository public
- [ ] DeWeb deployment (bonus points)

---

## 🆘 Support

- **Discord:** https://discord.gg/massa
- **Documentation:** https://docs.massa.net
- **Explorer:** https://buildnet.massa.net/explorer

---

## 📜 License

MIT License - Built for Massa Hackathon 2025

**Good luck with your submission! 🚀**
