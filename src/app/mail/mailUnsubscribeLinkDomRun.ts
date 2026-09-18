import type { MailUnsubscribeLink } from "../types";
import { normalizeMailHrefForOpen } from "./mailLinkOpen";
import { linkLooksLikeUnsubscribe, unsubscribeLinkLabel } from "./mailUnsubscribeLinkDetectRun";

export function collectUnsubscribeLinksFromDoc(doc: Document): MailUnsubscribeLink[] {
  const seen = new Set<string>();
  const out: MailUnsubscribeLink[] = [];
  doc.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((a) => {
    if (!linkLooksLikeUnsubscribe(a)) return;
    const href = normalizeMailHrefForOpen(a.getAttribute("href") || "");
    if (!href || seen.has(href)) return;
    seen.add(href);
    out.push({ href, label: unsubscribeLinkLabel(a) });
  });
  return out;
}

function blockIsMostlyUnsubscribe(el: Element): boolean {
  const text = (el.textContent || "").replace(/\s+/g, " ").trim();
  if (!text) return true;
  const links = el.querySelectorAll<HTMLAnchorElement>("a.mail-unsubscribe-link");
  if (!links.length) return false;
  const linkText = [...links].map((a) => (a.textContent || "").trim()).join(" ");
  const rest = text.replace(linkText, "").replace(/\s+/g, " ").trim();
  return !rest || /^[|·•\-–—\s]+$/.test(rest);
}

export function hideRelocatedUnsubscribeInDoc(doc: Document): void {
  doc.querySelectorAll<HTMLAnchorElement>("a.mail-unsubscribe-link").forEach((a) => {
    a.classList.add("mail-unsubscribe-link--relocated");
    const p = a.closest("p");
    if (p && blockIsMostlyUnsubscribe(p)) {
      p.classList.add("mail-unsubscribe-section--relocated");
    }
    const row = a.closest("tr");
    if (row && blockIsMostlyUnsubscribe(row)) {
      row.classList.add("mail-unsubscribe-section--relocated");
    }
    const cell = a.closest("td, th");
    if (cell && blockIsMostlyUnsubscribe(cell)) {
      cell.classList.add("mail-unsubscribe-section--relocated");
    }
  });
  doc.querySelectorAll("article.rm-amazon-digest, article.rm-deblock-digest").forEach((article) => {
    const h3 = article.querySelector(":scope > h3");
    if (!h3 || !/désabon|unsub/i.test(h3.textContent || "")) return;
    h3.classList.add("mail-unsubscribe-section--relocated");
    let sib = h3.nextElementSibling;
    while (sib && (sib.tagName === "TABLE" || sib.tagName === "P")) {
      sib.classList.add("mail-unsubscribe-section--relocated");
      if (sib.tagName === "TABLE") break;
      sib = sib.nextElementSibling;
    }
  });
}
