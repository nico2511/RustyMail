/** Résout les `img[src^=cid:]` du shadow mail vers des object URLs (blobs SQLite). */

import { resolveSrcForMailImageLightbox } from "./mailHtmlImageLightboxRun";

type ShadowCidState = {
  __cidObjectUrls?: string[];
  __cidHydrateGen?: number;
};

function revokeCidObjectUrls(shadow: ShadowRoot): void {
  const st = shadow as unknown as ShadowCidState;
  for (const url of st.__cidObjectUrls ?? []) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
  }
  st.__cidObjectUrls = [];
}

/**
 * Après montage du HTML : remplace chaque `cid:…` par un blob local.
 * Sans ça, les photos intégrées (Envoyés / multipart related) restent invisibles.
 */
export function hydrateCidImagesInMailShadow(shadow: ShadowRoot, messageId: string): void {
  revokeCidObjectUrls(shadow);
  const mid = messageId.trim();
  if (!mid) return;

  const imgs = [...shadow.querySelectorAll<HTMLImageElement>("img[src^='cid:'], img[src^='CID:']")];
  if (!imgs.length) return;

  const st = shadow as unknown as ShadowCidState;
  const gen = (st.__cidHydrateGen ?? 0) + 1;
  st.__cidHydrateGen = gen;
  st.__cidObjectUrls = [];

  for (const img of imgs) {
    const raw = (img.getAttribute("src") || "").trim();
    if (!raw) continue;
    img.classList.add("mail-cid-pending");
    void resolveSrcForMailImageLightbox(raw, mid).then((resolved) => {
      if ((shadow as unknown as ShadowCidState).__cidHydrateGen !== gen) {
        if (resolved.revokeObjectUrl) {
          try {
            URL.revokeObjectURL(resolved.revokeObjectUrl);
          } catch {
            /* ignore */
          }
        }
        return;
      }
      if (resolved.revokeObjectUrl) {
        st.__cidObjectUrls = st.__cidObjectUrls ?? [];
        st.__cidObjectUrls.push(resolved.revokeObjectUrl);
      }
      if (resolved.src && resolved.src !== raw) {
        img.setAttribute("src", resolved.src);
        img.classList.remove("mail-cid-pending");
        img.classList.remove("mail-cid-missing");
      } else {
        img.classList.remove("mail-cid-pending");
        img.classList.add("mail-cid-missing");
        img.setAttribute("alt", img.getAttribute("alt")?.trim() || "Image intégrée indisponible");
        img.title = "Image intégrée introuvable dans la copie locale";
      }
    });
  }
}
