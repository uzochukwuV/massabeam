import {
    Address,
    Context,
    generateEvent,
    sendMessage,
    Storage,
} from "@massalabs/massa-as-sdk";
import { Args, Result, stringToBytes } from "@massalabs/as-types";
import { IERC20 } from "../interfaces/IERC20";
import { u256, u128 } from 'as-bignum/assembly';

// Constants for storage keys
const POOL_KEY_PREFIX = "POOL:";
// Core constants
export const ONE_UNIT = 10 ** 9;
export const MIN_LIQUIDITY: u64 = 1000; // Minimum liquidity lock
export const MAX_FEE_RATE: u64 = 1000; // 10% maximum fee
export const MIN_FEE_RATE : u64 = 1; // 0.01% minimum fee
export const DEFAULT_FEE_RATE = 30; // 0.3% default fee
export const MAX_SLIPPAGE = 5000; // 50% maximum slippage protection
export const MAX_DEADLINE_HOURS = 24; // 24 hours maximum deadline
export const TREASURY_ADDRESS = new Address("AS1dJ8mrm2cVSdZVZLXo43wRx5FxywZ9BmxiUmXCy7Tx72XNbit8");

// Access control roles
export const ADMIN_ROLE = "ADMIN";
export const PAUSER_ROLE = "PAUSER";
export const FEE_SETTER_ROLE = "FEE_SETTER";

// Enhanced Pool structure with additional security fields
export class Pool {
    tokenA: Address;
    tokenB: Address;
    reserveA: u64;
    reserveB: u64;
    totalSupply: u64;
    fee: u64;
    lastUpdateTime: u64;
    isActive: bool;
    kLast: u64; // For protocol fee calculation
    cumulativePriceA: u64;
    cumulativePriceB: u64;
    blockTimestampLast: u64;

    constructor(
        tokenA: Address,
        tokenB: Address,
        reserveA: u64 = 0,
        reserveB: u64 = 0,
        totalSupply: u64 = 0,
        fee: u64 = DEFAULT_FEE_RATE,
        lastUpdateTime: u64 = 0,
        isActive: bool = true
    ) {
        this.tokenA = tokenA;
        this.tokenB = tokenB;
        this.reserveA = reserveA;
        this.reserveB = reserveB;
        this.totalSupply = totalSupply;
        this.fee = fee;
        this.lastUpdateTime = lastUpdateTime;
        this.isActive = isActive;
        this.kLast = 0;
        this.cumulativePriceA = 0;
        this.cumulativePriceB = 0;
        this.blockTimestampLast = Context.timestamp();
    }

    updateKLast(): void {
        // Use u128 to calculate k value safely
        const reserveA128 = u128.from(this.reserveA);
        const reserveB128 = u128.from(this.reserveB);
        const k = u128.mul(reserveA128, reserveB128);

        // Store as string if too large for u64, or cap at max u64
        if (k <= u128.from(u64.MAX_VALUE)) {
            this.kLast = k.toU64();
        } else {
            // Store large k values as string in storage
            Storage.set("large_k:" + getPoolKey(this.tokenA, this.tokenB), k.toString());
            this.kLast = u64.MAX_VALUE; // Flag that actual k is stored separately
        }
    }

    serialize(): StaticArray<u8> {
        const args = new Args();
        args.add(this.tokenA.toString());
        args.add(this.tokenB.toString());
        args.add(this.reserveA);
        args.add(this.reserveB);
        args.add(this.totalSupply);
        args.add(this.fee);
        args.add(this.lastUpdateTime);
        args.add(this.isActive);
        args.add(this.kLast);
        args.add(this.cumulativePriceA);
        args.add(this.cumulativePriceB);
        args.add(this.blockTimestampLast);
        return args.serialize();
    }

