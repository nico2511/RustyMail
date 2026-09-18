import { toast } from "../lib/toast";
import { downloadAllAttachmentsForMessage } from "./downloadAllAttachments";
import {
  decodeHtmlEntitiesLoose,
  normalizeMailHrefForOpen,
  openExternalFromMailHref,
} from "./mailLinkOpen";
import {
  prepareForward,
  prepareForwardToMessage,
  prepareReply,
  prepareReplyAll,
  prepareReplyToMessage,
} from "./composeThreadReply";

export async function tryHandleThreadReplyWire(action: string, element?: HTMLElement): Promise<boolean> {
  switch (action) {
    case "reply":
      await prepareReply();
      return true;
    case "reply-one":
      await prepareReplyToMessage(element?.dataset.msgId ?? "");
      return true;
    case "reply-all":
      await prepareReplyAll();
      return true;
    case "forward":
      await prepareForward();
      return true;
    case "forward-one":
      await prepareForwardToMessage(element?.dataset.msgId ?? "");
      return true;
    case "download-all-attachments": {
      const mid = element?.dataset.msgId?.trim();
      if (mid) void downloadAllAttachmentsForMessage(mid);
      return true;
    }
    case "contacts-entity-open": {
      const href = element?.dataset.href?.trim();
      if (href) void openExternalFromMailHref(href);
      return true;
    }
    case "contacts-entity-mailto": {
      const email = element?.dataset.email?.trim();
      if (email) void openExternalFromMailHref(`mailto:${email}`);
      return true;
    }
    case "mail-unsubscribe-open": {
      const href = decodeHtmlEntitiesLoose(element?.dataset.href?.trim() ?? "");
      const normalized = normalizeMailHrefForOpen(href);
      if (normalized) void openExternalFromMailHref(normalized);
      else toast("Lien de désabonnement invalide.");
      return true;
    }
    default:
      return false;
  }
}
