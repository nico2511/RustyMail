/** Assembles `RenderDeps` for registerRenderDeps (split from appRenderRegistry). */
import type { RenderDeps } from "../ui/render/renderDeps";
import { buildShellRenderDepsFragment } from "./appRenderRegistryDepsShellRun";
import { buildThreadRenderDepsFragment } from "./appRenderRegistryDepsThreadRun";

export function buildAppRenderDeps(): RenderDeps {
  return {
    ...buildShellRenderDepsFragment(),
    ...buildThreadRenderDepsFragment(),
  };
}