    static deserialize(data: StaticArray<u8>): Pool {
        const args = new Args(data);
        const pool = new Pool(
            new Address(args.nextString().unwrap()),
            new Address(args.nextString().unwrap()),
            args.nextU64().unwrap(),
            args.nextU64().unwrap(),
            args.nextU64().unwrap(),
            args.nextU64().unwrap(),
            args.nextU64().unwrap(),
            args.nextBool().unwrap()
        );
        pool.kLast = args.nextU64().unwrap();
        pool.cumulativePriceA = args.nextU64().unwrap();
        pool.cumulativePriceB = args.nextU64().unwrap();
        pool.blockTimestampLast = args.nextU64().unwrap();
        return pool;
    }
}

// Enhanced utility functions with security checks
export function onlyRole(role: string): void {
    const caller = Context.caller();
    const roleKey = role + ":" + caller.toString();
    assert(Storage.has(roleKey), "Access denied: insufficient permissions");
}

export function whenNotPaused(): void {
    assert(!Storage.has("paused"), "Contract is paused");
}

export function nonReentrant(): void {
    assert(!Storage.has("locked"), "ReentrancyGuard: reentrant call");
    Storage.set("locked", "true");
}

export function endNonReentrant(): void {
    Storage.del("locked");
}

export function validDeadline(deadline: u64): void {
    const currentTime = Context.timestamp();
    assert(deadline >= currentTime, "Transaction expired");
    assert(deadline <= currentTime + (MAX_DEADLINE_HOURS * 3600 * 1000), "Deadline too far in future");
}

export function getPoolKey(tokenA: Address, tokenB: Address): string {
    const addr1 = tokenA.toString();
    const addr2 = tokenB.toString();
    return addr1 < addr2 ? addr1 + ":" + addr2 : addr2 + ":" + addr1;
}

export function getPool(tokenA: Address, tokenB: Address): Pool | null {
    const keyBytes = stringToBytes("pool:" + getPoolKey(tokenA, tokenB));
    if (!Storage.has(keyBytes)) {
        return null;
    }
    const poolData = Storage.get<StaticArray<u8>>(keyBytes);
    return Pool.deserialize(poolData);
}

export function savePool(pool: Pool): void {
    const keyBytes = stringToBytes("pool:" + getPoolKey(pool.tokenA, pool.tokenB));
    Storage.set<StaticArray<u8>>(keyBytes, pool.serialize());
}

function safeDiv(numerator: u64, denominator: u64): u64 {
    assert(denominator > 0, "Division by zero");
    const result = f64(numerator) / f64(denominator);
    return u64(result);
}

// Enhanced AMM math using f64 (following Massa team's pattern)
export function getAmountOut(amountIn: u64, reserveIn: u64, reserveOut: u64, fee: u64): u64 {
    assert(amountIn > 0, "Insufficient input amount");
    assert(reserveIn > 0 && reserveOut > 0, "Insufficient liquidity");
    assert(fee < 10000, "Fee too high");

    // Convert to f64 for calculations
    const amountInF = f64(amountIn);
    const reserveInF = f64(reserveIn);
    const reserveOutF = f64(reserveOut);
    const feeF = f64(fee);

    // amountInWithFee = amountIn * (10000 - fee)
    const amountInWithFee = amountInF * (10000.0 - feeF);

    // numerator = amountInWithFee * reserveOut
    const numerator = amountInWithFee * reserveOutF;

    // denominator = reserveIn * 10000 + amountInWithFee
    const denominator = reserveInF * 10000.0 + amountInWithFee;

    assert(denominator > 0, "Division by zero");

    // amountOut = numerator / denominator
    const result = numerator / denominator;

    return u64(result);
}

