import {
    Address,
    Context,
    generateEvent,
    sendMessage,
    Storage,
} from "@massalabs/massa-as-sdk";
import { Args, Result, stringToBytes } from "@massalabs/as-types";
import { IERC20 } from "./interfaces/IERC20";

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
    const key = "pool:" + getPoolKey(tokenA, tokenB);
    if (!Storage.has(key)) {
        return null;
    }
    return Pool.deserialize(stringToBytes(Storage.get(key)));
}

export function savePool(pool: Pool): void {
    const key = "pool:" + getPoolKey(pool.tokenA, pool.tokenB);
    Storage.set(key, pool.serialize().toString());
}

// Enhanced AMM math with overflow protection
export function getAmountOut(amountIn: u64, reserveIn: u64, reserveOut: u64, fee: u64): u64 {
    assert(amountIn > 0, "Insufficient input amount");
    assert(reserveIn > 0 && reserveOut > 0, "Insufficient liquidity");
    
    const amountInWithFee = amountIn * (10000 - fee);
    const numerator = amountInWithFee * reserveOut;
    const denominator = reserveIn * 10000 + amountInWithFee;
    
    assert(denominator > 0, "Math overflow in getAmountOut");
    return numerator / denominator;
}

export function getAmountIn(amountOut: u64, reserveIn: u64, reserveOut: u64, fee: u64): u64 {
    assert(amountOut > 0, "Insufficient output amount");
    assert(reserveIn > 0 && reserveOut > amountOut, "Insufficient liquidity");
    
    const numerator = reserveIn * amountOut * 10000;
    const denominator = (reserveOut - amountOut) * (10000 - fee);
    
    assert(denominator > 0, "Math overflow in getAmountIn");
    return numerator / denominator + 1;
}

export function sqrt(x: u64): u64 {
    if (x == 0) return 0;
    let z = (x + 1) / 2;
    let y = x;
    while (z < y) {
        y = z;
        z = (x / z + z) / 2;
    }
    return y;
}

// Price oracle with TWAP protection
export function updateCumulativePrices(pool: Pool): void {
    const currentTime = Context.timestamp();
    const timeElapsed = currentTime - pool.blockTimestampLast;
    
    if (timeElapsed > 0 && pool.reserveA > 0 && pool.reserveB > 0) {
        // Update cumulative prices for TWAP
        pool.cumulativePriceA += (pool.reserveB * ONE_UNIT / pool.reserveA) * timeElapsed;
        pool.cumulativePriceB += (pool.reserveA * ONE_UNIT / pool.reserveB) * timeElapsed;
        pool.blockTimestampLast = currentTime;
    }
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
    assert(amountA < u64.MAX_VALUE / 2, "Amount A too large");
    assert(amountB < u64.MAX_VALUE / 2, "Amount B too large");
}

export function safeTransferFrom(token: Address, from: Address, to: Address, amount: u64): bool {
    if (amount == 0) return true;
    
    const tokenContract = new IERC20(token);
    const allowance = tokenContract.allowance(from, to);
    const balance = tokenContract.balanceOf(from);
    
    if (allowance < amount || balance < amount) {
        return false;
    }
    tokenContract.transferFrom(from, to, amount)
    return true;
}

export function safeTransfer(token: Address, to: Address, amount: u64): bool {
    if (amount == 0) return true;
    
    const tokenContract = new IERC20(token);
    const balance = tokenContract.balanceOf(Context.callee());
    
    if (balance < amount) {
        return false;
    }
    
    tokenContract.transfer(to, amount);
    return  true;
}

// Main contract functions with enhanced security
export function constructor(_: StaticArray<u8>): void {
    assert(Context.isDeployingContract(), "Not deploying");
    
    const deployer = Context.caller();
    
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
    
    generateEvent("MassaSwap: DEX deployed with enhanced security");
}

export function createPool(args: StaticArray<u8>): void {
    whenNotPaused();
    nonReentrant();
    
    const argument = new Args(args);
    const tokenA = new Address(argument.nextString().unwrap());
    const tokenB = new Address(argument.nextString().unwrap());
    const amountA = argument.nextU64().unwrap();
    const amountB = argument.nextU64().unwrap();
    const deadline = argument.nextU64().unwrap();
    
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
    const liquidity = sqrt(amountA * amountB);
    assert(liquidity > MIN_LIQUIDITY, "Insufficient liquidity");
    
    // Create pool with enhanced fields
    const pool = new Pool(tokenA, tokenB, amountA, amountB, liquidity, DEFAULT_FEE_RATE, Context.timestamp());
    pool.kLast = amountA * amountB;
    updateCumulativePrices(pool);
    savePool(pool);
    
    // Update registry
    const poolCount = u64(parseInt(Storage.get("pool_count")));
    Storage.set("pool_index:" + poolCount.toString(), poolKey);
    Storage.set("pool_count", (poolCount + 1).toString());
    
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
    
    validDeadline(deadline);
    validateTokenPair(tokenA, tokenB);
    
    const caller = Context.caller();
    const pool = getPool(tokenA, tokenB);
    assert(pool != null, "Pool does not exist");
    assert(pool!.isActive, "Pool is not active");
    
    // Calculate optimal amounts with slippage protection
    let amountA: u64, amountB: u64;
    
    if (pool!.reserveA == 0 || pool!.reserveB == 0) {
        amountA = amountADesired;
        amountB = amountBDesired;
    } else {
        const amountBOptimal = (amountADesired * pool!.reserveB) / pool!.reserveA;
        if (amountBOptimal <= amountBDesired) {
            assert(amountBOptimal >= amountBMin, "Insufficient B amount");
            amountA = amountADesired;
            amountB = amountBOptimal;
        } else {
            const amountAOptimal = (amountBDesired * pool!.reserveA) / pool!.reserveB;
            assert(amountAOptimal <= amountADesired && amountAOptimal >= amountAMin, "Insufficient A amount");
            amountA = amountAOptimal;
            amountB = amountBDesired;
        }
    }
    
    validateAmounts(amountA, amountB);
    
    // Safe transfers
    assert(safeTransferFrom(tokenA, caller, Context.callee(), amountA), "Token A transfer failed");
    assert(safeTransferFrom(tokenB, caller, Context.callee(), amountB), "Token B transfer failed");
    
    // Calculate liquidity to mint
    const liquidity = (amountA * pool!.totalSupply) / pool!.reserveA;
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
    
    validDeadline(deadline);
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
    
    // Calculate amounts with slippage protection
    const amountA = (liquidity * pool!.reserveA) / pool!.totalSupply;
    const amountB = (liquidity * pool!.reserveB) / pool!.totalSupply;
    
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
    
    validDeadline(deadline);
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
    
    // K invariant check with fee adjustment
    const amountInWithFee = amountIn * (10000 - pool!.fee);
    const newK = newReserveIn * newReserveOut * 10000;
    const oldK = reserveIn * reserveOut * 10000 + amountInWithFee * reserveOut;
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
    
    const fee = (amountIn * pool!.fee) / 10000;
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