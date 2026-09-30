import type { Draft } from "../types";
import { composeSourcePlainText, isComposeHtmlSource, unwrapComposeHtml } from "./composeHtmlBody";

/**
 * Dernier snapshot réellement écrit pour la session, et édition utilisateur.
 * La navigation des versions (comparer, aperçu, liste) ne passe pas par
 * `markComposeDraftEdited` : elle ne rend pas le brouillon « sale ».
 */
let savedSessionId: string | null = null;
let savedKey: string | null = null;
let userEdited = false;

export function resetDraftContentMemory(): void {
  savedSessionId = null;
  savedKey = null;
  userEdited = false;
}

export function markComposeDraftEdited(): void {
  userEdited = true;
}

export function composeDraftUserHasEdited(): boolean {
  return userEdited;
}

/** Texte visible ou image. Les zones vides (`<p></p>`, `<br>`) ne comptent pas. */
export function draftBodyHasVisibleContent(body: string): boolean {
  if (composeSourcePlainText(body).replace(/\u00a0/g, " ").trim()) return true;
  const html = isComposeHtmlSource(body) ? unwrapComposeHtml(body) : body;
  return /<img\b/i.test(html);
}

export function draftHasMeaningfulContent(draft: Draft | null | undefined): boolean {
  if (!draft) return false;
  if ((draft.subject ?? "").trim()) return true;
  if (draftBodyHasVisibleContent(draft.markdownBody ?? "")) return true;
  if ((draft.to?.length ?? 0) > 0 || (draft.cc?.length ?? 0) > 0 || (draft.bcc?.length ?? 0) > 0) return true;
  if ((draft.attachmentPaths ?? []).some((p) => p.trim())) return true;
  return false;
}

/** Identité stable : ignore les coquilles HTML vides et le bruit de sérialisation TipTap. */
export function draftBodyIdentity(body: string): string {
  if (!draftBodyHasVisibleContent(body)) return "";
  const normalized = body.replace(/\u00a0/g, " ").replace(/\r\n/g, "\n").trim();
  if (!isComposeHtmlSource(normalized)) return normalized;
  return unwrapComposeHtml(normalized)
    .replace(/<br\b[^>]*ProseMirror-trailingBreak[^>]*\/?>/gi, "")
    .replace(/\sclass="[^"]*"/gi, "")
    .replace(/\sstyle="[^"]*"/gi, "")
    .replace(/>\s+</g, "><")
    .replace(/\s+/g, " ")
    .trim();
}

function recipientKey(list: Draft["to"] | undefined): string {
  return [...(list ?? [])]
    .map((r) => `${(r.email ?? "").trim().toLowerCase()}\t${(r.name ?? "").trim()}`)
    .sort()
    .join("\n");
}

export function recipientListsEqual(a: Draft["to"] | undefined, b: Draft["to"] | undefined): boolean {
  return recipientKey(a) === recipientKey(b);
}

export function draftRevisionContentKey(draft: Draft): string {
  const paths = [...(draft.attachmentPaths ?? [])].map((p) => p.trim()).filter(Boolean).sort();
  return [
    (draft.subject ?? "").trim(),
    draftBodyIdentity(draft.markdownBody ?? ""),
    draft.sendHtml ? "1" : "0",
    draft.kind ?? "",
    recipientKey(draft.to),
    recipientKey(draft.cc),
    recipientKey(draft.bcc),
    paths.join("\n"),
    (draft.inReplyTo ?? "").trim(),
    (draft.references ?? []).join("\n"),
    (draft.threadId ?? "").trim(),
  ].join("\u001e");
}

export function rememberDraftContentSaved(sessionId: string, draft: Draft): void {
  savedSessionId = sessionId.trim();
  savedKey = draftRevisionContentKey(draft);
  userEdited = false;
}

export function draftSavedContentMatches(sessionId: string, draft: Draft): boolean {
  const sid = sessionId.trim();
  if (!sid || savedSessionId !== sid || savedKey == null) return false;
  return savedKey === draftRevisionContentKey(draft);
}

/** Autosave : édition réelle, contenu non vide, différent du dernier snapshot. */
export function shouldAutosaveDraftRevision(draft: Draft, sessionId: string): boolean {
  if (!sessionId.trim() || !userEdited) return false;
  if (!draftHasMeaningfulContent(draft)) return false;
  if (draftSavedContentMatches(sessionId, draft)) return false;
  return true;
}

/**
 * Dialogue de fermeture seulement si l’utilisateur a modifié le brouillon
 * et que ce contenu n’est pas déjà le dernier état enregistré.
 * Parcourir les versions sans édition ne coche pas `userEdited`.
 */
export function draftCloseNeedsSavePrompt(draft: Draft, sessionId: string): boolean {
  if (!userEdited) return false;
  if (!draftHasMeaningfulContent(draft)) return false;
  if (draftSavedContentMatches(sessionId, draft)) return false;
  return true;
}
