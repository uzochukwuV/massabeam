/**
 * Simple ERC20 interface for TypeScript
 */

export interface IERC20 {
  balanceOf(address: string): Promise<bigint>;
  approve(spender: string, amount: bigint): Promise<any>;
  transfer(to: string, amount: bigint): Promise<any>;
  transferFrom(from: string, to: string, amount: bigint): Promise<any>;
}
