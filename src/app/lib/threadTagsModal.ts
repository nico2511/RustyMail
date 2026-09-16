import { isNoisyTag } from "./tags";
import type { Tag } from "../types";

export function threadTagsForModal(tags: Tag[]): Tag[] {
  const dedup = new Map<string, Tag>();
  for (const tag of tags) {
    if (!tag?.value) continue;
    if (isNoisyTag(tag)) continue;
    dedup.set(`${tag.family}:${tag.value}`, tag);
  }
  return [...dedup.values()].sort((a, b) => {
    const familyRank = (f: Tag["family"]) => {
      if (f === "Kind") return 0;
      if (f === "Source") return 1;
      if (f === "State") return 2;
      return 3;
    };
    const dr = familyRank(a.family) - familyRank(b.family);
    if (dr !== 0) return dr;
    return a.value.localeCompare(b.value, undefined, { sensitivity: "base" });
  });
}

export function threadTagFamilyLabel(family: Tag["family"]): string {
  if (family === "Kind") return "Type";
  if (family === "Source") return "Source";
  if (family === "State") return "État";
  return "Entité";
}

export function tagToSearchDraft(tag: Tag): string | null {
  const fam = String(tag.family).toLowerCase();
  const val = tag.value.trim();
  if (!val) return null;
  if (fam === "source" && val.toLowerCase() === "imap") return null;
  if (fam === "source" || fam === "kind" || fam === "state" || fam === "entity") {
    return `#${fam}:${val}`;
  }
  return null;
}
