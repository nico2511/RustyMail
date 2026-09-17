import {
  renderAccountFormMarkup,
  type Account,
  type MailAuthKind,
} from "../../../accountSetup";
import { t } from "../../../i18n";
import {
  renderSettingsAiHub,
  renderSettingsAiModalBodyWithPrompts,
  renderSettingsAiModalShell,
  settingsAiModalTitle,
  type SettingsAiPanelDeps,
} from "../../../settingsAiPanel";
import { escapeAttr, escapeHtml } from "../../../ui/sanitize";
import { formatNewsletterRuleInput } from "../../lib/newsletterRuleFormat";
import { settingsExplainHtml } from "../../lib/settingsExplainHtml";
import { isTauriRuntime } from "../../lib/tauriRuntime";
import { state } from "../../state";
import type { AddressBookRow, ShortcutRow } from "../../types";
import {
  defaultAccountIdFromPrefs,
  defaultListFilterFromPrefs,
} from "../../mail/accountDefaultPrefs";
import { renderViewNavTrail } from "./listChrome";
import { renderDeps } from "./renderDeps";

function wrapSettingsPage(content: string, columns: 1 | 2 = 1): string {
  const cols = columns === 2 ? " settings-grid--2" : "";
  return `<div class="settings-page"><div class="settings-grid${cols}">${content}</div></div>`;
}

