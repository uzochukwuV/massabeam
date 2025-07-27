import { u256 } from 'as-bignum/assembly';
import { mrc20Constructor } from './MRC20';

export function constructor(): void {
  mrc20Constructor('BeamUSDC', 'BUSDC', 6, u256.fromU64(500000000));
}

export {
  name,
  symbol,
  totalSupply,
  decimals,
  balanceOf,
  transfer,
  allowance,
  increaseAllowance,
  decreaseAllowance,
  transferFrom,
  version,
  mint,
  ownerAddress as owner
} from './MRC20';

export { setOwner, onlyOwner, isOwner } from './utils/ownership';