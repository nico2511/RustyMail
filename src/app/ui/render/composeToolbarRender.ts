import { escapeAttr, escapeHtml } from "../../../ui/sanitize";
import { composeAiBusyKind } from "../../core/composeAiJobs";
import { toneLabelsFr, tones } from "../../core/composeTone";
import { iconSvg } from "../../lib/iconSvg";
import type { Tone } from "../../types";
import {
  COMPOSE_TRANSLATE_LANGS,
  normalizeComposeTranslateLang,
} from "../../mail/composeTranslateLangs";

/**
 * Commandes stables du compositeur.
 * TipTap les exécute sans redessiner cette barre :
 * `md:*`, `ai:grammar`, `ai:rewrite`, `ai:shorten`, `ai:translate`, `ai:replies`, `dictate`.
 */
export type ComposeMdCommand = {
  id: string;
  label: string;
  title: string;
  className: string;
};

/** Niveaux 1–3 dans un seul contrôle. Un second clic sur le niveau actif revient au paragraphe. */
export const COMPOSE_HEADING_LEVELS: readonly { id: string; label: string; title: string }[] = [
  { id: "h1", label: "1", title: "Titre 1" },
  { id: "h2", label: "2", title: "Titre 2" },
  { id: "h3", label: "3", title: "Titre 3" },
];

export const COMPOSE_MD_GROUPS: readonly (readonly ComposeMdCommand[])[] = [
  [
    { id: "bold", label: "Gras", title: "Gras (Ctrl+B)", className: "compose-tool--bold" },
    { id: "italic", label: "Italique", title: "Italique (Ctrl+I)", className: "compose-tool--italic" },
    { id: "underline", label: "Souligné", title: "Souligné (Ctrl+U)", className: "compose-tool--underline" },
  ],
  [
    { id: "ul", label: "Puces", title: "Liste à puces", className: "" },
    { id: "ol", label: "Numéros", title: "Liste numérotée", className: "" },
    { id: "link", label: "Lien", title: "Lien (Ctrl+K)", className: "" },
    { id: "image", label: "Image", title: "Image", className: "" },
  ],
  [
    { id: "code", label: "Code", title: "Code", className: "compose-tool--code" },
    { id: "quote", label: "Citation", title: "Citation", className: "" },
  ],
  [
    { id: "undo", label: "Annuler", title: "Annuler", className: "" },
    { id: "redo", label: "Refaire", title: "Refaire", className: "" },
  ],
];

const COMPOSE_TABLE_EDIT_CMDS: readonly ComposeMdCommand[] = [
  { id: "table-add-row", label: "+L", title: "Ajouter une ligne (curseur dans le tableau)", className: "compose-tool--table-edit" },
  { id: "table-add-col", label: "+C", title: "Ajouter une colonne (curseur dans le tableau)", className: "compose-tool--table-edit" },
  { id: "table-del-row", label: "−L", title: "Supprimer la ligne courante", className: "compose-tool--table-edit" },
  { id: "table-del-col", label: "−C", title: "Supprimer la colonne courante", className: "compose-tool--table-edit" },
  { id: "table-del", label: "✕T", title: "Supprimer le tableau", className: "compose-tool--table-edit compose-tool--table-del" },
];

export type ComposeToolbarProps = {
  tone: Tone;
  llmJobLabel: string | null;
  micState: string;
  micTitle: string;
  micAria: string;
  rewriteEnabled: boolean;
  grammarEnabled: boolean;
  quickRepliesEnabled: boolean;
  translateEnabled: boolean;
  /** Langue préselectionnée (langue mère des prefs). */
  translateLang: string;
};

