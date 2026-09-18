import {
  prepareForward,
  prepareForwardToMessage,
  prepareReply,
  prepareReplyAll,
  prepareReplyToMessage,
} from "./composeThreadReply";

export async function tryHandleThreadReplyComposeWire(action: string, element?: HTMLElement): Promise<boolean> {
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
    default:
      return false;
  }
}
