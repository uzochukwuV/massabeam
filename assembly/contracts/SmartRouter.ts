/**
 * MassaBeam SmartRouter
 *
 * Intelligent routing system that automatically selects the best DEX
 * for each swap operation, comparing prices between:
 * - MassaBeam (constant product AMM)
 * - Dussa (concentrated liquidity AMM)
 *
 * Features:
 * - Automatic best price discovery
 * - Multi-hop routing via Dussa
 * - Gas-optimized execution
 * - Transparent routing decisions
 */

import {
    Address,
    Context,
    generateEvent,
    Storage,
} from "@massalabs/massa-as-sdk";
import { Args } from "@massalabs/as-types";
import { u256 } from "as-bignum/assembly/integer/u256";

// Import Dussa interfaces
import { IRouter as IDussaRouter } from "./interfaces/IRouter";
import { IQuoter as IDussaQuoter } from "./interfaces/IQuoter";
import { IERC20 } from "./interfaces/IERC20";

// Import MassaBeam interface and types
import { IMassaBeamAMM } from "./interfaces/IMassaBeamAMM";
import { getPool, Pool } from "./massa_beam";

// Configuration - will be set in constructor
let DUSSA_ROUTER: Address = new Address("0x0000000000000000000000000000000000000000");
let DUSSA_QUOTER: Address= new Address("0x0000000000000000000000000000000000000000")
let DUSSA_FACTORY: Address= new Address("0x0000000000000000000000000000000000000000")
let MASSABEAM_AMM: Address= new Address("0x0000000000000000000000000000000000000000")
let WMAS_ADDRESS: Address= new Address("0x0000000000000000000000000000000000000000")

// Constants
export const ONE_UNIT = 10 ** 9;
const ADMIN_ROLE = "ADMIN";
const DEFAULT_BIN_STEP: u32 = 20;  // Dussa's default bin step

/**
 * Quote result from a DEX
 */
export class SwapQuote {
    dex: string;               // "DUSSA" or "MASSABEAM"
    amountOut: u64;            // Expected output amount
    priceImpact: u64;          // Price impact in basis points (100 = 1%)
    fee: u64;                  // Fee in basis points
    path: string[];            // Token path (for multi-hop)
    gasEstimate: u64;          // Estimated gas cost

    constructor(
        dex: string,
        amountOut: u64,
        priceImpact: u64,
        fee: u64,
        path: string[],
        gasEstimate: u64
    ) {
        this.dex = dex;
        this.amountOut = amountOut;
        this.priceImpact = priceImpact;
        this.fee = fee;
        this.path = path;
        this.gasEstimate = gasEstimate;
    }

    serialize(): StaticArray<u8> {
        const args = new Args();
        args.add(this.dex);
        args.add(this.amountOut);
        args.add(this.priceImpact);
        args.add(this.fee);
        args.add(this.path.join(","));
        args.add(this.gasEstimate);
        return args.serialize();
    }

    static deserialize(data: StaticArray<u8>): SwapQuote {
        const args = new Args(data);
        const dex = args.nextString().unwrap();
        const amountOut = args.nextU64().unwrap();
        const priceImpact = args.nextU64().unwrap();
        const fee = args.nextU64().unwrap();
        const pathStr = args.nextString().unwrap();
        const gasEstimate = args.nextU64().unwrap();

        const path = pathStr.length > 0 ? pathStr.split(",") : [];

        return new SwapQuote(dex, amountOut, priceImpact, fee, path, gasEstimate);
    }
}

/**
 * Constructor - Initialize SmartRouter
 */
export function constructor(args: StaticArray<u8>): void {
    assert(Context.isDeployingContract(), "Not deploying");

    const argument = new Args(args);

    // Set contract addresses
    DUSSA_ROUTER = new Address(argument.nextString().unwrap());
    DUSSA_QUOTER = new Address(argument.nextString().unwrap());
    DUSSA_FACTORY = new Address(argument.nextString().unwrap());
    MASSABEAM_AMM = new Address(argument.nextString().unwrap());
    WMAS_ADDRESS = new Address(argument.nextString().unwrap());

    // Store addresses
    Storage.set("DUSSA_ROUTER", DUSSA_ROUTER.toString());
    Storage.set("DUSSA_QUOTER", DUSSA_QUOTER.toString());
    Storage.set("DUSSA_FACTORY", DUSSA_FACTORY.toString());
    Storage.set("MASSABEAM_AMM", MASSABEAM_AMM.toString());
    Storage.set("WMAS_ADDRESS", WMAS_ADDRESS.toString());

    // Initialize admin
    const deployer = Context.caller();
    Storage.set(ADMIN_ROLE + ":" + deployer.toString(), "true");

    // Initialize statistics
    Storage.set("total_swaps", "0");
    Storage.set("dussa_swaps", "0");
    Storage.set("massabeam_swaps", "0");
    Storage.set("total_volume", "0");

    generateEvent("SmartRouter deployed: MassaBeam + Dussa integration active");
}