function renderSettingsGeneralPanel(): string {
  const ml = state.appPrefs.general.motherLanguage;
  const globalBook = Boolean(state.appPrefs.general.addressBookGlobalScope);
  const activitySuggestions = state.appPrefs.general.activitySuggestionsEnabled !== false;
  const defaultLf = defaultListFilterFromPrefs();
  const prefAccId = defaultAccountIdFromPrefs() ?? "";
  const accountOptions =
    state.accounts.length ?
      `<option value="" ${!prefAccId ? "selected" : ""}>Premier compte de la liste</option>${state.accounts
        .map((a) => {
          const label = (a.displayName || a.email || a.id).trim();
          return `<option value="${escapeAttr(a.id)}" ${prefAccId === a.id ? "selected" : ""}>${escapeHtml(label)}</option>`;
        })
        .join("")}`
    : `<option value="" selected>— Aucun compte configuré —</option>`;
  return wrapSettingsPage(`
    <div class="settings-card settings-general surface-sm">
      <section class="settings-general-section" aria-labelledby="settings-general-lang-heading">
        <h3 id="settings-general-lang-heading" class="thread-kicker settings-form-kicker">${escapeHtml(t("settings.general.languageHeading"))}</h3>
        ${settingsExplainHtml(t("settings.general.languageExplain"))}
        <div class="settings-form-row">
          <label class="compose-field-label" for="prefs-mother-language">${escapeHtml(t("settings.general.motherLanguage"))}</label>
          <select class="settings-ctl settings-ctl-select" id="prefs-mother-language">
            <option value="fr" ${ml === "fr" ? "selected" : ""}>${escapeHtml(t("settings.general.langFr"))}</option>
            <option value="fr-FR" ${ml === "fr-FR" ? "selected" : ""}>${escapeHtml(t("settings.general.langFrFR"))}</option>
            <option value="en" ${ml === "en" ? "selected" : ""}>${escapeHtml(t("settings.general.langEn"))}</option>
            <option value="en-US" ${ml === "en-US" ? "selected" : ""}>${escapeHtml(t("settings.general.langEnUS"))}</option>
            <option value="pt" ${ml === "pt" ? "selected" : ""}>${escapeHtml(t("settings.general.langPt"))}</option>
            <option value="pt-BR" ${ml === "pt-BR" ? "selected" : ""}>${escapeHtml(t("settings.general.langPtBR"))}</option>
            <option value="es" ${ml === "es" ? "selected" : ""}>${escapeHtml(t("settings.general.langEs"))}</option>
            <option value="de" ${ml === "de" ? "selected" : ""}>${escapeHtml(t("settings.general.langDe"))}</option>
            <option value="it" ${ml === "it" ? "selected" : ""}>${escapeHtml(t("settings.general.langIt"))}</option>
          </select>
        </div>
        <div class="settings-general-option">
          <label class="settings-checkbox settings-general-option__label">
            <input type="checkbox" id="prefs-address-book-global" ${globalBook ? "checked" : ""} />
            <span>${escapeHtml(t("settings.general.globalAddressBook"))}</span>
          </label>
          ${settingsExplainHtml(t("settings.general.globalAddressBookExplain"))}
        </div>
        <div class="settings-general-option">
          <label class="settings-checkbox settings-general-option__label">
            <input type="checkbox" id="prefs-activity-suggestions" ${activitySuggestions ? "checked" : ""} />
            <span>${escapeHtml(t("settings.general.activitySuggestions"))}</span>
          </label>
          ${settingsExplainHtml(t("settings.general.activitySuggestionsExplain"))}
        </div>
      </section>

      <hr class="settings-section-divider" />

      <section class="settings-general-section" aria-labelledby="settings-general-archive-heading">
        <h3 id="settings-general-archive-heading" class="thread-kicker settings-form-kicker">Archivage</h3>
        ${settingsExplainHtml("Hiérarchique : Archive/AAAA/MM-mois (locale app). Plat : dossier serveur (Gmail All Mail, Archive…).")}
        <div class="settings-form-row">
          <label class="compose-field-label" for="prefs-archive-layout">Mode</label>
          <select class="settings-ctl settings-ctl-select" id="prefs-archive-layout">
            <option value="hierarchical" ${(state.appPrefs.general.archiveLayout ?? "hierarchical") === "hierarchical" ? "selected" : ""}>Hiérarchique</option>
            <option value="flat" ${state.appPrefs.general.archiveLayout === "flat" ? "selected" : ""}>Plat (serveur)</option>
          </select>
        </div>
        <div class="settings-form-row">
          <label class="compose-field-label" for="prefs-archive-root">Racine IMAP</label>
          <input class="settings-ctl" id="prefs-archive-root" type="text" value="${escapeAttr(state.appPrefs.general.archiveRoot ?? "Archive")}" />
        </div>
        <div class="settings-form-row">
          <label class="compose-field-label" for="prefs-stale-inbox-days">Inbox stale (jours)</label>
          <input class="settings-ctl" id="prefs-stale-inbox-days" type="number" min="1" max="3650" value="${escapeAttr(String(state.appPrefs.general.staleInboxDays ?? 90))}" />
        </div>
        <div class="settings-form-row">
          <label class="compose-field-label" for="prefs-hybrid-weight">Poids lexical hybride (0–1)</label>
          <input class="settings-ctl" id="prefs-hybrid-weight" type="number" min="0" max="1" step="0.05" value="${escapeAttr(String(state.appPrefs.general.hybridLexicalWeight ?? 0.55))}" />
        </div>
        <div class="settings-general-option">
          <label class="settings-checkbox settings-general-option__label">
            <input type="checkbox" id="prefs-auto-archive-enabled" ${state.appPrefs.general.autoArchiveEnabled ? "checked" : ""} />
            <span>Archivage automatique (règles opt-in)</span>
          </label>
        </div>
      </section>

      <hr class="settings-section-divider" />

      <section class="settings-general-section" aria-labelledby="settings-general-startup-heading">
        <h3 id="settings-general-startup-heading" class="thread-kicker settings-form-kicker">Démarrage</h3>
        ${settingsExplainHtml(
          "Compte mail ouvert par défaut au lancement de RustyMail (utile si vous avez plusieurs comptes IMAP). « Premier compte » = le premier de la liste dans Paramètres → Comptes."
        )}
        <div class="settings-form-row">
          <label class="compose-field-label" for="prefs-default-account">Compte au démarrage</label>
          <select class="settings-ctl settings-ctl-select" id="prefs-default-account">${accountOptions}</select>
        </div>
      </section>

      <hr class="settings-section-divider" />

      <section class="settings-general-section" aria-labelledby="settings-general-inbox-heading">
        <h3 id="settings-general-inbox-heading" class="thread-kicker settings-form-kicker">Liste des mails</h3>
        ${settingsExplainHtml(
          "Filtre affiché par défaut à l’ouverture d’un dossier IMAP (puces Tout, Non lus, Suivis, Priorité, Auto)."
        )}
        <div class="settings-form-row">
          <label class="compose-field-label" for="prefs-default-list-filter">Vue principale par défaut</label>
          <select class="settings-ctl settings-ctl-select" id="prefs-default-list-filter">
            <option value="all" ${defaultLf === "all" ? "selected" : ""}>Tout</option>
            <option value="unread" ${defaultLf === "unread" ? "selected" : ""}>Non lus</option>
            <option value="starred" ${defaultLf === "starred" ? "selected" : ""}>Suivis (tous dossiers)</option>
            <option value="focused" ${defaultLf === "focused" ? "selected" : ""}>Priorité (hors expéditeurs auto)</option>
            <option value="auto" ${defaultLf === "auto" ? "selected" : ""}>Auto (newsletters / expéditeurs auto)</option>
          </select>
        </div>
      </section>

      <div class="settings-form-footer settings-general-footer">
        <button type="button" class="primary-button" data-action="save-general-prefs">${escapeHtml(t("common.save"))}</button>
      </div>
    </div>
  `);
}

