/**
 * Assistant compte, préréglages domaine (alignés sur `rustymail_infrastructure::mail_autoconfig`) et gabarit formulaire.
 * Voir aussi le commentaire SYNC-PRESETS dans `mail_autoconfig.rs`.
 */

import { emailDomain } from "./emailUtil";
import { escapeAttr, escapeHtml } from "./ui/sanitize";

export { emailDomain };
export { escapeAttr };

export type SecurityMode = "Tls" | "StartTls";

export type MailAuthKind = "password" | "oauthGoogle" | "oauthMicrosoft";

export type Account = {
  id: string;
  displayName: string;
  email: string;
  imap: { host: string; port: number; security: SecurityMode; allowInvalidTls: boolean };
  smtp: { host: string; port: number; security: SecurityMode; allowInvalidTls: boolean };
  /** Présent après chargement depuis Tauri / SQLite (camelCase). */
  authKind?: MailAuthKind;
};

export type MailPreset = {
  imapHost: string;
  imapPort: number;
  imapSecurity: SecurityMode;
  smtpHost: string;
  smtpPort: number;
  smtpSecurity: SecurityMode;
};

/** SYNC-PRESETS rust: `discover_mail_servers` builtin map — garder les mêmes hôtes / ports */
export const domainPresets: Record<string, MailPreset> = {
  "gmail.com": {
    imapHost: "imap.gmail.com",
    imapPort: 993,
    imapSecurity: "Tls",
    smtpHost: "smtp.gmail.com",
    smtpPort: 587,
    smtpSecurity: "StartTls",
  },
  "googlemail.com": {
    imapHost: "imap.gmail.com",
    imapPort: 993,
    imapSecurity: "Tls",
    smtpHost: "smtp.gmail.com",
    smtpPort: 587,
    smtpSecurity: "StartTls",
  },
  "outlook.com": {
    imapHost: "outlook.office365.com",
    imapPort: 993,
    imapSecurity: "Tls",
    smtpHost: "smtp.office365.com",
    smtpPort: 587,
    smtpSecurity: "StartTls",
  },
  "hotmail.com": {
    imapHost: "outlook.office365.com",
    imapPort: 993,
    imapSecurity: "Tls",
    smtpHost: "smtp.office365.com",
    smtpPort: 587,
    smtpSecurity: "StartTls",
  },
  "hotmail.fr": {
    imapHost: "outlook.office365.com",
    imapPort: 993,
    imapSecurity: "Tls",
    smtpHost: "smtp.office365.com",
    smtpPort: 587,
    smtpSecurity: "StartTls",
  },
  "hotmail.co.uk": {
    imapHost: "outlook.office365.com",
    imapPort: 993,
    imapSecurity: "Tls",
    smtpHost: "smtp.office365.com",
    smtpPort: 587,
    smtpSecurity: "StartTls",
  },
  "live.com": {
    imapHost: "outlook.office365.com",
    imapPort: 993,
    imapSecurity: "Tls",
    smtpHost: "smtp.office365.com",
    smtpPort: 587,
    smtpSecurity: "StartTls",
  },
  "live.fr": {
    imapHost: "outlook.office365.com",
    imapPort: 993,
    imapSecurity: "Tls",
    smtpHost: "smtp.office365.com",
    smtpPort: 587,
    smtpSecurity: "StartTls",
  },
  "msn.com": {
    imapHost: "outlook.office365.com",
    imapPort: 993,
    imapSecurity: "Tls",
    smtpHost: "smtp.office365.com",
    smtpPort: 587,
    smtpSecurity: "StartTls",
  },
  "office365.com": {
    imapHost: "outlook.office365.com",
    imapPort: 993,
    imapSecurity: "Tls",
    smtpHost: "smtp.office365.com",
    smtpPort: 587,
    smtpSecurity: "StartTls",
  },
  "outlook.fr": {
    imapHost: "outlook.office365.com",
    imapPort: 993,
    imapSecurity: "Tls",
    smtpHost: "smtp.office365.com",
    smtpPort: 587,
    smtpSecurity: "StartTls",
  },
  "icloud.com": {
    imapHost: "imap.mail.me.com",
    imapPort: 993,
    imapSecurity: "Tls",
    smtpHost: "smtp.mail.me.com",
    smtpPort: 587,
    smtpSecurity: "StartTls",
  },
  "me.com": {
    imapHost: "imap.mail.me.com",
    imapPort: 993,
    imapSecurity: "Tls",
    smtpHost: "smtp.mail.me.com",
    smtpPort: 587,
    smtpSecurity: "StartTls",
  },
  "mac.com": {
    imapHost: "imap.mail.me.com",
    imapPort: 993,
    imapSecurity: "Tls",
    smtpHost: "smtp.mail.me.com",
    smtpPort: 587,
    smtpSecurity: "StartTls",
  },
  "yahoo.com": {
    imapHost: "imap.mail.yahoo.com",
    imapPort: 993,
    imapSecurity: "Tls",
    smtpHost: "smtp.mail.yahoo.com",
    smtpPort: 587,
    smtpSecurity: "StartTls",
  },
  "yahoo.fr": {
    imapHost: "imap.mail.yahoo.com",
    imapPort: 993,
    imapSecurity: "Tls",
    smtpHost: "smtp.mail.yahoo.com",
    smtpPort: 587,
    smtpSecurity: "StartTls",
  },
  "ymail.com": {
    imapHost: "imap.mail.yahoo.com",
    imapPort: 993,
    imapSecurity: "Tls",
    smtpHost: "smtp.mail.yahoo.com",
    smtpPort: 587,
    smtpSecurity: "StartTls",
  },
  "yahoo.co.uk": {
    imapHost: "imap.mail.yahoo.com",
    imapPort: 993,
    imapSecurity: "Tls",
    smtpHost: "smtp.mail.yahoo.com",
    smtpPort: 587,
    smtpSecurity: "StartTls",
  },
};