export function getAmountIn(amountOut: u64, reserveIn: u64, reserveOut: u64, fee: u64): u64 {
    assert(amountOut > 0 && fee > 0, "Insufficient output amount");
    assert(reserveIn > 0 && reserveOut > amountOut, "Insufficient liquidity");

    // Convert to f64 for calculations
    const reserveInF = f64(reserveIn);
    const amountOutF = f64(amountOut);
    const reserveOutF = f64(reserveOut);
    const feeF = f64(fee);

    // numerator = reserveIn * amountOut * 10000
    const numerator = reserveInF * amountOutF * 10000.0;

    // denominator = (reserveOut - amountOut) * (10000 - fee)
    const denominator = (reserveOutF - amountOutF) * (10000.0 - feeF);

    assert(denominator > 0, "Math overflow in getAmountIn");

    // result = (numerator / denominator) + 1
    const result = (numerator / denominator) + 1.0;

    return u64(result);
}

export function safeSqrt(x: u64, y: u64): u64 {
    if (x == 0 || y == 0) return 0;

    // Use f64 for multiplication and sqrt to avoid overflow
    const product = f64(x) * f64(y);
    const result = Math.sqrt(product);

    return u64(result);
}

// Price oracle with TWAP protection

// Price oracle using f64 for simplicity
export function updateCumulativePrices(pool: Pool): void {
    const currentTime = Context.timestamp();
    const timeElapsed = currentTime - pool.blockTimestampLast;

    if (timeElapsed > 0 && pool.reserveA > 0 && pool.reserveB > 0) {
        // Calculate prices using f64
        const priceA = f64(pool.reserveB) * f64(ONE_UNIT) / f64(pool.reserveA);
        const priceB = f64(pool.reserveA) * f64(ONE_UNIT) / f64(pool.reserveB);

        // Time-weighted prices
        const priceATimeWeighted = priceA * f64(timeElapsed);
        const priceBTimeWeighted = priceB * f64(timeElapsed);

        // Update cumulative prices
        const newCumPriceA = f64(pool.cumulativePriceA) + priceATimeWeighted;
        const newCumPriceB = f64(pool.cumulativePriceB) + priceBTimeWeighted;

        // Store with modular arithmetic if overflow (optional)
        if (newCumPriceA <= f64(u64.MAX_VALUE)) {
            pool.cumulativePriceA = u64(newCumPriceA);
        } else {
            pool.cumulativePriceA = u64(newCumPriceA % f64(u64.MAX_VALUE));
        }

        if (newCumPriceB <= f64(u64.MAX_VALUE)) {
            pool.cumulativePriceB = u64(newCumPriceB);
        } else {
            pool.cumulativePriceB = u64(newCumPriceB % f64(u64.MAX_VALUE));
        }

        pool.blockTimestampLast = currentTime;
    }
}

export function sqrt(x: u64): u64 {
    if (x == 0) return 0;
    if (x == 1) return 1;

    let z = (x + 1) / 2;
    let y = x;

    // Add safety checks to prevent infinite loops and division by zero
    let iterations = 0;
    const MAX_ITERATIONS = 64; // Prevent infinite loops

    while (z < y && iterations < MAX_ITERATIONS) {
        y = z;
        // CRITICAL: Check z is not zero before division
        assert(z > 0, "Division by zero in sqrt");
        z = (safeDiv(x, z) + z) / 2;
        iterations++;
    }

    return y;
}


// Enhanced validation functions
export function validateTokenPair(tokenA: Address, tokenB: Address): void {
    assert(tokenA.toString() != tokenB.toString(), "Identical tokens");
    assert(tokenA.toString() != "", "Invalid token A address");
    assert(tokenB.toString() != "", "Invalid token B address");
}

export function validateAmounts(amountA: u64, amountB: u64): void {
    assert(amountA > 0, "Amount A must be positive");
    assert(amountB > 0, "Amount B must be positive");

    // Check that multiplication won't overflow
    const PRACTICAL_MAX: u64 = 1000000000 * ONE_UNIT; // 1 billion tokens with 9 decimals

    assert(amountA <= PRACTICAL_MAX, `Amount A too large: ${amountA} > ${PRACTICAL_MAX}`);
    assert(amountB <= PRACTICAL_MAX, `Amount B too large: ${amountB} > ${PRACTICAL_MAX}`);

    // Additional check for the product itself
    if (amountA > 1000000 && amountB > 1000000) {
        const amountA128 = u128.from(amountA);
        const amountB128 = u128.from(amountB);
        const product = u128.mul(amountA128 , amountB128);
        assert(product <= u128.from(u64.MAX_VALUE), "Amount product would overflow");
    }
}

