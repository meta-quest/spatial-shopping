/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Interaction configuration for grab, rotation, movement, and arrows
 */

export interface GrabConfig {
  /** Delay (ms) after rotation ends before translation can activate */
  rotationSwitchDelay: number;

  /** Threshold for filtering rotation jitter when switching between modes */
  rotationJitterThreshold: number;

  /** Max distance (meters) between hand and object to trigger close grab instead of far grab */
  closeGrabThreshold: number;

  /** Minimum placement distance for far grab (meters) */
  minPlacementDistance: number;
}

export interface ScaleAnimationConfig {
  /** Duration for object scaling animation (ms) */
  duration: number;

  /** Easing function for scaling (from @tweenjs/tween.js Easing) */
  easing: (amount: number) => number;
}

/**
 * Scale bounds and multiplier for arrow scaling
 */
export interface ScaleConfig {
  /** Scale multiplier applied to arrow size */
  multiplier: number;
  /** Minimum scale value */
  min: number;
  /** Maximum scale value */
  max: number;
}
/**
 * Arrow state machine configuration interface
 */
export interface ArrowStateMachineConfig {
  idleToHover: {
    color: number;
    opacity: number;
    duration: number;
    easing: (amount: number) => number;
  };
  hoverToIdle: {
    color: number;
    opacity: number;
    duration: number;
    easing: (amount: number) => number;
  };
  clickAnimation: {
    upScale: number;
    upDuration: number;
    downDuration: number;
    upEasing: (amount: number) => number;
    downEasing: (amount: number) => number;
  };
}

/**
 * Arrow configuration interface
 * @property rotationStepRadians - radians per click
 * @property rotationDragSensitivity - dampening factor for rotation (0–1, lower = smoother)
 * @property floorAngleThreshold - degrees
 * @property wallAngleThreshold - degrees
 * @property movementClickDistance - distance to move per arrow click (meters)
 * @property movementSpeed - speed to move per second (meters per second)
 * @property scaleConfig - scale bounds and multiplier for arrows
 * @property blue - blue arrow configuration
 * @property green - green arrow configuration
 */
export interface ArrowsConfig {
  rotationStepRadians: number;
  rotationDragSensitivityFloor: number;
  floorAngleThreshold: number;
  wallAngleThreshold: number;
  movementClickDistance: number;
  movementDragSensitivity: number;
  scaleConfig: ScaleConfig;
  blue: ArrowStateMachineConfig;
  green: ArrowStateMachineConfig;
}

/**
 * Interpolation configuration for smooth position and rotation transitions
 */
export interface InterpolationConfig {
  /** Speed multiplier for position interpolation (higher = faster) */
  positionSpeed: number;

  /** Speed multiplier for rotation interpolation (higher = faster) */
  rotationSpeed: number;
}

export interface InteractionConfig {
  /** Grab/drag behavior configuration */
  grab: GrabConfig;

  /** Scaling animation configuration */
  scaling: ScaleAnimationConfig;

  /** Arrow control configurations (includes rotation and movement) */
  arrows: ArrowsConfig;

  /** Interpolation speed configuration for smooth transitions */
  interpolation: InterpolationConfig;
}
