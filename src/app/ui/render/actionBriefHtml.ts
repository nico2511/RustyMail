import { escapeAttr, escapeHtml } from "../../../ui/sanitize";
import { renderBriefMailItemCard, renderBriefMailViewShell } from "../../ui/briefMailShell";
import type { ActionBriefEvidenceLink, ActionBriefResult } from "../../types";

function briefEvidenceButtons(links: ActionBriefEvidenceLink[]): string {
  if (!links?.length) return "";
  return links
    .map((L) => {
      const tid = String(L.threadId || "").trim();
      if (!tid) return "";
      const lab = L.label?.trim() || "Ouvrir le fil";
      return `<div class="inbox-brief-evidence"><button type="button" class="ghost-button digest-open-thread" data-thread-id="${escapeAttr(tid)}">${escapeHtml(lab)}</button></div>`;
    })
    .join("");
}

export function renderActionBriefHtml(b: ActionBriefResult): string {
  const confPct = Math.max(0, Math.min(100, Math.round(Number(b.confidence ?? 0) * 100)));
  const bucket = escapeHtml(String(b.priorityBucket ?? "—"));
  const mode = escapeHtml(String(b.mode ?? ""));
  const verif = b.verificationRecommended
    ? `<p class="thread-zen-par dim" role="status">Vérification recommandée</p>`
    : "";
  const skills =
    b.executedSkills && b.executedSkills.length ?
      `<p class="thread-zen-par dim inbox-brief-skills">Pipeline : ${escapeHtml(b.executedSkills.join(" → "))}</p>`
    : "";

  const sec = (title: string, inner: string) =>
    `<section class="inbox-brief-section"><div class="thread-kicker">${escapeHtml(title)}</div>${inner}</section>`;

  const changesBody =
    (b.changes || [])
      .map((c) => {
        const ev = briefEvidenceButtons(c.evidenceLinks || []);
        return renderBriefMailItemCard(
          `<p class="thread-zen-par">${escapeHtml(c.summary || "")}</p>${ev}`,
        );
      })
      .join("") || `<p class="thread-zen-par dim">—</p>`;

  const decisionsBody =
    [...(b.decisions || [])]
      .sort((a, d) => Number(a.rank) - Number(d.rank))
      .map((d) => {
        const opts = (d.optionsHint || [])
          .map((o) => `<li>${escapeHtml(o)}</li>`)
          .join("");
        const optsHtml = opts ? `<ul class="thread-zen-list">${opts}</ul>` : "";
        return renderBriefMailItemCard(
          `<p class="thread-zen-par dim">#${escapeHtml(String(d.rank))}</p>
          <p class="thread-zen-par"><strong>${escapeHtml(d.title)}</strong></p>
          ${d.impact ? `<p class="thread-zen-par dim">${escapeHtml(d.impact)}</p>` : ""}
          ${optsHtml}${briefEvidenceButtons(d.evidenceLinks || [])}`,
        );
      })
      .join("") || `<p class="thread-zen-par dim">—</p>`;

  const actionsBody =
    [...(b.recommendedActions || [])]
      .sort((a, x) => Number(a.rank) - Number(x.rank))
      .map((a) => {
        const due = a.suggestedDue ? `<span class="dim"> · ${escapeHtml(a.suggestedDue)}</span>` : "";
        const pr = a.priority ? `<span class="label inbox-brief-prio">${escapeHtml(a.priority)}</span> ` : "";
        return renderBriefMailItemCard(
          `${pr}<p class="thread-zen-par">${escapeHtml(a.action)}</p>
          <p class="thread-zen-par dim">${escapeHtml(a.suggestedOwner || "")}${due}</p>
          ${briefEvidenceButtons(a.evidenceLinks || [])}`,
        );
      })
      .join("") || `<p class="thread-zen-par dim">—</p>`;

  const risksBody =
    (b.risks || [])
      .map((r) => {
        const sev = r.severity ? ` <span class="dim">(${escapeHtml(r.severity)})</span>` : "";
        return renderBriefMailItemCard(
          `<p class="thread-zen-par"><strong>${escapeHtml(r.label)}</strong>${sev}</p>
          ${r.detail ? `<p class="thread-zen-par dim">${escapeHtml(r.detail)}</p>` : ""}
          ${briefEvidenceButtons(r.evidenceLinks || [])}`,
        );
      })
      .join("") || `<p class="thread-zen-par dim">—</p>`;

  const ambBody =
    (b.ambiguities || [])
      .map((a) => {
        return renderBriefMailItemCard(
          `<p class="thread-zen-par"><strong>${escapeHtml(a.question)}</strong></p>
          ${a.whyItMatters ? `<p class="thread-zen-par dim">${escapeHtml(a.whyItMatters)}</p>` : ""}
          ${briefEvidenceButtons(a.evidenceLinks || [])}`,
        );
      })
      .join("") || `<p class="thread-zen-par dim">—</p>`;

  const inner = `
    <p class="thread-zen-par dim inbox-brief-meta">Confiance ${confPct}% · priorité <strong>${bucket}</strong>${mode ? ` · mode ${mode}` : ""}</p>
    ${verif}
    ${sec("Ce qui change", changesBody)}
    ${sec("Décisions", decisionsBody)}
    ${sec("Actions recommandées", actionsBody)}
    ${sec("Risques & engagements", risksBody)}
    ${sec("Ambiguïtés", ambBody)}
    ${skills}`;
  return renderBriefMailViewShell(inner, { kicker: "Brief d’action" });
}
