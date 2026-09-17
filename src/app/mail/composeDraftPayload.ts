import type { Draft } from "../types";

/** Objet envoyé tel quel au backend Rust (évite champs omis / perdus après re-render avant `invoke`). */
export function draftPayloadForRust(d: Draft): Draft {
  const pathsRaw = Array.isArray(d.attachmentPaths) ? d.attachmentPaths : [];
  const attachmentPaths = Array.from(new Set(pathsRaw.map((p) => p.trim()).filter(Boolean)));
  return {
    id: d.id ?? "draft-local",
    kind: d.kind ?? "New",
    to: [...(d.to ?? [])],
    cc: [...(d.cc ?? [])],
    bcc: [...(d.bcc ?? [])],
    subject: d.subject ?? "",
    markdownBody: d.markdownBody ?? "",
    sendHtml: d.sendHtml !== false,
    inReplyTo: d.inReplyTo ?? null,
    references: [...(d.references ?? [])],
    attachmentPaths,
    threadId: d.threadId ?? null,
  };
}