function aiButton(opts: {
  action: string;
  label: string;
  title: string;
  extra?: string;
  quiet?: boolean;
  spinning: boolean;
  blocked: boolean;
}): string {
  const title = opts.spinning
    ? `${opts.title} — en cours`
    : opts.blocked
      ? `${opts.title} — une autre action IA est en cours`
      : opts.title;
  const classes = `compose-toolbar__go${opts.quiet ? " compose-toolbar__go--quiet" : ""}${opts.spinning ? " is-busy" : ""}`;
  return `<button type="button" class="${classes}" data-action="${escapeAttr(opts.action)}"${opts.extra ?? ""} title="${escapeAttr(title)}"${
    opts.blocked ? " disabled" : ""
  } aria-busy="${opts.spinning ? "true" : "false"}">${
    opts.spinning ? `<span class="spinner spinner--tiny" aria-hidden="true"></span>` : ""
  }<span>${escapeHtml(opts.label)}</span></button>`;
}

function renderMdButton(cmd: ComposeMdCommand): string {
  return `<button type="button" class="ghost-button md-button compose-tool ${cmd.className}" data-md="${escapeAttr(cmd.id)}" data-compose-cmd="md:${escapeAttr(cmd.id)}" title="${escapeAttr(cmd.title)}">${escapeHtml(cmd.label)}</button>`;
}

function renderHeadingGroup(): string {
  const levels = COMPOSE_HEADING_LEVELS.map(
    (level) =>
      `<button type="button" class="ghost-button md-button compose-tool compose-heading-group__level" data-md="${escapeAttr(level.id)}" data-compose-cmd="md:${escapeAttr(level.id)}" title="${escapeAttr(level.title)}" aria-label="${escapeAttr(level.title)}" aria-pressed="false">${escapeHtml(level.label)}</button>`,
  ).join("");
  return `<div class="compose-heading-group" role="group" aria-label="Titre"><span class="compose-heading-group__name">Titre</span>${levels}</div>`;
}

function renderTableGroup(): string {
  const insert = `<button type="button" class="ghost-button md-button compose-tool compose-table-group__insert" data-md="table" data-compose-cmd="md:table" title="Insérer un tableau (choisir lignes × colonnes)">Tableau</button>`;
  const edits = COMPOSE_TABLE_EDIT_CMDS.map(
    (cmd) =>
      `<button type="button" class="ghost-button md-button compose-tool compose-table-group__edit ${cmd.className}" data-md="${escapeAttr(cmd.id)}" data-compose-cmd="md:${escapeAttr(cmd.id)}" title="${escapeAttr(cmd.title)}" aria-label="${escapeAttr(cmd.title)}">${escapeHtml(cmd.label)}</button>`,
  ).join("");
  return `<div class="compose-table-group" role="group" aria-label="Tableau">${insert}<span class="compose-table-group__sep" aria-hidden="true"></span>${edits}</div>`;
}

