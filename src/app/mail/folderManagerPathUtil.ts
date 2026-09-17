export function mailboxPathDelimiter(mb: string): string {
  return mb.includes("/") ? "/" : ".";
}

export function mailboxLeafName(path: string): string {
  const i = Math.max(path.lastIndexOf("/"), path.lastIndexOf("."));
  return i >= 0 ? path.slice(i + 1) : path;
}

export function reparentMailboxPath(from: string, newParent: string): string {
  const leaf = mailboxLeafName(from);
  const parent = newParent.trim().replace(/[/.]$/, "");
  if (!parent) return leaf;
  const delim = mailboxPathDelimiter(parent);
  return `${parent}${delim}${leaf}`;
}
