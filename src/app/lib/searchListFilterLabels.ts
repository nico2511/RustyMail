import type { State } from "../types";

export const SEARCH_LIST_FILTER_LABELS: Record<Exclude<State["listFilter"], "all">, string> = {
  unread: "Non lus",
  starred: "Suivis",
  focused: "Priorité",
  auto: "Auto",
};
