import { handleDigestBenchAction } from "./digestBenchActions";
import { handleDigestCutAction, importDigestCutEmlBase64 } from "./digestCutActions";

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

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
  const cutQuery = document.querySelector<HTMLInputElement>("#digest-cut-query");
  cutQuery?.addEventListener(
    "keydown",
    (event: KeyboardEvent) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      void handleDigestCutAction("digest-cut-search");
    },
    { signal },
  );
  const eml = document.querySelector<HTMLInputElement>("#digest-cut-eml");
  eml?.addEventListener(
    "change",
    () => {
      const file = eml.files?.[0];
      eml.value = "";
      if (!file) return;
      void file.arrayBuffer().then((buffer) => {
        void importDigestCutEmlBase64(bytesToBase64(new Uint8Array(buffer)));
      });
    },
    { signal },
  );
}
