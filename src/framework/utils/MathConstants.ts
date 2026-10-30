/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Mathematical constants used throughout the application
 * These are immutable values that should never be configurable
 */

export class MathConstants {
  /** Square root of 1/2 - commonly used for quaternion calculations */
  static readonly SQRT1_2 = Math.SQRT1_2;

  /** Pi constant */
  static readonly PI = Math.PI;

  /** Half pi (90 degrees) */
  static readonly HALF_PI = Math.PI / 2;

  /** Two pi (360 degrees) */
  static readonly TWO_PI = Math.PI * 2;

  /** Converts degrees to radians */
  static degreesToRadians(degrees: number): number {
    return degrees * (this.PI / 180);
  }

  /** Converts radians to degrees */
  static radiansToDegrees(radians: number): number {
    return radians * (180 / this.PI);
  }
}
