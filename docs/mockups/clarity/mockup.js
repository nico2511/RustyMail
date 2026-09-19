(function () {
  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }
  function qsa(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  var seg = qs("[data-density-seg]");
  if (seg) {
    qsa("button", seg).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var mode = btn.getAttribute("data-density");
        qsa("button", seg).forEach(function (b) {
          b.classList.toggle("is-on", b === btn);
        });
        document.body.classList.toggle("density-compact", mode === "compact");
      });
    });
  }

  var splitSeg = qs("[data-split-seg]");
  if (splitSeg) {
    qsa("button", splitSeg).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var mode = btn.getAttribute("data-split");
        qsa("button", splitSeg).forEach(function (b) {
          b.classList.toggle("is-on", b === btn);
        });
        document.body.classList.toggle("split-off", mode === "list");
      });
    });
  }

  var sidebarBtn = qs("[data-sidebar-toggle]");
  if (sidebarBtn) {
    sidebarBtn.addEventListener("click", function () {
      if (document.body.classList.contains("focus-mode")) return;
      var rail = document.body.classList.toggle("sidebar-rail");
      sidebarBtn.textContent = rail ? "▶" : "◀";
      sidebarBtn.setAttribute("aria-label", rail ? "Élargir le panneau" : "Réduire le panneau");
    });
  }

  var focusBtn = qs("[data-focus-mode]");
  if (focusBtn) {
    focusBtn.addEventListener("click", function () {
      var on = document.body.classList.toggle("focus-mode");
      focusBtn.classList.toggle("is-on", on);
      focusBtn.setAttribute("aria-pressed", on ? "true" : "false");
      if (on) {
        document.body.classList.add("sidebar-rail");
        if (sidebarBtn) sidebarBtn.textContent = "▶";
      }
    });
  }

  var filters = qs("[data-filter-chips]");
  if (filters) {
    qsa(".chip", filters).forEach(function (chip) {
      chip.addEventListener("click", function () {
        var filter = chip.getAttribute("data-filter");
        qsa(".chip", filters).forEach(function (c) {
          c.classList.toggle("is-on", c === chip);
        });
        qsa(".list .row").forEach(function (row) {
          var show = true;
          if (filter === "unread") show = row.classList.contains("unread");
          if (filter === "urgent") show = !!row.querySelector(".badge-urgent");
          row.classList.toggle("is-filtered-out", !show);
        });
      });
    });
  }

  var readPane = qs("[data-read-pane]");
  var openThread = qs("[data-open-thread]");

  function applyPreview(row) {
    if (!readPane || !row) return;
    readPane.classList.remove("is-empty");
    var title = qs("[data-read-title]", readPane);
    var meta = qs("[data-read-meta]", readPane);
    var body = qs("[data-read-body]", readPane);
    var badge = qs("[data-read-urgent]", readPane);
    if (title) title.textContent = row.getAttribute("data-preview-subject") || "";
    if (meta) meta.textContent = row.getAttribute("data-preview-meta") || "";
    if (body) body.textContent = row.getAttribute("data-preview-body") || "";
    if (badge) {
      if (row.getAttribute("data-preview-urgent") === "1") {
        badge.textContent = "Échéance";
        badge.className = "badge-urgent read-pane-badge";
      } else {
        badge.textContent = "";
        badge.className = "read-pane-badge";
      }
    }
    if (openThread) openThread.setAttribute("href", row.getAttribute("data-thread") || "thread.html");
  }

  function selectRow(row) {
    if (!row || row.classList.contains("is-filtered-out")) return;
    qsa(".list .row").forEach(function (r) {
      r.classList.toggle("is-selected", r === row);
    });
    applyPreview(row);
  }

  function visibleRows() {
    return qsa(".list .row").filter(function (r) {
      return !r.classList.contains("is-filtered-out");
    });
  }

  var list = qs("[data-inbox-list]");
  if (list) {
    qsa(".row", list).forEach(function (row) {
      row.addEventListener("click", function (e) {
        if (e.target.closest(".row-actions")) return;
        if (document.body.classList.contains("split-off")) return;
        var link = qs(".row-link", row);
        if (link) e.preventDefault();
        selectRow(row);
      });
    });
    var selected = qs(".row.is-selected", list);
    if (selected) applyPreview(selected);
  }

  document.addEventListener("keydown", function (e) {
    if (!list || document.body.classList.contains("split-off")) return;
    if (e.target.matches("input, textarea, [contenteditable=true]")) return;
    var rows = visibleRows();
    if (!rows.length) return;
    var idx = rows.findIndex(function (r) {
      return r.classList.contains("is-selected");
    });
    if (e.key === "j" || e.key === "ArrowDown") {
      e.preventDefault();
      selectRow(rows[Math.min(idx < 0 ? 0 : idx + 1, rows.length - 1)]);
    }
    if (e.key === "k" || e.key === "ArrowUp") {
      e.preventDefault();
      selectRow(rows[Math.max(idx <= 0 ? 0 : idx - 1, 0)]);
    }
    if (e.key === "Enter" && idx >= 0 && openThread) {
      window.location.href = openThread.getAttribute("href") || "thread.html";
    }
  });

  var palette = qs("[data-command-palette]");
  var paletteInput = qs("[data-palette-input]");
  function openPalette() {
    if (!palette) return;
    palette.classList.add("is-open");
    palette.setAttribute("aria-hidden", "false");
    if (paletteInput) {
      paletteInput.value = "";
      paletteInput.focus();
    }
  }
  function closePalette() {
    if (!palette) return;
    palette.classList.remove("is-open");
    palette.setAttribute("aria-hidden", "true");
  }

  document.addEventListener("keydown", function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      if (palette && palette.classList.contains("is-open")) closePalette();
      else openPalette();
    }
    if (e.key === "Escape") closePalette();
  });

  if (palette) {
    palette.addEventListener("click", function (e) {
      if (e.target === palette) closePalette();
    });
    qsa("[data-palette-cmd]", palette).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var cmd = btn.getAttribute("data-palette-cmd");
        closePalette();
        if (cmd === "focus" && focusBtn) focusBtn.click();
        if (cmd === "compose") window.location.href = "compose.html";
        if (cmd === "thread" && openThread) window.location.href = openThread.getAttribute("href") || "thread.html";
      });
    });
  }

  var searchWrap = qs(".search-wrap");
  if (searchWrap) {
    searchWrap.addEventListener("click", function (e) {
      if (e.target.tagName === "KBD") openPalette();
    });
  }

  var tabs = qs("[data-compose-tabs]");
  var sheet = qs("[data-compose-sheet]");
  if (tabs && sheet) {
    qsa("button", tabs).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var tab = btn.getAttribute("data-tab");
        qsa("button", tabs).forEach(function (b) {
          b.classList.toggle("is-on", b === btn);
        });
        sheet.classList.toggle("show-preview", tab === "preview");
      });
    });
  }

  var sendBtn = qs("[data-send-trigger]");
  var toast = qs("[data-send-toast]");
  var undoBtn = qs("[data-send-undo]");
  if (sendBtn && toast) {
    sendBtn.addEventListener("click", function () {
      toast.classList.add("is-visible");
    });
    if (undoBtn) {
      undoBtn.addEventListener("click", function () {
        toast.classList.remove("is-visible");
      });
    }
  }
})();
