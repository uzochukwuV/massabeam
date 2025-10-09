import { OperationStatus, Mas,formatReadOnlyCallResponse } from "@massalabs/massa-web3";
import { getProvider } from "./wallet.js";

// Generic contract call wrapper
export async function callContract(contractAddress, functionName, args) {
  const provider = getProvider();
  if (!provider) {
    throw new Error("Wallet not connected");
  }

  try {
    const operation = await provider.callSC({
      target: contractAddress,
      func: functionName,
      parameter: args
    });

    const status = await operation.waitSpeculativeExecution();
    if (status !== OperationStatus.SpeculativeSuccess) {
      throw new Error(`Transaction failed with status: ${status}`);
    }

    return operation;
  } catch (error) {
    console.error(`Contract call failed: ${functionName}`, error);
    throw error;
  }
}

// Generic contract read wrapper
export async function readContract(contractAddress, functionName, args) {
  const provider = getProvider();
  if (!provider) {
    throw new Error("Wallet not connected");
  }

  try {
    const result = await provider.readSC({
      target: contractAddress,
      func: functionName,
      parameter: args,
      maxGas: 1_000_000_000n,
      coins: Mas.fromString("0.1"), 
    });
    return result.value;
  } catch (error) {
    console.error(`Contract read failed: ${functionName}`, error);
    throw error;
  }
}
