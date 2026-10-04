const ATTACH_PATH_FIELD_SEP = "\u001f";

/** Aligné sur `MAX_DRAFT_ATTACHMENTS` (ipc_guard.rs). */
export const MAX_COMPOSE_ATTACHMENTS = 50;

export function attachmentPathsJoinedForHiddenField(paths: string[]): string {
  return paths.join(ATTACH_PATH_FIELD_SEP);
}

export function attachmentPathsFromHiddenField(value: string | null | undefined): string[] {
  const raw = String(value ?? "");
  if (!raw.trim()) return [];
  return Array.from(
    new Set(
      raw
        .split(ATTACH_PATH_FIELD_SEP)
        .map((p) => p.trim())
        .filter(Boolean),
    ),
  );
}

/** Met à jour le champ caché lu par `persistDraft` (évite de perdre les PJ au send). */
export function syncComposeAttachmentsHiddenField(paths: string[]): void {
  const attachmentsField = document.querySelector<HTMLInputElement>("#compose-attachments");
  if (attachmentsField) {
    attachmentsField.value = attachmentPathsJoinedForHiddenField(paths);
  }
}