function renderSettingsAddressBookPanel(): string {
  const acc = renderDeps().currentAccount();
  const rows = renderDeps().addressBookRowsCache();
  const editing = renderDeps().addressBookEditEmail();
  const editRow = editing ? rows.find((r) => r.email === editing) : undefined;
  return wrapSettingsPage(`
    <div class="settings-card settings-card--span settings-address-book surface-sm">
      <h3 class="thread-kicker">Carnet d’adresses</h3>
      ${settingsExplainHtml("Contacts issus des messages et entrées manuelles. Les favoris remontent en tête des suggestions @.")}
      ${
        !acc
          ? `<p class="dim">Sélectionnez un compte dans la barre latérale.</p>`
          : `
        <div class="settings-form-row" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <input type="search" class="settings-ctl" id="address-book-search" placeholder="Rechercher…" value="${escapeAttr(renderDeps().addressBookListQuery())}" />
          <button type="button" class="ghost-button" data-action="address-book-refresh">Actualiser</button>
          <button type="button" class="ghost-button" data-action="reindex-address-book">Réindexer depuis les mails</button>
          <button type="button" class="ghost-button" data-action="address-book-export-vcard">Exporter vCard</button>
          <button type="button" class="ghost-button" data-action="address-book-import-vcard">Importer vCard</button>
        </div>
        <div class="address-book-table-wrap">
          <table class="address-book-table">
            <thead><tr><th></th><th>Nom</th><th>E-mail</th><th>Notes</th><th></th></tr></thead>
            <tbody>
              ${rows
                .map(
                  (r) => `
                <tr>
                  <td><button type="button" class="address-book-star${r.isFavorite ? " is-on" : ""}" data-action="address-book-toggle-fav" data-email="${escapeAttr(r.email)}" title="Favori">${r.isFavorite ? "★" : "☆"}</button></td>
                  <td>${escapeHtml(r.displayName || "—")}</td>
                  <td class="mono">${escapeHtml(r.email)}</td>
                  <td class="dim">${escapeHtml(r.notes || "")}</td>
                  <td>
                    <button type="button" class="ghost-button" data-action="address-book-edit" data-email="${escapeAttr(r.email)}">Modifier</button>
                    ${r.source === "manual" ? `<button type="button" class="ghost-button" data-action="address-book-delete" data-email="${escapeAttr(r.email)}">Supprimer</button>` : ""}
                  </td>
                </tr>`
                )
                .join("")}
            </tbody>
          </table>
        </div>
        <div class="settings-form-panel">
          <h4>${editing ? "Modifier le contact" : "Nouveau contact manuel"}</h4>
          <div class="settings-form-row"><label>E-mail</label><input class="settings-ctl" id="ab-edit-email" value="${escapeAttr(editRow?.email ?? "")}" ${editing ? "readonly" : ""} /></div>
          <div class="settings-form-row"><label>Nom affiché</label><input class="settings-ctl" id="ab-edit-name" value="${escapeAttr(editRow?.displayName ?? "")}" /></div>
          <div class="settings-form-row"><label>Notes</label><textarea class="settings-ctl" id="ab-edit-notes" rows="2">${escapeHtml(editRow?.notes ?? "")}</textarea></div>
          <label class="settings-checkbox"><input type="checkbox" id="ab-edit-fav" ${editRow?.isFavorite ? "checked" : ""} /> Favori</label>
          <div class="settings-form-footer">
            <button type="button" class="primary-button" data-action="address-book-save">${editing ? "Enregistrer" : "Ajouter"}</button>
            ${editing ? `<button type="button" class="ghost-button" data-action="address-book-cancel-edit">Annuler</button>` : ""}
          </div>
        </div>`
      }
    </div>`);
}