export const accountFieldTouched = {
  serverFields: false,
};

export type DiscoverMailServersResult = {
  imapHost: string;
  imapPort: number;
  imapSecurity: SecurityMode;
  imapAllowInvalidTls: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecurity: SecurityMode;
  smtpAllowInvalidTls: boolean;
  source: string;
  sourceLabel: string;
};

export function serverFieldSelectors(): string[] {
  return ["#imap-host", "#imap-port", "#imap-security", "#smtp-host", "#smtp-port", "#smtp-security"];
}

/** Préréglage local si le domaine est connu ; sans toucher les champs DOM (le prochain render applique les valeurs). */
export function applyDomainPresetIfSafe(
  email: string,
  callbacks?: {
    onApplied?: (domain: string, preset: MailPreset) => void;
  },
): MailPreset | null {
  if (accountFieldTouched.serverFields) return null;
  const domain = emailDomain(email);
  if (!domain) return null;
  const preset = domainPresets[domain];
  if (!preset) return null;
  callbacks?.onApplied?.(domain, preset);
  return preset;
}

export function serverSidesFromPreset(preset: MailPreset): {
  imap: Account["imap"];
  smtp: Account["smtp"];
} {
  return {
    imap: {
      host: preset.imapHost,
      port: preset.imapPort,
      security: preset.imapSecurity,
      allowInvalidTls: false,
    },
    smtp: {
      host: preset.smtpHost,
      port: preset.smtpPort,
      security: preset.smtpSecurity,
      allowInvalidTls: false,
    },
  };
}

export function serverSidesFromDiscovery(result: DiscoverMailServersResult): {
  imap: Account["imap"];
  smtp: Account["smtp"];
} {
  return {
    imap: {
      host: result.imapHost,
      port: result.imapPort,
      security: result.imapSecurity,
      allowInvalidTls: result.imapAllowInvalidTls,
    },
    smtp: {
      host: result.smtpHost,
      port: result.smtpPort,
      security: result.smtpSecurity,
      allowInvalidTls: result.smtpAllowInvalidTls,
    },
  };
}

export function securityOptionHtml(value: SecurityMode, current: SecurityMode) {
  return `<option value="${value}" ${value === current ? "selected" : ""}>${value === "Tls" ? "TLS" : "STARTTLS"}</option>`;
}

/** Préréglage IMAP/SMTP quand le domaine n’est pas dans `domainPresets` (flux OAuth automatique). */
export function oauthProviderFallbackPreset(authKind: MailAuthKind): MailPreset | null {
  if (authKind === "oauthGoogle") return domainPresets["gmail.com"] ?? null;
  if (authKind === "oauthMicrosoft") return domainPresets["outlook.com"] ?? null;
  return null;
}

export type OAuthAccountWizardPhase = null | "discover" | "save" | "sync" | "error";

