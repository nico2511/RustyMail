function foldUnsubKey(raw: string): string {
  return raw
    .replace(/&eacute;/gi, "e")
    .replace(/&egrave;/gi, "e")
    .replace(/&agrave;/gi, "a")
    .replace(/&nbsp;|&#160;/gi, " ")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

function nearbyUnsubscribeContext(anchor: HTMLAnchorElement): string {
  const parts: string[] = [];
  const parent = anchor.parentElement;
  if (parent) parts.push(parent.textContent || "");
  const block = anchor.closest("p, td, th, li, div");
  if (block && block !== parent) parts.push(block.textContent || "");
  return foldUnsubKey(parts.join(" ").slice(0, 500));
}

export function linkLooksLikeUnsubscribe(anchor: HTMLAnchorElement): boolean {
  const href = (anchor.getAttribute("href") || "").trim();
  const hrefLc = foldUnsubKey(href);
  const text = foldUnsubKey((anchor.textContent || "").trim());
  const title = foldUnsubKey((anchor.getAttribute("title") || "").trim());
  const nearby = nearbyUnsubscribeContext(anchor);
  const blob = `${hrefLc} ${text} ${title} ${nearby}`;

  const weakLabel = /^(ici|here|cliquez ici|click here|cliquez|link)$/i.test(text);
  const unsubPhrase =
    /\bunsubscribe\b|opt\s*-?\s*out|optout|desinscri|desabon|desinscription|list-unsubscribe|list-manage|subscription\s*center|one\s*-?\s*click|email\s*preferences|communication\s*preferences|advertising\s*preferences|ne plus recevoir|stop receiv|remove me from|manage preferences/i.test(
      blob,
    );

  if (unsubPhrase) {
    if (weakLabel) {
      return /desinscri|desabon|unsubscribe|opt\s*-?\s*out|ne plus recevoir|stop receiv|list-manage|\/s\/uh\/|\/s\/u\/|\/un\//i.test(
        `${hrefLc} ${nearby}`,
      );
    }
    return true;
  }

  if (
    /unsubscribe|opt[-_]out|optout|preferences\/email|email-preference|list-manage|\/u\/\d+\/unsub|\/s\/uh\/|\/s\/u\/|unsubscribe\.iterable/i.test(
      hrefLc,
    )
  ) {
    return true;
  }

  if (/^mailto:/i.test(hrefLc) && /unsubscribe|desinscri|desabon|opt[-_]out|unsub@/i.test(blob)) {
    return true;
  }

  try {
    const base =
      typeof window !== "undefined" && window.location?.origin
        ? window.location.origin
        : "https://local.invalid";
    const u = new URL(href, base);
    const path = foldUnsubKey(`${u.pathname}${u.search}`);
    if (
      /unsubscribe|optout|opt_out|list-manage|email-preference|preferences\/email|advertising-preferences|manage-subscription|subscription-center/i.test(
        path,
      )
    ) {
      return true;
    }
    if (/\/un\/|\/unsub\b|\/opt-?out\b|\/manage-subscription|\/s\/uh\/|\/s\/u\//i.test(path)) {
      return true;
    }
  } catch {
    /* ignore */
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