function renderSettingsAiPanel(): string {
  return wrapSettingsPage(`
    <div class="settings-card settings-card--span settings-ai">
      ${renderSettingsAiHub(renderDeps().buildSettingsAiPanelDeps())}
    </div>
  `);
}

export function renderSettingsAiModal(): string {
  const modalId = state.settingsAiModal;
  if (!modalId) return "";
  const deps = renderDeps().buildSettingsAiPanelDeps();
  const title = settingsAiModalTitle(modalId);
  const mother = state.appPrefs.general.motherLanguage?.trim() || "fr";
  const bodyHtml = renderSettingsAiModalBodyWithPrompts(
    modalId,
    deps,
    state.promptCatalog,
    state.promptCatalogLoadError,
    mother,
  );
  return renderSettingsAiModalShell(modalId, title, bodyHtml, deps);
}

function renderSettingsAppearancePanel(): string {
  const ai = state.appPrefs.ai;
  return wrapSettingsPage(`
    <div class="settings-card settings-appearance surface-sm">
      <h2 class="thread-kicker settings-form-kicker" style="margin:0 0 10px">Apparence</h2>
      ${settingsExplainHtml(
        "Réglages visuels de l’application (indépendants de la configuration LLM). Pour l’instant : largeur du panneau droit <strong>Détails</strong> / <strong>Brief d’action</strong> (variable CSS <code>--ai-width</code>)."
      )}
      <div class="settings-form-row">
        <label class="compose-field-label" for="prefs-ai-panel-width">Largeur panneau droit (px)</label>
        <input class="settings-ctl" type="number" id="prefs-ai-panel-width" min="260" max="640" step="10" value="${escapeAttr(String(ai.aiPanelWidthPx))}" autocomplete="off" />
      </div>
      <div class="settings-form-footer" style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border-weak)">
        <button type="button" class="primary-button" data-action="save-ai-prefs">Enregistrer l’apparence</button>
      </div>
    </div>
  `);
}

function renderSettingsAutoSendersPanel(): string {
  const rows = state.newsletterRules
    .map((r) => {
      const label = formatNewsletterRuleInput(r);
      return `
      <div class="settings-newsletter-row surface-sm">
        <code class="settings-newsletter-domain">${escapeHtml(label)}</code>
        <button type="button" class="ghost-button settings-newsletter-remove" data-action="newsletter-domain-remove" data-rule="${escapeAttr(label)}">Supprimer</button>
      </div>`;
    })
    .join("");
  return wrapSettingsPage(`
    <div class="settings-card settings-card--span settings-newsletters surface-sm">
      <h2 class="thread-kicker settings-form-kicker" style="margin:0 0 10px">Expéditeurs automatiques</h2>
      ${settingsExplainHtml(
        "Messages type <strong>noreply</strong>, confirmations, envois marketing ou ESP (<code>*.mailchimp.com</code>, etc.) : définissez ici qui est traité comme <strong>expéditeur automatique</strong>. Une règle peut être un domaine entier (<code>*.exemple.com</code>), ou une adresse précise (<code>order-update@amazon.fr</code>) pour laisser passer le SAV sur le même domaine. Les actions <strong>Répondre</strong> et <strong>Répondre à tous</strong> sont masquées quand le dernier message entrant correspond à une règle."
      )}
      <div class="settings-form-panel settings-newsletter-add">
        <div class="settings-form-row settings-newsletter-add-row">
          <label class="compose-field-label" for="newsletter-domain-input">Règle</label>
          <input class="settings-ctl" type="text" id="newsletter-domain-input" placeholder="noreply@banque.fr · *.sendgrid.net · substack.com" autocomplete="off" autocapitalize="off" spellcheck="false" />
          <button type="button" class="primary-button" data-action="newsletter-domain-add">Ajouter</button>
        </div>
      </div>
      <div class="settings-newsletter-list" aria-label="Règles expéditeurs automatiques">
        ${rows || `<p class="dim settings-account-list-empty">Aucune règle affichée (exemples par défaut en base au premier lancement Tauri).</p>`}
      </div>
    </div>
  `);
}

