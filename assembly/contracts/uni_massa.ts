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
export const FEE_RATE = 30; // 0.3% base fee
export const TREASURY_ADDRESS = new Address("AS1dJ8mrm2cVSdZVZLXo43wRx5FxywZ9BmxiUmXCy7Tx72XNbit8");




// Pool structure
export class Pool {
    tokenA: Address;
    tokenB: Address;
    reserveA: u64;
    reserveB: u64;
    totalSupply: u64;
    fee: u64;
    lastUpdateTime: u64;
    isActive: bool;

    constructor(
        tokenA: Address,
        tokenB: Address,
        reserveA: u64 = 0,
        reserveB: u64 = 0,
        totalSupply: u64 = 0,
        fee: u64 = FEE_RATE,
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
        return args.serialize();
    }

    static deserialize(data: StaticArray<u8>): Pool {
        
        const args = new Args(data);
        return new Pool(
            new Address(args.nextString().unwrap()),
            new Address(args.nextString().unwrap()),
            args.nextU64().unwrap(),
            args.nextU64().unwrap(),
            args.nextU64().unwrap(),
            args.nextU64().unwrap(),
            args.nextU64().unwrap(),
            args.nextBool().unwrap()
        );
    }
}


// Utility functions
export function callNextSlot(at: Address, function_name: string, gas: u64): void {
    const cur_period = Context.currentPeriod();
    const cur_thread = Context.currentThread();
    let next_thread = cur_thread + 1;
    let next_period = cur_period;
    if (next_thread >= 32) {
        ++next_period;
        next_thread = 0;
    }
    sendMessage(at, function_name, next_period, next_thread, next_period + 5, next_thread, gas, 0, 0, []);
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

export function getAmountOut(amountIn: u64, reserveIn: u64, reserveOut: u64, fee: u64): u64 {
    if (amountIn == 0 || reserveIn == 0 || reserveOut == 0) {
        return 0;
    }
    const amountInWithFee = amountIn * (10000 - fee);
    const numerator = amountInWithFee * reserveOut;
    const denominator = reserveIn * 10000 + amountInWithFee;
    return numerator / denominator;
}

export function getAmountIn(amountOut: u64, reserveIn: u64, reserveOut: u64, fee: u64): u64 {
    if (amountOut == 0 || reserveIn == 0 || reserveOut == 0) {
        return 0;
    }
    const numerator = reserveIn * amountOut * 10000;
    const denominator = (reserveOut - amountOut) * (10000 - fee);
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

// Price oracle functions
export function updatePrice(tokenA: Address, tokenB: Address): void {
    const pool = getPool(tokenA, tokenB);
    if (pool == null) return;
    
    const currentTime = Context.timestamp();
    const timeElapsed = currentTime - pool.lastUpdateTime;
    
    if (timeElapsed > 0) {
        const price = (pool.reserveB * ONE_UNIT) / pool.reserveA;
        const priceKey = "price:" + getPoolKey(tokenA, tokenB);
        Storage.set(priceKey, price.toString());
        Storage.set(priceKey + ":timestamp", currentTime.toString());
        
        pool.lastUpdateTime = currentTime;
        savePool(pool);
    }
}

export function getPrice(tokenA: Address, tokenB: Address): u64 {
    const priceKey = "price:" + getPoolKey(tokenA, tokenB);
    if (!Storage.has(priceKey)) {
        return 0;
    }
    return u64(parseInt(Storage.get(priceKey)));
}

// Arbitrage detection
export function detectArbitrage(): ArbitrageOpportunity[] {
    const opportunities: ArbitrageOpportunity[] = [];
    const poolKeys = getAllPoolKeys();
    
    for (let i = 0; i < poolKeys.length; i++) {
        for (let j = i + 1; j < poolKeys.length; j++) {
            const pool1 = Pool.deserialize(stringToBytes(Storage.get("pool:" + poolKeys[i])));
            const pool2 = Pool.deserialize(stringToBytes(Storage.get("pool:" + poolKeys[j])));
            
            // Check for triangular arbitrage opportunities
            if (pool1.tokenA.toString() == pool2.tokenA.toString() || 
                pool1.tokenA.toString() == pool2.tokenB.toString() ||
                pool1.tokenB.toString() == pool2.tokenA.toString() ||
                pool1.tokenB.toString() == pool2.tokenB.toString()) {
                
                const opportunity = calculateArbitrageProfit(pool1, pool2);
                if (opportunity.profit > 0) {
                    opportunities.push(opportunity);
                }
            }
        }
    }
    
    return opportunities;
}

export class ArbitrageOpportunity {
    pool1: Pool;
    pool2: Pool;
    profit: u64;
    amountIn: u64;
    path: Address[];

    constructor(pool1: Pool, pool2: Pool, profit: u64, amountIn: u64, path: Address[]) {
        this.pool1 = pool1;
        this.pool2 = pool2;
        this.profit = profit;
        this.amountIn = amountIn;
        this.path = path;
    }
}

export function calculateArbitrageProfit(pool1: Pool, pool2: Pool): ArbitrageOpportunity {
    // Simplified arbitrage calculation
    const testAmount = 1000 * ONE_UNIT;
    
    // Try different paths and amounts
    const price1 = (pool1.reserveB * ONE_UNIT) / pool1.reserveA;
    const price2 = (pool2.reserveB * ONE_UNIT) / pool2.reserveA;
    
    const profit = price1 > price2 ? price1 - price2 : price2 - price1;
    
    return new ArbitrageOpportunity(
        pool1,
        pool2,
        profit,
        testAmount,
        [pool1.tokenA, pool1.tokenB, pool2.tokenA]
    );
}

export function getAllPoolKeys(): string[] {
    const keys: string[] = [];
    const poolCount = u64(parseInt(Storage.has("pool_count") ? Storage.get("pool_count") : "0"));
    
    for (let i: u64 = 0; i < poolCount; i++) {
        const key = Storage.get("pool_index:" + i.toString());
        keys.push(key);
    }
    
    return keys;
}

// Main DEX contract functions
export function constructor(_: StaticArray<u8>): void {
    assert(Context.isDeployingContract());
    const callee = Context.callee();
    
    Storage.set("pool_count", "0");
    Storage.set("order_count", "0");
    Storage.set("total_volume", "0");
    Storage.set("total_fees", "0");
    Storage.set("last_arbitrage_check", "0");
    
    generateEvent("MassaSwap: DEX deployed successfully");
}

export function createPool(args: StaticArray<u8>): void {
    const argument= new Args(args);
    const tokenA = new Address(argument.nextString().unwrap());
    const tokenB = new Address(argument.nextString().unwrap());
    const amountA = argument.nextU64().unwrap();
    const amountB = argument.nextU64().unwrap();
    
    const caller = Context.caller();
    const poolKey = getPoolKey(tokenA, tokenB);
    
    // Check if pool already exists
    if (Storage.has("pool:" + poolKey)) {
        generateEvent("MassaSwap: Pool already exists");
        return;
    }
    
    // Transfer tokens from user
    const tokenAContract = new IERC20(tokenA);
    const tokenBContract = new IERC20(tokenB);


    if (tokenAContract.allowance(caller, Context.callee()) < amountA ||
        tokenBContract.allowance(caller, Context.callee()) < amountB) {
        generateEvent("MassaSwap: Token A transfer failed");
        return;
    }
    
    tokenAContract.transferFrom(caller, Context.callee(), amountA);
    tokenBContract.transferFrom(caller, Context.callee(), amountB);
    
    // Calculate initial liquidity
    const liquidity = sqrt(amountA * amountB);
    
    // Create pool
    const pool = new Pool(tokenA, tokenB, amountA, amountB, liquidity, FEE_RATE, Context.timestamp());
    savePool(pool);
    
    // Update pool registry
    const poolCount = u64(parseInt(Storage.get("pool_count")));
    Storage.set("pool_index:" + poolCount.toString(), poolKey);
    Storage.set("pool_count", (poolCount + 1).toString());
    
    // Mint LP tokens to user
    const lpTokenKey = "lp_balance:" + poolKey + ":" + caller.toString();
    Storage.set(lpTokenKey, liquidity.toString());
    
    updatePrice(tokenA, tokenB);
    
    generateEvent(`MassaSwap: Pool created for ${tokenA.toString()}/${tokenB.toString()}`);
}

export function addLiquidity(args: StaticArray<u8>): void {
    const argument = new Args(args);
    const tokenA = new Address(argument.nextString().unwrap());
    const tokenB = new Address(argument.nextString().unwrap());
    const amountA = argument.nextU64().unwrap();
    const amountB = argument.nextU64().unwrap();
    
    const caller = Context.caller();
    const pool = getPool(tokenA, tokenB);
    
    if (pool == null) {
        generateEvent("MassaSwap: Pool does not exist");
        return;
    }
    
    // Calculate optimal amounts
    const amountBOptimal = (amountA * pool.reserveB) / pool.reserveA;
    const amountAOptimal = (amountB * pool.reserveA) / pool.reserveB;
    
    let finalAmountA = amountA;
    let finalAmountB = amountB;
    
    if (amountBOptimal <= amountB) {
        finalAmountB = amountBOptimal;
    } else {
        finalAmountA = amountAOptimal;
    }
    
    // Transfer tokens
    const tokenAContract = new IERC20(tokenA);
    const tokenBContract = new IERC20(tokenB);

    if (tokenAContract.allowance(caller, Context.callee()) < finalAmountA ||
        tokenBContract.allowance(caller, Context.callee()) < finalAmountB) {
        generateEvent("MassaSwap: Token transfer failed");
        return;
    }
    
    tokenAContract.transferFrom(caller, Context.callee(), finalAmountA);
    tokenBContract.transferFrom(caller, Context.callee(), finalAmountB);
    
    // Calculate liquidity to mint
    const liquidity = (finalAmountA * pool.totalSupply) / pool.reserveA;
    
    // Update pool
    pool.reserveA += finalAmountA;
    pool.reserveB += finalAmountB;
    pool.totalSupply += liquidity;
    savePool(pool);
    
    // Update user LP balance
    const lpTokenKey = "lp_balance:" + getPoolKey(tokenA, tokenB) + ":" + caller.toString();
    const currentBalance = u64(parseInt(Storage.has(lpTokenKey) ? Storage.get(lpTokenKey) : "0"));
    Storage.set(lpTokenKey, (currentBalance + liquidity).toString());
    
    updatePrice(tokenA, tokenB);
    
    generateEvent(`MassaSwap: Liquidity added - ${finalAmountA}/${finalAmountB}`);
}

export function removeLiquidity(args: StaticArray<u8>): void {
    const argument = new Args(args);
    const tokenA = new Address(argument.nextString().unwrap());
    const tokenB = new Address(argument.nextString().unwrap());
    const liquidity = argument.nextU64().unwrap();
    
    const caller = Context.caller();
    const pool = getPool(tokenA, tokenB);
    
    if (pool == null) {
        generateEvent("MassaSwap: Pool does not exist");
        return;
    }
    
    // Check user LP balance
    const lpTokenKey = "lp_balance:" + getPoolKey(tokenA, tokenB) + ":" + caller.toString();
    const userBalance = u64(parseInt(Storage.has(lpTokenKey) ? Storage.get(lpTokenKey) : "0"));
    
    if (userBalance < liquidity) {
        generateEvent("MassaSwap: Insufficient liquidity balance");
        return;
    }
    
    // Calculate amounts to return
    const amountA = (liquidity * pool.reserveA) / pool.totalSupply;
    const amountB = (liquidity * pool.reserveB) / pool.totalSupply;
    
    // Update pool
    pool.reserveA -= amountA;
    pool.reserveB -= amountB;
    pool.totalSupply -= liquidity;
    savePool(pool);
    
    // Update user LP balance
    Storage.set(lpTokenKey, (userBalance - liquidity).toString());
    
    // Transfer tokens back to user
    const tokenAContract = new IERC20(tokenA);
    const tokenBContract = new IERC20(tokenB);
    
    tokenAContract.transfer(caller, amountA);
    tokenBContract.transfer(caller, amountB);
    
    updatePrice(tokenA, tokenB);
    
    generateEvent(`MassaSwap: Liquidity removed - ${amountA}/${amountB}`);
}

export function swap(args: StaticArray<u8>): void {
    const argument = new Args(args);
    const tokenIn = new Address(argument.nextString().unwrap());
    const tokenOut = new Address(argument.nextString().unwrap());
    const amountIn = argument.nextU64().unwrap();
    const minAmountOut = argument.nextU64().unwrap();
    
    const caller = Context.caller();
    const pool = getPool(tokenIn, tokenOut);
    
    if (pool == null) {
        generateEvent("MassaSwap: Pool does not exist");
        return;
    }
    
    // Determine which token is which
    const tokenInIsA = pool.tokenA.toString() == tokenIn.toString();
    const reserveIn = tokenInIsA ? pool.reserveA : pool.reserveB;
    const reserveOut = tokenInIsA ? pool.reserveB : pool.reserveA;
    
    // Calculate output amount
    const amountOut = getAmountOut(amountIn, reserveIn, reserveOut, pool.fee);
    
    if (amountOut < minAmountOut) {
        generateEvent("MassaSwap: Insufficient output amount");
        return;
    }
    
    // Transfer tokens
    const tokenInContract = new IERC20(tokenIn);
    const tokenOutContract = new IERC20(tokenOut);
    if (tokenInContract.allowance(caller, Context.callee()) < amountIn ){
        generateEvent("MassaSwap: Token transfer failed");
        return;
    }
    
    tokenInContract.transferFrom(caller, Context.callee(), amountIn);
    tokenOutContract.transfer(caller, amountOut);
    
    // Update pool reserves
    if (tokenInIsA) {
        pool.reserveA += amountIn;
        pool.reserveB -= amountOut;
    } else {
        pool.reserveB += amountIn;
        pool.reserveA -= amountOut;
    }
    
    savePool(pool);
    updatePrice(tokenIn, tokenOut);
    
    // Update volume stats
    const totalVolume = u64(parseInt(Storage.get("total_volume")));
    Storage.set("total_volume", (totalVolume + amountIn).toString());
    
    const fee = (amountIn * pool.fee) / 10000;
    const totalFees = u64(parseInt(Storage.get("total_fees")));
    Storage.set("total_fees", (totalFees + fee).toString());
    
    generateEvent(`MassaSwap: Swapped ${amountIn} ${tokenIn.toString()} for ${amountOut} ${tokenOut.toString()}`);
}