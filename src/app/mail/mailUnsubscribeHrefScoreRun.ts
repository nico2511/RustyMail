import { decodeHtmlEntitiesLoose } from "./mailLinkOpen";

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
