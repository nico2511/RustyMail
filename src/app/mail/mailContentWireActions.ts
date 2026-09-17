import {
  hydrateEmailHtml as hydrateEmailHtmlImpl,
  pickImgSrcForLightbox as pickImgSrcForLightboxImpl,
  resolveSrcForMailImageLightbox as resolveSrcForMailImageLightboxImpl,
} from "./mailHtmlShadowHydrate";
import { onAttachmentAction as onAttachmentActionImpl } from "./mailAttachmentActions";

export function hydrateEmailHtml(): void {
  return hydrateEmailHtmlImpl();
}

export function onAttachmentAction(
  kind: "download" | "open",
  messageId: string,
  attachmentId: string,
  fileName?: string,
): void | Promise<void> {
  return onAttachmentActionImpl(kind, messageId, attachmentId, fileName);
}

export function pickImgSrcForLightbox(img: HTMLImageElement): string {
  return pickImgSrcForLightboxImpl(img);
}

export function resolveSrcForMailImageLightbox(
  rawSrc: string,
  messageId?: string | null,
): Promise<{ src: string; revokeObjectUrl?: string | null }> {
  return resolveSrcForMailImageLightboxImpl(rawSrc, messageId);
}
