/**
 * SafeMath library for MassaBeam
 * Provides safe arithmetic operations with overflow/underflow checks
 * Adapted from Dussa implementation
 */

import { u256 } from 'as-bignum/assembly/integer/u256';

/**
 * SafeMath for u64 operations
 */
export class SafeMath {
  static add(a: u64, b: u64): u64 {
    const c: u64 = a + b;
    assert(c >= a, 'SafeMath: addition overflow');
    return c;
  }

  static sub(a: u64, b: u64): u64 {
    assert(b <= a, 'SafeMath: subtraction overflow');
    const c: u64 = a - b;
    return c;
  }

  static mul(a: u64, b: u64): u64 {
    if (a == 0) {
      return 0;
    }
    const c = a * b;
    assert(c / a == b, 'SafeMath: multiplication overflow');
    return c;
  }

  static div(a: u64, b: u64): u64 {
    assert(b > 0, 'SafeMath: division by zero');
    const c = a / b;
    return c;
  }

  static mod(a: u64, b: u64): u64 {
    assert(b != 0, 'SafeMath: modulo by zero');
    return a % b;
  }
}

/**
 * SafeMath256 for u256 operations
 * Used for all token amount calculations
 */
export class SafeMath256 {
  /**
   * Addition with overflow check
   * Returns a + b, reverts on overflow
   */
  static add(a: u256, b: u256): u256 {
    const c = u256.add(a, b);
    assert(c >= a, 'SafeMath256: addition overflow');
    return c;
  }

  /**
   * Subtraction with underflow check
   * Returns a - b, reverts if b > a
   */
  static sub(a: u256, b: u256): u256 {
    assert(b <= a, 'SafeMath256: subtraction overflow');
    const c = u256.sub(a, b);
    return c;
  }

  /**
   * Multiplication with overflow check
   * Returns a * b, reverts on overflow
   */
  static mul(a: u256, b: u256): u256 {
    if (a.isZero()) {
      return u256.Zero;
    }
    const c = u256.mul(a, b);
    assert(u256.eq(u256.div(c, a), b), 'SafeMath256: multiplication overflow');
    return c;
  }

  /**
   * Division with zero check
   * Returns a / b, reverts if b == 0
   */
  static div(a: u256, b: u256): u256 {
    assert(u256.gt(b, u256.Zero), 'SafeMath256: division by zero');
    const c = u256.div(a, b);
    return c;
  }

  /**
   * Modulo with zero check
   * Returns a % b, reverts if b == 0
   */
  static mod(a: u256, b: u256): u256 {
    assert(!b.isZero(), 'SafeMath256: modulo by zero');
    return u256.rem(a, b);
  }

  /**
   * Minimum of two values
   */
  static min(a: u256, b: u256): u256 {
    return a <= b ? a : b;
  }

  /**
   * Maximum of two values
   */
  static max(a: u256, b: u256): u256 {
    return a >= b ? a : b;
  }
}

/**
 * Math512Bits - High precision calculations
 * For operations that might overflow during intermediate calculations
 *
 * Simplified version for MassaBeam (full implementation available in Dussa)
 */
export class Math512Bits {
  /**
   * Calculate (x * y) / denominator with full precision
   * Prevents overflow in intermediate multiplication
   *
   * This is a simplified version. For production use, consider
   * adopting Dussa's full implementation with 512-bit intermediates.
   */
  static mulDivRoundDown(x: u256, y: u256, denominator: u256): u256 {
    assert(u256.gt(denominator, u256.Zero), 'Math512Bits: division by zero');

    // For now, use safe multiplication then division
    // TODO: Implement full 512-bit precision like Dussa
    const product = SafeMath256.mul(x, y);
    return u256.div(product, denominator);
  }

  /**
   * Calculate (x * y) / denominator, rounding up
   */
  static mulDivRoundUp(x: u256, y: u256, denominator: u256): u256 {
    assert(u256.gt(denominator, u256.Zero), 'Math512Bits: division by zero');

    const product = SafeMath256.mul(x, y);
    const result = u256.div(product, denominator);
    const remainder = u256.rem(product, denominator);

    // Round up if there's a remainder
    if (!remainder.isZero()) {
      return SafeMath256.add(result, u256.One);
    }
    return result;
  }

  /**
   * Calculate (x * y) >> offset with full precision
   * Used for fixed-point math
   */
  static mulShiftRoundDown(x: u256, y: u256, offset: i32): u256 {
    assert(offset <= 255, 'Math512Bits: offset overflow');

    const product = SafeMath256.mul(x, y);
    return u256.shr(product, offset);
  }
}