export function safeTransferFrom(token: Address, from: Address, to: Address, amount: u64): bool {
    if (amount == 0) return true;

    const tokenContract = new IERC20(token);
    const amount256 = u256.fromU64(amount);
    const allowance = tokenContract.allowance(from, to);
    const balance = tokenContract.balanceOf(from);

    // Compare u256 values
    if (allowance < amount256 || balance < amount256) {
        return false;
    }
    tokenContract.transferFrom(from, to, amount256);
    return true;
}

export function safeTransfer(token: Address, to: Address, amount: u64): bool {
    if (amount == 0) return true;

    const tokenContract = new IERC20(token);
    const amount256 = u256.fromU64(amount);
    const balance = tokenContract.balanceOf(Context.callee());

    // Compare u256 values
    if (balance < amount256) {
        return false;
    }

    tokenContract.transfer(to, amount256);
    return true;
}

// Main contract functions with enhanced security
export function constructor(_: StaticArray<u8>): void {
    assert(Context.isDeployingContract(), "Not deploying");

    const deployer = Context.caller();
    const poolList :string[] = [];

    // Initialize access control
    Storage.set(ADMIN_ROLE + ":" + deployer.toString(), "true");
    Storage.set(PAUSER_ROLE + ":" + deployer.toString(), "true");
    Storage.set(FEE_SETTER_ROLE + ":" + deployer.toString(), "true");

    // Initialize state
    Storage.set("pool_count", "0");
    Storage.set("total_volume", "0");
    Storage.set("total_fees", "0");
    Storage.set("protocol_fee_rate", "0"); // 0% initially
    Storage.set("initialized", "true");
    Storage.set("pool_list", poolList.join(","));

    generateEvent("MassaSwap: DEX deployed with enhanced security");
}

export function createPool(args: StaticArray<u8>): void {
    whenNotPaused();
    nonReentrant();

    const argument = new Args(args);
    const tokenA = new Address(argument.nextString().unwrap());
    const tokenB = new Address(argument.nextString().unwrap());


    const amountAResult = argument.nextU64();
    assert(amountAResult.isOk(), "Invalid amountA: ");
    const amountA = amountAResult.unwrap();

    const amountBResult = argument.nextU64();
    assert(amountBResult.isOk(), "Invalid amountB: ");
    const amountB = amountBResult.unwrap();

    const deadlineResult = argument.nextU64();
    assert(deadlineResult.isOk(), "Invalid deadline: ");
    const deadline = deadlineResult.unwrap();


    validDeadline(deadline + Context.timestamp());
    validateTokenPair(tokenA, tokenB);
    validateAmounts(amountA, amountB);

    const caller = Context.caller();
    const poolKey = getPoolKey(tokenA, tokenB);


    assert(!Storage.has("pool:" + poolKey), "Pool already exists");

    // Safe token transfers with validation
    assert(safeTransferFrom(tokenA, caller, Context.callee(), amountA), "Token A transfer failed");
    assert(safeTransferFrom(tokenB, caller, Context.callee(), amountB), "Token B transfer failed");

    // Calculate initial liquidity with minimum liquidity lock
    const liquidity = safeSqrt(amountA , amountB);
    assert(liquidity > MIN_LIQUIDITY, "Insufficient liquidity");

    // // Create pool with enhanced fields
    const pool = new Pool(tokenA, tokenB, amountA, amountB, liquidity, DEFAULT_FEE_RATE, Context.timestamp());
    pool.updateKLast(); 
    updateCumulativePrices(pool);
    savePool(pool);

    // Update registry
    const poolCount = u64(parseInt(Storage.get("pool_count")));
    Storage.set("pool_index:" + poolCount.toString(), poolKey);
    Storage.set("pool_count", (poolCount + 1).toString());
    const poolListStr = Storage.get("pool_list");
    const poolList = poolListStr.split(",");
    poolList.push(poolKey)

    Storage.set("pool_list", poolList.join(","));

    // Mint LP tokens (subtract minimum liquidity)
    const lpTokenKey = "lp_balance:" + poolKey + ":" + caller.toString();
    const userLiquidity = liquidity - MIN_LIQUIDITY;
    Storage.set(lpTokenKey, userLiquidity.toString());

    // Lock minimum liquidity permanently
    Storage.set("lp_balance:" + poolKey + ":MINIMUM_LIQUIDITY", MIN_LIQUIDITY.toString());

    endNonReentrant();
    generateEvent(`Pool created: ${tokenA.toString()}/${tokenB.toString()} - Liquidity: ${liquidity}`);
}

