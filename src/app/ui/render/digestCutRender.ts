import { escapeAttr, escapeHtml } from "../../../ui/sanitize";
import { sanitizeEmailHtml } from "../../mail/mailEmailHtmlSanitizeCoreRun";
import { decorateMailHtmlForCut } from "../../mail/digestCutPaint";
import {
  digestCut,
  formatAnchorSummary,
  type DigestCutSourceKind,
  type DigestCutZoneName,
} from "../../mail/digestCutState";

const ZONE_LABEL: Record<DigestCutZoneName, string> = {
  header: "En-tête",
  body: "Corps",
  footer: "Pied",
};

function sourceLabel(kind: DigestCutSourceKind): string {
  switch (kind) {
    case "mailbox":
      return "boîte";
    case "open":
      return "mail ouvert";
    case "eml":
      return "fichier .eml";
    default:
      return "aucun mail";
  }
}

function zoneRow(name: DigestCutZoneName): string {
  const zone = digestCut.proposal?.zones[name];
  const action = zone?.action ?? "show";
  const rationale = zone?.rationale?.trim();
  const anchors = formatAnchorSummary(zone?.anchors ?? []);
  const pressed = (value: string) => (action === value ? "true" : "false");
  const paintPressed = digestCut.paintZone === name ? "true" : "false";
  const label = ZONE_LABEL[name];
  return `<section class="digest-cut__zone">
    <h4 class="digest-cut__zone-title">${escapeHtml(label)}</h4>
    <p class="digest-cut__zone-anchors dim">Ancres : ${escapeHtml(anchors)}</p>
    ${rationale ? `<p class="digest-cut__zone-rationale">${escapeHtml(rationale)}</p>` : ""}
    <div class="digest-cut__zone-actions" role="group" aria-label="${escapeAttr(`Zone ${label}`)}">
      <button type="button" class="ghost-button digest-cut__zone-btn" data-action="digest-cut-zone" data-zone="${name}" data-zone-action="show" aria-pressed="${pressed("show")}">Afficher</button>
      <button type="button" class="ghost-button digest-cut__zone-btn" data-action="digest-cut-zone" data-zone="${name}" data-zone-action="hide" aria-pressed="${pressed("hide")}">Masquer</button>
      <button type="button" class="ghost-button digest-cut__zone-btn" data-action="digest-cut-zone" data-zone="${name}" data-zone-action="collapse" aria-pressed="${pressed("collapse")}">Replier</button>
      <button type="button" class="ghost-button digest-cut__zone-btn digest-cut__paint-btn" data-action="digest-cut-paint-zone" data-zone="${name}" aria-pressed="${paintPressed}" title="Cliquer dans le mail pour ancrer cette zone">Peindre</button>
    </div>
  </section>`;
}

function previewPane(): string {
  if (digestCut.previewing) return `<p class="dim">Aperçu découpe…</p>`;
  if (digestCut.previewError) {
    return `<p class="digest-bench__warn">${escapeHtml(digestCut.previewError)}</p>`;
  }
  if (digestCut.previewApplicable === false) {
    return `<p class="digest-bench__warn">La découpe ne tient pas sur ce mail : le domaine ou les ancres ne matchent pas. La lecture resterait générique.</p>`;
  }
  if (digestCut.previewApplicable && digestCut.previewHtml) {
    return sanitizeEmailHtml(digestCut.previewHtml).html;
  }
  return `<p class="dim">Lancez l'aperçu pour voir la lecture coupée.</p>`;
}

function threadList(): string {
  if (digestCut.threads.length === 0) return "";
  return digestCut.threads
    .map((thread) => {
      const active = thread.id === digestCut.selectedThreadId ? " digest-bench__hit--active" : "";
      const who = thread.participants[0] ?? "";
      return `<li>
        <button type="button" class="digest-bench__hit${active}" data-action="digest-cut-open-thread" data-thread-id="${escapeAttr(thread.id)}">
          <span class="digest-bench__hit-subject">${escapeHtml(thread.subject || "(sans objet)")}</span>
          <span class="dim">${escapeHtml(who)} · ${escapeHtml(thread.mailbox || "")}</span>
        </button>
      </li>`;
    })
    .join("");
}

function messageList(): string {
  if (!digestCut.selectedThreadId) return "";
  const messages = digestCut.messages
    .map((message) => {
      const active = message.id === digestCut.selectedMessageId ? " digest-bench__hit--active" : "";
      return `<li>
        <button type="button" class="digest-bench__hit${active}" data-action="digest-cut-open-message" data-message-id="${escapeAttr(message.id)}">
          <span>${escapeHtml(message.sender || message.senderEmail)}</span>
          <span class="dim">${escapeHtml(message.receivedAt)}</span>
        </button>
      </li>`;
    })
    .join("");
  return `<h4 class="digest-bench__thread-title">${escapeHtml(digestCut.threadSubject || "(sans objet)")}</h4><ul class="digest-bench__list">${messages}</ul>`;
}

function codeBlock(): string {
  if (!digestCut.showCode) return "";
  const raw = digestCut.html.trim() ? escapeHtml(digestCut.html) : "Aucun HTML chargé.";
  return `<div class="digest-cut__code">
    <label class="digest-bench__label" for="digest-cut-yaml">YAML (secondaire)</label>
    <textarea id="digest-cut-yaml" class="digest-bench__yaml" spellcheck="false">${escapeHtml(digestCut.yaml)}</textarea>
    <p class="digest-bench__fine dim">Code du mail chargé. La lecture rendue est au-dessus. Rien n'est écrit dans le registre de lecture.</p>
    <pre class="digest-cut__source">${raw}</pre>
  </div>`;
}

