import type { State } from "../types";

export const ENABLE_CLEAN_MESSAGE_VIEW = true;

export const DEFAULT_ACCOUNT_PROMPT_DISMISS_KEY = "rustymail.dismissDefaultAccountPrompt";

export const LIST_FILTER_VALUES: State["listFilter"][] = ["all", "unread", "starred", "focused", "auto"];

export function defaultListFilterFromRaw(raw: string | undefined): State["listFilter"] {
  return LIST_FILTER_VALUES.includes(raw as State["listFilter"]) ? (raw as State["listFilter"]) : "all";
}
