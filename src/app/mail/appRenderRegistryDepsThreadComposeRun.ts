/** Compose + mic labels for thread render deps. */
import type { RenderDeps } from "../ui/render/renderDeps";
import { renderComposer } from "../ui/render/composerRender";
import { attachmentPathsJoinedForHiddenField } from "./composeAttachmentPaths";
import { composeKindTitle, formatDraftRevisionStamp } from "./composeFormLabels";
import {
  composeMicButtonTitle,
  micAriaLabel,
  threadQaMicButtonTitle,
} from "./composeMicUiHints";
import { draftHasRecipientsExtra } from "./composeDraftRecipients";
import { sanitizeEmailHtml } from "./mailEmailHtmlSanitize";

export function buildThreadComposeRenderDepsFragment(): Pick<
  RenderDeps,
  | "renderComposer"
  | "draftHasRecipientsExtra"
  | "attachmentPathsJoinedForHiddenField"
  | "composeKindTitle"
  | "composeMicButtonTitle"
  | "micAriaLabel"
  | "formatDraftRevisionStamp"
  | "sanitizeEmailHtml"
  | "threadQaMicButtonTitle"
> {
  return {
    renderComposer,
    draftHasRecipientsExtra,
    attachmentPathsJoinedForHiddenField,
    composeKindTitle,
    composeMicButtonTitle,
    micAriaLabel,
    formatDraftRevisionStamp,
    sanitizeEmailHtml,
    threadQaMicButtonTitle,
  };
}
