export type MailContentWireActionsDeps = {
  hydrateEmailHtml: () => void;
  onAttachmentAction: (
    kind: "download" | "open",
    messageId: string,
    attachmentId: string,
    fileName?: string,
  ) => void | Promise<void>;
  pickImgSrcForLightbox: (img: HTMLImageElement) => string;
  resolveSrcForMailImageLightbox: (
    rawSrc: string,
    messageId?: string | null,
  ) => Promise<{ src: string; revokeObjectUrl?: string | null }>;
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
  mailContent().hydrateEmailHtml();
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
  return mailContent().pickImgSrcForLightbox(img);
}

export function resolveSrcForMailImageLightbox(
  rawSrc: string,
  messageId?: string | null,
): Promise<{ src: string; revokeObjectUrl?: string | null }> {
  return mailContent().resolveSrcForMailImageLightbox(rawSrc, messageId);
}
