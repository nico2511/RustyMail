export function settingsExplainHtml(inner: string, kind: "lead" | "field" | "toggle" = "lead"): string {
  if (kind === "toggle") {
    return `<span class="settings-explain settings-explain--toggle"><span class="settings-explain__content">${inner}</span></span>`;
  }
  const tag = kind === "field" ? "p" : "aside";
  const role = kind === "lead" ? ' role="note"' : "";
  const kicker = kind === "lead" ? '<span class="settings-explain__kicker">À savoir</span>' : "";
  return `<${tag} class="settings-explain settings-explain--${kind}"${role}><span class="settings-explain__mark" aria-hidden="true">${
    kind === "field" ? "·" : "i"
  }</span><span class="settings-explain__content">${kicker}${inner}</span></${tag}>`;
}