export function addLiquidity(args: StaticArray<u8>): void {
    whenNotPaused();
    nonReentrant();

    const argument = new Args(args);
    const tokenA = new Address(argument.nextString().unwrap());
    const tokenB = new Address(argument.nextString().unwrap());
    const amountADesired = argument.nextU64().unwrap();
    const amountBDesired = argument.nextU64().unwrap();
    const amountAMin = argument.nextU64().unwrap();
    const amountBMin = argument.nextU64().unwrap();
    const deadline = argument.nextU64().unwrap();

    validDeadline(deadline + Context.timestamp());
    validateTokenPair(tokenA, tokenB);

    const caller = Context.caller()
    const pool = getPool(tokenA, tokenB);


    assert(pool != null, "Pool does not exist");
    assert(pool!.isActive, "Pool is not active");

    // Calculate optimal amounts with slippage protection using f64
    let amountA: u64, amountB: u64;

    if (pool!.reserveA == 0 || pool!.reserveB == 0) {
        amountA = amountADesired;
        amountB = amountBDesired;
    } else {
        // amountBOptimal = amountADesired * reserveB / reserveA
        const amountBOptimal = u64(f64(amountADesired) * f64(pool!.reserveB) / f64(pool!.reserveA));
        if (amountBOptimal <= amountBDesired) {
            assert(amountBOptimal >= amountBMin, "Insufficient B amount");
            amountA = amountADesired;
            amountB = amountBOptimal;
        } else {
            // amountAOptimal = amountBDesired * reserveA / reserveB
            const amountAOptimal = u64(f64(amountBDesired) * f64(pool!.reserveA) / f64(pool!.reserveB));
            assert(amountAOptimal <= amountADesired && amountAOptimal >= amountAMin, "Insufficient A amount");
            amountA = amountAOptimal;
            amountB = amountBDesired;
        }
    }

    validateAmounts(amountA, amountB);

    // Safe transfers
    assert(safeTransferFrom(tokenA, caller, Context.callee(), amountA), "Token A transfer failed");
    assert(safeTransferFrom(tokenB, caller, Context.callee(), amountB), "Token B transfer failed");

    // Calculate liquidity to mint using f64
    // liquidity = amountA * totalSupply / reserveA
    const liquidity = u64(f64(amountA) * f64(pool!.totalSupply) / f64(pool!.reserveA));
    assert(liquidity > 0, "Insufficient liquidity minted");

    // Update pool state
    pool!.reserveA += amountA;
    pool!.reserveB += amountB;
    pool!.totalSupply += liquidity;
    updateCumulativePrices(pool!);
    savePool(pool!);

    // Update user LP balance
    const lpTokenKey = "lp_balance:" + getPoolKey(tokenA, tokenB) + ":" + caller.toString();
    const currentBalance = u64(parseInt(Storage.has(lpTokenKey) ? Storage.get(lpTokenKey) : "0"));
    Storage.set(lpTokenKey, (currentBalance + liquidity).toString());

    endNonReentrant();
    generateEvent(`Liquidity added: ${amountA}/${amountB} - LP tokens: ${liquidity}`);
}

