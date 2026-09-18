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

export function unsubscribeLinkLabel(anchor: HTMLAnchorElement): string {
  const text = (anchor.textContent || "").replace(/\s+/g, " ").trim();
  if (text.length >= 3 && text.length <= 80) return text;
  const title = (anchor.getAttribute("title") || "").replace(/\s+/g, " ").trim();
  if (title.length >= 3 && title.length <= 80) return title;
  const href = (anchor.getAttribute("href") || "").trim();
  if (/^mailto:/i.test(href)) return "Se désinscrire (courriel)";
  return "Se désinscrire";
}
