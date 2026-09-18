/** Mail security display helpers for thread `RenderDeps`. */
import type { RenderDeps } from "../ui/render/renderDeps";
import {
  mailSecurityFindingsForDisplay,
  mailSecurityTierClass,
  normalizedMailSecurity,
} from "./mailSecurityDisplay";

export function buildThreadMessageSecurityRenderDepsFragment(): Pick<
  RenderDeps,
  "normalizedMailSecurity" | "mailSecurityTierClass" | "mailSecurityFindingsForDisplay"
> {
  return {
    normalizedMailSecurity,
    mailSecurityTierClass,
    mailSecurityFindingsForDisplay,
  };
}