export function removeLiquidity(args: StaticArray<u8>): void {
    whenNotPaused();
    nonReentrant();

    const argument = new Args(args);
    const tokenA = new Address(argument.nextString().unwrap());
    const tokenB = new Address(argument.nextString().unwrap());
    const liquidity = argument.nextU64().unwrap();
    const amountAMin = argument.nextU64().unwrap();
    const amountBMin = argument.nextU64().unwrap();
    const deadline = argument.nextU64().unwrap();

    validDeadline(deadline +Context.timestamp());
    validateTokenPair(tokenA, tokenB);
    assert(liquidity > 0, "Insufficient liquidity");

    const caller = Context.caller();
    const pool = getPool(tokenA, tokenB);
    assert(pool != null, "Pool does not exist");
    assert(pool!.isActive, "Pool is not active");

    // Check user LP balance
    const lpTokenKey = "lp_balance:" + getPoolKey(tokenA, tokenB) + ":" + caller.toString();
    const userBalance = u64(parseInt(Storage.has(lpTokenKey) ? Storage.get(lpTokenKey) : "0"));
    assert(userBalance >= liquidity, "Insufficient LP balance");

    // Calculate amounts with slippage protection using f64
    const amountA = u64(f64(liquidity) * f64(pool!.reserveA) / f64(pool!.totalSupply));
    const amountB = u64(f64(liquidity) * f64(pool!.reserveB) / f64(pool!.totalSupply));

    assert(amountA >= amountAMin, "Insufficient A amount");
    assert(amountB >= amountBMin, "Insufficient B amount");
    assert(amountA > 0 && amountB > 0, "Insufficient liquidity burned");

    // Update pool state
    pool!.reserveA -= amountA;
    pool!.reserveB -= amountB;
    pool!.totalSupply -= liquidity;
    updateCumulativePrices(pool!);
    savePool(pool!);

    // Update user LP balance
    Storage.set(lpTokenKey, (userBalance - liquidity).toString());

    // Safe transfers
    assert(safeTransfer(tokenA, caller, amountA), "Token A transfer failed");
    assert(safeTransfer(tokenB, caller, amountB), "Token B transfer failed");

    endNonReentrant();
    generateEvent(`Liquidity removed: ${amountA}/${amountB} - LP tokens: ${liquidity}`);
}

