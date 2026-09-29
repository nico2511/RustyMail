/**
 * Corps du compositeur.
 *
 * Deux formats dans `draft.markdownBody` / `composeCanonicalBody` :
 * - Markdown historique (réponses, brouillons déjà enregistrés) : inchangé,
 *   aperçu et envoi passent par pulldown-cmark.
 * - HTML TipTap, dès que le message est édité dans l’éditeur :
 *   préfixe `<!--rustymail-html-->` puis un fragment HTML e-mail
 *   (`p`, `strong`, `em`, `u`, listes, titres, liens, images, tableaux).
 *   L’aperçu et l’envoi détectent le préfixe et utilisent ce fragment comme
 *   `text/html`, avec un texte brut dérivé (les images data deviennent `[image]`).
 */
import { marked } from "marked";

export const COMPOSE_HTML_MARK = "<!--rustymail-html-->";

marked.use({ gfm: true, breaks: true });

export function isComposeHtmlSource(source: string): boolean {
  return source.trimStart().startsWith(COMPOSE_HTML_MARK);
}

export function unwrapComposeHtml(source: string): string {
  const trimmed = source.trimStart();
  if (!trimmed.startsWith(COMPOSE_HTML_MARK)) return source;
  return trimmed.slice(COMPOSE_HTML_MARK.length).replace(/^\s+/, "");
}

export function markComposeHtml(html: string): string {
  return `${COMPOSE_HTML_MARK}${html}`;
}

export function markdownToEditorHtml(markdown: string): string {
  const src = markdown.replace(/\r\n/g, "\n");
  if (!src.trim()) return "<p></p>";
  const parsed = marked.parse(src, { async: false });
  return typeof parsed === "string" && parsed.trim() ? parsed : "<p></p>";
}

export function composeSourceToEditorHtml(source: string): string {
  if (!source.trim()) return "<p></p>";
  if (isComposeHtmlSource(source)) {
    const html = unwrapComposeHtml(source).trim();
    return html || "<p></p>";
  }
  return markdownToEditorHtml(source);
}

/** Texte visible pour l’IA quand l’éditeur n’est pas monté. */
export function composeSourcePlainText(source: string): string {
  if (!source.trim()) return "";
  if (!isComposeHtmlSource(source)) return source;
  return htmlFragmentPlainText(unwrapComposeHtml(source));
}

export function htmlFragmentPlainText(html: string): string {
  if (!html.trim()) return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script, style").forEach((node) => node.remove());
  doc.querySelectorAll("img").forEach((img) => {
    const alt = img.getAttribute("alt")?.trim() ?? "";
    const src = img.getAttribute("src") ?? "";
    const label = alt ? `[image: ${alt}]` : src.startsWith("data:image/") ? "[image]" : "";
    img.replaceWith(doc.createTextNode(label));
  });
  const text = doc.body?.textContent ?? "";
  return text.replace(/\u00a0/g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
