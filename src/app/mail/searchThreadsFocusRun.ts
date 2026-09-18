import { state } from "../state";

let searchThreadsGeneration = 0;

export function getSearchThreadsGeneration(): number {
  return searchThreadsGeneration;
}

export function bumpSearchThreadsGeneration(): number {
  return ++searchThreadsGeneration;
}

export function restoreSearchInputSelection(selStart: number, selEnd: number, genAtCapture: number): void {
  const apply = () => {
    if (genAtCapture !== searchThreadsGeneration) return;
    const inp = document.querySelector<HTMLInputElement>("#search-input");
    if (!inp) return;
    inp.focus();
    const len = inp.value.length;
    try {
      inp.setSelectionRange(Math.min(selStart, len), Math.min(selEnd, len));
    } catch {
      /* type=search */
    }
  };
  requestAnimationFrame(() => requestAnimationFrame(apply));
}

export function captureSearchInputFocusState(): {
  searchHadFocus: boolean;
  selStart: number;
  selEnd: number;
} {
  const inputBefore = document.querySelector<HTMLInputElement>("#search-input");
  const searchHadFocus = document.activeElement === inputBefore;
  let selStart = state.searchDraft.length;
  let selEnd = selStart;
  if (searchHadFocus && inputBefore) {
    selStart = inputBefore.value.length;
    selEnd = selStart;
    try {
      const a = inputBefore.selectionStart;
      const b = inputBefore.selectionEnd;
      if (typeof a === "number" && a >= 0) selStart = a;
      if (typeof b === "number" && b >= 0) selEnd = b;
    } catch {
      /* Safari / certains navigateurs avec type=search */
    }
  }
  return { searchHadFocus, selStart, selEnd };
}