export function swap(args: StaticArray<u8>): void {
    whenNotPaused();
    nonReentrant();

    const argument = new Args(args);
    const tokenIn = new Address(argument.nextString().unwrap());
    const tokenOut = new Address(argument.nextString().unwrap());
    const amountIn = argument.nextU64().unwrap();
    const amountOutMin = argument.nextU64().unwrap();
    const deadline = argument.nextU64().unwrap();

    validDeadline(deadline + Context.timestamp());
    validateTokenPair(tokenIn, tokenOut);
    assert(amountIn > 0, "Invalid input amount");
    assert(amountOutMin > 0, "Invalid minimum output");

    const caller = Context.caller();
    const pool = getPool(tokenIn, tokenOut);
    assert(pool != null, "Pool does not exist");
    assert(pool!.isActive, "Pool is not active");

    // Determine token order and reserves
    const tokenInIsA = pool!.tokenA.toString() == tokenIn.toString();
    const reserveIn = tokenInIsA ? pool!.reserveA : pool!.reserveB;
    const reserveOut = tokenInIsA ? pool!.reserveB : pool!.reserveA;

    // Calculate output with slippage protection
    const amountOut = getAmountOut(amountIn, reserveIn, reserveOut, pool!.fee);
    assert(amountOut >= amountOutMin, "Insufficient output amount");
    assert(amountOut < reserveOut, "Insufficient liquidity");

    // Safe transfers
    assert(safeTransferFrom(tokenIn, caller, Context.callee(), amountIn), "Input transfer failed");
    assert(safeTransfer(tokenOut, caller, amountOut), "Output transfer failed");

    // Update reserves and validate K
    const newReserveIn = reserveIn + amountIn;
    const newReserveOut = reserveOut - amountOut;

    // K invariant check: newK should be >= oldK after accounting for fees
    // The fee stays in the pool, so: (reserveIn + amountIn) * (reserveOut - amountOut) >= reserveIn * reserveOut
    // With fee: (reserveIn * 10000 + amountIn * (10000 - fee)) * (reserveOut - amountOut) >= reserveIn * reserveOut * 10000
    const oldK = f64(reserveIn) * f64(reserveOut);
    const newK = (f64(reserveIn) + f64(amountIn) * (10000.0 - f64(pool!.fee)) / 10000.0) * f64(reserveOut - amountOut);
    assert(newK >= oldK, "K invariant violation");

    // Update pool state
    if (tokenInIsA) {
        pool!.reserveA = newReserveIn;
        pool!.reserveB = newReserveOut;
    } else {
        pool!.reserveB = newReserveIn;
        pool!.reserveA = newReserveOut;
    }

    updateCumulativePrices(pool!);
    savePool(pool!);

    // Update statistics
    const totalVolume = u64(parseInt(Storage.get("total_volume")));
    Storage.set("total_volume", (totalVolume + amountIn).toString());

    const fee = u64(f64(amountIn) * f64(pool!.fee) / 10000.0);
    const totalFees = u64(parseInt(Storage.get("total_fees")));
    Storage.set("total_fees", (totalFees + fee).toString());

    endNonReentrant();
    generateEvent(`Swap: ${amountIn} ${tokenIn.toString()} → ${amountOut} ${tokenOut.toString()}`);
}

// Administrative functions
export function setPaused(args: StaticArray<u8>): void {
    onlyRole(PAUSER_ROLE);

    const argument = new Args(args);
    const paused = argument.nextBool().unwrap();

    if (paused) {
        Storage.set("paused", "true");
        generateEvent("Contract paused");
    } else {
        Storage.del("paused");
        generateEvent("Contract unpaused");
    }
}

export function setPoolFee(args: StaticArray<u8>): void {
    onlyRole(FEE_SETTER_ROLE);

    const argument = new Args(args);
    const tokenA = new Address(argument.nextString().unwrap());
    const tokenB = new Address(argument.nextString().unwrap());
    const newFee = argument.nextU64().unwrap();

    assert(newFee >= MIN_FEE_RATE && newFee <= MAX_FEE_RATE, "Invalid fee rate");

    const pool = getPool(tokenA, tokenB);
    assert(pool != null, "Pool does not exist");

    pool!.fee = newFee;
    savePool(pool!);

    generateEvent(`Pool fee updated: ${newFee}`);
}

export function grantRole(args: StaticArray<u8>): void {
    onlyRole(ADMIN_ROLE);

    const argument = new Args(args);
    const role = argument.nextString().unwrap();
    const account = new Address(argument.nextString().unwrap());

    Storage.set(role + ":" + account.toString(), "true");
    generateEvent(`Role granted: ${role} to ${account.toString()}`);
}

export function revokeRole(args: StaticArray<u8>): void {
    onlyRole(ADMIN_ROLE);

    const argument = new Args(args);
    const role = argument.nextString().unwrap();
    const account = new Address(argument.nextString().unwrap());

    Storage.del(role + ":" + account.toString());
    generateEvent(`Role revoked: ${role} from ${account.toString()}`);
}


