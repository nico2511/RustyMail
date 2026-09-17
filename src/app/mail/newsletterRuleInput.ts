export function extractAddrSpec(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  const lo = t.lastIndexOf("<");
  const gc = t.lastIndexOf(">");
  if (lo !== -1 && gc > lo) {
    let inner = t.slice(lo + 1, gc).trim().replace(/^mailto:/i, "");
    if (inner.includes("@")) return inner;
  }
  const loose = t.match(/[^\s<>,;]+@[^\s<>,;]+/);
  return loose?.[0]?.replace(/[>,;]+$/, "") ?? "";
}

export function readNlButtonRule(host: HTMLElement | undefined): string {
  if (!host) return "";
  const fromDs = typeof host.dataset?.rule === "string" ? host.dataset.rule.trim() : "";
  if (fromDs) return fromDs;
  const attr = host.getAttribute("data-rule");
  return typeof attr === "string" ? attr.trim() : "";
}

export function normalizeNlRuleInvokeInput(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (!t.includes("@")) return t.toLowerCase();
  const bare = extractAddrSpec(t) || t;
  return bare.trim().toLowerCase();
}
