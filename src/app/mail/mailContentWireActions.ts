import {
  hydrateEmailHtml as hydrateEmailHtmlImpl,
  pickImgSrcForLightbox as pickImgSrcForLightboxImpl,
  resolveSrcForMailImageLightbox as resolveSrcForMailImageLightboxImpl,
} from "./mailHtmlShadowHydrate";

export type MailContentWireActionsDeps = {
  onAttachmentAction: (
    kind: "download" | "open",
    messageId: string,
    attachmentId: string,
    fileName?: string,
  ) => void | Promise<void>;
};

let mailContentWireActionsDeps: MailContentWireActionsDeps | null = null;

export function registerMailContentWireActionsDeps(deps: MailContentWireActionsDeps): void {
  mailContentWireActionsDeps = deps;
}

function mailContent(): MailContentWireActionsDeps {
  if (!mailContentWireActionsDeps) throw new Error("registerMailContentWireActionsDeps not called");
  return mailContentWireActionsDeps;
}

export function hydrateEmailHtml(): void {
  return hydrateEmailHtmlImpl();
}

export function onAttachmentAction(
  kind: "download" | "open",
  messageId: string,
  attachmentId: string,
  fileName?: string,
): void | Promise<void> {
  return mailContent().onAttachmentAction(kind, messageId, attachmentId, fileName);
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
