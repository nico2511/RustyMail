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

  it("n’agrège pas Paramètres avec les écrans mail après un aller-retour", () => {
    navPushBackEntry(listSnap());
    navPushBackEntry({ view: "settings", backLabel: "Paramètres", breadcrumb: ["Paramètres"] });
    navPushBackEntry({
      view: "thread",
      backLabel: "Sujet du fil",
      breadcrumb: ["Boîte de réception", "Sujet du fil"],
      selectedThreadId: "t1",
    });
    const items = navBuildBreadcrumbItems("Paramètres");
    expect(items.map((i) => i.label)).toEqual(["Boîte de réception", "Paramètres"]);
  });

  it("n’affiche pas Réception en double quand Retour pointe déjà vers la boîte (fil → Paramètres)", () => {
    navPushBackEntry(listSnap("Réception"));
    navPushBackEntry({
      view: "thread",
      // Ancien bug : backLabel = boîte alors que le Retour mène au fil.
      backLabel: "Réception",
      breadcrumb: ["Réception", "Fil"],
      selectedThreadId: "t1",
    });
    expect(navBuildBreadcrumbItems("Paramètres").map((i) => i.label)).toEqual([
      "Fil",
      "Paramètres",
    ]);
  });

  it("omet le sujet du fil déjà porté par Retour (backLabel corrigé)", () => {
    navPushBackEntry(listSnap("Réception"));
    navPushBackEntry({
      view: "thread",
      backLabel: "Fil",
      breadcrumb: ["Réception", "Fil"],
      selectedThreadId: "t1",
    });
    expect(navBuildBreadcrumbItems("Paramètres").map((i) => i.label)).toEqual([
      "Réception",
      "Paramètres",
    ]);
  });
});
