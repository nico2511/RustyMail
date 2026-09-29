import { escapeAttr, escapeHtml } from "../../../ui/sanitize";
import { sanitizeEmailHtml } from "../../mail/mailEmailHtmlSanitizeCoreRun";
import { digestBench } from "../../mail/digestBenchState";

function roleMark(messageId: string): string {
  const bits: string[] = [];
  if (digestBench.sampleMessageId === messageId) bits.push("échantillon");
  if (digestBench.validationMessageId === messageId) bits.push("validation");
  return bits.length ? ` · ${bits.join(" · ")}` : "";
}

function pane(title: string, body: string): string {
  return `<section class="digest-bench__pane">
    <h4 class="digest-bench__pane-title">${escapeHtml(title)}</h4>
    <div class="digest-bench__pane-body mail">${body}</div>
  </section>`;
}

function comparePanes(rawHtml: string): string {
  const raw = rawHtml.trim()
    ? sanitizeEmailHtml(rawHtml).html
    : `<p class="dim">Pas de HTML.</p>`;
  let cut = `<p class="dim">Lancez l'aperçu sur un message.</p>`;
  if (digestBench.previewing) {
    cut = `<p class="dim">Découpe…</p>`;
  } else if (digestBench.previewError) {
    cut = `<p class="digest-bench__warn">${escapeHtml(digestBench.previewError)}</p>`;
  } else if (digestBench.previewApplicable === false) {
    cut = `<p class="digest-bench__warn">Fixture non applicable : le domaine ou les ancres ne tiennent pas sur ce mail. La lecture resterait générique. Ce n'est pas un échec de la recherche.</p>`;
  } else if (digestBench.previewApplicable && digestBench.previewHtml) {
    cut = sanitizeEmailHtml(digestBench.previewHtml).html;
  }
  const mode = digestBench.compareMode;
  const showRaw = mode === "split" || mode === "raw";
  const showCut = mode === "split" || mode === "cut";
  return `<div class="digest-bench__compare digest-bench__compare--${mode}">
    ${showRaw ? pane("Brut", raw) : ""}
    ${showCut ? pane("Lecture coupée", cut) : ""}
  </div>`;
}

