import {
  expandDigestCutPaintPick,
  handleDigestCutAction,
  handleDigestCutMailRange,
  importDigestCutEmlBase64,
  shiftDigestCutPaintSibling,
  shrinkDigestCutPaintPick,
} from "./digestCutActions";
import { digestCut } from "./digestCutState";
import { render } from "../dispatch";
import { cutRangeLabel, findElementForPick, snapDragRange } from "./digestCutPaint";

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
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
        if (event.key === "Escape" && digestCut.zoneStudioOpen) {
          digestCut.zoneStudioOpen = false;
          render();
        }
        return;
      }
      if (event.key === "Escape" && digestCut.zoneStudioOpen) {
        digestCut.zoneStudioOpen = false;
        render();
        return;
      }
      if (!event.altKey || !digestCut.paintPick) return;
      if (!document.querySelector("[data-digest-cut-mail]")) return;
      if (event.key === "ArrowUp") {
        event.preventDefault();
        expandDigestCutPaintPick();
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        shrinkDigestCutPaintPick();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        shiftDigestCutPaintSibling(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        shiftDigestCutPaintSibling(1);
      }
    },
    { signal },
  );

  const mail = document.querySelector<HTMLElement>("[data-digest-cut-mail]");
  const overlay = mail?.querySelector<HTMLElement>("[data-digest-cut-overlay]");

  const placeOverlay = (elements: Element[], label: string) => {
    if (!overlay || !mail || !elements.length) {
      if (overlay) overlay.hidden = true;
      return;
    }
    const host = mail.getBoundingClientRect();
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    for (const el of elements) {
      if (el === overlay) continue;
      const box = el.getBoundingClientRect();
      left = Math.min(left, box.left);
      top = Math.min(top, box.top);
      right = Math.max(right, box.right);
      bottom = Math.max(bottom, box.bottom);
    }
    if (!Number.isFinite(left) || !Number.isFinite(top)) {
      overlay.hidden = true;
      return;
    }
    overlay.hidden = false;
    overlay.style.left = `${left - host.left - mail.clientLeft + mail.scrollLeft}px`;
    overlay.style.top = `${top - host.top - mail.clientTop + mail.scrollTop}px`;
    overlay.style.width = `${Math.max(0, right - left)}px`;
    overlay.style.height = `${Math.max(0, bottom - top)}px`;
    overlay.textContent = label;
  };

  const restoreSelection = () => {
    if (!mail) return;
    const picks = digestCut.paintPicks.length ? digestCut.paintPicks : digestCut.paintPick ? [digestCut.paintPick] : [];
    const elements = picks
      .map((pick) => findElementForPick(mail, pick))
      .filter((el): el is Element => Boolean(el));
    placeOverlay(elements, cutRangeLabel(elements));
  };

  let dragStart: Element | null = null;

  mail?.addEventListener(
    "pointerdown",
    (event: PointerEvent) => {
      if (event.button !== 0 || !(event.target instanceof Element)) return;
      if (event.target.closest("a, button, input, textarea, label")) return;
      event.preventDefault();
      dragStart = event.target;
    },
    { signal },
  );

  const hitInMail = (event: PointerEvent): Element | null => {
    const hit = document.elementFromPoint(event.clientX, event.clientY);
    if (hit instanceof Element && mail?.contains(hit) && hit !== overlay) return hit;
    return dragStart;
  };

  document.addEventListener(
    "pointermove",
    (event: PointerEvent) => {
      if (!mail || !dragStart) return;
      const hit = hitInMail(event);
      if (!hit) return;
      const range = snapDragRange(mail, dragStart, hit);
      placeOverlay(range, cutRangeLabel(range));
    },
    { signal },
  );

  document.addEventListener(
    "pointerup",
    (event: PointerEvent) => {
      if (!mail || !dragStart) return;
      const start = dragStart;
      dragStart = null;
      const hit = hitInMail(event) ?? start;
      handleDigestCutMailRange(snapDragRange(mail, start, hit));
    },
    { signal },
  );

  mail?.addEventListener(
    "pointermove",
    (event: PointerEvent) => {
      if (dragStart || !(event.target instanceof Element) || !mail.contains(event.target)) return;
      if (event.target.closest("a, button, input, textarea, label, [data-digest-cut-overlay]")) {
        restoreSelection();
        return;
      }
      const range = snapDragRange(mail, event.target, event.target);
      placeOverlay(range, cutRangeLabel(range));
    },
    { signal },
  );
  mail?.addEventListener("pointerleave", () => {
    if (!dragStart) restoreSelection();
  }, { signal });
  const syncOverlay = () => {
    if (!dragStart) restoreSelection();
  };
  mail?.addEventListener("scroll", syncOverlay, { signal, passive: true });
  document.querySelector<HTMLElement>(".digest-bench__pane")?.addEventListener("scroll", syncOverlay, {
    signal,
    passive: true,
  });
  restoreSelection();
  window.requestAnimationFrame(syncOverlay);
}
