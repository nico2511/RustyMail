import { escapeAttr, escapeHtml } from "../../../ui/sanitize";
import { emphasizeReadingHtml, supplementReadingFacts } from "../../mail/emphasizeReading";
import { sanitizeEmailHtml } from "../../mail/mailEmailHtmlSanitizeCoreRun";
import { decorateMailHtmlForCut } from "../../mail/digestCutPaint";
import { checkSummaryFr } from "../../mail/digestCutValidate";
import {
  digestCut,
  formatAnchorSummary,
  type DigestCutSourceKind,
  type DigestCutZoneAction,
  type DigestCutZoneName,
} from "../../mail/digestCutState";

const ZONE_LABEL: Record<DigestCutZoneName, string> = {
  header: "En-tête",
  body: "Corps",
  footer: "Pied",
};

const ZONE_COLOR: Record<DigestCutZoneName, string> = {
  header: "header",
  body: "body",
  footer: "footer",
};

const ACTION_LABEL: Record<DigestCutZoneAction, string> = {
  show: "Affiché",
  hide: "Masqué",
  collapse: "Replié",
};

function sourceLabel(kind: DigestCutSourceKind): string {
  switch (kind) {
    case "mailbox":
      return "depuis la boîte";
    case "open":
      return "mail déjà ouvert";
    case "eml":
      return "fichier .eml";
    default:
      return "";
  }
}

function currentStep(): 1 | 2 | 3 {
  if (!digestCut.html.trim()) return 1;
  if (!digestCut.proposal) return 2;
  return 3;
}

function stepsNav(active: 1 | 2 | 3): string {
  const items: Array<{ n: 1 | 2 | 3; label: string; hint: string }> = [
    { n: 1, label: "Choisir", hint: "Un mail réel" },
    { n: 2, label: "Repérer", hint: "Signal vs bruit" },
    { n: 3, label: "Lire", hint: "Version claire" },
  ];
  return `<ol class="digest-cut__steps" aria-label="Étapes pour rendre un mail lisible">
    ${items
      .map((item) => {
        const state =
          item.n === active ? "is-active" : item.n < active ? "is-done" : "is-todo";
        return `<li class="digest-cut__step ${state}">
          <span class="digest-cut__step-num" aria-hidden="true">${item.n}</span>
          <span class="digest-cut__step-text">
            <strong>${escapeHtml(item.label)}</strong>
            <small>${escapeHtml(item.hint)}</small>
          </span>
        </li>`;
      })
      .join("")}
  </ol>`;
}

function zoneCheckBadge(name: DigestCutZoneName): string {
  const check = digestCut.zoneChecks[name];
  if (!check) return "";
  const label = checkSummaryFr(check);
  return `<span class="digest-cut__check digest-cut__check--${check.status}" title="${escapeAttr(check.message)}">${escapeHtml(label)}</span>`;
}

