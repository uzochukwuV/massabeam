import { Args } from '@massalabs/as-types';
import { Address, call, Storage } from '@massalabs/massa-as-sdk';
import { IFactory } from './IFactory';
import { u256 } from 'as-bignum/assembly/integer/u256';
import {  Result, Serializable } from '@massalabs/as-types';


export class IQuoter {
    _origin: Address;

      /**
     * Wraps a smart contract exposing standard token FFI.
     *
     * @param {Address} at - Address of the smart contract.
     */
    constructor(at: Address) {
        this._origin = at;
    }

  init(factory: Address): void {
    const args = new Args().add(factory);
    call(this._origin, 'constructor', args, 0);
  }

  findBestPathFromAmountIn(route: Address[], amountIn: u256): Quote {
    const args = new Args().addSerializableObjectArray(route).add(amountIn);
    const res = call(this._origin, 'findBestPathFromAmountIn', args, 0);
    return new Args(res).nextSerializable<Quote>().unwrap();
  }

  findBestPathFromAmountOut(route: Address[], amountOut: u256): Quote {
    const args = new Args().addSerializableObjectArray(route).add(amountOut);
    const res = call(this._origin, 'findBestPathFromAmountOut', args, 0);
    return new Args(res).nextSerializable<Quote>().unwrap();
  }

 
}




/// @dev Structure used in Quoter containing the necessary element to perform the swap :
export class Quote implements Serializable {
  /**
   *
   * @param {Address[]} route Path in the form of an array of token address to go through
   * @param {Address[]} pairs Address of the different pairs to do through
   * @param {u64[]} binSteps Bin step for each pair
   * @param {u256[]} amounts The amounts for every step of the swap
   * @param {u256[]} virtualAmountsWithoutSlippage The virtual amounts of every step of the swap without slippage
   * @param {u256[]} fees The fees to pay for every step of the swap
   */
  constructor(
    public route: Address[] = [],
    public pairs: Address[] = [],
    public binSteps: u64[] = [],
    public amounts: u256[] = [],
    public virtualAmountsWithoutSlippage: u256[] = [],
    public fees: u256[] = [],
  ) {}

  serialize(): StaticArray<u8> {
    return new Args()
      .addSerializableObjectArray(this.route)
      .addSerializableObjectArray(this.pairs)
      .add(this.binSteps)
      .add(this.amounts)
      .add(this.virtualAmountsWithoutSlippage)
      .add(this.fees)
      .serialize();
  }

  deserialize(data: StaticArray<u8>, offset: i32): Result<i32> {
    const args = new Args(data, offset);
    this.route = args
      .nextSerializableObjectArray<Address>()
      .expect('route is missing');
    this.pairs = args
      .nextSerializableObjectArray<Address>()
      .expect('pairs is missing');
    this.binSteps = args
      .nextFixedSizeArray<u64>()
      .expect('binSteps is missing');
    this.amounts = args.nextFixedSizeArray<u256>().expect('amounts is missing');
    this.virtualAmountsWithoutSlippage = args
      .nextFixedSizeArray<u256>()
      .expect('virtualAmountsWithoutSlippage is missing');
    this.fees = args.nextFixedSizeArray<u256>().expect('fees is missing');
    return new Result(args.offset);
  }
}
