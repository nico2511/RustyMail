import { describe, expect, it, beforeEach } from "vitest";
import {
  navBuildBreadcrumbItems,
  navPushBackEntry,
  navReset,
  type NavSnapshot,
} from "./navigation";

function listSnap(label = "Boîte de réception"): NavSnapshot {
  return {
    view: "list",
    backLabel: label,
    breadcrumb: [label],
    selectedMailbox: "INBOX",
  };
}

function contactsSnap(): NavSnapshot {
  return { view: "contacts", backLabel: "Carnet", breadcrumb: ["Carnet"] };
}

describe("navBuildBreadcrumbItems", () => {
  beforeEach(() => {
    navReset();
  });

  it("n’affiche pas de fil quand seul le parent est la boîte", () => {
    navPushBackEntry(listSnap());
    expect(navBuildBreadcrumbItems("Carnet")).toEqual([{ label: "Carnet", target: "current" }]);
  });

  it("affiche boîte › contact (sans répéter l’écran Retour)", () => {
    navPushBackEntry(listSnap());
    navPushBackEntry(contactsSnap());
    expect(navBuildBreadcrumbItems("Jean Dupont").map((i) => i.label)).toEqual([
      "Boîte de réception",
      "Jean Dupont",
    ]);
  });

  it("n’inclut pas Carnet dans le fil si Retour pointe déjà vers Carnet", () => {
    navPushBackEntry(listSnap());
    navPushBackEntry(contactsSnap());
    const items = navBuildBreadcrumbItems("Marie");
    expect(items.map((i) => i.label)).toEqual(["Boîte de réception", "Marie"]);
  });
});