/**
 * Main entry point - Smart Swap with automatic best price selection
 */
export function smartSwap(args: StaticArray<u8>): void {
    const argument = new Args(args);
    const tokenIn = new Address(argument.nextString().unwrap());
    const tokenOut = new Address(argument.nextString().unwrap());
    const amountIn = argument.nextU64().unwrap();
    const minAmountOut = argument.nextU64().unwrap();
    const deadline = argument.nextU64().unwrap();

    const caller = Context.caller();

    // Validate inputs
    assert(amountIn > 0, "Invalid input amount");
    assert(deadline >= Context.timestamp(), "Transaction expired");
    assert(tokenIn.toString() != tokenOut.toString(), "Identical tokens");

    // Get quotes from both DEXs
    const dussaQuote = getDussaQuote(tokenIn, tokenOut, amountIn);
    const massaBeamQuote = getMassaBeamQuote(tokenIn, tokenOut, amountIn);

    // Select best route
    const bestQuote = selectBestRoute(dussaQuote, massaBeamQuote);

    // Validate output meets minimum
    assert(bestQuote.amountOut >= minAmountOut, "Insufficient output amount");

    // Log routing decision
    generateEvent(`SmartSwap: Using ${bestQuote.dex} - Output: ${bestQuote.amountOut} (${bestQuote.priceImpact/100}% impact)`);

    // Execute on chosen DEX
    if (bestQuote.dex == "DUSSA") {
        executeOnDussa(tokenIn, tokenOut, amountIn, minAmountOut, deadline, caller);
    } else {
        executeOnMassaBeam(tokenIn, tokenOut, amountIn, minAmountOut, deadline, caller);
    }

    // Update statistics
    recordSwap(bestQuote, amountIn);

    generateEvent(`SmartSwap complete: ${amountIn} ${tokenIn.toString()} → ${bestQuote.amountOut} ${tokenOut.toString()}`);
}

/**
 * Get quote from MassaBeam AMM
 */
function getMassaBeamQuote(tokenIn: Address, tokenOut: Address, amountIn: u64): SwapQuote {
    // Load MassaBeam AMM address
    loadAddresses();

    // Get pool
    const pool = getPool(tokenIn, tokenOut);

    if (pool == null) {
        // Pool doesn't exist - return zero quote
        return new SwapQuote("MASSABEAM", 0, 9999, 30, [tokenIn.toString(), tokenOut.toString()], 500_000);
    }

    // Determine token order
    const tokenInIsA = pool.tokenA.toString() == tokenIn.toString();
    const reserveIn = tokenInIsA ? pool.reserveA : pool.reserveB;
    const reserveOut = tokenInIsA ? pool.reserveB : pool.reserveA;

    // Check if pool has liquidity
    if (reserveIn == 0 || reserveOut == 0) {
        return new SwapQuote("MASSABEAM", 0, 9999, pool.fee, [tokenIn.toString(), tokenOut.toString()], 500_000);
    }

    // Calculate output amount using constant product formula
    const amountInWithFee = u64(f64(amountIn) * (10000.0 - f64(pool.fee)) / 10000.0);
    const numerator = u64(f64(amountInWithFee) * f64(reserveOut));
    const denominator = u64(f64(reserveIn) + f64(amountInWithFee));
    const amountOut = numerator / denominator;

    // Calculate price impact in basis points
    const expectedRate = f64(reserveOut) / f64(reserveIn);
    const actualRate = f64(amountOut) / f64(amountIn);
    const priceImpact = u64(Math.abs(1.0 - (actualRate / expectedRate)) * 10000.0);

    return new SwapQuote(
        "MASSABEAM",
        amountOut,
        priceImpact,
        pool.fee,
        [tokenIn.toString(), tokenOut.toString()],
        500_000  // Estimated gas
    );
}

/**
 * Get quote from Dussa (Liquidity Book)
 */