const OAUTH_WIZARD_STEP_LABELS: Record<Exclude<OAuthAccountWizardPhase, null | "error">, string> = {
  discover: "Serveurs mail",
  save: "Enregistrement",
  sync: "Synchronisation",
};

export function renderNewAccountOAuthWizardLanding(opts?: {
  googleConfigured?: boolean;
  microsoftConfigured?: boolean;
}): string {
  const googleOk = opts?.googleConfigured !== false;
  const msOk = opts?.microsoftConfigured !== false;
  const oauthHint =
    !googleOk && !msOk ?
      `<p class="dim account-oauth-wizard__hint">Connexion OAuth non configurée pour cette installation — utilisez <strong>IMAP + mot de passe</strong> ou configurez les variables d’environnement (voir documentation développeur).</p>`
    : "";
  return `
    <div class="account-oauth-wizard surface-sm">
      <h2 class="account-oauth-wizard__title">Ajouter un compte</h2>
      <p class="account-oauth-wizard__lead dim">
        Connectez Google ou Microsoft en un clic. RustyMail détecte les serveurs, enregistre le compte et lance la synchronisation.
      </p>
      ${oauthHint}
      <div class="account-oauth-wizard__actions">
        <button type="button" class="primary-button account-oauth-wizard__btn" data-action="oauth-google-connect" ${googleOk ? "" : "disabled title=\"RUSTYMAIL_GOOGLE_OAUTH_CLIENT_ID non défini\""}>
          <span class="account-oauth-wizard__btn-label">Google</span>
          <span class="dim account-oauth-wizard__btn-sub">Gmail · Google Workspace</span>
        </button>
        <button type="button" class="primary-button account-oauth-wizard__btn" data-action="oauth-microsoft-connect" ${msOk ? "" : "disabled title=\"RUSTYMAIL_MICROSOFT_OAUTH_CLIENT_ID non défini\""}>
          <span class="account-oauth-wizard__btn-label">Microsoft</span>
          <span class="dim account-oauth-wizard__btn-sub">Outlook · Office 365 · Hotmail</span>
        </button>
      </div>
      <p class="account-oauth-wizard__alt dim">
        <button type="button" class="link-button" data-action="account-auth-password-mode">Autre fournisseur (IMAP + mot de passe)</button>
      </p>
    </div>`;
}

export function renderOAuthWizardProgress(
  phase: Exclude<OAuthAccountWizardPhase, null | "error">,
  message: string,
  providerLabel: string,
): string {
  const steps: Array<Exclude<OAuthAccountWizardPhase, null | "error">> = ["discover", "save", "sync"];
  const stepIdx = steps.indexOf(phase);
  const stepsHtml = steps
    .map((s, i) => {
      const done = i < stepIdx;
      const active = s === phase;
      const cls = done ? "account-oauth-wizard-step--done" : active ? "account-oauth-wizard-step--active" : "";
      return `<li class="account-oauth-wizard-step ${cls}"><span class="account-oauth-wizard-step__dot" aria-hidden="true"></span>${OAUTH_WIZARD_STEP_LABELS[s]}</li>`;
    })
    .join("");
  return `
    <div class="account-oauth-wizard account-oauth-wizard--progress surface-sm" aria-busy="true">
      <h2 class="account-oauth-wizard__title">Configuration ${providerLabel}</h2>
      <ol class="account-oauth-wizard-steps">${stepsHtml}</ol>
      <p class="account-oauth-wizard__status" role="status">${escapeHtml(message)}</p>
      <p class="dim account-oauth-wizard__hint" style="margin:0;font-size:13px;line-height:1.5">Ne fermez pas cette fenêtre — connexion au navigateur puis retour automatique ici.</p>
    </div>`;
}

export function renderOAuthWizardError(message: string, error: string): string {
  return `
    <div class="account-oauth-wizard account-oauth-wizard--error surface-sm">
      <h2 class="account-oauth-wizard__title">Configuration interrompue</h2>
      <p class="account-oauth-wizard__status" role="alert">${escapeHtml(message)}</p>
      <p class="dim" style="margin:0 0 14px;font-size:13px;line-height:1.55">${escapeHtml(error)}</p>
      <div class="account-oauth-wizard__actions account-oauth-wizard__actions--row">
        <button type="button" class="primary-button" data-action="oauth-wizard-retry">Réessayer</button>
        <button type="button" class="ghost-button" data-action="account-auth-password-mode">Configurer à la main</button>
      </div>
    </div>`;
}