function renderSettingsAccountsPanel(): string {
  const persisted = renderDeps().settingsDraftProfile();
  const isNew = state.settingsSelectedAccountId === "new";
  const merged = renderDeps().mergedProfileForAccountsForm();
  const scratch = state.accountFormOAuthPrefill ?? renderDeps().accountsFormIdentityScratch();
  const authKindEffective: MailAuthKind = isNew ? state.accountFormAuthKind : (persisted?.authKind ?? "password");
  const wizardBusy = isNew && state.accountOAuthWizardPhase != null && state.accountOAuthWizardPhase !== "error";
  const showOAuthWizardLanding =
    isNew &&
    !state.accountPasswordSetupExpanded &&
    authKindEffective === "password" &&
    !state.oauthLockedEmail &&
    state.accountOAuthWizardPhase == null;
  const hint =
    wizardBusy ?
      "Configuration automatique du compte en cours…"
    : showOAuthWizardLanding ?
      "Choisissez <strong>Google</strong> ou <strong>Microsoft</strong> — le reste est automatique."
    : isNew && state.accountPasswordSetupExpanded ?
      "Compte IMAP classique : e-mail, mot de passe, puis <strong>Enregistrer</strong>."
    : isNew ?
      ""
    : `Modification du compte <strong>${escapeHtml(persisted?.email ?? "")}</strong> — vous pouvez mettre à jour les serveurs sans changer le mot de passe.`;

  const listRows = state.accounts
    .map(
      (a) => `
        <button type="button" class="settings-account-row ${a.id === state.settingsSelectedAccountId ? "settings-account-row--active" : ""}"
          data-action="settings-select-account" data-account-id="${escapeAttr(a.id)}">
          <span class="settings-account-row-main">${escapeHtml(a.displayName || a.email)}</span>
          <span class="settings-account-row-sub dim">${escapeHtml(a.email)}</span>
        </button>`
    )
    .join("");

  return wrapSettingsPage(`
    <div class="settings-card settings-card--span settings-accounts-grid">
      <aside class="settings-account-list" aria-label="Comptes configurés">
        <div class="settings-account-list-title dim">Mes comptes</div>
        ${listRows || `<p class="dim settings-account-list-empty">Aucun compte — ajoutez-en un.</p>`}
        <button type="button" class="ghost-button settings-add-account" data-action="settings-new-account">+ Ajouter un compte</button>
      </aside>
      <div class="settings-account-editor">
        ${hint ? settingsExplainHtml(hint) : ""}
        ${renderAccountFormMarkup(merged, {
          statusFallbackText:
            "Le mot de passe est conservé dans le trousseau du système uniquement · les serveurs sont enregistrés en local (SQLite).",
          accountMessage: state.accountMessage,
          isNewAccount: isNew,
          serversPanelOpen: !isNew || state.accountServersPanelOpen,
          identityScratch: scratch,
          persistedAccount: persisted,
          authKindEffective,
          showOAuthConnect: false,
          oauthLockedEmail: state.oauthLockedEmail,
          showOAuthWizardLanding: Boolean(isTauriRuntime() && showOAuthWizardLanding),
          oauthWizardPhase: state.accountOAuthWizardPhase,
          oauthWizardMessage: state.accountOAuthWizardMessage,
          oauthWizardError: state.accountOAuthWizardError,
          oauthGoogleConfigured: state.oauthGoogleConfigured,
          oauthMicrosoftConfigured: state.oauthMicrosoftConfigured,
        })}
      </div>
    </div>
  `);
}

