const ATTACH_PATH_FIELD_SEP = "\u001f";

export function attachmentPathsJoinedForHiddenField(paths: string[]): string {
  return paths.join(ATTACH_PATH_FIELD_SEP);
}
