import { escapeHtml } from "../../ui/sanitize";
import { state } from "../state";
import { renderBriefMailItemCard, renderBriefMailViewShell } from "../ui/briefMailShell";

export function buildMailboxBriefGateBannerHtml(): string {
  const hint = state.llmRuntimeStatus?.llmGateHint?.trim();
  const detail =
    hint ||
    "Activez OpenRouter (clé + modèle) ou llama-server (URL + modèle, ou lancement auto avec GGUF) dans Paramètres → IA & dictée.";
  const escaped = escapeHtml(detail);
  const inner = renderBriefMailItemCard(
    `<p class="thread-zen-par">Aucun moteur IA n’est prêt pour générer le brief.</p>
    <p class="thread-zen-par dim">${escaped}</p>
    <p class="thread-zen-par dim">Ouvrez <strong>Paramètres → IA & dictée</strong>, puis cliquez <strong>Rafraîchir</strong>.</p>`,
  );
  return renderBriefMailViewShell(inner, { kicker: "Brief indisponible" });
}

export function buildMailboxBriefErrorBannerHtml(detail: string): string {
  const raw = detail.replace(/\s+/g, " ").trim();
  const jsonLike =
    /json invalide|eof while parsing|expected value|trailing characters/i.test(raw);
  const text = jsonLike
    ? `La réponse du modèle était incomplète ou mal formée (souvent une limite de longueur). Essayez le mode Quick, puis Rafraîchir.`
    : raw.slice(0, 400);
  const inner = renderBriefMailItemCard(
    `<p class="thread-zen-par"><strong>Brief indisponible</strong></p>
    <p class="thread-zen-par dim">${escapeHtml(text)}</p>
    <p class="thread-zen-par dim">Cliquez <strong>Rafraîchir</strong> pour relancer.</p>`,
  );
  return renderBriefMailViewShell(inner, { kicker: "Brief indisponible" });
}