function renderSettingsShortcutsPanel(): string {
  const mod = navigator.platform.toLowerCase().includes("mac") ? "⌘" : "Ctrl";
  const rows: ShortcutRow[] = [
    { keys: `${mod}+T`, summary: "Recherche globale", detail: "Ouvre la modale de recherche (partout dans l’app). Reappuyer pour fermer.", scope: "Global" },
    {
      keys: `${mod}+F5`,
      summary: "Synchroniser IMAP",
      detail: "Relance la synchronisation du dossier courant (ou des dossiers principaux). F5 seul recharge l’application.",
      scope: "Global",
    },
    { keys: "Échap", summary: "Fermer / retour", detail: "Ferme la modale de recherche, les dialogues, le panneau IA, puis navigation arrière.", scope: "Global" },
    { keys: "/", summary: "Focus recherche", detail: "Affiche la liste et focus la barre de recherche ; ouvre la modale si la barre est absente.", scope: "Global" },
    { keys: "n", summary: "Nouveau message", detail: "Ouvre le compositeur (sans Ctrl — ne pas confondre avec Ctrl+C copier).", scope: "Hors champ texte" },
    { keys: "r", summary: "Répondre", detail: "Répondre au fil ouvert.", scope: "Fil" },
    { keys: "s", summary: "Résumer le fil", detail: "Synthèse IA du fil courant.", scope: "Fil" },
    { keys: "t", summary: "Traduire le fil", detail: "Traduction IA (sans Ctrl — ne pas confondre avec Ctrl+T).", scope: "Fil" },
    { keys: "Tab", summary: "Panneau IA", detail: "Affiche ou masque le panneau latéral IA.", scope: "Fil" },
    { keys: "m", summary: "Aperçu compositeur", detail: "Bascule l’aperçu HTML en rédaction.", scope: "Compositeur" },
    { keys: "Entrée", summary: "Valider la recherche", detail: "Applique critères @, #, texte. Depuis la modale : retour à la liste avec résultats.", scope: "Recherche" },
    { keys: "Tab", summary: "Autocomplétion recherche", detail: "Insère la suggestion @contact ou #dossier / #tag (sans lancer la recherche).", scope: "Recherche" },
    { keys: "Boutons 4 / 5", summary: "Navigation souris", detail: "Précédent / suivant (comme le navigateur), si aucune modale ouverte.", scope: "Global" },
  ];
  const tableRows = rows
    .map(
      (r) => `
        <tr>
          <td class="shortcuts-table__keys"><kbd>${escapeHtml(r.keys)}</kbd></td>
          <td><strong>${escapeHtml(r.summary)}</strong>${r.detail ? `<br><span class="dim">${escapeHtml(r.detail)}</span>` : ""}</td>
          <td class="dim shortcuts-table__scope">${escapeHtml(r.scope ?? "")}</td>
        </tr>`
    )
    .join("");
  return wrapSettingsPage(`
    <article class="settings-card settings-card--span surface-sm">
      <h3 class="thread-kicker">Raccourcis clavier</h3>
      ${settingsExplainHtml("Raccourcis actifs dans l’interface principale. Dans un champ de saisie (ou zone éditable), seuls Échap, Ctrl+T (recherche) et Ctrl+F5 (sync IMAP) s’appliquent. Les raccourcis à une touche ignorent Ctrl, Alt et Cmd (copier, coller, etc.). F5 seul recharge l’application.")}
      <div class="shortcuts-table-wrap">
        <table class="shortcuts-table">
          <thead>
            <tr><th scope="col">Raccourci</th><th scope="col">Action</th><th scope="col">Contexte</th></tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
    </article>
  `);
}

function renderSettingsStoragePanel(): string {
  if (!isTauriRuntime()) {
    return wrapSettingsPage(
      `<article class="settings-card surface-sm"><p class="dim" style="margin:0">Chemins disque : disponibles dans l’application bureau Tauri.</p></article>`
    );
  }
  if (state.settingsPathsLoadError && !state.lastAppPaths) {
    return wrapSettingsPage(`<article class="settings-card surface-sm">
      <p style="margin:0">${escapeHtml(state.settingsPathsLoadError)}</p>
      <button type="button" class="ghost-button settings-storage-refresh" data-action="settings-reload-paths">Recharger les chemins</button>
    </article>`);
  }
  const p = state.lastAppPaths;
  if (!p) {
    return wrapSettingsPage(`<article class="settings-card surface-sm">
      <p class="dim" style="margin:0">Chargement des chemins…</p>
      <button type="button" class="ghost-button settings-storage-refresh" data-action="settings-reload-paths">Rafraîchir</button>
    </article>`);
  }
  const sections: Array<{ heading: string; hint: string; rows: Array<[string, string]> }> = [
    {
      heading: "Courrier & cache local",
      hint: "Messages synchronisés, fils de discussion, pièces jointes indexées.",
      rows: [["Base SQLite", p.dbPath]],
    },
    {
      heading: "Configuration application",
      hint: "Préférences UI, comptes, options IA (hors trousseau).",
      rows: [["Fichier JSON des préférences", p.prefsPath]],
    },
    {
      heading: "Modèles IA sur disque",
      hint: "Téléchargements locaux pour la recherche sémantique et llama-server.",
      rows: [
        ["Embeddings sémantiques (MiniLM ONNX)", p.modelsDir],
        ["Cache modèles LLM (fichiers GGUF)", p.llmModelsDir],
      ],
    },
  ];
  return wrapSettingsPage(`<article class="settings-card settings-card--span surface-sm settings-storage-panel">
    <header class="settings-storage-head">
      <h3 class="thread-kicker settings-form-kicker settings-card__title">Chemins disque</h3>
      <p class="dim settings-card__lead">Emplacements renvoyés par la commande Tauri <code>app_paths</code> (dossier de données de l’app).</p>
      <button type="button" class="ghost-button settings-storage-refresh" data-action="settings-reload-paths">Rafraîchir</button>
    </header>
    ${sections
      .map(
        (sec) => `
    <section class="settings-storage-section" aria-label="${escapeAttr(sec.heading)}">
      <h4 class="settings-storage-section__title">${escapeHtml(sec.heading)}</h4>
      <p class="dim settings-storage-section__hint">${escapeHtml(sec.hint)}</p>
      <div class="settings-storage-paths">
        ${sec.rows
          .map(
            ([label, path]) => `
        <div class="settings-storage-path">
          <div class="settings-storage-path__label">${escapeHtml(label)}</div>
          <code class="settings-path-code">${escapeHtml(path)}</code>
        </div>`
          )
          .join("")}
      </div>
    </section>`
      )
      .join('<hr class="settings-section-divider settings-storage-section-divider" />')}
  </article>`);
}

