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
     * @param amountIn - Amount of input tokens (u256)
     * @param minAmountOut - Minimum output amount (u256)
     * @param deadline - Transaction deadline (u64)
     * @param to - Recipient address
     */
    swap(
        tokenIn: Address,
        tokenOut: Address,
        amountIn: u256,
        minAmountOut: u256,
        deadline: u64,
        to: Address
    ): u256 {
        const args = new Args()
            .add(tokenIn.toString())
            .add(tokenOut.toString())
            .add(amountIn)  // u256
            .add(minAmountOut)  // u256
            .add(deadline);  // u64

        const result = call(this._origin, "swap", args, 0);

        // Parse result - swap returns output amount (u256)
        const resultArgs = new Args(result);
        return resultArgs.nextU256().unwrap();
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
     * @param amountIn - Input amount (u256)
     * @returns Output amount (u256)
     */
    getAmountOut(tokenIn: Address, tokenOut: Address, amountIn: u256): u256 {
        const args = new Args()
            .add(tokenIn.toString())
            .add(tokenOut.toString())
            .add(amountIn);  // u256

        const result = call(this._origin, "getAmountOut", args, 0);
        const resultArgs = new Args(result);
        return resultArgs.nextU256().unwrap();
    }

    /**
     * Execute a flash loan
     * @param args - Serialized arguments (receiver, token, amount, data)
     */
    flashLoan(args: StaticArray<u8>): void {
        call(this._origin, "flashLoan", new Args().add(args), 0);
    }

    /**
     * Set pool reserves for testing (ADMIN ONLY)
     * @param tokenA - First token
     * @param tokenB - Second token
     * @param newReserveA - New reserve for tokenA (u256)
     * @param newReserveB - New reserve for tokenB (u256)
     */
    setPoolReserves(
        tokenA: Address,
        tokenB: Address,
        newReserveA: u256,
        newReserveB: u256
    ): void {
        const args = new Args()
            .add(tokenA.toString())
            .add(tokenB.toString())
            .add(newReserveA)  // u256
            .add(newReserveB); // u256

        call(this._origin, "setPoolReserves", args, 0);
    }

    /**
     * Simulate price change for testing
     * @param tokenIn - Token to swap in
     * @param tokenOut - Token to swap out
     * @param amountIn - Amount to swap in (u256)
     */
    simulatePriceChange(
        tokenIn: Address,
        tokenOut: Address,
        amountIn: u256
    ): void {
        const args = new Args()
            .add(tokenIn.toString())
            .add(tokenOut.toString())
            .add(amountIn);  // u256

        call(this._origin, "simulatePriceChange", args, 0);
    }

    /**
     * Swap MAS for tokens
     * @param tokenOut - Output token address
     * @param minAmountOut - Minimum output amount (u256)
     * @param deadline - Transaction deadline (u64)
     * @param to - Recipient address
     */
    swapMASForTokens(
        tokenOut: Address,
        minAmountOut: u256,
        deadline: u64,
        to: Address
    ): u256 {
        const args = new Args()
            .add(tokenOut.toString())
            .add(minAmountOut)  // u256
            .add(deadline)
            .add(to.toString());

        const result = call(this._origin, "swapMASForTokens", args, 0);
        const resultArgs = new Args(result);
        return resultArgs.nextU256().unwrap();
    }

    /**
     * Swap tokens for MAS
     * @param tokenIn - Input token address
     * @param amountIn - Amount of input tokens (u256)
     * @param minAmountOut - Minimum MAS output (u64)
     * @param deadline - Transaction deadline (u64)
     * @param to - Recipient address
     */
    swapTokensForMAS(
        tokenIn: Address,
        amountIn: u256,
        minAmountOut: u64,
        deadline: u64,
        to: Address
    ): u64 {
        const args = new Args()
            .add(tokenIn.toString())
            .add(amountIn)  // u256
            .add(minAmountOut)
            .add(deadline)
            .add(to.toString());

        const result = call(this._origin, "swapTokensForMAS", args, 0);
        const resultArgs = new Args(result);
        return resultArgs.nextU64().unwrap();
    }
}