export function renderDigestBenchPanel(): string {
  const selected = digestBench.messages.find((message) => message.id === digestBench.selectedMessageId);
  const threads = digestBench.threads
    .map((thread) => {
      const active = thread.id === digestBench.selectedThreadId ? " digest-bench__hit--active" : "";
      const who = thread.participants[0] ?? "";
      return `<li>
        <button type="button" class="digest-bench__hit${active}" data-action="digest-bench-open-thread" data-thread-id="${escapeAttr(thread.id)}">
          <span class="digest-bench__hit-subject">${escapeHtml(thread.subject || "(sans objet)")}</span>
          <span class="dim">${escapeHtml(who)} · ${escapeHtml(thread.mailbox || "")}</span>
        </button>
      </li>`;
    })
    .join("");
  const messages = digestBench.messages
    .map((message) => {
      const active = message.id === digestBench.selectedMessageId ? " digest-bench__hit--active" : "";
      return `<li class="digest-bench__message${active}">
        <button type="button" class="digest-bench__hit" data-action="digest-bench-open-message" data-message-id="${escapeAttr(message.id)}">
          <span>${escapeHtml(message.sender || message.senderEmail)}</span>
          <span class="dim">${escapeHtml(message.receivedAt)}${escapeHtml(roleMark(message.id))}</span>
        </button>
        <span class="digest-bench__roles">
          <button type="button" class="ghost-button" data-action="digest-bench-sample" data-message-id="${escapeAttr(message.id)}">Échantillon</button>
          <button type="button" class="ghost-button" data-action="digest-bench-validation" data-message-id="${escapeAttr(message.id)}">Validation</button>
        </span>
      </li>`;
    })
    .join("");
  const reading = digestBench.readingEnabled
    ? `Lecture locale active${digestBench.readingFixtureId ? ` (${digestBench.readingFixtureId})` : ""}.`
    : "Lecture locale inactive. Accepter ne l'allume pas.";
  const accepted = digestBench.accepted
    ? `Verdict du banc : acceptée${digestBench.acceptedFixtureId ? ` (${digestBench.acceptedFixtureId})` : ""}.`
    : "Pas de fixture acceptée pour le banc.";
  const comparePressed = (mode: string) => (digestBench.compareMode === mode ? "true" : "false");

  return `<div class="settings-page digest-bench">
    <article class="settings-card surface-sm">
      <h3 class="thread-kicker settings-form-kicker settings-card__title">Banc d'essai fixtures</h3>
      <p class="dim settings-card__lead">
        Même recherche que la boîte (mode lexical) : <code>@domaine</code>, texte sujet et corps, <code>#dossier:</code>.
        Ouvrir un mail applique la fixture candidate. Le domaine seul ne réécrit pas.
        Accepter enregistre le verdict du banc. Cela n'active pas la lecture.
      </p>
      <p class="digest-bench__status">${escapeHtml(accepted)} ${escapeHtml(reading)}</p>
      <p class="digest-bench__notice" aria-live="polite">${digestBench.notice ? escapeHtml(digestBench.notice) : ""}</p>
      <div class="digest-bench__layout">
        <div class="digest-bench__col">
          <label class="digest-bench__label" for="digest-bench-query">Recherche</label>
          <div class="digest-bench__search">
            <input id="digest-bench-query" class="digest-bench__input" type="search" value="${escapeAttr(digestBench.queryDraft)}" placeholder="@deblock.com reçu #dossier:INBOX" />
            <button type="button" class="primary-button" data-action="digest-bench-search">${digestBench.searching ? "Recherche…" : "Chercher"}</button>
          </div>
          ${digestBench.searchError ? `<p class="digest-bench__warn">${escapeHtml(digestBench.searchError)}</p>` : ""}
          <ul class="digest-bench__list">${threads || `<li class="dim">Aucun résultat pour l'instant.</li>`}</ul>
          ${
            digestBench.selectedThreadId
              ? `<h4 class="digest-bench__thread-title">${escapeHtml(digestBench.threadSubject || "(sans objet)")}</h4><ul class="digest-bench__list">${messages}</ul>`
              : ""
          }
        </div>
        <div class="digest-bench__col">
          <label class="digest-bench__label" for="digest-bench-yaml">Fixture candidate (YAML)</label>
          <textarea id="digest-bench-yaml" class="digest-bench__yaml" rows="16" spellcheck="false">${escapeHtml(digestBench.yaml)}</textarea>
          <div class="settings-card__actions digest-bench__actions">
            <button type="button" class="primary-button" data-action="digest-bench-preview">Aperçu</button>
            <button type="button" class="ghost-button" data-action="digest-bench-tweak">Ajuster</button>
            <button type="button" class="ghost-button" data-action="digest-bench-accept">Accepter</button>
            <button type="button" class="ghost-button" data-action="digest-bench-reject">Refuser</button>
          </div>
          <div class="settings-card__actions digest-bench__actions">
            <button type="button" class="ghost-button" data-action="digest-bench-enable">Activer en lecture</button>
            <button type="button" class="ghost-button" data-action="digest-bench-disable">Désactiver la lecture locale</button>
          </div>
          <p class="dim digest-bench__fine">
            « Activer en lecture » installe la dernière fixture <strong>acceptée</strong>, pas le texte encore en cours d'édition.
            Désactivé par défaut. Aucun modèle n'est appelé.
          </p>
          <div class="digest-bench__toggles" role="group" aria-label="Comparaison">
            <button type="button" class="ghost-button" data-action="digest-bench-compare" data-compare="split" aria-pressed="${comparePressed("split")}">Côte à côte</button>
            <button type="button" class="ghost-button" data-action="digest-bench-compare" data-compare="raw" aria-pressed="${comparePressed("raw")}">Brut</button>
            <button type="button" class="ghost-button" data-action="digest-bench-compare" data-compare="cut" aria-pressed="${comparePressed("cut")}">Lecture coupée</button>
          </div>
          ${comparePanes(selected?.html ?? "")}
        </div>
      </div>
    </article>
  </div>`;
}
