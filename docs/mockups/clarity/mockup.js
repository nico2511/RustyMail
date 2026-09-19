(function () {
  var seg = document.querySelector("[data-density-seg]");
  if (seg) {
    seg.querySelectorAll("button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var mode = btn.getAttribute("data-density");
        seg.querySelectorAll("button").forEach(function (b) {
          b.classList.toggle("is-on", b === btn);
        });
        document.body.classList.toggle("density-compact", mode === "compact");
      });
    });
  }

  var splitSeg = document.querySelector("[data-split-seg]");
  if (splitSeg) {
    splitSeg.querySelectorAll("button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var mode = btn.getAttribute("data-split");
        splitSeg.querySelectorAll("button").forEach(function (b) {
          b.classList.toggle("is-on", b === btn);
        });
        document.body.classList.toggle("split-off", mode === "list");
      });
    });
  }

  var sidebarBtn = document.querySelector("[data-sidebar-toggle]");
  if (sidebarBtn) {
    sidebarBtn.addEventListener("click", function () {
      var rail = document.body.classList.toggle("sidebar-rail");
      sidebarBtn.textContent = rail ? "▶" : "◀";
      sidebarBtn.setAttribute("aria-label", rail ? "Élargir le panneau" : "Réduire le panneau");
    });
  }

  var filters = document.querySelector("[data-filter-chips]");
  if (filters) {
    filters.querySelectorAll(".chip").forEach(function (chip) {
      chip.addEventListener("click", function () {
        var filter = chip.getAttribute("data-filter");
        filters.querySelectorAll(".chip").forEach(function (c) {
          c.classList.toggle("is-on", c === chip);
        });
        document.querySelectorAll(".list .row").forEach(function (row) {
          var show = true;
          if (filter === "unread") show = row.classList.contains("unread");
          if (filter === "urgent") show = !!row.querySelector(".badge-urgent");
          row.classList.toggle("is-filtered-out", !show);
        });
      });
    });
  }

  var tabs = document.querySelector("[data-compose-tabs]");
  var sheet = document.querySelector("[data-compose-sheet]");
  if (tabs && sheet) {
    tabs.querySelectorAll("button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var tab = btn.getAttribute("data-tab");
        tabs.querySelectorAll("button").forEach(function (b) {
          b.classList.toggle("is-on", b === btn);
        });
        sheet.classList.toggle("show-preview", tab === "preview");
      });
    });
  }

  var sendBtn = document.querySelector("[data-send-trigger]");
  var toast = document.querySelector("[data-send-toast]");
  var undoBtn = document.querySelector("[data-send-undo]");
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
