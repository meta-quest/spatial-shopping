/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Main configuration interface for the XR Viewer
 * Contains all application constants and configuration values
 */

import { Easing } from "@tweenjs/tween.js";
import { LightingConfig } from "./LightingConfig.js";
import { UIConfig } from "./UIConfig.js";
import { InteractionConfig } from "./InteractionConfig.js";
import { PlacementConfig } from "./PlacementConfig.js";
import { RENDER_ORDER } from "./RenderOrder.js";

/** Interactive targets retain a consistent apparent size through the working range. */
const CONTROL_PANEL_DISTANCE_SCALE = {
  referenceDistance: 1.5,
  exponent: 1,
  minScale: 0.7,
  maxScale: 2,
  smoothingTau: 0.12,
} as const;

/** Reading surfaces retain depth while avoiding extreme near/far sizes. */
const READING_PANEL_DISTANCE_SCALE = {
  referenceDistance: 1.5,
  exponent: 0.8,
  minScale: 0.6,
  maxScale: 2,
  smoothingTau: 0.12,
} as const;

/**
 * Complete viewer configuration interface
 */
export interface ViewerConfig {
  /** Lighting configuration (IBL, directional lights, shadows) */
  lighting: LightingConfig;

  /** UI configuration (panels, tooltips, dimensions) */
  ui: UIConfig;

  /** Interaction configuration (grab, rotation, movement, scaling, arrows) */
  interaction: InteractionConfig;

  /** Placement and snapping configuration */
  placement: PlacementConfig;
}

/**
 * Application configuration constants
 * @readonly
 */
