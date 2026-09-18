/** registerRenderDeps wiring — extracted from appModuleRegistry.ts */
import { registerRenderDeps } from "../ui/render/renderDeps";
import { buildAppRenderDeps } from "./appRenderRegistryDepsRun";

export function registerAppRenderDeps(): void {
  registerRenderDeps(buildAppRenderDeps());
}
