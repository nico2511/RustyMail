import { state } from "../state";
import { toast } from "../lib/toast";

export async function tryHandleListThreadQuickWire(action: string, element?: HTMLElement): Promise<boolean> {
  if (action !== "quick-reply-copy") return false;
  const idx = Number(element?.dataset.qrIndex ?? "");
  const s = state.quickReplySuggestions[idx];
  const t = s?.text?.trim();
  if (!t) return true;
  void navigator.clipboard.writeText(t).then(
    () => toast("Copié dans le presse-papiers."),
    () => toast("Copie impossible (permission navigateur).")
  );
  return true;
}