function renderSettingsDeveloperPanel(): string {
  return wrapSettingsPage(
    `
    <article class="settings-card surface-sm" aria-labelledby="settings-dev-stack-heading">
      <h3 id="settings-dev-stack-heading" class="thread-kicker settings-form-kicker settings-card__title">Pile technique</h3>
      <p class="dim settings-card__lead">Aperçu pour développeurs du client mail RustyMail.</p>
      <ul class="settings-card__list">
        <li><strong>Shell</strong> — Tauri 2, Rust (<code>crates/rustymail-*</code>, binaire <code>src-tauri</code>)</li>
        <li><strong>UI</strong> — Vite, TypeScript, CSS (<code>dompurify</code> pour HTML mail)</li>
        <li><strong>Données</strong> — SQLite + WAL (<code>rusqlite</code>), JSON prefs, trousseau OS</li>
        <li><strong>Mail</strong> — IMAP (<code>async-imap</code>), SMTP (<code>lettre</code>), pièces jointes</li>
        <li><strong>Recherche</strong> — lexical + mode hybrid / sémantique (<code>rustymail-semantic</code>, ONNX MiniLM)</li>
        <li><strong>IA</strong> — OpenRouter ou serveur compatible OpenAI, llama-server, dictée Whisper</li>
      </ul>
      <p class="dim" style="margin:12px 0 0;font-size:12px;line-height:1.5">Détails : <code>README.md</code> et <code>docs/</code>.</p>
    </article>
    <article class="settings-card surface-sm" aria-labelledby="settings-dev-demo-heading">
      <h3 id="settings-dev-demo-heading" class="thread-kicker settings-form-kicker settings-card__title">Données démo (pro fictif)</h3>
      <p class="dim settings-card__lead">
        <strong>Essayer</strong> — crée ou réinitialise <code>playground@demo.rustymail.app</code> (conversations pro en local, IMAP factice) pour tester le <strong>Brief d’action</strong>.
      </p>
      <p class="dim" style="margin:0 0 4px;font-size:13px;line-height:1.55">
        <strong>Passer à un vrai compte</strong> — supprimez la démo puis ajoutez un compte IMAP dans <strong>Paramètres → Comptes</strong>.
      </p>
      <div class="settings-card__actions">
        <button type="button" class="primary-button" data-action="demo-reset-playground">Réinitialiser la boîte démo pro</button>
        <button type="button" class="ghost-button btn-danger-soft" data-action="demo-remove-playground">Supprimer la boîte démo</button>
      </div>
    </article>
  `,
    2
  );
}