export function readPool(args: StaticArray<u8>): StaticArray<u8>{
    const argument = new Args(args);
    const tokenA = new Address(argument.nextString().unwrap());
    const tokenB = new Address(argument.nextString().unwrap());
    const pool = getPool(tokenA, tokenB);
    if (pool == null){
        return stringToBytes("null")
    }
    return pool.serialize()
}


export function readLPBalance(args: StaticArray<u8>): StaticArray<u8>{
    const argument = new Args(args);
    const tokenA = new Address(argument.nextString().unwrap());
    const tokenB = new Address(argument.nextString().unwrap());
    const caller = new Address(argument.nextString().unwrap());

    const lpTokenKey = "lp_balance:" + getPoolKey(tokenA, tokenB) + ":" + caller.toString();
    const currentBalance = Storage.has(lpTokenKey) ? Storage.get(lpTokenKey) : "0";

    return stringToBytes(currentBalance)
}


export function readPoolTotalLiquidity(args: StaticArray<u8>):StaticArray<u8>{
    const argument = new Args(args);
    const tokenA = new Address(argument.nextString().unwrap());
    const tokenB = new Address(argument.nextString().unwrap());
    const pool = getPool(tokenA, tokenB);
    if (!pool){
        return stringToBytes("0")
    }

    return stringToBytes(pool.totalSupply.toString())

}

export function readPoolKey(args: StaticArray<u8>): StaticArray<u8>{
    const argument = new Args(args);
    const tokenA = new Address(argument.nextString().unwrap());
    const tokenB = new Address(argument.nextString().unwrap());
    return stringToBytes(getPoolKey(tokenA, tokenB))
}


//  Storage.set("pool_count", "0");
//     Storage.set("total_volume", "0");
//     Storage.set("total_fees", "0");
//     Storage.set("protocol_fee_rate", "0"); // 0% initially
//     Storage.set("initialized", "true");

export function readPoolCount():StaticArray<u8>{
    return stringToBytes(Storage.get("pool_count"));
}

export function readTotalVolume():StaticArray<u8>{
    return stringToBytes(Storage.get("total_volume"));
}

export function readProtocolFeeRate():StaticArray<u8>{
    return stringToBytes(Storage.get("protocol_fee_rate"));
}

export function readInitialized():StaticArray<u8>{
    return stringToBytes(Storage.get("initialized"));
}

export function readPoolList():StaticArray<u8>{
    return stringToBytes(Storage.get("pool_list"));
}

export function readGetAmountOut(args: StaticArray<u8>): StaticArray<u8> {
    const argument = new Args(args);
    const amountIn = argument.nextU64().unwrap();
    const reserveIn = argument.nextU64().unwrap();
    const reserveOut = argument.nextU64().unwrap();
    const fee = argument.nextU64().unwrap();

    const amountOut = getAmountOut(amountIn, reserveIn, reserveOut, fee);

    return stringToBytes(amountOut.toString());
}

export function readGetAmountIn(args: StaticArray<u8>): StaticArray<u8> {
    const argument = new Args(args);
    const amountOut = argument.nextU64().unwrap();
    const reserveIn = argument.nextU64().unwrap();
    const reserveOut = argument.nextU64().unwrap();
    const fee = argument.nextU64().unwrap();

    const amountIn = getAmountIn(amountOut, reserveIn, reserveOut, fee);

    return stringToBytes(amountIn.toString());
}

export function readSafeSqrt(args: StaticArray<u8>): StaticArray<u8> {
    const argument = new Args(args);
    const x = argument.nextU64().unwrap();
    const y = argument.nextU64().unwrap();

    const result = safeSqrt(x, y);

    return stringToBytes(result.toString()); 
}

export function readSqrt(args: StaticArray<u8>): StaticArray<u8> {
    const argument = new Args(args);
    const x = argument.nextU64().unwrap();

    const result = sqrt(x);

    return stringToBytes(result.toString());
}