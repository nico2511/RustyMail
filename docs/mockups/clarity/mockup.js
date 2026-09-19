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
})();
