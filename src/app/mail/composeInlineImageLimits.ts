/** Limites des images intégrées (data URL) dans le corps du composeur. */

export const MAX_INLINE_IMAGE_BYTES = 8 * 1024 * 1024;
/** Au-delà : on recompresse (JPEG) même si encore sous le plafond IPC. */
export const TARGET_INLINE_IMAGE_BYTES = 1_500_000;
const EDGE_PX_STEPS = [1600, 1280, 1024, 800, 640];
const JPEG_QUALITIES = [0.82, 0.72, 0.6, 0.48, 0.36];

export function estimateDataUrlDecodedBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return dataUrl.length;
  const b64 = dataUrl.slice(comma + 1).replace(/\s+/g, "");
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((b64.length * 3) / 4) - padding);
}

/** Data URLs `data:image/…;base64,…` présents dans le corps (HTML ou markdown). */
export function listInlineDataImageUrls(body: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < body.length) {
    const idx = body.indexOf("data:image/", i);
    if (idx < 0) break;
    let end = idx;
    while (end < body.length) {
      const c = body[end]!;
      if (c === '"' || c === "'" || c === ")" || c === " " || c === "\n" || c === "\r" || c === "\t") {
        break;
      }
      end += 1;
    }
    const url = body.slice(idx, end);
    if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(url)) {
      out.push(url);
    }
    i = Math.max(end, idx + 1);
  }
  return out;
}

function loadImageFromObjectUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image illisible"));
    img.src = url;
  });
}

async function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    return await loadImageFromObjectUrl(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function loadImageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return loadImageFromObjectUrl(dataUrl);
}

function canvasToJpegDataUrl(canvas: HTMLCanvasElement, quality: number): string {
  return canvas.toDataURL("image/jpeg", quality);
}

function drawScaled(img: HTMLImageElement, edgePx: number): HTMLCanvasElement | null {
  const nw = img.naturalWidth || 1;
  const nh = img.naturalHeight || 1;
  const scale = Math.min(1, edgePx / Math.max(nw, nh));
  const w = Math.max(1, Math.round(nw * scale));
  const h = Math.max(1, Math.round(nh * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, w, h);
  return canvas;
}

async function compressImageElement(
  img: HTMLImageElement,
  alt: string,
): Promise<{ ok: true; dataUrl: string; alt: string } | { ok: false; error: string }> {
  let best = "";
  let bestBytes = Number.POSITIVE_INFINITY;
  for (const edge of EDGE_PX_STEPS) {
    const canvas = drawScaled(img, edge);
    if (!canvas) return { ok: false, error: "Compression d’image indisponible." };
    for (const q of JPEG_QUALITIES) {
      const dataUrl = canvasToJpegDataUrl(canvas, q);
      const bytes = estimateDataUrlDecodedBytes(dataUrl);
      if (bytes < bestBytes) {
        best = dataUrl;
        bestBytes = bytes;
      }
      if (bytes <= TARGET_INLINE_IMAGE_BYTES) {
        return { ok: true, dataUrl, alt };
      }
    }
  }
  if (best && bestBytes <= MAX_INLINE_IMAGE_BYTES) {
    return { ok: true, dataUrl: best, alt };
  }
  return {
    ok: false,
    error: `Image intégrée trop volumineuse (max ${MAX_INLINE_IMAGE_BYTES} octets, obtenu ~${Number.isFinite(bestBytes) ? bestBytes : "?"}). Réduisez la résolution ou joignez-la en pièce jointe.`,
  };
}

async function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("Lecture impossible"));
    reader.readAsDataURL(file);
  });
}

/**
 * Redimensionne / compresse une image fichier pour l’inline compose.
 * Refuse si, après compression, la charge utile dépasse `MAX_INLINE_IMAGE_BYTES`.
 */
