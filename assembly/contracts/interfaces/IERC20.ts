import { Args, Result, Serializable } from "@massalabs/as-types";
import { Address, Context, call } from "@massalabs/massa-as-sdk";
import { TokenWrapper } from "./TokenWrapper";
import { u256 } from 'as-bignum/assembly';

/**
 * FIXED VERSION: Updated to use u256 for all token amounts
 */
export class IERC20 extends TokenWrapper implements Serializable {
    constructor(origin: Address = new Address()) {
        super(origin);
    }

    init(name: string, symbol: string, decimals: u8, supply: u256): void {
        const args = new Args().add(name).add(symbol).add(decimals).add(supply);
        call(this._origin, "constructor", args, 0);
    }

    /**
     * Returns the amount of token received by the pair
     *
     * @param {u256} reserve - The total reserve of token
     * @param {u256} fees - The total fees of token
     *
     * @return {u256} - The amount received by the pair
     */
    received(reserve: u256, fees: u256): u256 {
        const balance = this.balanceOf(Context.callee());
        // @ts-ignore
        const reservePlusFees = reserve + fees;

        // Check for underflow
        if (balance < reservePlusFees) {
            return u256.Zero;
        }

        // @ts-ignore
        const received = balance - reservePlusFees;
        return received;
    }

    serialize(): StaticArray<u8> {
        return this._origin.serialize();
    }

    deserialize(data: StaticArray<u8>, offset: i32): Result<i32> {
        return this._origin.deserialize(data, offset);
    }

    // OVERRIDE WRAPPER

    notEqual(other: IERC20): bool {
        return this._origin.notEqual(other._origin);
    }

    equals(other: IERC20): bool {
        return this._origin.equals(other._origin);
    }
}
