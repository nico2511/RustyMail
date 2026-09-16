import type { Tag } from "../types";

export function tagFamilyForInvoke(family: string): Tag["family"] {
  const f = family.trim().toLowerCase();
  if (f === "source") return "Source";
  if (f === "kind") return "Kind";
  if (f === "state") return "State";
  return "Entity";
}
