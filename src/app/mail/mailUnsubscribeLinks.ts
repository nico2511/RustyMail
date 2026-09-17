import type { MailUnsubscribeLink } from "../types";
import { decodeHtmlEntitiesLoose, normalizeMailHrefForOpen } from "./mailLinkOpen";

export function unsubscribeHrefScore(hrefRaw: string): number {
  const href = decodeHtmlEntitiesLoose(hrefRaw.trim());
  const low = href.toLowerCase();
  let score = 0;
  if (/^https?:\/\//i.test(href)) score += 30;
  if (/^mailto:/i.test(href)) score += 10;
  if (/unsubscribe|opt[-_]?out|optout|desinscri|desabonner/i.test(low)) score += 80;
  if (/\/un\/|\/unsub\b|\/opt-?out\b|\/manage-subscription/i.test(low)) score += 70;
  if (/list-unsubscribe|list-manage|subscription|preferences/i.test(href)) score += 25;
  if (/unsub\.aspx/i.test(href)) score += 35;
  if (/\/ats\/show\.aspx/i.test(low)) score -= 60;
  if (/(\/click|\/redirect|\/track|\/open)\b/i.test(low)) score -= 20;
  if (/utm_/i.test(low)) score -= 5;
  return score;
}

export function sortUnsubscribeLinks(links: string[]): string[] {
  return [...links].sort((a, b) => unsubscribeHrefScore(b) - unsubscribeHrefScore(a));
}

export function linkLooksLikeUnsubscribe(anchor: HTMLAnchorElement): boolean {
  const href = (anchor.getAttribute("href") || "").trim();
  const hrefLc = href.toLowerCase();
  const text = (anchor.textContent || "").trim().toLowerCase();
  const title = (anchor.getAttribute("title") || "").trim().toLowerCase();
  const blob = `${hrefLc} ${text} ${title}`;
  if (
    /\bunsubscribe\b|opt\s*-?\s*out|optout|d[ée]sinscri|d[ée]sabonner|d[ée]sinscription|list-unsubscribe|list-manage|subscription\s*center|one\s*-?\s*click|email\s*preferences|communication\s*preferences|advertising\s*preferences/i.test(
      blob,
    )
  ) {
    return true;
  }
  if (/unsubscribe|opt[-_]out|optout|subscription|preferences\/email|email-preference|list-manage|\/u\/\d+\/unsub/i.test(hrefLc)) {
    return true;
  }
  if (/^mailto:/i.test(hrefLc) && /unsubscribe|d[ée]sinscri|opt[-_]out/i.test(blob)) return true;
  try {
    const base =
      typeof window !== "undefined" && window.location?.origin ? window.location.origin : "https://local.invalid";
    const u = new URL(href, base);
    const path = `${u.pathname}${u.search}`.toLowerCase();
    if (/unsubscribe|optout|opt_out|subscription|preferences|list-manage/i.test(path)) return true;
    if (/\/un\/|\/unsub\b|\/opt-?out\b|\/manage-subscription/i.test(path)) return true;
  } catch {
    /* ignore */
  }
  if (
    /^(ici|here|cliquez ici|click here)$/i.test(text) &&
    /\bd[ée]s(inscri|abonner)|unsubscribe|opt\s*-?\s*out/i.test(blob)
  ) {
    return true;
  }
  return false;
}

function unsubscribeLinkLabel(anchor: HTMLAnchorElement): string {
  const text = (anchor.textContent || "").replace(/\s+/g, " ").trim();
  if (text.length >= 3 && text.length <= 80) return text;
  const title = (anchor.getAttribute("title") || "").replace(/\s+/g, " ").trim();
  if (title.length >= 3 && title.length <= 80) return title;
  const href = (anchor.getAttribute("href") || "").trim();
  if (/^mailto:/i.test(href)) return "Se désinscrire (courriel)";
  return "Se désinscrire";
}

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
