import { escapeAttr, escapeHtml } from "../../../ui/sanitize";
import { composeAiBusyKind } from "../../core/composeAiJobs";
import { toneLabelsFr, tones } from "../../core/composeTone";
import { iconSvg } from "../../lib/iconSvg";
import type { Tone } from "../../types";

/**
 * Commandes stables du compositeur.
 * L’éditeur actuel est un textarea Markdown (`data-md`, `data-action`).
 * Une migration TipTap peut lier les mêmes id sans redessiner cette barre :
 * `md:*`, `ai:grammar`, `ai:rewrite`, `ai:shorten`, `ai:replies`, `dictate`.
 */
export type ComposeMdCommand = {
  id: string;
  label: string;
  title: string;
  className: string;
};

export const COMPOSE_MD_GROUPS: readonly (readonly ComposeMdCommand[])[] = [
  [
    { id: "bold", label: "Gras", title: "Gras (Ctrl+B)", className: "compose-tool--bold" },
    { id: "italic", label: "Italique", title: "Italique (Ctrl+I)", className: "compose-tool--italic" },
    { id: "underline", label: "Souligné", title: "Souligné (Ctrl+U)", className: "compose-tool--underline" },
  ],
  [
    { id: "h1", label: "Titre 1", title: "Titre 1 (#)", className: "compose-tool--h1" },
    { id: "h2", label: "Titre 2", title: "Titre 2 (##)", className: "compose-tool--h2" },
    { id: "h3", label: "Titre 3", title: "Titre 3 (###)", className: "compose-tool--h3" },
  ],
  [
    { id: "ul", label: "Puces", title: "Liste à puces", className: "" },
    { id: "ol", label: "Numéros", title: "Liste numérotée", className: "" },
    { id: "link", label: "Lien", title: "Lien (Ctrl+K)", className: "" },
    { id: "image", label: "Image", title: "Image (URL Markdown)", className: "" },
    { id: "table", label: "Tableau", title: "Tableau Markdown", className: "" },
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

export type ComposeToolbarProps = {
  tone: Tone;
  llmJobLabel: string | null;
  micState: string;
  micTitle: string;
  micAria: string;
  rewriteEnabled: boolean;
  grammarEnabled: boolean;
  quickRepliesEnabled: boolean;
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

export function renderComposeToolbar(props: ComposeToolbarProps): string {
  const busy = composeAiBusyKind(props.llmJobLabel);
  const blocked = busy !== null;
  const showAi = props.grammarEnabled || props.rewriteEnabled;

  const mdHtml = COMPOSE_MD_GROUPS.map((group, index) => {
    const buttons = group
      .map(
        (cmd) =>
          `<button type="button" class="ghost-button md-button compose-tool ${cmd.className}" data-md="${escapeAttr(cmd.id)}" data-compose-cmd="md:${escapeAttr(cmd.id)}" title="${escapeAttr(cmd.title)}">${escapeHtml(cmd.label)}</button>`,
      )
      .join("");
    const sep = index > 0 ? `<span class="md-toolbar-sep" aria-hidden="true"></span>` : "";
    return `${sep}${buttons}`;
  }).join("");

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
          title: "Orthographe et formulation — chaque suggestion s’applique une par une",
          extra: ` data-compose-cmd="ai:grammar"`,
          spinning: busy === "grammar",
          blocked,
        })}
      </div>`
    : "";

  const tonesHtml = tones
    .map((tone) => {
      const active = tone === props.tone;
      return `<button type="button" role="radio" class="tone-button${active ? " active" : ""}" data-tone="${escapeAttr(tone)}" aria-checked="${active ? "true" : "false"}" tabindex="${active ? "0" : "-1"}" title="Ton ${escapeAttr(toneLabelsFr[tone])} — réécriture et dictée">${escapeHtml(toneLabelsFr[tone])}</button>`;
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
          title: "Réécrit tout le message dans le ton choisi. La dictée utilise le même ton.",
          extra: ` data-compose-cmd="ai:rewrite"`,
          spinning: busy === "rewrite",
          blocked,
        })}
        ${aiButton({
          action: "compose-ai-rewrite",
          label: "Raccourcir",
          title: "Raccourcit tout le message",
          extra: ` data-rewrite-style="Concise" data-compose-cmd="ai:shorten"`,
          quiet: true,
          spinning: busy === "shorten",
          blocked,
        })}
      </div>`
    : "";

  const aiRow =
    showAi ?
      `<div class="compose-toolbar__row compose-toolbar__row--ai">
        ${correct}
        ${transform}
      </div>`
    : "";

  const recording = props.micState === "recording";
  return `<div class="compose-toolbar" role="region" aria-label="Outils du compositeur">
    <div class="compose-toolbar__row">
      <span class="compose-toolbar__label" id="compose-write-label">Écrire</span>
      <div class="md-toolbar compose-toolbar__tools" role="toolbar" aria-labelledby="compose-write-label">
        ${mdHtml}
      </div>
      ${replies}
      <button type="button" class="mic-button compose-toolbar__dictate ${escapeAttr(props.micState)}" data-action="mic" data-compose-cmd="dictate" title="${escapeAttr(props.micTitle)}" aria-label="${escapeAttr(props.micAria)}" aria-pressed="${recording ? "true" : "false"}">
        <span class="mic-button__ico" aria-hidden="true">${iconSvg("mic")}</span>
        <span class="compose-toolbar__dictate-label">Dicter</span>
      </button>
    </div>
    ${aiRow}
  </div>`;
}