function anchorRemoveList(name: DigestCutZoneName): string {
  const anchors = digestCut.proposal?.zones[name].anchors ?? [];
  if (!anchors.length) return "";
  return `<ul class="digest-cut__anchor-list">${anchors
    .map((anchor, index) => {
      const label =
        [anchor.selector, anchor.classContains, anchor.index != null ? `#${anchor.index}` : ""]
          .filter((part) => part != null && String(part).trim() !== "")
          .join(" · ") || "repère";
      return `<li><span>${escapeHtml(label)}</span><button type="button" class="ghost-button" data-action="digest-cut-anchor-remove" data-zone="${name}" data-anchor-index="${index}">Retirer</button></li>`;
    })
    .join("")}</ul>`;
}

function zoneRow(name: DigestCutZoneName): string {
  const zone = digestCut.proposal?.zones[name];
  const action = zone?.action ?? "show";
  const rationale = zone?.rationale?.trim();
  const anchors = formatAnchorSummary(zone?.anchors ?? []);
  const pressed = (value: string) => (action === value ? "true" : "false");
  const paintPressed = digestCut.paintZone === name ? "true" : "false";
  const label = ZONE_LABEL[name];
  const color = ZONE_COLOR[name];
  const check = digestCut.zoneChecks[name];
  return `<section class="digest-cut__zone digest-cut__zone--${color}">
    <div class="digest-cut__zone-head">
      <h4 class="digest-cut__zone-title">
        <span class="digest-cut__zone-swatch" aria-hidden="true"></span>
        ${escapeHtml(label)}
        <span class="digest-cut__zone-state dim">${escapeHtml(ACTION_LABEL[action])}</span>
        ${zoneCheckBadge(name)}
      </h4>
    </div>
    ${rationale ? `<p class="digest-cut__zone-rationale">${escapeHtml(rationale)}</p>` : ""}
    ${
      check
        ? `<p class="digest-cut__zone-check-msg dim">${escapeHtml(check.message)}</p>`
        : `<p class="digest-cut__zone-anchors dim" title="Repères techniques dans le HTML">Repères : ${escapeHtml(anchors)}</p>`
    }
    ${anchorRemoveList(name)}
    <div class="digest-cut__zone-actions" role="group" aria-label="${escapeAttr(`Zone ${label}`)}">
      <button type="button" class="ghost-button digest-cut__zone-btn" data-action="digest-cut-zone" data-zone="${name}" data-zone-action="show" aria-pressed="${pressed("show")}">Afficher</button>
      <button type="button" class="ghost-button digest-cut__zone-btn" data-action="digest-cut-zone" data-zone="${name}" data-zone-action="hide" aria-pressed="${pressed("hide")}">Masquer</button>
      <button type="button" class="ghost-button digest-cut__zone-btn" data-action="digest-cut-zone" data-zone="${name}" data-zone-action="collapse" aria-pressed="${pressed("collapse")}">Replier</button>
      <button type="button" class="ghost-button digest-cut__zone-btn digest-cut__paint-btn" data-action="digest-cut-paint-zone" data-zone="${name}" aria-pressed="${paintPressed}" title="Puis cliquez un bloc complet dans le mail">Changer le bloc</button>
    </div>
  </section>`;
}

function previewPane(): string {
  if (digestCut.reformatting) return `<p class="dim">Mise en lisibilité…</p>`;
  if (digestCut.previewing) return `<p class="dim">Calcul de l’aperçu…</p>`;
  if (digestCut.previewError) {
    return `<p class="digest-bench__warn">${escapeHtml(digestCut.previewError)}</p>`;
  }
  if (digestCut.previewApplicable === false && !digestCut.reformattedHtml.trim()) {
    return `<p class="digest-bench__warn">Cette découpe ne colle pas à ce mail (domaine ou repères). La lecture resterait normale.</p>`;
  }
  if (digestCut.previewApplicable && digestCut.previewHtml) {
    const note = digestCut.reformattedHtml.trim()
      ? `<p class="digest-cut__reformat-note dim">Article de lecture — signal en avant.</p>`
      : `<p class="digest-cut__reformat-note dim">Aperçu de la découpe (zones). Puis Rendre lisible.</p>`;
    const safe = emphasizeReadingHtml(sanitizeEmailHtml(digestCut.previewHtml).html);
    const withFacts = digestCut.reformattedHtml.trim()
      ? supplementReadingFacts(safe, digestCut.html)
      : safe;
    return `${note}${withFacts}`;
  }
  return `<p class="digest-cut__empty-hint">Ajustez si besoin, puis <strong>Rendre lisible (IA)</strong>.</p>`;
}

function previewPaneTitle(): string {
  if (digestCut.reformattedHtml.trim()) return "Lecture claire";
  if (digestCut.proposal) return "Découpe";
  return "Lecture claire";
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
  return `<p class="digest-cut__subhead">Messages du fil — choisissez celui à rendre lisible</p>
    <h4 class="digest-bench__thread-title">${escapeHtml(digestCut.threadSubject || "(sans objet)")}</h4>
    <ul class="digest-bench__list">${messages}</ul>`;
}

function codeBlock(): string {
  if (!digestCut.showCode) return "";
  const raw = digestCut.html.trim() ? escapeHtml(digestCut.html) : "Aucun HTML chargé.";
  return `<div class="digest-cut__code">
    <label class="digest-bench__label" for="digest-cut-yaml">Détails techniques (YAML)</label>
    <textarea id="digest-cut-yaml" class="digest-bench__yaml" spellcheck="false">${escapeHtml(digestCut.yaml)}</textarea>
    <p class="digest-bench__fine dim">Réservé au réglage fin. Rien n’est activé en lecture depuis cet écran.</p>
    <pre class="digest-cut__source">${raw}</pre>
  </div>`;
}

function paintBar(): string {
  if (!digestCut.html.trim() || !digestCut.proposal) return "";
  const pick = digestCut.paintPick;
  const zone = digestCut.paintZone;
  const check = digestCut.paintCheck;
  if (!zone && !pick) {
    return `<div class="digest-cut__paint-bar digest-cut__paint-bar--idle">
      <p class="digest-cut__paint-title">Ajuster visuellement</p>
      <p class="digest-bench__fine dim">Glissez sur le mail : le cadre suit le <strong>bloc HTML complet</strong> ou une plage de blocs voisins. <strong>Alt</strong> + flèches : parent, enfant, frère. Puis assignez la zone.</p>
    </div>`;
  }
  const zoneHint = zone ? ZONE_LABEL[zone] : "non assignée";
  const checkLine = check
    ? `<p class="digest-cut__paint-check digest-cut__check--${check.status}">${escapeHtml(checkSummaryFr(check))} — ${escapeHtml(check.message)}</p>`
    : "";
  return `<div class="digest-cut__paint-bar">
    <p class="digest-cut__paint-title">Bloc sélectionné</p>
    <p class="digest-cut__paint-status">Zone : <strong>${escapeHtml(zoneHint)}</strong>${
      pick ? ` · ${escapeHtml(pick.label)}` : " · cliquez dans le mail"
    }</p>
    ${checkLine}
    <div class="digest-cut__actions digest-cut__actions--size">
      <button type="button" class="primary-button digest-cut__size-btn" data-action="digest-cut-paint-expand" ${pick ? "" : "disabled"} title="Inclure le bloc parent">Plus grand</button>
      <button type="button" class="primary-button digest-cut__size-btn" data-action="digest-cut-paint-shrink" ${pick ? "" : "disabled"} title="Restreindre au sous-bloc">Plus petit</button>
    </div>
    <div class="digest-cut__actions">
      <button type="button" class="ghost-button" data-action="digest-cut-paint-assign" data-zone="header" ${pick ? "" : "disabled"}>→ En-tête</button>
      <button type="button" class="ghost-button" data-action="digest-cut-paint-assign" data-zone="body" ${pick ? "" : "disabled"}>→ Corps</button>
      <button type="button" class="ghost-button" data-action="digest-cut-paint-assign" data-zone="footer" ${pick ? "" : "disabled"}>→ Pied</button>
      <button type="button" class="ghost-button" data-action="digest-cut-paint-clear">Annuler</button>
    </div>
  </div>`;
}

function pickSection(loaded: boolean): string {
  const summary = loaded
    ? `<div class="digest-cut__mail-chip">
        <strong>${escapeHtml(digestCut.subject || "(sans objet)")}</strong>
        <span class="dim">${escapeHtml(digestCut.senderEmail || "expéditeur inconnu")}${
          sourceLabel(digestCut.sourceKind) ? ` · ${escapeHtml(sourceLabel(digestCut.sourceKind))}` : ""
        }</span>
      </div>`
    : `<p class="digest-cut__empty-hint">Pas encore de mail. Cherchez un domaine de votre boîte, reprenez le mail ouvert, ou importez un <code>.eml</code>.</p>`;

  return `<section class="digest-cut__card" aria-labelledby="digest-cut-step1">
    <header class="digest-cut__card-head">
      <h4 id="digest-cut-step1" class="digest-cut__card-title"><span class="digest-cut__card-n">1</span> Choisir un mail</h4>
      ${loaded ? `<span class="digest-cut__badge digest-cut__badge--ok">Prêt</span>` : `<span class="digest-cut__badge">En attente</span>`}
    </header>
    ${summary}
    <label class="digest-bench__label" for="digest-cut-query">Chercher dans la boîte</label>
    <div class="digest-bench__search">
      <input id="digest-cut-query" class="digest-bench__input" type="search" value="${escapeAttr(digestCut.queryDraft)}" placeholder="@exemple.fr" />
      <button type="button" class="primary-button" data-action="digest-cut-search">${digestCut.searching ? "Recherche…" : "Chercher"}</button>
    </div>
    <p class="digest-bench__fine dim">Ex. <code>@exemple.fr</code> — tous les dossiers du compte. Puis cliquez un résultat.</p>
    <div class="digest-cut__actions">
      <button type="button" class="ghost-button" data-action="digest-cut-open-current">Utiliser le mail déjà ouvert</button>
      <label class="ghost-button digest-cut__file">Importer un .eml
        <input id="digest-cut-eml" type="file" accept=".eml,message/rfc822" hidden />
      </label>
    </div>
    ${digestCut.searchError ? `<p class="digest-bench__warn">${escapeHtml(digestCut.searchError)}</p>` : ""}
    ${digestCut.threads.length ? `<p class="digest-cut__subhead">Résultats — ouvrez un fil</p><ul class="digest-bench__list">${threadList()}</ul>` : ""}
    ${messageList()}
  </section>`;
}

function proposeSection(loaded: boolean): string {
  const busy = digestCut.proposing || digestCut.reformatting ? "disabled" : "";
  const ready = Boolean(digestCut.proposal);
  return `<section class="digest-cut__card${loaded ? "" : " digest-cut__card--disabled"}" aria-labelledby="digest-cut-step2">
    <header class="digest-cut__card-head">
      <h4 id="digest-cut-step2" class="digest-cut__card-title"><span class="digest-cut__card-n">2</span> Repérer l’essentiel</h4>
      ${ready ? `<span class="digest-cut__badge digest-cut__badge--ok">Fait</span>` : `<span class="digest-cut__badge">${loaded ? "À faire" : "Bloqué"}</span>`}
    </header>
    <p class="digest-bench__fine">On sépare le <strong>signal</strong> (titre, faits, analyse utile) du <strong>bruit</strong> (pied promo / légal).</p>
    <div class="digest-cut__actions">
      <button type="button" class="primary-button" data-action="digest-cut-propose" ${loaded && !digestCut.proposing && !digestCut.reformatting ? "" : "disabled"} ${busy}>${digestCut.proposing ? "Analyse…" : ready ? "Repérer à nouveau" : "Repérer l’essentiel"}</button>
      <button type="button" class="ghost-button" data-action="digest-cut-refine" ${loaded && ready && !digestCut.proposing && !digestCut.reformatting ? "" : "disabled"} ${busy} title="Le modèle affine la proposition">Affiner</button>
    </div>
    <label class="digest-bench__label" for="digest-cut-feedback">Ce qui ne va pas (optionnel)</label>
    <textarea id="digest-cut-feedback" class="digest-cut__feedback" rows="2" placeholder="Ex. le pied est encore dans le corps">${escapeHtml(digestCut.refineFeedback)}</textarea>
    <p class="digest-bench__fine dim">Rien n’est activé en lecture automatique depuis cet écran.</p>
  </section>`;
}

function adjustSection(): string {
  const hasProposal = Boolean(digestCut.proposal);
  const explanation = digestCut.proposal?.explanationFr?.trim() ?? "";
  const busy = digestCut.proposing || digestCut.reformatting || digestCut.previewing;
  const reformatted = Boolean(digestCut.reformattedHtml.trim());
  return `<section class="digest-cut__card${hasProposal ? "" : " digest-cut__card--disabled"}" aria-labelledby="digest-cut-step3">
    <header class="digest-cut__card-head">
      <h4 id="digest-cut-step3" class="digest-cut__card-title"><span class="digest-cut__card-n">3</span> Lecture claire</h4>
      ${
        reformatted
          ? `<span class="digest-cut__badge digest-cut__badge--ok">Lisible</span>`
          : hasProposal
            ? `<span class="digest-cut__badge digest-cut__badge--ok">Zones prêtes</span>`
            : `<span class="digest-cut__badge">Après l’étape 2</span>`
      }
    </header>
    ${
      hasProposal
        ? `${explanation ? `<p class="digest-cut__explain">${escapeHtml(explanation)}</p>` : ""}
           <div class="digest-cut__legend" aria-hidden="true">
             <span class="digest-cut__legend-item digest-cut__legend-item--header">En-tête</span>
             <span class="digest-cut__legend-item digest-cut__legend-item--body">Corps</span>
             <span class="digest-cut__legend-item digest-cut__legend-item--footer">Pied</span>
           </div>
           <div class="digest-cut__zones">${zoneRow("header")}${zoneRow("body")}${zoneRow("footer")}</div>
           ${paintBar()}
           <div class="digest-cut__actions">
             <button type="button" class="primary-button" data-action="digest-cut-reformat" ${busy ? "disabled" : ""}>${
               digestCut.reformatting ? "Mise en lisibilité…" : reformatted ? "Rendre lisible à nouveau" : "Rendre lisible (IA)"
             }</button>
             ${
               reformatted
                 ? ""
                 : `<button type="button" class="ghost-button" data-action="digest-cut-preview" ${busy ? "disabled" : ""}>${digestCut.previewing ? "Aperçu…" : "Voir la découpe"}</button>`
             }
             <button type="button" class="ghost-button" data-action="digest-cut-zone-studio">${digestCut.zoneStudioOpen ? "Fermer l’éditeur" : "Ajuster les zones en grand"}</button>
             <button type="button" class="ghost-button" data-action="digest-cut-toggle-code" aria-pressed="${digestCut.showCode ? "true" : "false"}">${digestCut.showCode ? "Masquer le code" : "Détails techniques"}</button>
           </div>
           <p class="digest-bench__fine dim">L’IA construit un article : IDs voyants, faits, liens utiles — sans le blabla. Les zones se règlent plus clairement en grand.</p>`
        : `<p class="digest-cut__empty-hint">Après l’étape 2, vous pouvez ajuster puis rendre le mail lisible.</p>`
    }
  </section>`;
}

function zoneStudio(rendered: string, paintClass: string): string {
  if (!digestCut.zoneStudioOpen || !digestCut.proposal) return "";
  return `<div class="modal-backdrop digest-cut-studio" role="presentation">
    <div class="modal surface-elevated digest-cut-studio__panel modal-shell-stop-prop" role="dialog" aria-modal="true" aria-labelledby="digest-cut-studio-title">
      <header class="modal-header">
        <h3 id="digest-cut-studio-title">Ajuster les zones</h3>
        <button type="button" class="ghost-button" data-action="digest-cut-zone-studio">Fermer</button>
      </header>
      <div class="digest-cut-studio__body">
        <div class="digest-cut__mail-frame">
          <div class="digest-cut-studio__mail mail digest-cut__mail-doc digest-cut__mail-source${paintClass}" data-digest-cut-mail="1">${rendered}<div class="digest-cut__overlay" data-digest-cut-overlay="1" hidden></div></div>
        </div>
        <aside class="digest-cut-studio__side">
          <p class="digest-bench__fine">Glissez pour peindre une zone. <strong>Alt</strong> + flèches élargit vers le parent, l’enfant ou le frère.</p>
          <div class="digest-cut__legend" aria-hidden="true">
            <span class="digest-cut__legend-item digest-cut__legend-item--header">En-tête</span>
            <span class="digest-cut__legend-item digest-cut__legend-item--body">Corps</span>
            <span class="digest-cut__legend-item digest-cut__legend-item--footer">Pied</span>
          </div>
          <div class="digest-cut__zones">${zoneRow("header")}${zoneRow("body")}${zoneRow("footer")}</div>
          ${paintBar()}
        </aside>
      </div>
    </div>
  </div>`;
}

export function renderDigestCutPanel(): string {
  const loaded = digestCut.html.trim().length > 0;
  const sanitized = loaded ? sanitizeEmailHtml(digestCut.html).html : "";
  const rendered = loaded
    ? decorateMailHtmlForCut(sanitized)
    : `<p class="digest-cut__empty-hint">Le mail choisi apparaît ici.</p>`;
  const editing = Boolean(digestCut.proposal && loaded);
  const paintClass = editing || digestCut.paintZone ? " digest-cut__mail-source--painting" : "";
  const step = currentStep();
  const studio = digestCut.zoneStudioOpen && editing;
  const mailPane = studio
    ? `<p class="digest-cut__empty-hint">Le mail est ouvert dans l’éditeur de zones. Fermez-le pour revenir à cet aperçu.</p>`
    : rendered;

  return `<div class="settings-page digest-cut">
    <article class="settings-card surface-sm digest-cut__shell">
      <h3 class="thread-kicker">Rendre un mail lisible</h3>
      <p class="digest-cut__lead">Gardez ce qui compte, retirez le bruit. Outil d’essai : ça ne change pas la lecture réelle tant que vous n’activez rien ailleurs.</p>
      ${stepsNav(step)}
      ${digestCut.notice ? `<p class="digest-cut__notice" aria-live="polite">${escapeHtml(digestCut.notice)}</p>` : ""}
      <div class="digest-cut__flow">
        ${pickSection(loaded)}
        ${proposeSection(loaded)}
        ${adjustSection()}
      </div>
      <div class="digest-cut__preview digest-bench__compare digest-bench__compare--split">
        <section class="digest-bench__pane">
          <h4 class="digest-bench__pane-title">Mail d’origine${editing && !studio ? " · glissez pour peindre une zone" : ""}</h4>
          <div class="digest-bench__pane-body">
            ${
              studio
                ? mailPane
                : `<div class="digest-cut__mail-frame">
                    <div class="mail digest-cut__mail-doc digest-cut__mail-source${paintClass}" data-digest-cut-mail="1">${mailPane}<div class="digest-cut__overlay" data-digest-cut-overlay="1" hidden></div></div>
                  </div>`
            }
          </div>
        </section>
        <section class="digest-bench__pane">
          <h4 class="digest-bench__pane-title">${escapeHtml(previewPaneTitle())}</h4>
          <div class="digest-bench__pane-body mail digest-cut__reading">${previewPane()}</div>
        </section>
      </div>
      ${codeBlock()}
    </article>
    ${zoneStudio(rendered, paintClass)}
  </div>`;
}
