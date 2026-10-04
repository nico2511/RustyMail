/** Limites des images intégrées (data URL) dans le corps du composeur. */

export const MAX_INLINE_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_EDGE_PX = 1600;
const JPEG_QUALITIES = [0.82, 0.72, 0.6, 0.48];

export function estimateDataUrlDecodedBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return dataUrl.length;
  const b64 = dataUrl.slice(comma + 1).replace(/\s+/g, "");
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((b64.length * 3) / 4) - padding);
}

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image illisible"));
    };
    img.src = url;
  });
}

function canvasToJpegDataUrl(canvas: HTMLCanvasElement, quality: number): string {
  return canvas.toDataURL("image/jpeg", quality);
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
    const img = await loadImageFromFile(file);
    const scale = Math.min(1, MAX_EDGE_PX / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
    const w = Math.max(1, Math.round((img.naturalWidth || 1) * scale));
    const h = Math.max(1, Math.round((img.naturalHeight || 1) * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { ok: false, error: "Compression d’image indisponible." };
    ctx.drawImage(img, 0, 0, w, h);

    // GIF / PNG avec transparence : tenter le data URL brut s’il est déjà sous plafond.
    if (file.type === "image/png" || file.type === "image/gif" || file.type === "image/webp") {
      const raw = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
        reader.onerror = () => reject(new Error("Lecture impossible"));
        reader.readAsDataURL(file);
      });
      if (raw.startsWith("data:image/") && estimateDataUrlDecodedBytes(raw) <= MAX_INLINE_IMAGE_BYTES) {
        return { ok: true, dataUrl: raw, alt: file.name || "image" };
      }
    }

    let best = "";
    for (const q of JPEG_QUALITIES) {
      const dataUrl = canvasToJpegDataUrl(canvas, q);
      best = dataUrl;
      if (estimateDataUrlDecodedBytes(dataUrl) <= MAX_INLINE_IMAGE_BYTES) {
        return { ok: true, dataUrl, alt: file.name || "image" };
      }
    }

    const bytes = estimateDataUrlDecodedBytes(best);
    return {
      ok: false,
      error: `Image intégrée trop volumineuse (max ${MAX_INLINE_IMAGE_BYTES} octets, obtenu ~${bytes}). Réduisez la résolution ou joignez-la en pièce jointe.`,
    };
  } catch {
    return { ok: false, error: "Impossible de préparer cette image." };
  }
}
