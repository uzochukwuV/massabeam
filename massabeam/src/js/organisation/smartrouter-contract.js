/**
 * SmartRouter Contract Interface
 *
 * Handles interaction with the SmartRouter contract that compares
 * prices between MassaBeam and Dussa DEXs for the best swap rates
 */

import { Args } from "@massalabs/massa-web3";
import { DEPLOYED_CONTRACTS } from "./contracts-config.js";
import { getProvider } from "./wallet.js";

const SMART_ROUTER_ADDRESS = DEPLOYED_CONTRACTS.SMART_ROUTER;

/**
 * Get the best quote by comparing MassaBeam and Dussa
 * @param {string} tokenIn - Input token address
 * @param {string} tokenOut - Output token address
 * @param {string} amountIn - Amount to swap (in token units)
 * @returns {Promise<Object>} Quote object with DEX name, output amount, and route details
 */
export async function getBestQuote(tokenIn, tokenOut, amountIn) {
    try {
        const client = await getProvider();

        // Prepare arguments
        const args = new Args()
            .addString(tokenIn)
            .addString(tokenOut)
            .addU64(BigInt(amountIn));

        // Call SmartRouter's getBestQuote function
        const result = await client.smartContracts().readSmartContract({
            targetAddress: SMART_ROUTER_ADDRESS,
            targetFunction: "getBestQuote",
            parameter: args.serialize(),
            maxGas: BigInt(1_000_000_000),
        });

        // Parse result
        const resultArgs = new Args(result.returnValue);
        const dex = resultArgs.nextString();
        const amountOut = resultArgs.nextU64();
        const priceImpact = resultArgs.nextU64();
        const fee = resultArgs.nextU64();

        const routeLength = resultArgs.nextU64();
        const route = [];
        for (let i = 0; i < routeLength; i++) {
            route.push(resultArgs.nextString());
        }

        const gasEstimate = resultArgs.nextU64();

        return {
            dex,
            amountOut: Number(amountOut),
            priceImpact: Number(priceImpact) / 100, // Convert basis points to percentage
            fee: Number(fee) / 100,
            route,
            gasEstimate: Number(gasEstimate),
            rawAmountOut: amountOut.toString(),
        };
    } catch (error) {
        console.error("Error getting best quote:", error);
        throw error;
    }
}

/**
 * Execute swap using the best DEX (MassaBeam or Dussa)
 * @param {string} tokenIn - Input token address
 * @param {string} tokenOut - Output token address
 * @param {string} amountIn - Amount to swap
 * @param {string} minAmountOut - Minimum acceptable output
 * @param {number} deadline - Unix timestamp deadline
 * @returns {Promise<string>} Transaction ID
 */
export async function executeSmartSwap(tokenIn, tokenOut, amountIn, minAmountOut, deadline) {
    try {
        const client = await getClientWallet();

        // Prepare arguments
        const args = new Args()
            .addString(tokenIn)
            .addString(tokenOut)
            .addU64(BigInt(amountIn))
            .addU64(BigInt(minAmountOut))
            .addU64(BigInt(deadline));

        console.log("Executing smart swap:", {
            tokenIn,
            tokenOut,
            amountIn,
            minAmountOut,
            deadline
        });

        // Execute swap
        const operation = await client.smartContracts().callSmartContract({
            targetAddress: SMART_ROUTER_ADDRESS,
            targetFunction: "swap",
            parameter: args.serialize(),
            maxGas: BigInt(2_000_000_000),
            coins: BigInt(0),
        });

        console.log("Smart swap transaction submitted:", operation.id);
        return operation.id;
    } catch (error) {
        console.error("Error executing smart swap:", error);
        throw error;
    }
}

/**
 * Compare quotes from both DEXs side by side
 * @param {string} tokenIn - Input token address
 * @param {string} tokenOut - Output token address
 * @param {string} amountIn - Amount to swap
 * @returns {Promise<Object>} Comparison with MassaBeam and Dussa quotes
 */
export async function compareQuotes(tokenIn, tokenOut, amountIn) {
    try {
        const client = await getClientWallet();

        // Get MassaBeam quote
        const massaBeamQuote = await getMassaBeamQuoteOnly(client, tokenIn, tokenOut, amountIn);

        // Get Dussa quote
        const dussaQuote = await getDussaQuoteOnly(client, tokenIn, tokenOut, amountIn);

        // Calculate savings
        const bestQuote = massaBeamQuote.amountOut > dussaQuote.amountOut ? massaBeamQuote : dussaQuote;
        const worstQuote = massaBeamQuote.amountOut > dussaQuote.amountOut ? dussaQuote : massaBeamQuote;

        const savings = bestQuote.amountOut - worstQuote.amountOut;
        const savingsPercent = (savings / worstQuote.amountOut) * 100;

        return {
            massaBeam: massaBeamQuote,
            dussa: dussaQuote,
            bestDex: bestQuote.dex,
            savings,
            savingsPercent: savingsPercent.toFixed(2),
        };
    } catch (error) {
        console.error("Error comparing quotes:", error);
        throw error;
    }
}

/**
 * Get quote from MassaBeam only
 */
async function getMassaBeamQuoteOnly(client, tokenIn, tokenOut, amountIn) {
    const args = new Args()
        .addString(tokenIn)
        .addString(tokenOut)
        .addU64(BigInt(amountIn));

    const result = await client.smartContracts().readSmartContract({
        targetAddress: SMART_ROUTER_ADDRESS,
        targetFunction: "getMassaBeamQuote",
        parameter: args.serialize(),
        maxGas: BigInt(1_000_000_000),
    });

    const resultArgs = new Args(result.returnValue);
    return {
        dex: "MassaBeam",
        amountOut: Number(resultArgs.nextU64()),
    };
}

/**
 * Get quote from Dussa only
 */
async function getDussaQuoteOnly(client, tokenIn, tokenOut, amountIn) {
    const args = new Args()
        .addString(tokenIn)
        .addString(tokenOut)
        .addU64(BigInt(amountIn));

    const result = await client.smartContracts().readSmartContract({
        targetAddress: SMART_ROUTER_ADDRESS,
        targetFunction: "getDussaQuote",
        parameter: args.serialize(),
        maxGas: BigInt(1_000_000_000),
    });

    const resultArgs = new Args(result.returnValue);
    return {
        dex: "Dussa",
        amountOut: Number(resultArgs.nextU64()),
    };
}

/**
 * Format quote for display
 * @param {Object} quote - Quote object
 * @param {number} decimals - Token decimals
 * @returns {Object} Formatted quote
 */
export function formatQuote(quote, decimals = 8) {
    return {
        ...quote,
        amountOutFormatted: (quote.amountOut / Math.pow(10, decimals)).toFixed(decimals),
        priceImpactFormatted: `${quote.priceImpact.toFixed(2)}%`,
        feeFormatted: `${quote.fee.toFixed(2)}%`,
    };
}