export function renderComposeToolbar(props: ComposeToolbarProps): string {
  const busy = composeAiBusyKind(props.llmJobLabel);
  const blocked = busy !== null;

  const mdChunks = [
    COMPOSE_MD_GROUPS[0]!.map(renderMdButton).join(""),
    renderHeadingGroup(),
    COMPOSE_MD_GROUPS[1]!.map(renderMdButton).join("") + renderTableGroup(),
    ...COMPOSE_MD_GROUPS.slice(2).map((group) => group.map(renderMdButton).join("")),
  ];
  const mdHtml = mdChunks
    .map((chunk, index) => `${index > 0 ? `<span class="md-toolbar-sep" aria-hidden="true"></span>` : ""}${chunk}`)
    .join("");

  const replies = props.quickRepliesEnabled
    ? aiButton({
        action: "llm-quick-replies-compose",
        label: "Réponses",
        title: "Insère une suggestion de réponse en tête du message",
        extra: ` data-compose-cmd="ai:replies"`,
        quiet: true,
        spinning: busy === "replies",
        blocked,
      })
    : "";

  const correct = props.grammarEnabled
    ? `<div class="compose-toolbar__cluster">
        <span class="compose-toolbar__label" id="compose-correct-label">Corriger</span>
        ${aiButton({
          action: "compose-ai-grammar",
          label: "Correction",
          title: "Orthographe de tout le brouillon. Pour une zone : sélectionnez puis clic droit → Corriger la sélection.",
          extra: ` data-compose-cmd="ai:grammar"`,
          spinning: busy === "grammar",
          blocked,
        })}
      </div>`
    : "";

  const tonesHtml = tones
    .map((tone) => {
      const active = tone === props.tone;
      return `<button type="button" role="radio" class="tone-button${active ? " active" : ""}" data-tone="${escapeAttr(tone)}" aria-checked="${active ? "true" : "false"}" tabindex="${active ? "0" : "-1"}" title="Réécrire tout de suite en ton ${escapeAttr(toneLabelsFr[tone])} (dictée aussi)">${escapeHtml(toneLabelsFr[tone])}</button>`;
    })
    .join("");

  const transform = props.rewriteEnabled
    ? `<div class="compose-toolbar__cluster">
        <span class="compose-toolbar__label" id="compose-transform-label">Transformer</span>
        <div class="compose-toolbar__tones" role="radiogroup" aria-label="Ton du message">
          ${tonesHtml}
        </div>
        ${aiButton({
          action: "compose-ai-rewrite-selected-tone",
          label: "Réécrire",
          title: "Réécrit tout le message dans le ton choisi. Pour une zone : sélection + clic droit.",
          extra: ` data-compose-cmd="ai:rewrite"`,
          spinning: busy === "rewrite",
          blocked,
        })}
        ${aiButton({
          action: "compose-ai-rewrite",
          label: "Raccourcir",
          title: "Raccourcit tout le message. Pour une zone : sélection + clic droit.",
          extra: ` data-rewrite-style="Concise" data-compose-cmd="ai:shorten"`,
          quiet: true,
          spinning: busy === "shorten",
          blocked,
        })}
      </div>`
    : "";

  const mother = normalizeComposeTranslateLang(props.translateLang);
  const langOptions = COMPOSE_TRANSLATE_LANGS.map(
    (l) =>
      `<option value="${escapeAttr(l.code)}"${l.code === mother ? " selected" : ""}>${escapeHtml(l.label)}</option>`,
  ).join("");
  const translate = props.translateEnabled
    ? `<div class="compose-toolbar__cluster compose-toolbar__cluster--translate">
        <span class="compose-toolbar__label" id="compose-translate-label">Traduire</span>
        <select id="compose-translate-lang" class="compose-toolbar__lang" aria-labelledby="compose-translate-label" title="Langue cible (défaut : langue mère)">
          ${langOptions}
        </select>
        ${aiButton({
          action: "compose-ai-translate",
          label: "Traduire",
          title: "Traduit tout le message vers la langue choisie. Pour une zone : sélection + clic droit.",
          extra: ` data-compose-cmd="ai:translate"`,
          spinning: busy === "translate",
          blocked,
        })}
      </div>`
    : "";

  const recording = props.micState === "recording";
  const aiRow = `<div class="compose-toolbar__row compose-toolbar__row--ai">
      ${correct}
      ${transform}
      ${translate}
      <div class="compose-toolbar__trailing">
        ${replies}
        <button type="button" class="mic-button compose-toolbar__dictate ${escapeAttr(props.micState)}" data-action="mic" data-compose-cmd="dictate" title="${escapeAttr(props.micTitle)}" aria-label="${escapeAttr(props.micAria)}" aria-pressed="${recording ? "true" : "false"}">
          <span class="mic-button__ico" aria-hidden="true">${iconSvg("mic")}</span>
          <span class="compose-toolbar__dictate-label">Dicter</span>
        </button>
      </div>
    </div>`;

  return `<div class="compose-toolbar" role="region" aria-label="Outils du compositeur">
    <div class="compose-toolbar__row">
      <span class="compose-toolbar__label" id="compose-write-label">Écrire</span>
      <div class="md-toolbar compose-toolbar__tools" role="toolbar" aria-labelledby="compose-write-label">
        ${mdHtml}
      </div>
    </div>
    ${aiRow}
  </div>`;
}
