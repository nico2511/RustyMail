import { escapeAttr, escapeHtml } from "../../../ui/sanitize";
import { sanitizeEmailHtml } from "../../mail/mailEmailHtmlSanitizeCoreRun";
import { digestCut, type DigestCutZoneName } from "../../mail/digestCutState";

function zoneRow(name: DigestCutZoneName, label: string): string {
  const zone = digestCut.proposal?.zones[name];
  const action = zone?.action ?? "show";
  const rationale = zone?.rationale?.trim();
  const anchors =
    zone?.anchors
      ?.map((anchor) => {
        const bits = [
          anchor.selector,
          anchor.index != null ? `#${anchor.index}` : "",
          anchor.classContains ? `.${anchor.classContains}` : "",
        ].filter(Boolean);
        return bits.join("");
      })
      .filter(Boolean)
      .join(", ") ?? "—";
  const pressed = (value: string) => (action === value ? "true" : "false");
  return `<section class="digest-cut__zone">
    <h4 class="digest-cut__zone-title">${escapeHtml(label)}</h4>
    <p class="dim digest-cut__zone-anchors">${escapeHtml(anchors)}</p>
    ${rationale ? `<p class="digest-cut__zone-rationale">${escapeHtml(rationale)}</p>` : ""}
    <div class="digest-cut__zone-actions" role="group" aria-label="${escapeAttr(`Zone ${label}`)}">
      <button type="button" class="ghost-button" data-action="digest-cut-zone" data-zone="${name}" data-zone-action="show" aria-pressed="${pressed("show")}">Afficher</button>
      <button type="button" class="ghost-button" data-action="digest-cut-zone" data-zone="${name}" data-zone-action="hide" aria-pressed="${pressed("hide")}">Masquer</button>
      <button type="button" class="ghost-button" data-action="digest-cut-zone" data-zone="${name}" data-zone-action="collapse" aria-pressed="${pressed("collapse")}">Replier</button>
    </div>
  </section>`;
}

function previewPane(): string {
  if (digestCut.previewing) return `<p class="dim">Aperçu découpe…</p>`;
  if (digestCut.previewError) {
    return `<p class="digest-bench__warn">${escapeHtml(digestCut.previewError)}</p>`;
  }
  if (digestCut.previewApplicable === false) {
    return `<p class="digest-bench__warn">Fixture non applicable sur cet échantillon : domaine ou ancres insuffisants. La lecture resterait générique.</p>`;
  }
  if (digestCut.previewApplicable && digestCut.previewHtml) {
    return sanitizeEmailHtml(digestCut.previewHtml).html;
  }
  return `<p class="dim">Proposez une découpe puis lancez l'aperçu.</p>`;
}

export function renderDigestCutPanel(): string {
  const raw = digestCut.html.trim()
    ? sanitizeEmailHtml(digestCut.html).html
    : `<p class="dim">Échantillon non chargé.</p>`;
  const source = digestCut.proposal?.source ?? "—";
  return `<div class="settings-page digest-cut">
    <article class="settings-card surface-sm">
      <h3 class="thread-kicker">Éditeur de découpe</h3>
      <p class="digest-bench__fine dim">Outil distinct du compositeur et du banc d'essai. Analyse la structure HTML (balises, classes), pas une capture d'écran. Valider une proposition ne l'active pas en lecture.</p>
      <div class="digest-cut__actions digest-bench__actions">
        <button type="button" class="ghost-button" data-action="digest-cut-load-sample">Charger l'échantillon Deblock</button>
        <button type="button" class="ghost-button" data-action="digest-cut-propose" ${digestCut.proposing ? "disabled" : ""}>Proposer la découpe</button>
        <button type="button" class="ghost-button" data-action="digest-cut-propose-llm" ${digestCut.proposing ? "disabled" : ""}>Affiner avec le modèle</button>
        <button type="button" class="ghost-button" data-action="digest-cut-preview">Aperçu lecture coupée</button>
      </div>
      <p class="digest-bench__status">${escapeHtml(digestCut.subject || "Reçu Deblock embarqué")} · ${escapeHtml(digestCut.senderEmail || "support@deblock.com")} · source : ${escapeHtml(String(source))}</p>
      <p class="digest-bench__notice">${escapeHtml(digestCut.notice)}</p>
      <div class="digest-cut__layout digest-bench__layout">
        <div>
          <label class="digest-bench__label" for="digest-cut-yaml">Fixture candidate (YAML)</label>
          <textarea id="digest-cut-yaml" class="digest-bench__yaml" spellcheck="false">${escapeHtml(digestCut.yaml)}</textarea>
          <p class="digest-bench__fine dim">Ajustez les zones ci-dessous ou le YAML, puis aperçu. Pas d'écriture du registre de lecture depuis cet écran.</p>
          ${digestCut.proposal ? `<div class="digest-cut__zones">${zoneRow("header", "Header")}${zoneRow("body", "Body")}${zoneRow("footer", "Footer")}</div>` : ""}
        </div>
        <div class="digest-cut__preview">
          <section class="digest-bench__pane">
            <h4 class="digest-bench__pane-title">HTML échantillon</h4>
            <div class="digest-bench__pane-body mail">${raw}</div>
          </section>
          <section class="digest-bench__pane">
            <h4 class="digest-bench__pane-title">Lecture coupée</h4>
            <div class="digest-bench__pane-body mail">${previewPane()}</div>
          </section>
        </div>
      </div>
    </article>
  </div>`;
}