export async function prepareInlineImageFromFile(
  file: File,
): Promise<{ ok: true; dataUrl: string; alt: string } | { ok: false; error: string }> {
  if (!file.type.startsWith("image/")) {
    return { ok: false, error: "Ce fichier n’est pas une image." };
  }
  try {
    const alt = file.name || "image";
    // Petites images déjà sous la cible : garder le format d’origine (transparence PNG/GIF).
    if (file.type === "image/png" || file.type === "image/gif" || file.type === "image/webp") {
      const raw = await readFileAsDataUrl(file);
      if (raw.startsWith("data:image/") && estimateDataUrlDecodedBytes(raw) <= TARGET_INLINE_IMAGE_BYTES) {
        return { ok: true, dataUrl: raw, alt };
      }
    } else if (file.type === "image/jpeg" || file.type === "image/jpg") {
      const raw = await readFileAsDataUrl(file);
      if (raw.startsWith("data:image/") && estimateDataUrlDecodedBytes(raw) <= TARGET_INLINE_IMAGE_BYTES) {
        return { ok: true, dataUrl: raw, alt };
      }
    }
    const img = await loadImageFromFile(file);
    return compressImageElement(img, alt);
  } catch {
    return { ok: false, error: "Impossible de préparer cette image." };
  }
}

/** Compresse un data URL déjà présent dans le brouillon (collage HTML, ancien brouillon…). */
export async function prepareInlineImageFromDataUrl(
  dataUrl: string,
  alt = "image",
): Promise<{ ok: true; dataUrl: string; alt: string } | { ok: false; error: string }> {
  if (!/^data:image\/(?:png|jpe?g|gif|webp|bmp);base64,/i.test(dataUrl.trim())) {
    return { ok: false, error: "Image intégrée illisible." };
  }
  const bytes = estimateDataUrlDecodedBytes(dataUrl);
  if (bytes <= TARGET_INLINE_IMAGE_BYTES) {
    return { ok: true, dataUrl, alt };
  }
  try {
    const img = await loadImageFromDataUrl(dataUrl);
    return compressImageElement(img, alt);
  } catch {
    return { ok: false, error: "Impossible de compresser cette image intégrée." };
  }
}

/**
 * Avant envoi / sauvegarde IPC : recompresse chaque data URL trop lourde.
 * Met à jour le corps si au moins une image a été réduite.
 */
export async function ensureInlineImagesWithinLimit(
  body: string,
): Promise<{ ok: true; body: string; compressed: number } | { ok: false; error: string }> {
  const urls = listInlineDataImageUrls(body);
  if (urls.length === 0) return { ok: true, body, compressed: 0 };

  let next = body;
  let compressed = 0;
  // Dédupliquer : même data URL réutilisée plusieurs fois.
  const unique = [...new Set(urls)];
  for (const url of unique) {
    const bytes = estimateDataUrlDecodedBytes(url);
    if (bytes <= TARGET_INLINE_IMAGE_BYTES) continue;
    const prepared = await prepareInlineImageFromDataUrl(url);
    if (!prepared.ok) {
      if (bytes > MAX_INLINE_IMAGE_BYTES) {
        return { ok: false, error: prepared.error };
      }
      // Sous le plafond dur mais compression impossible : laisser passer.
      continue;
    }
    if (prepared.dataUrl !== url) {
      next = next.split(url).join(prepared.dataUrl);
      compressed += 1;
    }
    if (estimateDataUrlDecodedBytes(prepared.dataUrl) > MAX_INLINE_IMAGE_BYTES) {
      return {
        ok: false,
        error: `Image intégrée trop volumineuse (max ${MAX_INLINE_IMAGE_BYTES} octets). Joignez-la en pièce jointe.`,
      };
    }
  }

  for (const url of listInlineDataImageUrls(next)) {
    if (estimateDataUrlDecodedBytes(url) > MAX_INLINE_IMAGE_BYTES) {
      return {
        ok: false,
        error: `Image intégrée trop volumineuse (max ${MAX_INLINE_IMAGE_BYTES} octets). Joignez-la en pièce jointe.`,
      };
    }
  }
  return { ok: true, body: next, compressed };
}
