/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { ArrowMoverSystemFloor } from "../../features/ArrowMover/ArrowMoverSystemFloor.js";
import { ArrowMoverSystemWall } from "../../features/ArrowMover/ArrowMoverSystemWall.js";
import { CustomFollowerSystem } from "../../features/CustomFollower/CustomFollowerSystem.js";
import { CustomGrabSystem } from "../../features/CustomGrab/CustomGrabSystem.js";
import { DynamicScaleUISystem } from "../../features/DynamicScaleUI/DynamicScaleUISystem.js";
import { InterpolateSystem } from "../../features/Interpolate/InterpolateSystem.js";
import { PlaneProcessSystem } from "../../features/PlaneProcessSystem/PlaneProcessSystem.js";
import { PlacementReticleSystem } from "../../features/PlacementReticle/PlacementReticleSystem.js";
import { BottomControlPanelSystem } from "../../ui/BottomControlPanel/BottomControlPanelSystem.js";
import { ConfirmationPanelSystem } from "../../ui/ConfirmationPanel/ConfirmationPanelSystem.js";
import { NotifierPanelSystem } from "../../ui/NotifierPanel/NotifierPanelSystem.js";
import { CartDataSystem } from "../../ui/CartDataPanel/CartDataSystem.js";
import { SpatialPanelSystem } from "../../ui/ProductPanel/SpatialPanelSystem.js";
import { TooltipSystem } from "../../ui/Tooltip/TooltipSystem.js";
import { UIInteractionSystem } from "../../ui/UIInteraction/UIInteractionSystem.js";
import { UIRaycastBlockerSystem } from "../../ui/UIRaycastBlocker/UIRaycastBlockerSystem.js";
import { VariantSelectorSystem } from "../../ui/VariantSelector/VariantSelectorSystem.js";
import { World } from "@iwsdk/core";

/**
 * Holds references to all ECS systems after world initialization.
 */
export class SystemsHolder {
  public spatialPanelSystem!: SpatialPanelSystem | null;
  public arrowMoverSystemFloor!: ArrowMoverSystemFloor | null;
  public arrowMoverSystemWall!: ArrowMoverSystemWall | null;
  public customGrabSystem!: CustomGrabSystem | null;
  public planeProcessSystem!: PlaneProcessSystem | null;
  public placementReticleSystem!: PlacementReticleSystem | null;
  public customFollowerSystem!: CustomFollowerSystem | null;
  public tooltipSystem!: TooltipSystem | null;
  public confirmationPanelSystem!: ConfirmationPanelSystem | null;
  public bottomControlPanelSystem!: BottomControlPanelSystem | null;
  public variantSelectorSystem!: VariantSelectorSystem | null;
  public uiInteractionSystem!: UIInteractionSystem | null;
  public uiRaycastBlockerSystem!: UIRaycastBlockerSystem | null;
  public dynamicScaleUISystem!: DynamicScaleUISystem | null;
  public interpolateSystem!: InterpolateSystem | null;
  public notifierPanelSystem!: NotifierPanelSystem | null;
  public cartDataSystem!: CartDataSystem | null;

  /**
   * Resolves and assigns all system references from the world.
   * @param world - The ECS world instance.
   */
  public init(world: World): void {
    this.spatialPanelSystem = world.getSystem(
      SpatialPanelSystem,
    ) as SpatialPanelSystem;
    this.arrowMoverSystemFloor = world.getSystem(
      ArrowMoverSystemFloor,
    ) as ArrowMoverSystemFloor;
    this.arrowMoverSystemWall = world.getSystem(
      ArrowMoverSystemWall,
    ) as ArrowMoverSystemWall;
    this.customGrabSystem = world.getSystem(
      CustomGrabSystem,
    ) as CustomGrabSystem;
    this.planeProcessSystem = world.getSystem(
      PlaneProcessSystem,
    ) as PlaneProcessSystem;
    this.placementReticleSystem = world.getSystem(
      PlacementReticleSystem,
    ) as PlacementReticleSystem;
    this.customFollowerSystem = world.getSystem(
      CustomFollowerSystem,
    ) as CustomFollowerSystem;
    this.tooltipSystem = world.getSystem(TooltipSystem) as TooltipSystem;
    this.confirmationPanelSystem = world.getSystem(
      ConfirmationPanelSystem,
    ) as ConfirmationPanelSystem;
    this.bottomControlPanelSystem = world.getSystem(
      BottomControlPanelSystem,
    ) as BottomControlPanelSystem;
    this.variantSelectorSystem = world.getSystem(
      VariantSelectorSystem,
    ) as VariantSelectorSystem;
    this.uiInteractionSystem = world.getSystem(
      UIInteractionSystem,
    ) as UIInteractionSystem;
    this.uiRaycastBlockerSystem = world.getSystem(
      UIRaycastBlockerSystem,
    ) as UIRaycastBlockerSystem;
    this.dynamicScaleUISystem = world.getSystem(
      DynamicScaleUISystem,
    ) as DynamicScaleUISystem;
    this.interpolateSystem = world.getSystem(
      InterpolateSystem,
    ) as InterpolateSystem;
    this.notifierPanelSystem = world.getSystem(
      NotifierPanelSystem,
    ) as NotifierPanelSystem;
    this.cartDataSystem = world.getSystem(CartDataSystem) as CartDataSystem;
  }
}