function getDussaQuote(tokenIn: Address, tokenOut: Address, amountIn: u64): SwapQuote {
    loadAddresses();

    // Create Dussa quoter interface
    const quoter = new IDussaQuoter(DUSSA_QUOTER);

    // Prepare route
    const route: Address[] = [tokenIn, tokenOut];
    const amount256 = u256.fromU64(amountIn);

    
        // Call Dussa quoter to find best path
        const quote = quoter.findBestPathFromAmountIn(route, amount256);

        // Extract output amount (last element in amounts array)
        const outputAmount = quote.amounts[quote.amounts.length - 1];

        // Calculate total fees
        let totalFee: u64 = 0;
        for (let i = 0; i < quote.fees.length; i++) {
            totalFee += quote.fees[i].toU64() / 100000000;  // Convert from u256 to basis points
        }
        if (totalFee == 0) totalFee = 20;  // Default 0.2%

        // Calculate price impact
        const expectedOut = u256.fromU64(amountIn);  // Simplified - should use actual spot price
        const actualOut = outputAmount;
        const priceImpact = u64(Math.abs(1.0 - (f64(actualOut.toU64()) / f64(expectedOut.toU64()))) * 10000.0);

        return new SwapQuote(
            "DUSSA",
            outputAmount.toU64(),
            priceImpact,
            totalFee,
            [tokenIn.toString(), tokenOut.toString()],
            800_000  // Dussa uses more gas due to bin complexity
        );
    
}

/**
 * Select best route based on multiple factors
 */
function selectBestRoute(dussaQuote: SwapQuote, massaBeamQuote: SwapQuote): SwapQuote {
    // If one DEX has no quote, use the other
    if (dussaQuote.amountOut == 0 && massaBeamQuote.amountOut > 0) {
        generateEvent("MassaBeam selected: Dussa has no liquidity");
        return massaBeamQuote;
    }
    if (massaBeamQuote.amountOut == 0 && dussaQuote.amountOut > 0) {
        generateEvent("Dussa selected: MassaBeam has no liquidity");
        return dussaQuote;
    }
    if (dussaQuote.amountOut == 0 && massaBeamQuote.amountOut == 0) {
        generateEvent("No liquidity on either DEX");
        return dussaQuote;  // Will fail with proper error
    }

    // Primary criterion: highest output amount
    if (dussaQuote.amountOut > massaBeamQuote.amountOut) {
        const diff = dussaQuote.amountOut - massaBeamQuote.amountOut;
        const improvement = f64(diff) / f64(massaBeamQuote.amountOut) * 100.0;

        // But only if improvement is significant enough to justify higher gas
        const gasOverhead = dussaQuote.gasEstimate - massaBeamQuote.gasEstimate;
        const gasCostInTokens = gasOverhead / ONE_UNIT;  // Rough estimate

        if (diff > gasCostInTokens) {
            generateEvent(`Dussa selected: ${improvement.toString()}% better price`);
            return dussaQuote;
        } else {
            generateEvent(`MassaBeam selected: Better after gas costs`);
            return massaBeamQuote;
        }
    }

    if (massaBeamQuote.amountOut > dussaQuote.amountOut) {
        const diff = massaBeamQuote.amountOut - dussaQuote.amountOut;
        const improvement = f64(diff) / f64(dussaQuote.amountOut) * 100.0;
        generateEvent(`MassaBeam selected: ${improvement.toString()}% better price`);
        return massaBeamQuote;
    }

    // If amounts are equal, prefer MassaBeam (lower gas)
    generateEvent("Prices equal - using MassaBeam (lower gas)");
    return massaBeamQuote;
}

/**
 * Execute swap on MassaBeam
 */
function executeOnMassaBeam(
    tokenIn: Address,
    tokenOut: Address,
    amountIn: u64,
    minAmountOut: u64,
    deadline: u64,
    caller: Address
): void {
    loadAddresses();

    // Create MassaBeam AMM interface
    const massaBeamAMM = new IMassaBeamAMM(MASSABEAM_AMM);

    // Transfer tokens from user to MassaBeam AMM
    const tokenInContract = new IERC20(tokenIn);
    tokenInContract.transferFrom(caller, MASSABEAM_AMM, u256.fromU64(amountIn));

    // Execute swap via interface
    const amountOut = massaBeamAMM.swap(
        tokenIn,
        tokenOut,
        amountIn,
        minAmountOut,
        deadline,
        caller  // Output goes directly to user
    );

    generateEvent(`Executed on MassaBeam: ${amountOut} output`);
}

/**
 * Execute swap on Dussa
 */
function executeOnDussa(
    tokenIn: Address,
    tokenOut: Address,
    amountIn: u64,
    minAmountOut: u64,
    deadline: u64,
    caller: Address
): void {
    loadAddresses();

    // Create Dussa router interface
    const dussaRouter = new IDussaRouter(DUSSA_ROUTER);

    // Transfer tokens from user to Dussa router
    const tokenInContract = new IERC20(tokenIn);
    tokenInContract.transferFrom(caller, DUSSA_ROUTER, u256.fromU64(amountIn));

    // Prepare swap parameters
    const amount256 = u256.fromU64(amountIn);
    const minAmount256 = u256.fromU64(minAmountOut);

    // Default bin step
    const binSteps: u64[] = [DEFAULT_BIN_STEP];

    // Token path
    const tokenInERC20 = new IERC20(tokenIn);
    const tokenOutERC20 = new IERC20(tokenOut);
    const path: IERC20[] = [tokenInERC20, tokenOutERC20];

    // Execute swap via Dussa router
    const amountOut = dussaRouter.swapExactTokensForTokens(
        amountIn,
        minAmountOut,
        binSteps,
        path,
        caller,  // Output goes directly to user
        deadline,
        0  // No MAS to send
    );

    generateEvent(`Executed on Dussa: ${amountOut.toString()} output`);
}