function paintBar(): string {
  if (!digestCut.html.trim()) return "";
  const pick = digestCut.paintPick;
  const zone = digestCut.paintZone;
  const zoneHint = zone ? ZONE_LABEL[zone] : "aucune";
  return `<div class="digest-cut__paint-bar">
    <p class="digest-bench__fine">Sélection visuelle : activez <strong>Peindre</strong> sur une zone, puis cliquez dans le mail (tables, sections, blocs). Étendre au parent si besoin.</p>
    <p class="digest-cut__paint-status dim">Zone active : ${escapeHtml(zoneHint)}${pick ? ` · sélection : ${escapeHtml(pick.label)}` : ""}</p>
    <div class="digest-cut__actions">
      <button type="button" class="ghost-button" data-action="digest-cut-paint-expand" ${pick ? "" : "disabled"}>Étendre au parent</button>
      <button type="button" class="ghost-button" data-action="digest-cut-paint-assign" data-zone="header" ${pick ? "" : "disabled"}>→ En-tête</button>
      <button type="button" class="ghost-button" data-action="digest-cut-paint-assign" data-zone="body" ${pick ? "" : "disabled"}>→ Corps</button>
      <button type="button" class="ghost-button" data-action="digest-cut-paint-assign" data-zone="footer" ${pick ? "" : "disabled"}>→ Pied</button>
      <button type="button" class="ghost-button" data-action="digest-cut-paint-clear">Effacer sélection</button>
    </div>
  </div>`;
}

export function renderDigestCutPanel(): string {
  const loaded = digestCut.html.trim().length > 0;
  const sanitized = loaded ? sanitizeEmailHtml(digestCut.html).html : "";
  const rendered = loaded
    ? decorateMailHtmlForCut(sanitized)
    : `<p class="dim">Choisissez un mail pour le voir ici.</p>`;
  const status = loaded
    ? `${digestCut.subject || "(sans objet)"} · ${digestCut.senderEmail || "expéditeur inconnu"} · ${sourceLabel(digestCut.sourceKind)}`
    : "Aucun mail chargé. La recherche lit votre boîte ; aucun exemple n'est proposé à votre place.";
  const explanation = digestCut.proposal?.explanationFr?.trim() ?? "";
  const busy = digestCut.proposing ? "disabled" : "";
  const paintClass = digestCut.paintZone ? " digest-cut__mail-source--painting" : "";
  return `<div class="settings-page digest-cut">
    <article class="settings-card surface-sm">
      <h3 class="thread-kicker">Éditeur de découpe</h3>
      <p class="digest-bench__fine dim">Vous choisissez un mail réel. L'assistant propose trois zones, l'explique en français, et vous ajustez sur le rendu. Le code HTML reste replié. Valider une proposition ne l'active pas en lecture. Affiner interroge le modèle local (prompt calibré pour Llama 3.2).</p>
      <div class="digest-cut__pick">
        <label class="digest-bench__label" for="digest-cut-query">Chercher dans la boîte</label>
        <div class="digest-bench__search">
          <input id="digest-cut-query" class="digest-bench__input" type="search" value="${escapeAttr(digestCut.queryDraft)}" placeholder="@domaine #dossier:INBOX" />
          <button type="button" class="primary-button" data-action="digest-cut-search">${digestCut.searching ? "Recherche…" : "Chercher"}</button>
        </div>
        <p class="digest-bench__fine dim">Même barre que le courrier, mode lexical. Prenez un domaine au hasard dans votre boîte, par exemple <code>@exemple.fr</code>.</p>
        <div class="digest-cut__actions">
          <button type="button" class="ghost-button" data-action="digest-cut-open-current">Mail déjà ouvert</button>
          <label class="ghost-button digest-cut__file">Importer un .eml
            <input id="digest-cut-eml" type="file" accept=".eml,message/rfc822" hidden />
          </label>
        </div>
        ${digestCut.searchError ? `<p class="digest-bench__warn">${escapeHtml(digestCut.searchError)}</p>` : ""}
        ${digestCut.threads.length ? `<ul class="digest-bench__list">${threadList()}</ul>` : ""}
        ${messageList()}
      </div>
      <p class="digest-bench__status">${escapeHtml(status)}</p>
      <p class="digest-bench__notice" aria-live="polite">${escapeHtml(digestCut.notice)}</p>
      <div class="digest-cut__actions">
        <button type="button" class="primary-button" data-action="digest-cut-propose" ${busy}>Proposer</button>
        <button type="button" class="ghost-button" data-action="digest-cut-refine" ${busy}>Affiner</button>
        <button type="button" class="ghost-button" data-action="digest-cut-preview">Aperçu</button>
        <button type="button" class="ghost-button" data-action="digest-cut-toggle-code" aria-pressed="${digestCut.showCode ? "true" : "false"}">${digestCut.showCode ? "Masquer le code" : "Voir le code"}</button>
      </div>
      ${explanation ? `<p class="digest-cut__explain">${escapeHtml(explanation)}</p>` : ""}
      ${digestCut.proposal ? `<div class="digest-cut__zones">${zoneRow("header")}${zoneRow("body")}${zoneRow("footer")}</div>` : ""}
      ${paintBar()}
      <div class="digest-cut__preview digest-bench__compare digest-bench__compare--split">
        <section class="digest-bench__pane">
          <h4 class="digest-bench__pane-title">Mail</h4>
          <div class="digest-bench__pane-body mail digest-cut__mail-source${paintClass}" data-digest-cut-mail="1">${rendered}</div>
        </section>
        <section class="digest-bench__pane">
          <h4 class="digest-bench__pane-title">Lecture coupée</h4>
          <div class="digest-bench__pane-body mail">${previewPane()}</div>
        </section>
      </div>
      ${codeBlock()}
    </article>
  </div>`;
}
