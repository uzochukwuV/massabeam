/**
 * Interface for MassaBeam AMM contract
 */

import { Args } from "@massalabs/as-types";
import { Address, call } from "@massalabs/massa-as-sdk";
import { u256 } from "as-bignum/assembly/integer/u256";

export class IMassaBeamAMM {
    _origin: Address;

    constructor(at: Address) {
        this._origin = at;
    }

    /**
     * Swap tokens
     * @param tokenIn - Input token address
     * @param tokenOut - Output token address
     * @param amountIn - Amount of input tokens
     * @param minAmountOut - Minimum output amount (slippage protection)
     * @param deadline - Transaction deadline
     * @param to - Recipient address
     */
    swap(
        tokenIn: Address,
        tokenOut: Address,
        amountIn: u64,
        minAmountOut: u64,
        deadline: u64,
        to: Address
    ): u64 {
        const args = new Args()
            .add(tokenIn.toString())
            .add(tokenOut.toString())
            .add(amountIn)
            .add(minAmountOut)
            .add(deadline);

        const result = call(this._origin, "swap", args, 0);

        // Parse result - swap returns output amount
        const resultArgs = new Args(result);
        return resultArgs.nextU64().unwrap();
    }

    /**
     * Get pool information
     * @param tokenA - First token
     * @param tokenB - Second token
     */
    getPool(tokenA: Address, tokenB: Address): StaticArray<u8> {
        const args = new Args()
            .add(tokenA.toString())
            .add(tokenB.toString());

        return call(this._origin, "getPool", args, 0);
    }

    /**
     * Get output amount for a given input
     * @param tokenIn - Input token
     * @param tokenOut - Output token
     * @param amountIn - Input amount
     */
    getAmountOut(tokenIn: Address, tokenOut: Address, amountIn: u64): u64 {
        const args = new Args()
            .add(tokenIn.toString())
            .add(tokenOut.toString())
            .add(amountIn);

        const result = call(this._origin, "getAmountOut", args, 0);
        const resultArgs = new Args(result);
        return resultArgs.nextU64().unwrap();
    }
}