export type AccountFormRenderOpts = {
  /** Texte pied de formulaire si `accountMessage` est vide */
  statusFallbackText: string;
  accountMessage: string;
  isNewAccount: boolean;
  /** Faux pour nouveau compte : champs serveurs dans un `<details>` fermé tant que non ouvert explicitement */
  serversPanelOpen: boolean;
  /** Reprise identité après re-render si les champs existaient encore dans le DOM */
  identityScratch: { displayName: string; email: string } | null | undefined;
  /** Compte déjà présent dans SQLite (mot de passe, suppression). `undefined` = ajout nouveau. */
  persistedAccount?: Account | undefined;
  /** Authentification effective affichée / enregistrée. */
  authKindEffective: MailAuthKind;
  /** Afficher les boutons Google/Microsoft (app Tauri, nouveau compte). */
  showOAuthConnect: boolean;
  /** Après OAuth : e-mail figé jusqu’à l’enregistrement. */
  oauthLockedEmail: string | null;
  /** Assistant OAuth : afficher l’écran d’accueil (Google / Microsoft) au lieu du formulaire complet. */
  showOAuthWizardLanding: boolean;
  /** Phase automatique post-connexion (détection → enregistrement → sync). */
  oauthWizardPhase: OAuthAccountWizardPhase;
  oauthWizardMessage: string;
  oauthWizardError: string | null;
  oauthGoogleConfigured?: boolean;
  oauthMicrosoftConfigured?: boolean;
};

