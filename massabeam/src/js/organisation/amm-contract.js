import { Args, Mas, bytesToStr, OperationStatus, bytesToF64, bytesToSerializableObjectArray, bytesToF32, formatReadOnlyCallResponse, U128, U256, U32 } from "@massalabs/massa-web3";
import { callContract, readContract } from "./contract-helpers.js";
import { showError, showSuccess } from "./ui.js";
import { getTokenByAddress } from "./services/token-service.js";
import { toU256 } from "./utils.js";
import { getProvider } from "./wallet.js";
import { DEPLOYED_CONTRACTS } from "./contracts-config.js";

const CONTRACTS = {
  AMM: DEPLOYED_CONTRACTS.AMM,
}

let provider = null;

// AMM Contract Functions
export const AMMContract = {
  // Create a new liquidity pool
  async createPool(tokenA, tokenB, amountA, amountB, deadline) {
    try {
      console.log("Creating pool:", tokenA, tokenB, amountA, amountB, deadline);

      provider = await getProvider()
      const tokenAcontract = await getTokenByAddress(tokenA);
      const tokenBcontract = await getTokenByAddress(tokenB);

      const decimalsA = await tokenAcontract.decimals();
      const decimalsB = await tokenBcontract.decimals();

      // Convert amounts to u256 (BigInt with decimals)
      const amountA256 = toU256(amountA, Number(decimalsA));
      const amountB256 = toU256(amountB, Number(decimalsB));

      console.log("Amounts in u256:", amountA256.toString(), amountB256.toString());

      // Check balances
      const balanceA = await tokenAcontract.balanceOf(provider.address);
      if (balanceA < amountA256) {
        const symbol = await tokenAcontract.symbol();
        showError(`Insufficient ${symbol} balance`);
        throw new Error(`Insufficient ${symbol} balance`);
      }

      const balanceB = await tokenBcontract.balanceOf(provider.address);
      if (balanceB < amountB256) {
        const symbol = await tokenBcontract.symbol();
        showError(`Insufficient ${symbol} balance`);
        throw new Error(`Insufficient ${symbol} balance`);
      }

      // Approve Token A
      const opA = await tokenAcontract.increaseAllowance(
        CONTRACTS.AMM,
        amountA256
      );

      const statusA = await opA.waitSpeculativeExecution();
      if (statusA !== OperationStatus.SpeculativeSuccess) {
        throw new Error(`Token A approval failed with status: ${statusA}`);
      }

      // Approve Token B
      const opB = await tokenBcontract.increaseAllowance(
        CONTRACTS.AMM,
        amountB256
      );

      const statusB = await opB.waitSpeculativeExecution();
      if (statusB !== OperationStatus.SpeculativeSuccess) {
        throw new Error(`Token B approval failed with status: ${statusB}`);
      }

      // Call createPool with u256 amounts
      const args = new Args()
        .addString(tokenA)
        .addString(tokenB)
        .addU256(amountA256)  // ✅ Changed from addU64 to addU256
        .addU256(amountB256)  // ✅ Changed from addU64 to addU256
        .addU64(BigInt(deadline));

      console.log("Calling createPool with args:", args.serialize());

      const operation = await callContract(CONTRACTS.AMM, "createPool", args.serialize());

      showSuccess("Pool created successfully!");
      return operation;
    } catch (error) {
      showError(`Failed to create pool: ${error.message}`);
      throw error;
    }
  },

  // Add liquidity to existing pool
  async addLiquidity(tokenA, tokenB, amountADesired, amountBDesired, amountAMin, amountBMin, deadline) {
    try {
      const tokenAcontract = await getTokenByAddress(tokenA);
      const tokenBcontract = await getTokenByAddress(tokenB);

      const decimalsA = await tokenAcontract.decimals();
      const decimalsB = await tokenBcontract.decimals();

      // Convert amounts to u256
      const amountADesired256 = toU256(amountADesired, Number(decimalsA));
      const amountBDesired256 = toU256(amountBDesired, Number(decimalsB));
      const amountAMin256 = toU256(amountAMin, Number(decimalsA));
      const amountBMin256 = toU256(amountBMin, Number(decimalsB));

      const args = new Args()
        .addString(tokenA)
        .addString(tokenB)
        .addU256(amountADesired256)  // ✅ Changed to u256
        .addU256(amountBDesired256)  // ✅ Changed to u256
        .addU256(amountAMin256)      // ✅ Changed to u256
        .addU256(amountBMin256)      // ✅ Changed to u256
        .addU64(BigInt(deadline))
        .serialize();

      const operation = await callContract(CONTRACTS.AMM, "addLiquidity", args);

      showSuccess("Liquidity added successfully!");
      return operation;
    } catch (error) {
      showError(`Failed to add liquidity: ${error.message}`);
      throw error;
    }
  },

  // Remove liquidity from pool
  async removeLiquidity(tokenA, tokenB, liquidity, amountAMin, amountBMin, deadline) {
    try {
      const tokenAcontract = await getTokenByAddress(tokenA);
      const tokenBcontract = await getTokenByAddress(tokenB);

      const decimalsA = await tokenAcontract.decimals();
      const decimalsB = await tokenBcontract.decimals();

      // Convert amounts to u256
      const liquidity256 = toU256(liquidity, 18); // LP tokens typically have 18 decimals
      const amountAMin256 = toU256(amountAMin, Number(decimalsA));
      const amountBMin256 = toU256(amountBMin, Number(decimalsB));

      const args = new Args()
        .addString(tokenA)
        .addString(tokenB)
        .addU256(liquidity256)    // ✅ Changed to u256
        .addU256(amountAMin256)   // ✅ Changed to u256
        .addU256(amountBMin256)   // ✅ Changed to u256
        .addU64(BigInt(deadline))
        .serialize();

      const operation = await callContract(CONTRACTS.AMM, "removeLiquidity", args);

      showSuccess("Liquidity removed successfully!");
      return operation;
    } catch (error) {
      showError(`Failed to remove liquidity: ${error.message}`);
      throw error;
    }
  },

  // Swap tokens
  async swap(tokenIn, tokenOut, amountIn, amountOutMin, deadline) {
    try {
      const tokenInContract = await getTokenByAddress(tokenIn);
      const tokenOutContract = await getTokenByAddress(tokenOut);

      const decimalsIn = await tokenInContract.decimals();
      const decimalsOut = await tokenOutContract.decimals();

      // Convert amounts to u256
      const amountIn256 = toU256(amountIn, Number(decimalsIn));
      const amountOutMin256 = toU256(amountOutMin, Number(decimalsOut));

      const args = new Args()
        .addString(tokenIn)
        .addString(tokenOut)
        .addU256(amountIn256)       // ✅ Changed to u256
        .addU256(amountOutMin256)   // ✅ Changed to u256
        .addU64(BigInt(deadline))
        .serialize();

      const operation = await callContract(CONTRACTS.AMM, "swap", args);

      showSuccess("Swap completed successfully!");
      return operation;
    } catch (error) {
      showError(`Failed to swap tokens: ${error.message}`);
      throw error;
    }
  },

  // Get pool information
  async getPool(tokenA, tokenB) {
    try {
      const args = new Args()
          .addString(tokenA)
          .addString(tokenB)
          .serialize()

        console.log(args)
      const result = await readContract(CONTRACTS.AMM, "readPool", args)
      console.log(result)
      console.log(bytesToStr(result))
      return bytesToStr(result)
    } catch (error) {
      console.error("Failed to get pool info:", error)
      return null
    }
  },

  

  // Get amount out for swap
  async getAmountOut(amountIn, reserveIn, reserveOut, fee) {
    try {
      const args = new Args()
            .addU64(amountIn)
            .addU64(reserveIn)
            .addU64(reserveOut)
            .addU64(fee)
      const result = await readContract(CONTRACTS.AMM, "getAmountOut", args.serialize())
      return result
    } catch (error) {
      console.error("Failed to get amount out:", error)
      return 0
    }
  },

  async getPools() {
      
      if (!provider) {
          throw new Error("Provider not initialized");
      }
      const args = new Args()
      const pools =  await readContract(CONTRACTS.AMM, "readPoolList", args.serialize())
      console.log("getPools:", pools);

      return pools;
  },

  async getPoolCount() {
      
      if (!provider) {
          throw new Error("Provider not initialized");
      }
      const args = new Args()
      const poolCount =  await readContract(CONTRACTS.AMM, "readPoolCount", args.serialize())
      console.log("getPoolCount:", poolCount);

      return poolCount;
  },

  async getTotalVolume() {
      
      if (!provider) {
          throw new Error("Provider not initialized"); 
      }
      const args = new Args()
      const volume =  await readContract(CONTRACTS.AMM, "readTotalVolume", args.serialize())
      console.log("getTotalVolume :", volume);

      return volume;
  },

  async getProtocolFeeRate() {
      
      if (!provider) {
          throw new Error("Provider not initialized"); 
      }
      const args = new Args()

      const readProtocolFeeRate =  await readContract(CONTRACTS.AMM, "readProtocolFeeRate", args.serialize())
      console.log("readProtocolFeeRate:", readProtocolFeeRate);

      return readProtocolFeeRate;
  },

}

export async function getProtocolStats() {
    provider = await getProvider()
    
    const tvl = await AMMContract.getTotalVolume()
    const poolCount = await AMMContract.getPoolCount()
    const readProtocolFeeRate = await AMMContract.getProtocolFeeRate()

    console.log( U256.fromBytes(poolCount), bytesToF32(readProtocolFeeRate))
    
    return {tvl: bytesToF64(tvl), poolCount: bytesToF64(poolCount), readProtocolFeeRate: bytesToF64(readProtocolFeeRate)}
}


