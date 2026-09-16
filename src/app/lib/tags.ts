import { escapeAttr, escapeHtml } from "../../ui/sanitize";
import type { Tag } from "../types";

export function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function formatTag(tag?: Tag) {
  if (!tag) return "untagged";
  return `${tag.family.toLowerCase()}:${tag.value}`;
}

export function isNoisyTag(tag?: Tag) {
  if (!tag) return false;
  if (tag.family === "Source" && tag.value.toLowerCase() === "imap") return true;
  // Entity tags are AI-derived. By default they should not drive the main UI.
  // Even when AI artifacts are shown, identifier:* is still noisy in practice.
  return tag.family === "Entity" && tag.value.startsWith("identifier:");
}
