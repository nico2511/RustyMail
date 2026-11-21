import type { FolderListCacheKey } from "./mailListFolderCache";

let pendingLoadKey: FolderListCacheKey | null = null;
let pendingHadCacheHit = false;

const capturesByLoadGen = new Map<
  number,
  { key: FolderListCacheKey; hadCacheHit: boolean }
>();

export function beginFolderListLoad(key: FolderListCacheKey | undefined, hadCacheHit: boolean): void {
  pendingLoadKey = key ?? null;
  pendingHadCacheHit = hadCacheHit;
}

export function bindFolderListCaptureForGen(
  loadGen: number,
  key: FolderListCacheKey | undefined,
  hadCacheHit: boolean,
): void {
  if (!key) return;
  capturesByLoadGen.set(loadGen, { key, hadCacheHit });
}

export function folderListCaptureForGen(loadGen: number): {
  key: FolderListCacheKey;
  hadCacheHit: boolean;
} | undefined {
  return capturesByLoadGen.get(loadGen);
}

export function releaseFolderListCaptureForGen(loadGen: number): void {
  capturesByLoadGen.delete(loadGen);
}

export function clearFolderListLoadContext(): void {
  pendingLoadKey = null;
  pendingHadCacheHit = false;
}

export function folderListLoadHadCacheHit(): boolean {
  return pendingHadCacheHit;
}

export function folderListLoadWriteKey(): FolderListCacheKey | null {
  return pendingLoadKey;
}