export function renderSettings() {
  const tabAccounts = state.settingsTab === "accounts";
  const tabGeneral = state.settingsTab === "general";
  const tabAppearance = state.settingsTab === "appearance";
  const tabAutoSenders = state.settingsTab === "autoSenders";
  const tabAi = state.settingsTab === "ai";
  const tabAddressBook = state.settingsTab === "addressBook";
  const tabStorage = state.settingsTab === "storage";
  const tabShortcuts = state.settingsTab === "shortcuts";
  const tabDeveloper = state.settingsTab === "developer";
  let settingsBody = "";
  switch (state.settingsTab) {
    case "accounts":
      settingsBody = renderSettingsAccountsPanel();
      break;
    case "general":
      settingsBody = renderSettingsGeneralPanel();
      break;
    case "appearance":
      settingsBody = renderSettingsAppearancePanel();
      break;
    case "autoSenders":
      settingsBody = renderSettingsAutoSendersPanel();
      break;
    case "ai":
      settingsBody = renderSettingsAiPanel();
      break;
    case "addressBook":
      settingsBody = renderSettingsAddressBookPanel();
      break;
    case "storage":
      settingsBody = renderSettingsStoragePanel();
      break;
    case "shortcuts":
      settingsBody = renderSettingsShortcutsPanel();
      break;
    case "developer":
      settingsBody = renderSettingsDeveloperPanel();
      break;
    default:
      settingsBody = renderSettingsAccountsPanel();
  }
  return `
    <section class="settings-root compose-view thread-view thread-reading" aria-label="${escapeAttr(t("settings.title"))}">
      <header class="thread-reading-head" aria-label="${escapeAttr(t("settings.title"))}">
        ${renderViewNavTrail()}
        <div class="thread-reading-hero">
          <h1 class="thread-reading-title">${escapeHtml(t("settings.title"))}</h1>
        </div>
      </header>
      <div class="settings-tabbar" role="tablist" aria-label="${escapeAttr(t("settings.sectionsAria"))}">
        <button type="button" role="tab" class="settings-tab ${tabAccounts ? "settings-tab--active" : ""}"
          data-action="settings-tab" data-settings-tab="accounts" aria-selected="${tabAccounts}">${escapeHtml(t("settings.tabs.accounts"))}</button>
        <button type="button" role="tab" class="settings-tab ${tabGeneral ? "settings-tab--active" : ""}"
          data-action="settings-tab" data-settings-tab="general" aria-selected="${tabGeneral}">${escapeHtml(t("settings.tabs.general"))}</button>
        <button type="button" role="tab" class="settings-tab ${tabAppearance ? "settings-tab--active" : ""}"
          data-action="settings-tab" data-settings-tab="appearance" aria-selected="${tabAppearance}">${escapeHtml(t("settings.tabs.appearance"))}</button>
        <button type="button" role="tab" class="settings-tab ${tabAutoSenders ? "settings-tab--active" : ""}"
          data-action="settings-tab" data-settings-tab="autoSenders" aria-selected="${tabAutoSenders}"
          title="noreply, notifications, newsletters, ESP…">${escapeHtml(t("settings.tabs.autoSenders"))}</button>
        <button type="button" role="tab" class="settings-tab ${tabAi ? "settings-tab--active" : ""}"
          data-action="settings-tab" data-settings-tab="ai" aria-selected="${tabAi}">${escapeHtml(t("settings.tabs.ai"))}</button>
        <button type="button" role="tab" class="settings-tab ${tabAddressBook ? "settings-tab--active" : ""}"
          data-action="settings-tab" data-settings-tab="addressBook" aria-selected="${tabAddressBook}">${escapeHtml(t("settings.tabs.addressBook"))}</button>
        <button type="button" role="tab" class="settings-tab ${tabStorage ? "settings-tab--active" : ""}"
          data-action="settings-tab" data-settings-tab="storage" aria-selected="${tabStorage}"
          title="SQLite, JSON, modèles…">${escapeHtml(t("settings.tabs.storage"))}</button>
        <button type="button" role="tab" class="settings-tab ${tabShortcuts ? "settings-tab--active" : ""}"
          data-action="settings-tab" data-settings-tab="shortcuts" aria-selected="${tabShortcuts}"
          title="Raccourcis clavier">${escapeHtml(t("settings.tabs.shortcuts"))}</button>
        <button type="button" role="tab" class="settings-tab ${tabDeveloper ? "settings-tab--active" : ""}"
          data-action="settings-tab" data-settings-tab="developer" aria-selected="${tabDeveloper}"
          title="Dépôt, crates, libs">${escapeHtml(t("settings.tabs.developer"))}</button>
      </div>
      <div class="settings-body">
        ${settingsBody}
      </div>
    </section>
  `;
}