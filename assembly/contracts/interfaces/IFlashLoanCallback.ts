/**
 * IFlashLoanCallback Interface
 *
 * Interface that must be implemented by flash loan borrowers.
 * The callback function is called during flash loan execution
 * and must repay the loan + fee before returning.
 *
 * @interface IFlashLoanCallback
 */

import { Address, call } from '@massalabs/massa-as-sdk';
import { Args, u256ToBytes } from '@massalabs/as-types';
import { u256 } from 'as-bignum/assembly/integer/u256';

export class IFlashLoanCallback {
  _origin: Address;

  constructor(at: Address) {
    this._origin = at;
  }

  /**
   * Callback function called during flash loan
   *
   * @param sender Address that initiated the flash loan
   * @param token Token being borrowed
   * @param amount Amount borrowed
   * @param fee Fee to be paid
   * @param data Arbitrary data passed by the borrower
   */
  onFlashLoan(
    sender: Address,
    token: Address,
    amount: u256,
    fee: u256,
    data: StaticArray<u8>,
  ): void {
    const args = new Args()
      .add(sender.toString())
      .add(token.toString())
      .add(u256ToBytes(amount))
      .add(u256ToBytes(fee))
      .add(data);

    call(this._origin, 'onFlashLoan', args, 0);
  }
}
