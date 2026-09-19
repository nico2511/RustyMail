/** Clarity v10 — toggles session mock (pas de widgets inventés). */
(function () {
  const KEY = "clarity-session-modes";

  function readModes() {
    try {
      return JSON.parse(localStorage.getItem(KEY) || "{}");
    } catch {
      return {};
    }
  }

  function writeModes(m) {
    localStorage.setItem(KEY, JSON.stringify(m));
  }

  function apply(m) {
    document.body.classList.toggle("clarity-session", m.session !== false);
    document.body.classList.toggle("clarity-contrast-plus", Boolean(m.contrast));
    document.body.classList.toggle("clarity-accent-lavender", Boolean(m.lavender));
    document.querySelectorAll("[data-clarity-mode]").forEach((btn) => {
      const mode = btn.getAttribute("data-clarity-mode");
      const on =
        mode === "session"
          ? m.session !== false
          : mode === "contrast"
            ? Boolean(m.contrast)
            : mode === "lavender"
              ? Boolean(m.lavender)
              : false;
      btn.classList.toggle("is-on", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function bind() {
    const m = readModes();
    if (m.session === undefined) m.session = true;
    apply(m);

    document.querySelectorAll("[data-clarity-mode]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const mode = btn.getAttribute("data-clarity-mode");
        const next = readModes();
        if (mode === "session") next.session = !next.session;
        if (mode === "contrast") next.contrast = !next.contrast;
        if (mode === "lavender") next.lavender = !next.lavender;
        writeModes(next);
        apply(next);
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})();
