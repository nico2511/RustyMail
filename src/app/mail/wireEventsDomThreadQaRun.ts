// @ts-nocheck — DOM wiring; tighten types incrementally.
import { state } from "../state";

export function wireEventsDomThreadQaInput(signal: AbortSignal): void {
  document.querySelector<HTMLTextAreaElement>("#thread-qa-input")?.addEventListener(
    "input",
    (ev) => {
      state.threadQaDraft = (ev.currentTarget as HTMLTextAreaElement).value;
    },
    { signal }
  );
}
