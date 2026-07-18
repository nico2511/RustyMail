/** Parsing / affichage des dates dans la liste de fils. */

/** Parse `received_at` SQLite / ISO ; retourne null si la valeur est déjà un libellé court non ISO. */
export function parseThreadListActivityDate(raw: string): Date | null {
  const t = raw.trim();
  if (!t) return null;
  let ms = Date.parse(t);
  if (!Number.isFinite(ms) && /^\d{4}-\d{2}-\d{2}$/.test(t)) {
    ms = Date.parse(`${t}T12:00:00Z`);
  }
  return Number.isFinite(ms) ? new Date(ms) : null;
}

/** Infobulle : date complète lisible (fuseau local navigateur). */
export function threadListActivityTooltip(raw: string): string {
  const trimmed = raw.trim();
  const d = parseThreadListActivityDate(trimmed);
  if (!d) return trimmed;
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZoneName: "short",
    }).format(d);
  } catch {
    return trimmed;
  }
}

/** Colonne étroite : dernière modif + date de création (liste Sauvés). */
export function savedDraftDatesColumnSnippet(
  createdIso: string | undefined,
  updatedIso: string | undefined,
): {
  line1: string;
  line2: string;
  tip: string;
} {
  const upd = parseThreadListActivityDate(updatedIso ?? "");
  const cre = parseThreadListActivityDate(createdIso ?? "");
  const line1 = upd
    ? new Intl.DateTimeFormat("fr-FR", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(upd)
    : "";
  let line2 = "";
  if (cre) {
    const creOpts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
    if (cre.getFullYear() !== new Date().getFullYear()) creOpts.year = "2-digit";
    line2 = `créé ${new Intl.DateTimeFormat("fr-FR", creOpts).format(cre)}`;
  }
  const tips: string[] = [];
  if (createdIso?.trim()) tips.push(`Création : ${threadListActivityTooltip(createdIso.trim())}`);
  if (updatedIso?.trim()) tips.push(`Dernière modif : ${threadListActivityTooltip(updatedIso.trim())}`);
  return { line1, line2, tip: tips.length ? tips.join(" · ") : line1 || line2 };
}

/** Affichage liste : relatif / court plutôt que ISO brut. */
export function formatFriendlyThreadListDate(raw: string, nowArg?: Date): string {
  const trimmed = raw.trim();
  const d = parseThreadListActivityDate(trimmed);
  if (!d) return trimmed;

  const now = nowArg ?? new Date();
  const startOfLocalDay = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

  const dDay = startOfLocalDay(d);
  const nDay = startOfLocalDay(now);
  const diffDays = Math.round((nDay - dDay) / 86400000);

  const timeFmt = new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  try {
    if (diffDays === 0) return timeFmt.format(d);

    if (diffDays === 1) return `Hier, ${timeFmt.format(d)}`;

    if (diffDays >= 2 && diffDays <= 6) {
      return new Intl.DateTimeFormat("fr-FR", {
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(d);
    }

    if (diffDays < 0) {
      return new Intl.DateTimeFormat("fr-FR", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(d);
    }

    if (d.getFullYear() === now.getFullYear()) {
      return new Intl.DateTimeFormat("fr-FR", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(d);
    }

    return new Intl.DateTimeFormat("fr-FR", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);
  } catch {
    return trimmed;
  }
}
