import { handleDigestBenchAction } from "./digestBenchActions";

export function wireEventsDomDigestBench(signal: AbortSignal): void {
  const input = document.querySelector<HTMLInputElement>("#digest-bench-query");
  input?.addEventListener(
    "keydown",
    (event: KeyboardEvent) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      void handleDigestBenchAction("digest-bench-search");
    },
    { signal },
  );
}
