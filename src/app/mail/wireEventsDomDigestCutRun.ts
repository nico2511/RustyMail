import { handleDigestCutAction, handleDigestCutMailClick, importDigestCutEmlBase64 } from "./digestCutActions";
import { digestCut } from "./digestCutState";
import { render } from "../dispatch";
import { snapToCuttableBlock } from "./digestCutValidate";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("lecture .eml"));
    reader.readAsDataURL(file);
  });
}

export function wireEventsDomDigestCut(signal: AbortSignal): void {
  const query = document.querySelector<HTMLInputElement>("#digest-cut-query");
  query?.addEventListener(
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
      void fileToBase64(file)
        .then((b64) => importDigestCutEmlBase64(b64))
        .catch(() => {
          void importDigestCutEmlBase64("");
        });
    },
    { signal },
  );

  document.addEventListener(
    "keydown",
    (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !digestCut.zoneStudioOpen) return;
      digestCut.zoneStudioOpen = false;
      render();
    },
    { signal },
  );

  const mail = document.querySelector<HTMLElement>("[data-digest-cut-mail]");
  mail?.addEventListener(
    "click",
    (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      if (event.target.closest("a, button, input, textarea, label")) return;
      event.preventDefault();
      handleDigestCutMailClick(event.target);
    },
    { signal },
  );

  let hoverEl: Element | null = null;
  const clearHover = () => {
    hoverEl?.classList.remove("digest-cut__hover-cand");
    hoverEl = null;
  };
  mail?.addEventListener(
    "pointermove",
    (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !mail.contains(event.target)) return;
      if (event.target.closest("a, button, input, textarea, label")) {
        clearHover();
        return;
      }
      const next = snapToCuttableBlock(event.target, mail);
      if (
        !next ||
        next.classList.contains("digest-cut__zone-hl") ||
        next.classList.contains("digest-cut__paint-pick")
      ) {
        clearHover();
        return;
      }
      if (next === hoverEl) return;
      clearHover();
      next.classList.add("digest-cut__hover-cand");
      hoverEl = next;
    },
    { signal },
  );
  mail?.addEventListener("pointerleave", clearHover, { signal });
}
