import { isTauriRuntime } from "../lib/tauriRuntime";
import { tauriErrorMessage } from "../lib/tauriCommand";
import { toast } from "../lib/toast";

export function decodeHtmlEntitiesLoose(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'");
}

export function normalizeMailHrefForOpen(href: string): string | null {
  const t = href.trim();
  if (!t || /^javascript:/i.test(t)) return null;
  if (t.startsWith("#")) return null;
  if (t.startsWith("cid:")) return null;
  if (/^https?:\/\//i.test(t)) return t;
  if (t.startsWith("//")) return `https:${t}`;
  if (/^mailto:/i.test(t) || /^tel:/i.test(t)) return t;
  return null;
}

export async function openExternalFromMailHref(href: string): Promise<void> {
  const raw = href.trim();
  if (!raw) return;
  try {
    if (isTauriRuntime()) {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(raw);
    } else {
      if (/^mailto:/i.test(raw)) {
        window.location.assign(raw);
        return;
      }
      window.open(raw, "_blank", "noopener,noreferrer");
    }
  } catch (e) {
    console.error("openExternalFromMailHref", e);
    toast(`Impossible d'ouvrir le lien : ${tauriErrorMessage(e)}`);
  }
}
