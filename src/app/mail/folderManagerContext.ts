export type FolderManagerRunDeps = {
  loadMailView: (append?: boolean) => Promise<void>;
};

let folderManagerRunDeps: FolderManagerRunDeps | null = null;

export function registerFolderManagerRunDeps(deps: FolderManagerRunDeps): void {
  folderManagerRunDeps = deps;
}

export function requireFolderManagerRunDeps(): FolderManagerRunDeps {
  if (!folderManagerRunDeps) throw new Error("registerFolderManagerRunDeps not called");
  return folderManagerRunDeps;
}