export const CONFIG: Readonly<ViewerConfig> = {
  lighting: {
    /** Image-based lighting */
    ibl: {
      resource: "poly_haven_studio_1k",
      intensity: 1.3,
    },
    /** Directional lights */
    directional: {
      intensity: 1.3,
    },
    /** Shadows */
    shadows: {
      enabled: false,
      contactShadow: {
        hardOpacity: 0.4,
        softOpacity: 0.8,
        hardScaleFactor: 1.1,
        softScaleFactor: 1.6,
        positionOffsetHard: 0.002,
        positionOffsetSoft: 0.001,
      },
    },
  },

  ui: {
    /** Panel animations and timing */
    panelTiming: {
      fadeInDuration: 400,
      fadeOutDuration: 400,
      controlPanelsShowDelay: 600,
      controlPanelsHideDelay: 3000,
      variantPanelHideDelay: 3000,
      wrongSurfaceNotifierShowDelay: 1500,
    },
    /** Tooltip animations */
    tooltipTiming: {
      fadeInDuration: 300,
      fadeOutDuration: 200,
    },
    /** Dimension labels */
    dimensions: {
      textureHeight: 64,
      fontSize: 30,
      planeWidth: 0.3,
      planeHeight: 0.1,
      renderOrder: RENDER_ORDER.panel,
      /** Convert meters to centimeters */
      metersToDisplayUnit: 100,
      displayUnitSuffix: "cm",
      distanceScale: {
        distanceChangeThreshold: 2.5,
        minDistance: 0.5,
        maxDistance: 5.0,
        minScale: 0.3,
        maxScale: 1.5,
      },
    },
    /** Offsets from product bounding plane edges to panels (meters) */
    panelToProductOffsets: {
      leftPanelOffset: 0.1,
      rightPanelOffset: 0.1,
      bottomPanelOffset: 0.05,
      topPanelOffset: 0.15,
      productPanelAttachedHorizontalOffset: 0.32,
    },
    /** Dynamic UI scaling based on camera distance */
    distanceScale: {
      /** Distance at which UI scaling begins (meters) */
      distanceChangeThreshold: 2.5,
      /** Minimum distance for scaling calculations (meters) */
      minDistance: 1.0,
      /** Maximum distance for distance-based scaling (meters) */
      maxDistance: 5.0,
      /** Minimum scale factor for UI panels */
      minScale: 0.33,
      /** Maximum scale factor for UI panels */
      maxScale: 1.5,
    },
    variantPanelDistanceScale: CONTROL_PANEL_DISTANCE_SCALE,
    controlBarDistanceScale: CONTROL_PANEL_DISTANCE_SCALE,
    productPanelDistanceScale: READING_PANEL_DISTANCE_SCALE,
    controlBarAnchor: {
      sideGap: 0.04,
      surfaceClearance: 0.02,
    },
    /** Distance at which UI is completely hidden (meters) */
    uiTurnOffDistance: 0.1,
    /** Visibility dead band near the product */
    uiHideHysteresis: 0.15,
  },

  interaction: {
    /** Grab/drag behavior */
    grab: {
      /** Ms delay after rotation ends before translation activates */
      rotationSwitchDelay: 300,
      /** Avoid jittering when switching modes */
      rotationJitterThreshold: 0.05,
      /** Hand-to-object distance below which close grab is used (meters) */
      closeGrabThreshold: 0.12,
      /** Minimum placement distance for far grab (meters) */
      minPlacementDistance: 0.5,
    },
    /** Object scaling animation */
    scaling: {
      duration: 1200,
      easing: Easing.Sinusoidal.InOut,
    },
    /** Arrow control configurations (movement and rotation arrows) */
    arrows: {
      /** Arrow rotation increment per click */
      rotationStepRadians: 0.0125,
      /** Sensitivity factor for rotation drag on floor */
      rotationDragSensitivityFloor: 1.75,
      /** Degrees */
      floorAngleThreshold: 45,
      /** Degrees */
      wallAngleThreshold: 55,
      /** Distance to move per arrow click (meters) */
      movementClickDistance: 0.01,
      /** Sensitivity factor for movement drag */
      movementDragSensitivity: 1,
      scaleConfig: {
        /** Scale multiplier for arrows */
        multiplier: 1.0,
        /** Minimum scale for arrows */
        min: 0.4,
        /** Maximum scale for arrows */
        max: 0.8,
      },
      /** Blue arrow configuration (used for movement arrows) */
      blue: {
        idleToHover: {
          color: 0xbcdeff,
          opacity: 1.0,
          duration: 300,
          easing: Easing.Quadratic.InOut,
        },
        hoverToIdle: {
          color: 0x4f7fcf,
          opacity: 0.78,
          duration: 300,
          easing: Easing.Quadratic.InOut,
        },
        clickAnimation: {
          upScale: 1.2,
          upDuration: 200,
          downDuration: 200,
          upEasing: Easing.Back.Out,
          downEasing: Easing.Quadratic.InOut,
        },
      },
      /** Green arrow configuration (used for rotation arrows) */
      green: {
        idleToHover: {
          color: 0xaae7b8,
          opacity: 1.0,
          duration: 300,
          easing: Easing.Quadratic.InOut,
        },
        hoverToIdle: {
          color: 0x3f9b68,
          opacity: 0.78,
          duration: 300,
          easing: Easing.Quadratic.InOut,
        },
        clickAnimation: {
          upScale: 1.2,
          upDuration: 200,
          downDuration: 200,
          upEasing: Easing.Back.Out,
          downEasing: Easing.Quadratic.InOut,
        },
      },
    },
    /** Interpolation speeds for smooth position and rotation transitions */
    interpolation: {
      /** Speed multiplier for position interpolation */
      positionSpeed: 7.5,
      /** Speed multiplier for rotation interpolation */
      rotationSpeed: 5,
    },
  },

  placement: {
    /** Snapping to surfaces */
    snapping: {
      /** Distance threshold for snapping to planes (meters) */
      threshold: 0.1,
      enabled: true,
    },
    /** Initial placement */
    initial: {
      defaultPosition: [0, 0, -2.5] as [number, number, number],
      /** 5cm margin in front of panel */
      forwardMargin: 0.05,
    },
    /** Placement reticle */
    reticle: {
      minimumRadius: 0.4,
      maximumRadius: 1.5,
      fallbackRadius: 1,
      fadeDistance: 0.3,
      spacing: 0.125,
      dotRadius: 0.0175,
      surfaceOffset: 0.003,
      opacityTransitionSpeed: 5.0,
      renderOrder: RENDER_ORDER.placementReticle,
    },
    /** Room data polling before room capture (~2 s total) */
    roomDetection: {
      pollAttempts: 20,
      pollIntervalMs: 100,
    },
  },
} as const satisfies ViewerConfig;
