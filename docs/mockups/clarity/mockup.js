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
        updateListEmpty();
      });
    });
  }

  function updateListEmpty() {
    var empty = qs("[data-list-empty]");
    if (!empty) return;
    var anyVisible = qsa(".list .row").some(function (r) {
      return !r.classList.contains("is-filtered-out");
    });
    empty.classList.toggle("is-visible", !anyVisible);
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
    updateActivity(row);
  }

  function updateActivity(row) {
    var feed = qs("[data-activity-feed]");
    if (!feed || !row) return;
    var subject = row.getAttribute("data-preview-subject") || "Message";
    var sender = row.getAttribute("data-sender") || "Contact";
    var urgent = row.getAttribute("data-preview-urgent") === "1";
    feed.innerHTML =
      "<li><strong>Maintenant</strong> — lecture « " +
      subject +
      " »</li>" +
      "<li>Contact · " +
      sender +
      "</li>" +
      (urgent ? "<li>Priorité auto · échéance détectée</li>" : "<li>Priorité · normale</li>");
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
  var dateListHtml = list ? list.innerHTML : "";

  function bindRowPins() {
    qsa(".row-pin").forEach(function (pin) {
      pin.addEventListener("click", function (e) {
        e.stopPropagation();
        e.preventDefault();
        var row = pin.closest(".row");
        if (row) row.classList.toggle("is-pinned");
        pin.textContent = row.classList.contains("is-pinned") ? "★" : "☆";
      });
    });
  }

  function bindInboxRows() {
    if (!list) return;
    qsa(".row", list).forEach(function (row) {
      row.addEventListener("click", function (e) {
        if (e.target.closest(".row-actions") || e.target.closest(".row-pin")) return;
        if (document.body.classList.contains("split-off")) return;
        var link = qs(".row-link", row);
        if (link) e.preventDefault();
        selectRow(row);
      });
    });
    qsa(".row-check input").forEach(function (cb) {
      cb.addEventListener("click", function (e) {
        e.stopPropagation();
        updateBatchCount();
      });
    });
    bindRowPins();
  }

  function sortInbox(mode) {
    if (!list) return;
    var meta = qs("[data-inbox-meta]");
    if (mode === "date") {
      list.innerHTML = dateListHtml;
      if (meta) meta.textContent = "4 non lus · groupé par date";
      document.body.classList.remove("pinned-first");
    } else {
      var rows = [];
      var wrap = document.createElement("div");
      wrap.innerHTML = dateListHtml;
      qsa(".row", wrap).forEach(function (r) {
        rows.push(r.cloneNode(true));
      });
      rows.sort(function (a, b) {
        var pa = a.classList.contains("is-pinned") ? 0 : 1;
        var pb = b.classList.contains("is-pinned") ? 0 : 1;
        if (pa !== pb) return pa - pb;
        return (a.getAttribute("data-sender") || "").localeCompare(b.getAttribute("data-sender") || "");
      });
      list.innerHTML = "";
      var lastSender = null;
      rows.forEach(function (row) {
        var sender = row.getAttribute("data-sender") || "Autre";
        if (sender !== lastSender) {
          var section = document.createElement("div");
          section.className = "list-section";
          var label = document.createElement("div");
          label.className = "list-section-label";
          label.textContent = sender;
          section.appendChild(label);
          list.appendChild(section);
          lastSender = sender;
        }
        list.lastElementChild.appendChild(row);
      });
      if (meta) meta.textContent = "4 non lus · groupé par contact";
      document.body.classList.toggle("pinned-first", !!qs(".row.is-pinned", list));
    }
    bindInboxRows();
    updateListEmpty();
    var sel = qs(".row.is-selected", list) || qs(".row", list);
    if (sel) selectRow(sel);
  }

  if (list) {
    bindInboxRows();
    var selected = qs(".row.is-selected", list);
    if (selected) updateActivity(selected);
  }

  var sortSeg = qs("[data-sort-seg]");
  if (sortSeg) {
    qsa("button", sortSeg).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var mode = btn.getAttribute("data-sort");
        qsa("button", sortSeg).forEach(function (b) {
          b.classList.toggle("is-on", b === btn);
        });
        sortInbox(mode);
      });
    });
  }

  var contrastBtn = qs("[data-contrast-plus]");
  if (contrastBtn) {
    contrastBtn.addEventListener("click", function () {
      var on = document.body.classList.toggle("contrast-plus");
      contrastBtn.classList.toggle("is-on", on);
      contrastBtn.setAttribute("aria-pressed", on ? "true" : "false");
    });
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
      filterPalette("");
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
        if (btn.classList.contains("is-hidden")) return;
        var cmd = btn.getAttribute("data-palette-cmd");
        closePalette();
        if (cmd === "focus" && focusBtn) focusBtn.click();
        if (cmd === "compose") window.location.href = "compose.html";
        if (cmd === "thread" && openThread) window.location.href = openThread.getAttribute("href") || "thread.html";
        if (cmd === "snooze") {
          var snoozeToast = qs("[data-snooze-toast]");
          if (snoozeToast) snoozeToast.classList.add("is-visible");
        }
        if (cmd === "batch") {
          var batchBtn = qs("[data-batch-mode]");
          if (batchBtn) batchBtn.click();
        }
        if (cmd === "contrast" && contrastBtn) contrastBtn.click();
        if (cmd === "sort-contact" && sortSeg) {
          qsa("button", sortSeg).forEach(function (b) {
            b.classList.toggle("is-on", b.getAttribute("data-sort") === "sender");
          });
          sortInbox("sender");
        }
      });
    });
    if (paletteInput) {
      paletteInput.addEventListener("input", function () {
        filterPalette(paletteInput.value);
      });
    }
  }

  function filterPalette(query) {
    var paletteEmpty = qs("[data-palette-empty]");
    var q = (query || "").trim().toLowerCase();
    var items = qsa("[data-palette-cmd]");
    var shown = 0;
    items.forEach(function (btn) {
      var text = (btn.textContent + " " + (btn.getAttribute("data-palette-keywords") || "")).toLowerCase();
      var match = !q || text.indexOf(q) !== -1;
      btn.classList.toggle("is-hidden", !match);
      if (match) shown += 1;
    });
    if (paletteEmpty) paletteEmpty.classList.toggle("is-visible", shown === 0);
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

  var snoozeBtn = qs("[data-snooze-trigger]");
  var snoozeToast = qs("[data-snooze-toast]");
  if (snoozeBtn && snoozeToast) {
    snoozeBtn.addEventListener("click", function () {
      snoozeToast.classList.add("is-visible");
    });
  }

  var batchBtn = qs("[data-batch-mode]");
  var batchCount = qs("[data-batch-count]");
  function updateBatchCount() {
    if (!batchCount) return;
    var n = qsa(".row-check input:checked").length;
    batchCount.textContent = n + (n > 1 ? " sélectionnés" : " sélectionné");
  }
  if (batchBtn) {
    batchBtn.addEventListener("click", function () {
      var on = document.body.classList.toggle("batch-mode");
      batchBtn.classList.toggle("is-on", on);
      if (!on) {
        qsa(".row-check input").forEach(function (cb) {
          cb.checked = false;
        });
        updateBatchCount();
      }
    });
  }

  var toneSeg = qs("[data-tone-seg]");
  var bodyField = qs(".body-field");
  if (toneSeg && bodyField) {
    qsa("button", toneSeg).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var tone = btn.getAttribute("data-tone");
        qsa("button", toneSeg).forEach(function (b) {
          b.classList.toggle("is-on", b === btn);
        });
        bodyField.classList.remove("tone-pro", "tone-warm");
        if (tone === "pro") bodyField.classList.add("tone-pro");
        if (tone === "warm") bodyField.classList.add("tone-warm");
      });
    });
  }

  var attachToggle = qs("[data-attach-toggle]");
  var dropZone = qs("[data-drop-zone]");
  if (attachToggle && dropZone) {
    attachToggle.addEventListener("click", function () {
      dropZone.classList.toggle("is-visible");
    });
    ["dragenter", "dragover"].forEach(function (ev) {
      dropZone.addEventListener(ev, function (e) {
        e.preventDefault();
        dropZone.classList.add("is-dragover");
      });
    });
    dropZone.addEventListener("dragleave", function () {
      dropZone.classList.remove("is-dragover");
    });
    dropZone.addEventListener("drop", function (e) {
      e.preventDefault();
      dropZone.classList.remove("is-dragover");
      dropZone.textContent = "Fichier ajouté (mock) — contrat.pdf";
    });
  }

  var scheduleBtn = qs("[data-schedule-trigger]");
  var scheduleHint = qs("[data-schedule-hint]");
  if (scheduleBtn && scheduleHint) {
    scheduleBtn.addEventListener("click", function () {
      scheduleHint.classList.add("is-visible");
    });
  }
})();