export function renderAccountFormMarkup(account: Account | undefined, opts: AccountFormRenderOpts): string {
  if (opts.showOAuthWizardLanding) {
    return renderNewAccountOAuthWizardLanding({
      googleConfigured: opts.oauthGoogleConfigured,
      microsoftConfigured: opts.oauthMicrosoftConfigured,
    });
  }
  if (opts.oauthWizardPhase && opts.oauthWizardPhase !== "error") {
    const providerLabel =
      opts.authKindEffective === "oauthGoogle" ? "Google"
      : opts.authKindEffective === "oauthMicrosoft" ? "Microsoft"
      : "";
    return renderOAuthWizardProgress(opts.oauthWizardPhase, opts.oauthWizardMessage, providerLabel);
  }
  if (opts.oauthWizardPhase === "error" && opts.oauthWizardError) {
    return renderOAuthWizardError(opts.oauthWizardMessage, opts.oauthWizardError);
  }
  const profEmail = opts.identityScratch?.email ?? account?.email ?? "";
  const profDisplay = opts.identityScratch?.displayName ?? account?.displayName ?? "";

  const persisted = opts.persistedAccount;
  const isOauth = opts.authKindEffective !== "password";
  const emailReadonly = Boolean(opts.oauthLockedEmail);

  const pwdPlaceholder = isOauth
    ? "—"
    : persisted ?
      "Remplir uniquement pour remplacer le mot de passe"
    : "Mot de passe IMAP ou mot de passe d’application";
  const pwdHint = isOauth
    ? `<p class="settings-form-field-hint dim" id="account-password-hint">
        Avec OAuth2, aucun mot de passe IMAP n’est stocké : les jetons sont dans le trousseau du système.
      </p>`
    : persisted ?
    `<p class="settings-form-field-hint dim" id="account-password-hint">
      Si vous ne saisissez <strong class="settings-form-hint-em">rien</strong> dans ce champ et que vous enregistrez,
      nous ne modifions pas le mot de passe : celui qui est déjà stocké dans le trousseau du système (Windows, macOS, etc.) continue d’être utilisé pour IMAP et SMTP.
    </p>`
  : `<p class="settings-form-field-hint dim" id="account-password-hint">
      Obligatoire pour ajouter ce compte. Il est stocké dans le trousseau du système, pas dans le fichier SQLite.
    </p>`;
  const tlsImap = account?.imap.allowInvalidTls ? "checked" : "";
  const tlsSmtp = account?.smtp.allowInvalidTls ? "checked" : "";
  const deleteBtn =
    persisted ?
      `<button type="button" class="ghost-button btn-danger-soft settings-form-btn-delete" data-action="delete-settings-account">Supprimer le compte</button>`
    : "";

  const isNew = opts.isNewAccount;
  const oauthConnected = isNew && isOauth && Boolean(opts.oauthLockedEmail);
  const oauthProviderLabel =
    opts.authKindEffective === "oauthGoogle" ? "Google" : opts.authKindEffective === "oauthMicrosoft" ? "Microsoft" : "";

  const assistantNote =
    oauthConnected ?
      `<div class="settings-oauth-done surface-sm" style="margin:0 0 16px;padding:12px 14px;border-radius:var(--radius-md);max-width:72ch">
        <p style="margin:0 0 8px;font-size:14px;line-height:1.5"><strong>Connexion ${oauthProviderLabel} réussie.</strong></p>
        <p class="dim" style="margin:0;font-size:13px;line-height:1.55">Vérifiez l’identité puis <strong>Enregistrer</strong>, ou attendez la fin de la configuration automatique.</p>
      </div>`
    : isNew && !opts.showOAuthConnect ?
      `<p class="dim account-assistant-lead" style="margin:0 0 16px;line-height:1.55;max-width:68ch;font-size:14px">
          Compte IMAP classique : renseignez l’e-mail et le mot de passe, puis <strong>Enregistrer</strong>.
        </p>`
    : "";

  const n1 = isNew ? "1 · " : "";
  const n2 = isNew && !oauthConnected ? "2 · " : "";
  const n3 = isNew ? (oauthConnected ? "2 · " : "3 · ") : "";

  const serversBlock = `
        <div class="settings-form-section">
          <h3 class="thread-kicker settings-form-kicker">${n3}Réception · IMAP</h3>
          <div class="settings-form-panel">
          <div class="settings-form-row">
            <label class="compose-field-label" for="imap-host">Hôte</label>
            <input class="settings-ctl" id="imap-host" value="${escapeAttr(account?.imap.host ?? "imap.gmail.com")}" placeholder="imap.example.com" autocapitalize="off" autocorrect="off" spellcheck="false" />
          </div>
          <div class="settings-form-duo">
            <div class="settings-form-duo-cell">
              <label class="compose-field-label" for="imap-port">Port</label>
              <input class="settings-ctl" id="imap-port" type="number" min="1" max="65535" value="${account?.imap.port ?? 993}" />
            </div>
            <div class="settings-form-duo-cell">
              <label class="compose-field-label" for="imap-security">Sécurité</label>
              <select class="settings-ctl settings-ctl-select" id="imap-security">
                ${securityOptionHtml("Tls", account?.imap.security ?? "Tls")}
                ${securityOptionHtml("StartTls", account?.imap.security ?? "Tls")}
              </select>
            </div>
          </div>
          <label class="settings-form-check" for="imap-allow-invalid-tls">
            <input id="imap-allow-invalid-tls" type="checkbox" ${tlsImap} />
            <span class="settings-form-check-text"><span class="settings-form-check-title">TLS non vérifié</span><span class="dim settings-form-check-sub">Autoriser certificats non approuvés (laboratoire / proxy)</span></span>
          </label>
        </div></div>

        <div class="settings-form-section">
          <h3 class="thread-kicker settings-form-kicker">Envoi · SMTP</h3>
          <div class="settings-form-panel">
          <div class="settings-form-row">
            <label class="compose-field-label" for="smtp-host">Hôte</label>
            <input class="settings-ctl" id="smtp-host" value="${escapeAttr(account?.smtp.host ?? "smtp.gmail.com")}" placeholder="smtp.example.com" autocapitalize="off" autocorrect="off" spellcheck="false" />
          </div>
          <div class="settings-form-duo">
            <div class="settings-form-duo-cell">
              <label class="compose-field-label" for="smtp-port">Port</label>
              <input class="settings-ctl" id="smtp-port" type="number" min="1" max="65535" value="${account?.smtp.port ?? 587}" />
            </div>
            <div class="settings-form-duo-cell">
              <label class="compose-field-label" for="smtp-security">Sécurité</label>
              <select class="settings-ctl settings-ctl-select" id="smtp-security">
                ${securityOptionHtml("StartTls", account?.smtp.security ?? "StartTls")}
                ${securityOptionHtml("Tls", account?.smtp.security ?? "StartTls")}
              </select>
            </div>
          </div>
          <label class="settings-form-check" for="smtp-allow-invalid-tls">
            <input id="smtp-allow-invalid-tls" type="checkbox" ${tlsSmtp} />
            <span class="settings-form-check-text"><span class="settings-form-check-title">TLS non vérifié</span><span class="dim settings-form-check-sub">Autoriser certificats non approuvés (laboratoire / proxy)</span></span>
          </label>
        </div></div>
  `;

  const serversWrapped =
    isNew && !opts.serversPanelOpen ?
      `
      <details class="settings-account-server-details surface-sm accounts-server-details-muted">
        <summary class="account-server-summary">Afficher ou modifier les serveurs IMAP / SMTP…</summary>
        <div class="account-server-details-body">
          ${serversBlock}
        </div>
      </details>`
    : `
      ${isNew ?
        `
      <div class="settings-form-section">
        <h3 class="thread-kicker settings-form-kicker kicker-muted">${n3}Serveurs (avancé)</h3>
        <p class="dim" style="margin:0 0 10px;font-size:13px;line-height:1.5;max-width:68ch">
          Paramètres remplis automatiquement — ouvrez pour les ajuster pour un domaine ou un pare-feu spécifique.
        </p>
      </div>`
      : ""}
      ${serversBlock}`;

  return `
    <div class="settings-account-form">
      ${assistantNote}

      <div class="settings-form-section">
        <h3 class="thread-kicker settings-form-kicker">${n1}Identité</h3>
        <div class="settings-form-panel">
          <div class="settings-form-row">
            <label class="compose-field-label" for="account-display-name">Nom affiché</label>
            <input class="settings-ctl" id="account-display-name" autocomplete="name" value="${escapeAttr(profDisplay)}" placeholder="Sophie Martin" />
          </div>
          <div class="settings-form-row">
            <label class="compose-field-label" for="account-email">Adresse e-mail</label>
            <input class="settings-ctl" id="account-email" type="email" autocomplete="username email" value="${escapeAttr(profEmail)}" placeholder="vous@example.com" ${emailReadonly ? 'readonly aria-readonly="true"' : ""} />
          </div>
          ${
            isOauth ?
              `<p class="dim" style="margin:0 0 0 14px;font-size:13px">Mode <strong>${opts.authKindEffective === "oauthGoogle" ? "Google OAuth2" : "Microsoft OAuth2"}</strong></p>`
            : ""
          }
          <div class="settings-form-row account-detect-actions">
            <button type="button" class="ghost-button" data-action="discover-mail-servers">Détecter les serveurs</button>
            ${
              isNew ?
                `<button type="button" class="ghost-button" data-action="account-toggle-servers" title="Afficher les champs technique IMAP/SMTP">
                   ${opts.serversPanelOpen ? "Replier les serveurs" : "Afficher les serveurs"}
                </button>`
              : ""
            }
          </div>
        </div>
      </div>


      ${
        isOauth && !oauthConnected ?
          `<div class="settings-form-section">
        <h3 class="thread-kicker settings-form-kicker">${n2}Authentification</h3>
        <div class="settings-form-panel">
          <p class="dim" style="margin:0;line-height:1.55;font-size:14px;padding:11px 14px;max-width:72ch">
            Mode OAuth2 : aucun mot de passe IMAP n’est requis.
          </p>
        </div>
      </div>`
        : !isOauth ?
      `<div class="settings-form-section">
        <h3 class="thread-kicker settings-form-kicker">${n2}Mot de passe</h3>
        <div class="settings-form-panel">
          <div class="settings-form-row settings-form-row--stack">
            <label class="compose-field-label" for="account-password">Mot de passe</label>
            <div class="settings-form-field-stack">
              <input class="settings-ctl" id="account-password" type="password" autocomplete="${persisted ? "current-password" : "new-password"}" placeholder="${escapeAttr(pwdPlaceholder)}" aria-describedby="account-password-hint" />
              ${pwdHint}
            </div>
          </div>
        </div>
      </div>`
        : ""
      }

      ${serversWrapped}

      <footer class="settings-form-footer">
        <div class="settings-form-actions">
          <button type="button" class="primary-button settings-form-btn-primary" data-action="save-account">Enregistrer</button>
          <button type="button" class="ghost-button" data-action="sync-inbox" title="Synchroniser tous les dossiers IMAP de ce compte (sous-dossiers inclus)">Synchroniser tout</button>
          ${deleteBtn}
        </div>
        <p class="settings-form-status dim">${opts.accountMessage || opts.statusFallbackText}</p>
      </footer>
    </div>
  `;
}
