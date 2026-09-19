/** Clarity v10 — toggles thème + session mock (pas de widgets inventés). */
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

  function systemPrefersDark() {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  function effectiveDark(m) {
    const scheme = m.scheme || "light";
    if (scheme === "dark") return true;
    if (scheme === "system") return systemPrefersDark();
    return false;
  }

  function apply(m) {
    const dark = effectiveDark(m);
    document.body.classList.toggle("clarity-dark", dark);
    document.body.classList.toggle("clarity-session", !dark && m.session !== false);
    const lightMods = !dark;
    document.body.classList.toggle("clarity-contrast-plus", lightMods && Boolean(m.contrast));
    document.body.classList.toggle("clarity-accent-lavender", lightMods && Boolean(m.lavender));

    document.documentElement.style.colorScheme = dark ? "dark" : "light";

    document.querySelectorAll("[data-clarity-scheme]").forEach((btn) => {
      const scheme = btn.getAttribute("data-clarity-scheme");
      const on = (m.scheme || "light") === scheme;
      btn.classList.toggle("is-on", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });

    document.querySelectorAll("[data-clarity-mode]").forEach((btn) => {
      const mode = btn.getAttribute("data-clarity-mode");
      const disabled = dark;
      btn.disabled = disabled;
      btn.setAttribute("aria-disabled", disabled ? "true" : "false");
      const on =
        !disabled &&
        (mode === "session"
          ? m.session !== false
          : mode === "contrast"
            ? Boolean(m.contrast)
            : mode === "lavender"
              ? Boolean(m.lavender)
              : false);
      btn.classList.toggle("is-on", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function bind() {
    const m = readModes();
    if (m.session === undefined) m.session = true;
    if (m.scheme === undefined) m.scheme = "light";
    apply(m);

    document.querySelectorAll("[data-clarity-scheme]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const next = readModes();
        next.scheme = btn.getAttribute("data-clarity-scheme") || "light";
        writeModes(next);
        apply(next);
      });
    });

    document.querySelectorAll("[data-clarity-mode]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (effectiveDark(readModes())) return;
        const mode = btn.getAttribute("data-clarity-mode");
        const next = readModes();
        if (mode === "session") next.session = !next.session;
        if (mode === "contrast") next.contrast = !next.contrast;
        if (mode === "lavender") next.lavender = !next.lavender;
        writeModes(next);
        apply(next);
      });
    });

    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      const cur = readModes();
      if ((cur.scheme || "light") === "system") apply(cur);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})();
