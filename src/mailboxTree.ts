/** Utilitaires arbre dossiers IMAP (partagés sidebar / vue Dossiers). */

export type MailboxTreeNode = {
  label: string;
  key: string;
  mailboxFull?: string;
  children: MailboxTreeNode[];
};

export function splitMailboxSegments(raw: string): string[] {
  return raw
    .split(/[/.]/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function commonPrefixSegments(personal: string[]): string[] {
  if (personal.length < 2) return [];
  const segs = personal.map((p) => splitMailboxSegments(p));
  const first = segs[0];
  const out: string[] = [];
  for (let i = 0; i < first.length; i++) {
    const cand = first[i]?.toLowerCase();
    if (!cand) break;
    if (segs.every((s) => (s[i] ?? "").toLowerCase() === cand)) out.push(first[i]!);
    else break;
  }
  const joined = out.join(" ").trim();
  if (joined.length < 6) return [];
  return out;
}

export function buildPersonalMailboxTree(personal: string[], dropPrefix: string[]): MailboxTreeNode[] {
  const root = new Map<string, { node: MailboxTreeNode; children: Map<string, unknown> }>();

  const getOrCreate = (map: Map<string, { node: MailboxTreeNode; children: Map<string, unknown> }>, label: string, key: string) => {
    const hit = map.get(key);
    if (hit) return hit;
    const created = {
      node: { label, key, children: [] as MailboxTreeNode[] } as MailboxTreeNode,
      children: new Map<string, unknown>(),
    };
    map.set(key, created);
    return created;
  };

  for (const mb of personal) {
    if (!String(mb ?? "").trim()) continue;
    const full = mb;
    let segs = splitMailboxSegments(full);
    if (dropPrefix.length && segs.length >= dropPrefix.length) {
      const matches = dropPrefix.every((s, i) => (segs[i] ?? "").toLowerCase() === s.toLowerCase());
      if (matches) segs = segs.slice(dropPrefix.length);
    }
    if (!segs.length) segs = [full];

    let cur = root;
    let keyPath = "";
    for (let i = 0; i < segs.length; i++) {
      const label = segs[i]!;
      keyPath = keyPath ? `${keyPath}/${label}` : label;
      const entry = getOrCreate(cur, label, keyPath);
      if (i === segs.length - 1) entry.node.mailboxFull = full;
      cur = entry.children as Map<string, { node: MailboxTreeNode; children: Map<string, unknown> }>;
    }
  }

  const materialize = (
    map: Map<string, { node: MailboxTreeNode; children: Map<string, unknown> }>,
  ): MailboxTreeNode[] => {
    const nodes = Array.from(map.values()).map((x) => {
      x.node.children = materialize(
        x.children as Map<string, { node: MailboxTreeNode; children: Map<string, unknown> }>,
      );
      return x.node;
    });
    nodes.sort((a, b) => a.label.localeCompare(b.label, "fr-FR", { sensitivity: "base" }));
    return nodes;
  };

  return materialize(root);
}

export function folderNodeOpenBySelection(selectedMailbox: string, nodeKey: string): boolean {
  const sel = String(selectedMailbox ?? "").trim();
  if (!sel || !nodeKey) return false;
  return splitMailboxSegments(sel).join("/").toLowerCase().includes(nodeKey.toLowerCase());
}

export function isDescendantMailboxPath(ancestor: string, candidate: string): boolean {
  const a = splitMailboxSegments(ancestor).join("/").toLowerCase();
  const c = splitMailboxSegments(candidate).join("/").toLowerCase();
  if (!a || !c || a === c) return false;
  return c.startsWith(`${a}/`);
}

const EXPANDED_LS_KEY = "rustymail.folderTree.expanded";

export function loadFolderTreeExpanded(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(EXPANDED_LS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, boolean>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveFolderTreeExpanded(map: Record<string, boolean>): void {
  try {
    localStorage.setItem(EXPANDED_LS_KEY, JSON.stringify(map));
  } catch {
    /* quota */
  }
}

export function entryMapByMailbox<T extends { mailbox: string }>(entries: T[]): Map<string, T> {
  const m = new Map<string, T>();
  for (const e of entries) {
    m.set(e.mailbox, e);
    m.set(e.mailbox.trim(), e);
  }
  return m;
}
