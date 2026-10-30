/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Panel identifiers for single panel tooltips
 */
export enum TooltipPanel {
  GRAB_AND_PLACE = "grabAndPlace",
  TWIST_OBJECT = "twistObject",
  EXPLORE_VARIANTS = "exploreVariants",
}

/**
 * Tooltip panel display configuration.
 */
export interface PanelConfig {
  title?: string;
  description?: string;
  imageSrc?: string;
  showStepper: boolean;
  showCheckbox: boolean;
  showContinueButton: boolean;
}

/**
 * Core panel data - single source of truth for all panel content.
 */
export const PANEL_DATA = {
  GRAB_AND_PLACE: {
    title: "Grab and Place",
    description:
      "Pinch your fingers to grab the object. Move your hand, then release to place it.",
    imageSrc: "imgs/placement-tooltip-1.webm",
  },
  EXPLORE_VARIANTS: {
    title: "Explore Variants",
    description: "Hover your hand over the object to see different options.",
    imageSrc: "imgs/placement-tooltip-2.webp",
  },
  TWIST_OBJECT: {
    title: "Twist the object",
    description:
      "Pinch with both hands and twist to rotate. You can also use the Adjust Position button.",
    imageSrc: "imgs/placement-tooltip-3.webp",
  },
  TUTORIAL_COMPLETE: {
    title: "You're all set",
    description: "Everything's ready to go.",
    imageSrc: "imgs/placement-tooltip-4.webp",
  },
} as const;

/**
 * Pre-configured tutorial sequence with display settings
 */
export const TUTORIAL_SEQUENCE: PanelConfig[] = [
  {
    ...PANEL_DATA.GRAB_AND_PLACE,
    showStepper: true,
    showCheckbox: false,
    showContinueButton: true,
  },
  {
    ...PANEL_DATA.EXPLORE_VARIANTS,
    showStepper: true,
    showCheckbox: false,
    showContinueButton: true,
  },
  {
    ...PANEL_DATA.TWIST_OBJECT,
    showStepper: true,
    showCheckbox: false,
    showContinueButton: true,
  },
  {
    ...PANEL_DATA.TUTORIAL_COMPLETE,
    showStepper: true,
    showCheckbox: false,
    showContinueButton: true,
  },
];

/**
 * Pre-configured single panel configs with display settings
 */
export const SINGLE_PANEL_CONFIGS: Record<TooltipPanel, PanelConfig> = {
  [TooltipPanel.GRAB_AND_PLACE]: {
    ...PANEL_DATA.GRAB_AND_PLACE,
    showStepper: false,
    showCheckbox: true,
    showContinueButton: false,
  },
  [TooltipPanel.TWIST_OBJECT]: {
    ...PANEL_DATA.TWIST_OBJECT,
    showStepper: false,
    showCheckbox: true,
    showContinueButton: false,
  },
  [TooltipPanel.EXPLORE_VARIANTS]: {
    ...PANEL_DATA.EXPLORE_VARIANTS,
    showStepper: false,
    showCheckbox: true,
    showContinueButton: false,
  },
};