/**
 * Record swap statistics
 */
function recordSwap(quote: SwapQuote, amountIn: u64): void {
    // Update total swaps
    const totalSwaps = u64(parseInt(Storage.get("total_swaps")));
    Storage.set("total_swaps", (totalSwaps + 1).toString());

    // Update DEX-specific counter
    const dexKey = quote.dex == "DUSSA" ? "dussa_swaps" : "massabeam_swaps";
    const dexSwaps = u64(parseInt(Storage.get(dexKey)));
    Storage.set(dexKey, (dexSwaps + 1).toString());

    // Update volume
    const totalVolume = u64(parseInt(Storage.get("total_volume")));
    Storage.set("total_volume", (totalVolume + amountIn).toString());
}

/**
 * Get best quote without executing (view function)
 */
export function getBestQuote(args: StaticArray<u8>): StaticArray<u8> {
    const argument = new Args(args);
    const tokenIn = new Address(argument.nextString().unwrap());
    const tokenOut = new Address(argument.nextString().unwrap());
    const amountIn = argument.nextU64().unwrap();

    const dussaQuote = getDussaQuote(tokenIn, tokenOut, amountIn);
    const massaBeamQuote = getMassaBeamQuote(tokenIn, tokenOut, amountIn);

    const bestQuote = selectBestRoute(dussaQuote, massaBeamQuote);

    return bestQuote.serialize();
}

/**
 * Compare quotes from both DEXs (view function)
 */
export function compareQuotes(args: StaticArray<u8>): StaticArray<u8> {
    const argument = new Args(args);
    const tokenIn = new Address(argument.nextString().unwrap());
    const tokenOut = new Address(argument.nextString().unwrap());
    const amountIn = argument.nextU64().unwrap();

    const dussaQuote = getDussaQuote(tokenIn, tokenOut, amountIn);
    const massaBeamQuote = getMassaBeamQuote(tokenIn, tokenOut, amountIn);

    // Return both quotes
    const result = new Args()
        .add(dussaQuote.serialize())
        .add(massaBeamQuote.serialize());

    return result.serialize();
}

/**
 * Get routing statistics
 */
export function getStatistics(_: StaticArray<u8>): StaticArray<u8> {
    const totalSwaps = Storage.get("total_swaps");
    const dussaSwaps = Storage.get("dussa_swaps");
    const massabeamSwaps = Storage.get("massabeam_swaps");
    const totalVolume = Storage.get("total_volume");

    const result = new Args()
        .add(totalSwaps)
        .add(dussaSwaps)
        .add(massabeamSwaps)
        .add(totalVolume);

    return result.serialize();
}

/**
 * Update Dussa contract addresses (admin only)
 */
export function updateDussaAddresses(args: StaticArray<u8>): void {
    const caller = Context.caller();
    const roleKey = ADMIN_ROLE + ":" + caller.toString();
    assert(Storage.has(roleKey), "Admin only");

    const argument = new Args(args);
    DUSSA_ROUTER = new Address(argument.nextString().unwrap());
    DUSSA_QUOTER = new Address(argument.nextString().unwrap());
    DUSSA_FACTORY = new Address(argument.nextString().unwrap());

    Storage.set("DUSSA_ROUTER", DUSSA_ROUTER.toString());
    Storage.set("DUSSA_QUOTER", DUSSA_QUOTER.toString());
    Storage.set("DUSSA_FACTORY", DUSSA_FACTORY.toString());

    generateEvent("Dussa addresses updated");
}

// ============ HELPER FUNCTIONS ============

/**
 * Load addresses from storage
 */
function loadAddresses(): void {
    if (!Storage.has("DUSSA_ROUTER")) return;

    DUSSA_ROUTER = new Address(Storage.get("DUSSA_ROUTER"));
    DUSSA_QUOTER = new Address(Storage.get("DUSSA_QUOTER"));
    DUSSA_FACTORY = new Address(Storage.get("DUSSA_FACTORY"));
    MASSABEAM_AMM = new Address(Storage.get("MASSABEAM_AMM"));
    WMAS_ADDRESS = new Address(Storage.get("WMAS_ADDRESS"));
}
