/* Navigation et bascules des maquettes. Pas de logique mail. */
(function () {
  const page = document.body.dataset.page;
  const app = document.querySelector(".app");

  document.querySelectorAll("[data-nav]").forEach((link) => {
    if (link.dataset.nav === page) link.setAttribute("aria-current", "page");
  });

  const railBtn = document.getElementById("rail-toggle");
  if (railBtn && app) {
    railBtn.addEventListener("click", () => {
      const collapsed = app.classList.toggle("is-rail-collapsed");
      railBtn.setAttribute("aria-expanded", String(!collapsed));
      const label = collapsed ? "Afficher les dossiers" : "Masquer les dossiers";
      railBtn.setAttribute("aria-label", label);
      railBtn.title = label;
    });
  }

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

  const accountBtn = document.getElementById("account-btn");
  const accountMenu = document.getElementById("account-menu");
  if (accountBtn && accountMenu) {
    accountBtn.addEventListener("click", () => {
      const open = accountMenu.hasAttribute("hidden");
      accountMenu.hidden = !open;
      accountBtn.setAttribute("aria-expanded", String(open));
    });
    accountMenu.querySelectorAll("button").forEach((option) => {
      option.addEventListener("click", () => {
        const name = option.dataset.name || "";
        const mail = option.dataset.mail || "";
        const mark = option.dataset.mark || "";
        const nameEl = document.getElementById("account-name");
        const mailEl = document.getElementById("account-mail");
        const markEl = document.getElementById("account-mark");
        if (nameEl) nameEl.textContent = name;
        if (mailEl) mailEl.textContent = mail;
        if (markEl) markEl.textContent = mark;
        accountMenu.querySelectorAll("button").forEach((b) => {
          b.setAttribute("aria-selected", String(b === option));
        });
        accountMenu.hidden = true;
        accountBtn.setAttribute("aria-expanded", "false");
      });
    });
  }

  document.querySelectorAll("[data-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const filter = btn.dataset.filter;
      document.querySelectorAll("[data-filter]").forEach((b) => {
        b.setAttribute("aria-pressed", String(b === btn));
      });
      const rows = document.querySelectorAll(".row");
      let shown = 0;
      rows.forEach((row) => {
        const unread = row.classList.contains("is-unread");
        const follow = row.classList.contains("is-follow");
        const visible = filter === "all" || (filter === "unread" && unread) || (filter === "follow" && follow);
        row.hidden = !visible;
        if (visible) shown += 1;
      });
      const empty = document.getElementById("filter-empty");
      if (empty) empty.hidden = shown !== 0;
    });
  });

  function unreadTotal() {
    return document.querySelectorAll(".row.is-unread").length;
  }

  function paintUnread() {
    const total = unreadTotal();
    const label = document.getElementById("unread-count");
    if (label) label.textContent = total + (total > 1 ? " non lus" : " non lu");
    const badge = document.querySelector("[data-count='inbox']");
    if (badge) badge.textContent = String(total);
  }

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

  document.addEventListener("click", (event) => {
    if (accountMenu && accountBtn && !accountBtn.contains(event.target) && !accountMenu.contains(event.target)) {
      accountMenu.hidden = true;
      accountBtn.setAttribute("aria-expanded", "false");
    }
    if (moveMenu && moveBtn && !moveBtn.contains(event.target) && !moveMenu.contains(event.target)) {
      moveMenu.hidden = true;
      moveBtn.setAttribute("aria-expanded", "false");
    }
  });

  document.addEventListener("keydown", (event) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName) || event.target.isContentEditable;
    if (event.key === "Escape") {
      setPanel(false);
      if (accountMenu) accountMenu.hidden = true;
      if (moveMenu) moveMenu.hidden = true;
      if (typing) event.target.blur();
      return;
    }
    if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
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
})();
