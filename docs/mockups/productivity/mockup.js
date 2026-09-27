/* Navigation et bascules des maquettes. Pas de logique mail. */
(function () {
  const page = document.body.dataset.page;
  const app = document.querySelector(".app");

  document.querySelectorAll("[data-nav]").forEach((link) => {
    if (link.dataset.nav === page) link.setAttribute("aria-current", "page");
  });

  function syncRail(collapsed) {
    if (!app) return;
    app.classList.toggle("is-rail-collapsed", collapsed);
    const btn = document.getElementById("rail-toggle");
    if (!btn) return;
    btn.setAttribute("aria-expanded", String(!collapsed));
    const label = collapsed ? "Afficher les dossiers" : "Masquer les dossiers";
    btn.setAttribute("aria-label", label);
    btn.title = label + " ([)";
    const text = btn.querySelector(".label");
    if (text) text.textContent = collapsed ? "Dossiers" : "Réduire";
  }

  if (app?.classList.contains("is-rail-collapsed")) syncRail(true);

  document.getElementById("rail-toggle")?.addEventListener("click", () => {
    syncRail(!app.classList.contains("is-rail-collapsed"));
  });

  function setPanel(open) {
    const panel = document.querySelector(".panel");
    if (!panel || !app) return;
    panel.hidden = !open;
    app.classList.toggle("is-panel-open", open);
    document.querySelectorAll("[data-panel-toggle]").forEach((btn) => {
      btn.setAttribute("aria-expanded", String(open));
    });
  }

  document.querySelectorAll("[data-panel-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const panel = document.getElementById(btn.getAttribute("aria-controls"));
      if (!panel) return;
      setPanel(panel.hidden);
    });
  });

  function setDialog(id, open) {
    const dialog = document.getElementById(id);
    if (!dialog) return;
    dialog.hidden = !open;
    document.querySelectorAll(`[aria-controls="${id}"]`).forEach((btn) => {
      btn.setAttribute("aria-expanded", String(open));
    });
  }

  document.querySelectorAll("[data-open-profile]").forEach((btn) => {
    btn.addEventListener("click", () => setDialog("profile", true));
  });
  document.querySelectorAll("[data-open-props]").forEach((btn) => {
    btn.addEventListener("click", () => setDialog("props", true));
  });
  const contacts = {
    camille: {
      name: "Camille Moreau",
      mark: "C",
      addrs: ["camille@menuiserie-moreau.fr"],
      note: "Menuiserie Moreau · cliente, lot chêne.",
      inBook: true,
    },
    elbaz: {
      name: "Maître Julien Elbaz",
      mark: "J",
      addrs: ["elbaz@etude-elbaz.fr"],
      note: "Notaire · copie du contrat d’atelier.",
      inBook: true,
    },
    sillon: { name: "Transport Sillon", mark: "T", addrs: ["avis@transport-sillon.fr"], note: "", inBook: false },
    rhone: { name: "Banque Rhône", mark: "B", addrs: ["releves@banque-rhone.fr"], note: "", inBook: false },
    hugo: { name: "Hugo Martin", mark: "H", addrs: ["hugo.martin@exemple.fr"], note: "", inBook: false },
    revue: { name: "La Revue du bois", mark: "R", addrs: ["redaction@revue-du-bois.fr"], note: "", inBook: false },
    ines: { name: "Inès Navarro", mark: "I", addrs: ["ines.navarro@exemple.fr"], note: "", inBook: false },
    lea: { name: "Léa Charpentier", mark: "L", addrs: ["lea.charpentier@exemple.fr"], note: "", inBook: false },
    seve: { name: "Imprimerie Sève", mark: "S", addrs: ["bat@imprimerie-seve.fr"], note: "", inBook: false },
    paul: { name: "Paul Hedin", mark: "P", addrs: ["paul.hedin@exemple.fr"], note: "", inBook: false },
    bellevue: { name: "SCI Bellevue", mark: "B", addrs: ["charges@sci-bellevue.fr"], note: "", inBook: false },
    marie: { name: "Marie Duval", mark: "M", addrs: ["marie.duval@exemple.fr"], note: "", inBook: false },
  };

  let contactId = "camille";

  function paintContact(id) {
    const person = contacts[id];
    if (!person) return;
    contactId = id;
    const name = document.getElementById("contact-name");
    const mail = document.getElementById("contact-mail");
    const mark = document.getElementById("contact-mark");
    const list = document.getElementById("contact-addrs");
    const note = document.getElementById("contact-note");
    const noteLabel = document.getElementById("contact-note-label");
    const book = document.getElementById("contact-book");
    if (name) name.textContent = person.name;
    if (mail) mail.textContent = person.addrs[0] || "";
    if (mark) mark.textContent = person.mark;
    if (list) {
      list.replaceChildren();
      person.addrs.forEach((addr) => {
        const li = document.createElement("li");
        li.textContent = addr;
        list.append(li);
      });
    }
    const hasNote = Boolean(person.note);
    if (note) {
      note.hidden = !hasNote;
      note.textContent = person.note;
    }
    if (noteLabel) noteLabel.hidden = !hasNote;
    if (book) book.textContent = person.inBook ? "Voir dans le carnet" : "Ajouter au carnet";
  }

  function openContact(id) {
    if (!document.getElementById("contact")) return;
    paintContact(id || "camille");
    setDialog("contact", true);
  }

  document.querySelectorAll("[data-open-contact]").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openContact(btn.dataset.who || "camille");
    });
  });

  document.querySelectorAll(".from[data-who]").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openContact(btn.dataset.who);
    });
  });

  document.querySelectorAll(".row a").forEach((link) => {
    link.addEventListener("click", (event) => {
      if (event.target.closest("[data-who]")) event.preventDefault();
    });
  });

  document.getElementById("contact-book")?.addEventListener("click", () => {
    const person = contacts[contactId];
    if (!person) return;
    person.inBook = true;
    const book = document.getElementById("contact-book");
    if (book) book.textContent = "Voir dans le carnet";
  });
  document.querySelectorAll("[data-close-modal]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const dialog = btn.closest(".modal");
      if (dialog) dialog.hidden = true;
    });
  });

  document.querySelectorAll("#account-menu [data-compte]").forEach((option) => {
    option.addEventListener("click", () => {
      if (page === "inbox") setCompte(option.dataset.compte);
      else {
        option.parentElement?.querySelectorAll("[data-compte]").forEach((other) => {
          other.setAttribute("aria-selected", String(other === option));
        });
      }
    });
  });

  document.getElementById("add-account")?.addEventListener("click", () => {
    const note = document.getElementById("add-account-note");
    if (note) note.hidden = false;
  });

  document.getElementById("logout")?.addEventListener("click", (event) => {
    event.currentTarget.textContent = "Déconnecté";
    event.currentTarget.disabled = true;
  });

  const accounts = {
    tous: { title: "Tous les comptes", mail: "Perso, Atelier, Facturation", boxes: "Boîtes", sync: "3 comptes · synchronisés" },
    perso: { title: "Perso", mail: "nicolas@exemple.fr", boxes: "Boîtes · Perso", sync: "Perso · synchronisé il y a 2 min" },
    atelier: { title: "Atelier", mail: "atelier@exemple.fr", boxes: "Boîtes · Atelier", sync: "Atelier · synchronisé il y a 4 min" },
    facturation: { title: "Facturation", mail: "facturation@exemple.fr", boxes: "Boîtes · Facturation", sync: "Facturation · synchronisé il y a 6 min" },
  };

  let currentCompte = "tous";
  let currentFilter = "all";

  function unreadIn(id) {
    return [...document.querySelectorAll(".row.is-unread")].filter((row) => id === "tous" || row.dataset.compte === id).length;
  }

  function rowVisible(row) {
    const accountOk = currentCompte === "tous" || row.dataset.compte === currentCompte;
    const unread = row.classList.contains("is-unread");
    const follow = row.classList.contains("is-follow");
    const filterOk = currentFilter === "all" || (currentFilter === "unread" && unread) || (currentFilter === "follow" && follow);
    return accountOk && filterOk;
  }

  function applyRows() {
    let shown = 0;
    document.querySelectorAll(".row").forEach((row) => {
      const visible = rowVisible(row);
      row.hidden = !visible;
      if (visible) shown += 1;
    });
    const empty = document.getElementById("filter-empty");
    if (empty) empty.hidden = shown !== 0;
  }

  function paintUnread() {
    ["tous", "perso", "atelier", "facturation"].forEach((id) => {
      const n = unreadIn(id);
      document.querySelectorAll(`[data-compte-count="${id}"]`).forEach((el) => {
        el.textContent = String(n);
      });
    });
    const scoped = unreadIn(currentCompte);
    const label = document.getElementById("unread-count");
    if (label) label.textContent = scoped + (scoped > 1 ? " non lus" : " non lu");
    const badge = document.querySelector("[data-count='inbox']");
    if (badge) badge.textContent = String(scoped);
    const tousMenu = document.querySelector("#scope-menu [data-compte='tous'] small");
    if (tousMenu) tousMenu.textContent = scopedLabel(unreadIn("tous"));
    const tousModal = document.querySelector("#account-menu [data-compte='tous'] small");
    if (tousModal) tousModal.textContent = "Vue unifiée · " + scopedLabel(unreadIn("tous"));
  }

  function scopedLabel(n) {
    return n + (n > 1 ? " non lus" : " non lu");
  }

  function setCompte(id) {
    if (!accounts[id]) id = "tous";
    currentCompte = id;
    const meta = accounts[id];
    const title = document.getElementById("box-title");
    if (title) title.textContent = meta.title;
    const mail = document.getElementById("scope-mail");
    if (mail) mail.textContent = meta.mail;
    const boxes = document.getElementById("boxes-label");
    if (boxes) boxes.textContent = meta.boxes;
    if (page === "inbox") {
      const chrome = document.querySelector(".chrome-title");
      if (chrome) chrome.textContent = meta.title;
      document.title = "RustyMail — " + meta.title;
      const sync = document.querySelector(".sync");
      if (sync) sync.title = meta.sync;
      const url = new URL(location.href);
      if (id === "tous" && url.searchParams.get("compte") && url.searchParams.get("compte") !== "tous") {
        url.searchParams.delete("compte");
      } else if (id !== "tous") {
        url.searchParams.set("compte", id);
      }
      history.replaceState(null, "", url);
    }
    document.querySelector(".app")?.setAttribute("data-compte", id);
    document.querySelectorAll(".folder[data-compte], #account-menu [data-compte], #scope-menu [data-compte]").forEach((el) => {
      const on = el.dataset.compte === id;
      el.classList.toggle("is-scope", on && el.classList.contains("folder"));
      if (el.getAttribute("role") === "option") el.setAttribute("aria-selected", String(on));
      if (el.getAttribute("role") === "menuitemradio") el.setAttribute("aria-checked", String(on));
    });
    applyRows();
    paintUnread();
  }

  document.querySelectorAll("[data-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentFilter = btn.dataset.filter;
      document.querySelectorAll("[data-filter]").forEach((b) => {
        b.setAttribute("aria-pressed", String(b === btn));
      });
      applyRows();
    });
  });

  document.querySelectorAll("[data-read]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const row = btn.closest(".row");
      if (!row) return;
      row.classList.toggle("is-unread");
      const unread = row.classList.contains("is-unread");
      const name = unread ? "Marquer comme lu" : "Marquer comme non lu";
      btn.title = name;
      btn.setAttribute("aria-label", name);
      paintUnread();
    });
  });

  const scopeBtn = document.getElementById("scope-btn");
  const scopeMenu = document.getElementById("scope-menu");
  scopeBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    const open = scopeMenu?.hidden;
    if (scopeMenu) scopeMenu.hidden = !open;
    scopeBtn.setAttribute("aria-expanded", String(Boolean(open)));
  });
  document.querySelectorAll(".rail [data-compte], #scope-menu [data-compte]").forEach((btn) => {
    if (page !== "inbox") return;
    btn.addEventListener("click", () => {
      setCompte(btn.dataset.compte);
      if (scopeMenu) scopeMenu.hidden = true;
      scopeBtn?.setAttribute("aria-expanded", "false");
    });
  });

  const moveBtn = document.getElementById("move-btn");
  const moveMenu = document.getElementById("move-menu");
  if (moveBtn && moveMenu) {
    moveBtn.addEventListener("click", () => {
      const open = moveMenu.hasAttribute("hidden");
      moveMenu.hidden = !open;
      moveBtn.setAttribute("aria-expanded", String(open));
    });
    moveMenu.querySelectorAll("button").forEach((item) => {
      item.addEventListener("click", () => {
        moveMenu.hidden = true;
        moveBtn.setAttribute("aria-expanded", "false");
        moveBtn.lastChild.textContent = " " + item.textContent.trim();
      });
    });
  }

  const followBtn = document.getElementById("follow-btn");
  if (followBtn) {
    followBtn.addEventListener("click", () => {
      const on = followBtn.getAttribute("aria-pressed") !== "true";
      followBtn.setAttribute("aria-pressed", String(on));
      followBtn.textContent = on ? "Suivi" : "Suivre";
    });
  }

  const ccBtn = document.getElementById("cc-toggle");
  document.querySelectorAll("[data-cc]").forEach((row) => {
    row.hidden = true;
  });
  if (ccBtn) {
    ccBtn.addEventListener("click", () => {
      const open = ccBtn.getAttribute("aria-expanded") !== "true";
      ccBtn.setAttribute("aria-expanded", String(open));
      document.querySelectorAll("[data-cc]").forEach((row) => {
        row.hidden = !open;
      });
    });
  }

  function escapeHtml(value) {
    return value.replace(/[&<>]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[ch]));
  }

  function miniMd(src) {
    const inline = (line) =>
      escapeHtml(line).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    const blocks = src.trim().split(/\n{2,}/);
    if (!src.trim()) return "<p class='note'>Rien à prévisualiser.</p>";
    return blocks
      .map((block) => {
        const lines = block.split("\n");
        if (lines.every((line) => /^\d+\.\s/.test(line))) {
          return (
            "<ol>" +
            lines.map((line) => "<li>" + inline(line.replace(/^\d+\.\s/, "")) + "</li>").join("") +
            "</ol>"
          );
        }
        return "<p>" + lines.map(inline).join("<br>") + "</p>";
      })
      .join("");
  }

  const preview = document.getElementById("preview");
  const body = document.getElementById("body");
  document.querySelectorAll("[data-compose-tab]").forEach((tab) => {
    tab.addEventListener("click", () => {
      const name = tab.dataset.composeTab;
      document.querySelectorAll("[data-compose-tab]").forEach((other) => {
        other.setAttribute("aria-selected", String(other === tab));
      });
      document.querySelectorAll("[data-compose-pane]").forEach((pane) => {
        pane.hidden = pane.dataset.composePane !== name;
      });
      if (name === "preview" && preview && body) preview.innerHTML = miniMd(body.value);
    });
  });

  document.querySelectorAll("[data-restore]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const text = document.getElementById(btn.dataset.restore);
      if (text && body) {
        body.value = text.textContent.trim();
        document.querySelector("[data-compose-tab='write']")?.click();
      }
    });
  });

  const files = document.getElementById("files");
  const picker = document.getElementById("pick-files");
  if (picker && files) {
    picker.addEventListener("change", () => {
      Array.from(picker.files || []).forEach((file) => {
        const li = document.createElement("li");
        li.className = "filechip";
        const name = document.createElement("span");
        name.textContent = file.name;
        const meta = document.createElement("span");
        meta.className = "meta";
        meta.textContent = Math.max(1, Math.round(file.size / 1024)) + " Ko";
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "icon-btn";
        remove.setAttribute("aria-label", "Retirer " + file.name);
        remove.textContent = "×";
        remove.addEventListener("click", () => li.remove());
        li.append(name, meta, remove);
        files.append(li);
      });
      picker.value = "";
    });
  }
  files?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-remove-file]");
    if (btn) btn.closest(".filechip")?.remove();
  });

  document.querySelector(".qa")?.addEventListener("submit", (event) => event.preventDefault());

  document.getElementById("translate")?.addEventListener("click", () => {
    const note = document.getElementById("translate-note");
    if (note) note.hidden = false;
  });

  function setTurn(turn, open) {
    turn.classList.toggle("is-open", open);
    turn.classList.toggle("is-folded", !open);
    turn.querySelectorAll(".turn-fold, .turn-rest").forEach((btn) => {
      btn.setAttribute("aria-expanded", String(open));
    });
    const body = turn.querySelector(".turn-body");
    if (body) body.hidden = !open;
    const fold = turn.querySelector(".turn-fold");
    const who = turn.querySelector(".turn-name")?.textContent.trim() || "ce message";
    if (fold) fold.setAttribute("aria-label", (open ? "Replier" : "Développer") + " le message de " + who);
  }

  document.querySelectorAll(".turn-fold, .turn-rest").forEach((btn) => {
    btn.addEventListener("click", () => {
      const turn = btn.closest(".turn");
      if (!turn) return;
      const openCount = document.querySelectorAll(".turn.is-open").length;
      const wasOpen = turn.classList.contains("is-open");
      if (wasOpen && openCount === 1) {
        setTurn(turn, false);
        return;
      }
      document.querySelectorAll(".turn").forEach((other) => setTurn(other, other === turn));
    });
  });

  document.getElementById("fold-all")?.addEventListener("click", () => {
    document.querySelectorAll(".turn").forEach((turn) => setTurn(turn, false));
  });

  document.getElementById("unfold-all")?.addEventListener("click", () => {
    document.querySelectorAll(".turn").forEach((turn) => setTurn(turn, true));
  });

  document.addEventListener("click", (event) => {
    if (moveMenu && moveBtn && !moveBtn.contains(event.target) && !moveMenu.contains(event.target)) {
      moveMenu.hidden = true;
      moveBtn.setAttribute("aria-expanded", "false");
    }
    if (scopeMenu && scopeBtn && !scopeBtn.contains(event.target) && !scopeMenu.contains(event.target)) {
      scopeMenu.hidden = true;
      scopeBtn.setAttribute("aria-expanded", "false");
    }
  });

  document.addEventListener("keydown", (event) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName) || event.target.isContentEditable;
    if (event.key === "Escape") {
      const openDialog = document.querySelector(".modal:not([hidden])");
      if (openDialog) {
        openDialog.hidden = true;
        return;
      }
      setPanel(false);
      if (moveMenu) moveMenu.hidden = true;
      if (typing) event.target.blur();
      return;
    }
    if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === "[" || event.key === "\\") {
      event.preventDefault();
      syncRail(!app?.classList.contains("is-rail-collapsed"));
      return;
    }
    if (event.key === "/") {
      const search = document.getElementById("q");
      if (search) {
        event.preventDefault();
        search.focus();
      }
    } else if (event.key === "n" || event.key === "N") {
      location.href = "compose.html?nouveau=1";
    } else if ((event.key === "r" || event.key === "R") && page === "thread") {
      location.href = "compose.html";
    } else if ((event.key === "m" || event.key === "M") && page === "compose") {
      document.querySelector("[data-compose-tab='preview']")?.click();
    }
  });

  if (page === "compose" && new URLSearchParams(location.search).get("nouveau") === "1") {
    document.title = "RustyMail — Nouveau message";
    const title = document.getElementById("compose-title");
    const chrome = document.querySelector(".chrome-title");
    if (title) title.textContent = "Nouveau message";
    if (chrome) chrome.textContent = "Nouveau message";
    document.getElementById("to-chip")?.remove();
    const subject = document.getElementById("subject");
    if (subject) subject.value = "";
    if (body) body.value = "";
    const cc = document.getElementById("cc");
    const bcc = document.getElementById("bcc");
    if (cc) cc.value = "";
    if (bcc) bcc.value = "";
    files?.replaceChildren();
    const close = document.getElementById("close-compose");
    if (close) close.href = "inbox.html";
    const autosave = document.getElementById("autosave");
    if (autosave) autosave.textContent = "Nouveau brouillon";
    const history = document.getElementById("history-list");
    if (history) history.innerHTML = "<li><span class='ago'> </span>Aucune version enregistrée.</li>";
    document.querySelectorAll("[data-cc]").forEach((row) => {
      row.hidden = true;
    });
  }

  const params = new URLSearchParams(location.search);
  if (page === "inbox") setCompte(params.get("compte") || "tous");
  if (params.get("profil") === "1") setDialog("profile", true);
  if (params.get("contact") === "1") openContact("camille");
})();
