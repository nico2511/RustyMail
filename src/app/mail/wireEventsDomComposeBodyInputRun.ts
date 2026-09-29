import { destroyComposeBodyEditor, mountComposeBodyEditor } from "./composeBodyEditor";

export function wireEventsDomComposeBodyInput(signal: AbortSignal): void {
  const host = document.querySelector<HTMLElement>("#compose-body");
  if (!host) {
    destroyComposeBodyEditor();
    return;
  }
  mountComposeBodyEditor(host);
  signal.addEventListener("abort", () => {
    destroyComposeBodyEditor();
  });
}
