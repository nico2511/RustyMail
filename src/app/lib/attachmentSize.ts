export function formatAttachmentSizeKb(sizeBytes: number): string {
  const kb = Math.max(0, Math.round(sizeBytes / 1024));
  return kb >= 1024 ? `${(sizeBytes / (1024 * 1024)).toFixed(1)} Mo` : `${kb} Ko`;
}
