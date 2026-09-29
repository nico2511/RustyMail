/** @vitest-environment happy-dom */

import { afterEach, describe, expect, it, vi } from "vitest";
import { inferToastKind, toast } from "./toast";

function clearToasts() {
  document.getElementById("toast-box")?.remove();
}

afterEach(() => {
  vi.useRealTimers();
  clearToasts();
});

describe("inferToastKind", () => {
  it("distingue échec, confirmation, précondition et statut", () => {
    expect(inferToastKind("Impossible d’ouvrir le fil.")).toBe("error");
    expect(inferToastKind("Enregistré dans « Sauvés ».")).toBe("success");
    expect(inferToastKind("Configurez d’abord un compte IMAP.")).toBe("warning");
    expect(inferToastKind("Recherche appliquée.")).toBe("info");
    expect(inferToastKind("Synchronisation partielle — voir la ligne d’état.")).toBe("warning");
    expect(inferToastKind("Sync… tous les dossiers · a@b.c")).toBe("info");
    expect(inferToastKind("Filtre #security:50 ajouté — lancez la recherche.")).toBe("success");
    expect(inferToastKind("Index sémantique : 4 ligne(s), 0 erreur(s).")).toBe("info");
    expect(inferToastKind("Index sémantique : 4 ligne(s), 2 erreur(s).")).toBe("error");
    expect(inferToastKind("Repli cloud activé : enregistrez une clé API.")).toBe("warning");
  });
});

describe("toast", () => {
  it("affiche un message texte, une icône et un bouton fermer", () => {
    toast.success("Compte enregistré.");
    const el = document.querySelector<HTMLElement>(".toast");
    expect(el?.dataset.toastKind).toBe("success");
    expect(el?.getAttribute("role")).toBe("status");
    expect(el?.querySelector(".toast__text")?.textContent).toBe("Compte enregistré.");
    expect(el?.querySelector(".toast__icon svg")).toBeTruthy();
    expect(el?.querySelector(".toast__close")?.getAttribute("aria-label")).toBe("Fermer");
    expect(el?.querySelector("b")).toBeNull();
  });

  it("n’interprète pas le HTML du message", () => {
    toast.error("<b>boom</b>");
    expect(document.querySelector(".toast b")).toBeNull();
    expect(document.querySelector(".toast__text")?.textContent).toBe("<b>boom</b>");
    expect(document.querySelector(".toast")?.getAttribute("role")).toBe("alert");
  });

  it("ferme au clic sur le toast et sur la croix", () => {
    vi.useFakeTimers();
    toast.info("Portée : tout le compte");
    const el = document.querySelector<HTMLElement>(".toast")!;
    el.click();
    expect(el.classList.contains("toast--out")).toBe(true);
    vi.advanceTimersByTime(250);
    expect(document.querySelector(".toast")).toBeNull();

    toast.warning("Compte requis.");
    const close = document.querySelector<HTMLButtonElement>(".toast__close")!;
    close.click();
    expect(document.querySelector(".toast")?.classList.contains("toast--out")).toBe(true);
  });

  it("laisse l’erreur jusqu’au dismiss et raccourcit le succès", () => {
    vi.useFakeTimers();
    toast.error("Échec enregistrement.");
    vi.advanceTimersByTime(20_000);
    expect(document.querySelector(".toast--error")).toBeTruthy();
    expect(document.querySelector(".toast--out")).toBeNull();

    toast.success("Vue supprimée.", 1000);
    vi.advanceTimersByTime(999);
    const success = document.querySelector<HTMLElement>(".toast--success")!;
    expect(success.classList.contains("toast--out")).toBe(false);
    vi.advanceTimersByTime(1);
    expect(success.classList.contains("toast--out")).toBe(true);
  });

  it("met en pause le délai au survol", () => {
    vi.useFakeTimers();
    toast.success("Copié dans le presse-papiers.");
    const el = document.querySelector<HTMLElement>(".toast")!;
    el.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    vi.advanceTimersByTime(20_000);
    expect(el.classList.contains("toast--out")).toBe(false);
    el.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
    vi.advanceTimersByTime(3400);
    expect(el.classList.contains("toast--out")).toBe(true);
  });

  it("retire les plus anciens au-delà de 6", () => {
    for (let i = 0; i < 8; i += 1) toast.info(`note ${i}`);
    const texts = [...document.querySelectorAll(".toast__text")].map((node) => node.textContent);
    expect(texts).toEqual(["note 2", "note 3", "note 4", "note 5", "note 6", "note 7"]);
  });

  it("exécute l’action sans fermer via le clic du toast parent", () => {
    const onClick = vi.fn();
    toast.info("Mise à jour disponible.", { action: { label: "Ouvrir", onClick } });
    const action = document.querySelector<HTMLButtonElement>(".toast__action")!;
    expect(action.textContent).toBe("Ouvrir");
    action.click();
    expect(onClick).toHaveBeenCalledOnce();
    expect(document.querySelector(".toast")?.classList.contains("toast--out")).toBe(true);
  });

  it("infère le type quand on appelle toast(message)", () => {
    toast("Préférences enregistrées.");
    expect(document.querySelector(".toast")?.classList.contains("toast--success")).toBe(true);
  });
});
