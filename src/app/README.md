# Front-end (`src/`)

Découpage progressif du monolithe historique. **`src/main.ts`** enregistre les modules puis lance **`boot()`** ; le câblage vit dans **`app/mail/*`** (dont `appModuleRegistry.ts`). Les fichiers **`application.ts`** / **`deps.ts`** n’existent plus sur cette branche.

## Point d’entrée

| Fichier | Rôle |
| ------- | ---- |
| `main.ts` | CSS, `registerAllAppModules()`, `boot()`, file drop Tauri |
| `app/state.ts` | État global `state` |
| `app/dispatch.ts` | `render()` / `registerRender()` |
| `app/dom.ts` | Élément racine `#app` |
| `app/types/` | Types TypeScript |

## Modules extraits (dégraissage en cours)

| Dossier | Contenu |
| ------- | ------- |
| `app/lib/tauriCommand.ts` | `withTimeout`, `tauriErrorMessage`, `safeInvoke` |
| `app/lib/toast.ts` | Notifications toast |
| `app/lib/appUiConstants.ts` | Constantes UI (filtres liste, prompt compte par défaut, vue message) |
| `app/account/discoveredServerSnap.ts` | Snapshot serveurs IMAP/SMTP découverts (formulaire compte) |
| `app/account/accountWizardState.ts` | État assistant OAuth / nouveau compte |
| `app/lib/domForm.ts` | Lecture champs formulaire DOM |
| `app/lib/textFormat.ts` | Liens / texte IA |
| `app/lib/tags.ts` | `initials`, tags bruit |
| `app/lib/iconSvg.ts` | Icônes SVG inline |
| `app/lib/htmlMessage.ts` | Base64 / montage HTML mail |
| `app/modals/promptConfirm.ts` | Modales prompt + confirm |
| `app/core/composeTone.ts` | Tons compositeur |
| `app/core/timeouts.ts` | Constantes délais Tauri / debounces IA & digest |
| `app/lib/tauriRuntime.ts` | Détection runtime Tauri |
| `app/ui/briefMailShell.ts` | Coquille HTML brief dossier |
| `app/mail/mailboxDigest.ts` | Barrel brief d’action dossier |
| `app/mail/mailboxDigestContext.ts` | `initMailboxDigest`, feature flag, gen requêtes |
| `app/mail/mailboxDigestScheduleRun.ts` | Debounce / idle refresh |
| `app/mail/mailboxDigestPanelRun.ts` | Ouvrir / fermer panneau, éligibilité |
| `app/mail/mailboxDigestFetchRun.ts` | `llm_inbox_digest` (invoke + état) |
| `app/mail/mailboxDigestBriefBannerRun.ts` | Bannières brief indisponible / erreur |
| `app/mail/mailboxDigestRenderRun.ts` | Bouton toolbar Brief |
| `app/mail/idleAiCachePrefetch.ts` | Barrel préchargement cache LLM au idle |
| `app/mail/searchQueryContext.ts` | Barrel payload recherche / critères / dossier |
| `app/mail/searchQueryContextActiveRun.ts` | `isSearchActive`, dossier effectif, loader contexte |
| `app/mail/searchQueryContextBuildRun.ts` | `buildSearchQueryFromCurrentState`, compte requête |
| `app/mail/searchThreadsRun.ts` | Exécution `searchThreads()` |
| `app/mail/searchThreadsFocusRun.ts` | Génération requête + focus/sélection champ recherche |
| `app/mail/fetchOpenThread.ts` | `fetchOpenThreadOrNotify()` |
| `app/mail/searchCommitQuery.ts` | Barrel commit barre recherche |
| `app/mail/searchCommitContext.ts` | `registerSearchCommitDeps` |
| `app/mail/searchCommitStructuralRun.ts` | Re-exports parse barre / NL |
| `app/mail/searchCommitStructuralBarRun.ts` | Barrel parse barre → état / snapshots |
| `app/mail/searchStructuralBarApplyRun.ts` | `applyParsedSearchBar*` + merge tag |
| `app/mail/searchStructuralBarSnapshotRun.ts` | Snapshots brouillon, reset filtres NL |
| `app/mail/searchCommitStructuralNlRun.ts` | Application requête NL à l’état |
| `app/mail/searchCommitBarRun.ts` | `commitSearchQuery` + re-exports |
| `app/mail/searchCommitBarQueryRun.ts` | Critères barre, toast résultat, clear, apply query |
| `app/mail/searchNlQueryInvoke.ts` | `llm_search_nl` invoke + application état / fallbacks lexicaux |
| `app/mail/searchNlAssistRun.ts` | Action « recherche NL » (prompt + `llm_search_nl`) |
| `app/mail/searchCommitNlBarRun.ts` | Commit barre recherche via NL (`llm_search_nl` depuis la barre) |
| `app/mail/searchBarUi.ts` | Modale recherche, `syncSearchBarChrome` |
| `app/mail/searchMailboxResolve.ts` | Résolution chemin dossier (liste + recherche) |
| `app/mail/searchAccountResolve.ts` | Email canonique NL, expéditeurs recherche, compte depuis ref barre |
| `app/mail/savedSearchViews.ts` | Barrel vues enregistrées |
| `app/mail/savedSearchViewsHelpers.ts` | Sync brouillon recherche, nom suggéré, règle newsletter |
| `app/mail/savedSearchListRun.ts` | Liste / refresh / marquer vue active vue |
| `app/mail/savedSearchCrudRun.ts` | Barrel vues enregistrées (CRUD) |
| `app/mail/savedSearchSaveRun.ts` | Enregistrer la vue courante |
| `app/mail/savedSearchApplyViewRun.ts` | Appliquer une vue enregistrée |
| `app/mail/savedSearchDeleteRun.ts` | Supprimer une vue |
| `app/mail/savedSearchSuggestionsRun.ts` | Barrel suggestions de vues (activité) |
| `app/mail/savedSearchSuggestionsRefreshRun.ts` | Charger suggestions depuis activité |
| `app/mail/savedSearchSuggestionsActionsRun.ts` | Accepter / ignorer suggestion de vue |
| `app/mail/searchLaunchQueries.ts` | Barrel lancements recherche |
| `app/mail/searchLaunchContext.ts` | `registerSearchLaunchDeps` |
| `app/mail/searchLaunchPresetsRun.ts` | Barrel lancements recherche preset |
| `app/mail/searchLaunchTagPresetRun.ts` | Recherche depuis tag |
| `app/mail/searchLaunchContactPresetRun.ts` | Recherche contact / domaine |
| `app/mail/searchLaunchHashAutocompleteRun.ts` | Barrel hits `#` autocomplete |
| `app/mail/searchLaunchHashHitStateRun.ts` | Appliquer hit → état recherche |
| `app/mail/searchLaunchHashHitApplyRun.ts` | Dispatch hit hash → inbox / recherche |
| `app/mail/searchLaunchHashHitRefreshRun.ts` | Requête barre après hit (si critères) |
| `app/mail/searchLaunchHashHitMailboxRun.ts` | Hit dossier / compte |
| `app/mail/searchLaunchHashHitCriteriaRun.ts` | Hit tag / portée |
| `app/mail/searchLaunchHashHitListRun.ts` | Hit filtre liste / règle NL |
| `app/mail/searchTagCatalog.ts` | `refreshSearchTagCatalog` + `registerSearchTagCatalogDeps()` |
| `app/mail/searchAtAutocompleteWire.ts` | Orchestration câblage `@` / `#` |
| `app/mail/searchAtAutocompleteWireContext.ts` | `registerSearchAtAutocompleteWireDeps` |
| `app/mail/searchAtAutocompleteSearchFieldsRun.ts` | Autocomplete recherche + hash |
| `app/mail/searchAtAutocompleteComposeFieldsRun.ts` | Autocomplete destinataires + mentions |
| `app/mail/searchViewContext.ts` | Critères vue enregistrée / contexte recherche inbox + `registerSearchViewContextDeps()` |
| `app/mail/searchViewBatch.ts` | Barrel actions lot recherche / vue enregistrée |
| `app/mail/searchViewBatchContext.ts` | Job batch + `registerSearchViewBatchDeps` |
| `app/mail/searchViewBulkActionsRun.ts` | Re-export lot recherche / vue |
| `app/mail/searchViewBulkMarkReadRun.ts` | Marquer lus lot (confirm) |
| `app/mail/searchViewBulkMarkReadInvokeRun.ts` | Boucle IMAP marquer lus + barre d’état |
| `app/mail/searchViewBulkPreflightRun.ts` | Garde-fous communs actions lot recherche |
| `app/mail/searchViewBulkArchiveRun.ts` | Archiver lot (confirm + optimiste) |
| `app/mail/searchViewBulkArchiveInvokeRun.ts` | Boucle IMAP archivage + barre d’état |
| `app/mail/searchFluxAffinerRun.ts` | Orchestration Affiner le flux |
| `app/mail/searchFluxAffinerSuggestRun.ts` | LLM + confirmation modale Affiner |
| `app/mail/searchFluxAffinerApplyRun.ts` | Création dossier IMAP + déplacement lot |
| `app/lib/tagFamilyForInvoke.ts` | Normalisation famille tag pour invoke Rust |
| `app/mail/bulkTrashList.ts` | Re-export corbeille lot + registry |
| `app/mail/bulkTrashListDepsRun.ts` | `registerBulkTrashListDeps` |
| `app/mail/bulkTrashListRun.ts` | Orchestration `bulkTrashVisibleThreads` |
| `app/mail/bulkTrashListPreflightRun.ts` | Garde-fous + confirm corbeille (liste) |
| `app/mail/bulkTrashListOptimisticRun.ts` | UI optimiste / rollback corbeille lot |
| `app/mail/bulkTrashListInvokeRun.ts` | Boucle invoke corbeille lot |
| `app/mail/emptyTrashMailbox.ts` | Vider corbeille dossier + `registerEmptyTrashMailboxDeps()` |
| `app/mail/appNavActions.ts` | Facades `goBack` / `navigateToInbox` / fil d’Ariane |
| `app/mail/mailboxManageAction.ts` | Facade CRUD dossier IMAP (modale gérer) |
| `app/mail/mailboxManageActionContext.ts` | `registerMailboxManageActionDeps` |
| `app/mail/mailboxManageKindInvokeRun.ts` | Modales + invoke create/rename/delete/subscribe |
| `app/mail/threadActivityTracking.ts` | Activité fil / recherche (suggestions vues enregistrées) |
| `app/mail/syncInboxAction.ts` | Facade `syncInbox()` |
| `app/mail/syncInboxRun.ts` | Orchestration `syncInbox`, re-exports watch / push refresh |
| `app/mail/syncInboxPrepareRun.ts` | Garde-fous + début/fin progression sync |
| `app/mail/syncInboxStatusRun.ts` | Message statut sync, toasts fin, réindex sémantique |
| `app/mail/syncInboxBatchRun.ts` | Barrel sync IMAP par lots |
| `app/mail/syncInboxTargetsRun.ts` | Cibles dossiers `resolveImapSyncTargets` |
| `app/mail/syncInboxBatchInvokeRun.ts` | Boucles `sync_mailboxes` |
| `app/mail/syncInboxPostSyncRun.ts` | Refresh liste + aliases après sync |
| `app/mail/syncInboxListReloadRun.ts` | Rechargement liste + fil ouvert après sync |
| `app/mail/syncInboxPushRefreshRun.ts` | `refreshUiAfterImapPush` (IDLE) |
| `app/mail/syncInboxImapWatch.ts` | Focus dossier pour watch IMAP |
| `app/mail/composeThreadReply.ts` | Re-export répondre / transférer + `registerComposeThreadReplyDeps` |
| `app/mail/composeThreadReplyDepsRun.ts` | Registry deps, `currentThreadIdForReply`, after-compose hooks |
| `app/mail/composeThreadReplyPrepareRun.ts` | `prepareReply`, `prepareReplyAll`, quote message |
| `app/mail/composeThreadReplyForwardRun.ts` | `prepareForward`, transfert ciblé message |
| `app/mail/openThreadView.ts` | `openThread()` orchestration |
| `app/mail/openThreadViewDepsRun.ts` | `registerOpenThreadDeps` |
| `app/mail/openThreadViewEffectsRun.ts` | Marquer lu à l’ouverture, synthèse auto |
| `app/mail/mailLinkOpen.ts` | Liens mail (normalisation href, ouverture externe) |
| `app/mail/collapsedQuotesGroup.ts` | Regroupement citations repliées (modale fil) |
| `app/mail/downloadAllAttachments.ts` | Téléchargement groupé des PJ d’un message |
| `app/mail/newsletterRulesLoad.ts` | Chargement règles expéditeurs auto |
| `app/mail/threadAutoMail.ts` | Détection fil newsletter / auto |
| `app/mail/composeSendQuickReply.ts` | Envoi quick reply depuis la vue fil |
| `app/mail/sendDraftImapNotice.ts` | Toast notice IMAP après envoi |
| `app/mail/threadAiWireActions.ts` | Facades IA fil (synthèse, traduction, Q&R…) |
| `app/mail/threadAiRun.ts` | Barrel cœurs synthèse/traduction + batch expéditeur |
| `app/mail/threadAiSummarizeCoreRun.ts` | `summarizeThreadCore` (stream + cache) |
| `app/mail/threadAiTranslateCoreRun.ts` | `translateThreadCore` |
| `app/mail/threadAiSenderBatchRun.ts` | Synthèse légère multi-fils (filtre expéditeur) |
| `app/mail/threadAiWireUiRun.ts` | Barrel actions wire UI fil |
| `app/mail/threadAiWireSummarizeRun.ts` | `summarizeThread` (wire) |
| `app/mail/threadAiWireTranslateRun.ts` | Barrel traduction fil/message + cache |
| `app/mail/threadAiWireTranslateThreadRun.ts` | `llmTranslateThreadUi` |
| `app/mail/threadAiWireTranslateMessageRun.ts` | `llmTranslateMessageUi` |
| `app/mail/threadAiWireTranslateCacheRun.ts` | Hydrate traductions message depuis cache |
| `app/mail/threadAiWireQuickReplyRun.ts` | Réponses rapides fil / compose |
| `app/mail/threadAiWireQaDigestRun.ts` | Q&A fil + brief dossier |
| `app/mail/agentWireActions.ts` | Facades agent assist (prepare reply, telemetry, plan) |
| `app/mail/agentPrepareReplyRun.ts` | Barrel assistant réponse |
| `app/mail/agentPrepareReplyStartRun.ts` | `agentPrepareReplyStart` |
| `app/mail/agentPrepareReplyPipelineRun.ts` | Barrel phases LLM assistant réponse |
| `app/mail/agentPrepareReplyExtractRun.ts` | Facts + skills post-extract + cohérence |
| `app/mail/agentPrepareReplyDraftRun.ts` | Stream brouillon + refresh plan |
| `app/mail/agentPrepareReplyContinueRun.ts` | Dispatch `agentPrepareReplyContinue` |
| `app/mail/agentPrepareReplyContinueClarifyRun.ts` | Suite assistant après clarification |
| `app/mail/agentPrepareReplyContinueAnalyzeRun.ts` | Suite assistant après analyse intent |
| `app/mail/agentPrepareReplyContinueSlotsRun.ts` | Suite brouillon → créneaux |
| `app/mail/agentAssistSessionHelpers.ts` | Session assist (payload, télémetrie, merge reco) |
| `app/mail/agentInsertDraftRun.ts` | Insertion brouillon agent dans le composeur |
| `app/mail/agentSchedulingDraftFormat.ts` | Format créneaux dans le corps de réponse |
| `app/mail/composeAiWireActions.ts` | Facades IA compose + envoi split |
| `app/mail/accountsLoadAction.ts` | Ré-export `loadAccountsFromBackend()` |
| `app/mail/settingsWireActions.ts` | Barrel facades paramètres (wire) |
| `app/mail/settingsWireActionsContext.ts` | `registerSettingsWireActionsDeps` |
| `app/mail/settingsWireActionsAccountRun.ts` | Comptes, OAuth, chemins, carnet |
| `app/mail/settingsWireActionsAiRun.ts` | Prefs IA, moteurs LLM, barres progression |
| `app/mail/settingsWireActionsMicRun.ts` | Micro / dictée (util audio) |
| `app/mail/orgFolderWireActions.ts` | Barrel facades org / dossiers / contacts |
| `app/mail/orgFolderWireFacadeViewsRun.ts` | Navigation vues org + refresh rapport |
| `app/mail/orgFolderWireFacadeFolderManagerRun.ts` | Délégation gestionnaire dossiers IMAP |
| `app/mail/orgFolderWireFacadeApplyRun.ts` | Apply org v1/v2, propositions, sync dossier |
| `app/mail/orgV1WireActionsRun.ts` | Barrel actions wire org v1 |
| `app/mail/orgV1WireScanRun.ts` | Scan org v1, retag compte |
| `app/mail/orgV1WireApplyRun.ts` | Appliquer propositions org v1 |
| `app/mail/orgV1WireConfirmRun.ts` | Modales confirm corbeille / dossier org v1 |
| `app/mail/orgV2WireActionsRun.ts` | Barrel actions wire org v2 |
| `app/mail/orgV2WireScanUndoRun.ts` | Scan org v2, undo lot |
| `app/mail/orgV2WireProposalRun.ts` | Propositions org v2 (apply, snooze, dismiss) |
| `app/mail/orgV2WireConfirmRun.ts` | Modales confirm org v2 |
| `app/mail/mailContentWireActions.ts` | Hydratation HTML fil, PJ, lightbox images |
| `app/mail/mailAttachmentActions.ts` | Téléchargement / ouverture PJ (confirm risque) |
| `app/mail/appShellRender.ts` | Barrel rendu DOM shell |
| `app/mail/appShellRenderRefs.ts` | Refs wire (compose, carnet, prefs IA immédiates) |
| `app/mail/appShellRenderContext.ts` | Barrel `registerAppShellWireContext` |
| `app/mail/appShellRenderContextRun.ts` | `registerWireEventsContext` + `registerRender(renderAppShell)` |
| `app/mail/appShellRenderRun.ts` | `renderAppShell` (orchestration) |
| `app/mail/appShellRenderMarkupRun.ts` | Classes CSS shell, largeur panneau IA, HTML inner |
| `app/mail/loadBootDeferredPrefs.ts` | Orchestration prefs différées au boot |
| `app/mail/bootDeferredPrefsFetchRun.ts` | `get_app_prefs`, statuts clés API |
| `app/mail/bootDeferredPrefsListenersRun.ts` | Events bootstrap modèles / prefetch LLM |
| `app/mail/bootDeferredPrefsAfterLoadRun.ts` | Wizard, compte défaut, filtre liste, brief gate |
| `app/mail/appModuleRegistry.ts` | Barrel `registerAllAppModules()` |
| `app/mail/appModuleRegistryRun.ts` | Ordre d’enregistrement des registries au boot |
| `app/mail/appRenderRegistry.ts` | `registerAppRenderDeps()` (barrel) |
| `app/mail/appRenderRegistryPagesRun.ts` | Rendu pages Organiser / Dossiers |
| `app/mail/appRenderRegistryDepsRun.ts` | Barrel `buildAppRenderDeps()` |
| `app/mail/appRenderRegistryDepsShellRun.ts` | Barrel fragment shell RenderDeps |
| `app/mail/appRenderRegistryDepsShellSearchRun.ts` | Recherche / vues enregistrées |
| `app/mail/appRenderRegistryDepsShellListRun.ts` | Liste, org, fil d’Ariane |
| `app/mail/appRenderRegistryDepsShellSettingsRun.ts` | Réglages, contacts, carnet |
| `app/mail/appRenderRegistryDepsThreadRun.ts` | Barrel fragment RenderDeps fil / compose / IA |
| `app/mail/appRenderRegistryDepsThreadMessageRun.ts` | Message fil, participants, HTML |
| `app/mail/appRenderRegistryDepsThreadMessageSecurityRun.ts` | Affichage sécurité mail |
| `app/mail/appRenderRegistryDepsThreadComposeRun.ts` | Labels compositeur + `renderComposer` |
| `app/mail/appRenderRegistryDepsThreadAiRun.ts` | IA fil, agent, compteurs jobs traduction |
| `app/mail/appSearchWireRegistry.ts` | Barrel recherche (list / UI) |
| `app/mail/appSearchWireRegistryListRun.ts` | Liste mail, commit query, corbeille bulk |
| `app/mail/appSearchWireRegistryUiRun.ts` | Barre recherche, vues, batch, lancement, @ autocomplete |
| `app/mail/appThreadWireRegistry.ts` | Barrel fil / boîtes (open / mailbox) |
| `app/mail/appThreadWireRegistryOpenRun.ts` | `registerOpenThreadDeps` + auto-résumé fil |
| `app/mail/appThreadWireRegistryMailboxRun.ts` | Vide corbeille, actions liste, scroll, switch mailbox |
| `app/mail/appComposeWireRegistry.ts` | Barrel compose wire (close / draft / LLM) |
| `app/mail/appComposeWireRegistryCloseRun.ts` | Fermeture compose, pièces jointes, layout, envoi |
| `app/mail/appComposeWireRegistryDraftRun.ts` | Preview, autosave révisions, reply thread |
| `app/mail/appComposeWireRegistryLlmRun.ts` | Annulation file LLM / prefetch idle |
| `app/mail/appAccountOrgWireRegistry.ts` | Compte, réglages, org/dossiers, pile nav |
| `app/mail/appAccountOrgWireRegistryBackgroundRun.ts` | Digest mailbox + prefetch cache IA idle |
| `app/mail/savedDraftOpenRun.ts` | Ouvrir un brouillon enregistré dans le composeur |
| `app/mail/appRuntimeFallbacks.ts` | Fallback `app_status` / `capabilities` hors Tauri |
| `app/mail/appBootRun.ts` | Facade `boot()` |
| `app/mail/appBootRuntimeRun.ts` | Shell UI, status, capabilities, chemins |
| `app/mail/appBootAccountsRun.ts` | Comptes + listener IMAP push + sync initiale |
| `app/mail/appBootMailDataRun.ts` | Mailboxes, liste, brouillons, vues, règles NL |
| `app/mail/appBootLlmDeferRun.ts` | Statut LLM au boot + prefetch différé |
| `app/mail/appShellBindings.ts` | Barrel raccourcis clavier / souris / flush brouillon |
| `app/mail/appShellInputGuards.ts` | Overlays bloquant navigation / raccourcis |
| `app/mail/appShellKeyboardRun.ts` | Barrel `bindKeyboard` |
| `app/mail/appShellKeyboardChordsRun.ts` | Alt+1-9 vues, Ctrl+T recherche, Ctrl+F5 sync |
| `app/mail/appShellKeyboardEscapeRun.ts` | Touche Échap (modales, retour, panneaux) |
| `app/mail/appShellKeyboardPlainShortcutsRun.ts` | Raccourcis une touche (n, r, /, …) |
| `app/mail/appShellMouseNavRun.ts` | Boutons souris retour / avant |
| `app/mail/appShellDraftFlushRun.ts` | Flush révisions brouillon (visibility) |
| `app/mail/mailEmailHtmlSanitize.ts` | Affichage HTML message + barrel sanitize |
| `app/mail/mailEmailHtmlSanitizeCoreRun.ts` | Orchestration DOMPurify + collecte désabonnement |
| `app/mail/mailEmailHtmlSanitizeDomRun.ts` | Styles, liens, images dans doc HTML mail |
| `app/mail/mailEmailHtmlOutlookStripRun.ts` | Nettoyage bruit Outlook / citations |
| `app/mail/idleAiCachePrefetchContext.ts` | `initIdleAiCachePrefetch`, gen / abort |
| `app/mail/idleAiCachePrefetchScheduleRun.ts` | Planification debounce / idle |
| `app/mail/idleAiCachePrefetchPickRun.ts` | Sélection fils + miss cache synthèse/traduction |
| `app/mail/idleAiCachePrefetchPassRun.ts` | Pass synthèse / traduction prefetch |
| `app/mail/mailHtmlShadowHydrate.ts` | Barrel shadow DOM message HTML |
| `app/mail/mailHtmlImageLightboxRun.ts` | Lightbox, résolution `cid:` |
| `app/mail/mailHtmlShadowInnerRun.ts` | Styles + inner HTML shadow |
| `app/mail/mailHtmlShadowHydrateRun.ts` | Hydratation DOM + clics shadow |
| `app/mail/threadMessageSort.ts` | Tri messages fil, dates (`parseMaybeDate`, `dayKey`) |
| `app/mail/threadLangGuessSamples.ts` | Échantillon texte + `normalizeIso639Primary` |
| `app/mail/threadLangGuess.ts` | Barrel heuristiques langue + offres traduction |
| `app/mail/threadLangGuessHints.ts` | Barrel indices mots par langue (ISO) |
| `app/mail/threadLangGuessHintsFr.ts` | Indices FR |
| `app/mail/threadLangGuessHintsEn.ts` | Indices EN |
| `app/mail/threadLangGuessHintsIt.ts` | Indices IT |
| `app/mail/threadLangGuessHintsDe.ts` | Indices DE |
| `app/mail/threadLangGuessHintsEs.ts` | Indices ES |
| `app/mail/threadLangGuessHintsPt.ts` | Indices PT |
| `app/mail/threadLangGuessDetectRun.ts` | Détection ISO639 depuis texte / tags |
| `app/mail/threadLangGuessOfferRun.ts` | `shouldOffer*Translate` |
| `app/mail/threadViewUiHelpers.ts` | Barrel participants fil, zen summary, mode vue message |
| `app/mail/threadViewUiMojibakeRun.ts` | Réparation mojibake UTF-8 + résumé zen texte |
| `app/mail/threadViewUiParticipantsRun.ts` | Expéditeurs uniques, dédup participant, `isOwnSender` |
| `app/mail/threadViewUiRecipientPresenceRun.ts` | Diff To/Cc par message (événements présence) |
| `app/mail/threadViewUiLayoutRun.ts` | Lanes arbre fil, accent expéditeur, cible réponse rapide |
| `app/mail/threadViewUiZenHtmlRun.ts` | Fragments HTML résumé zen (listes / paragraphes) |
| `app/mail/threadViewUiCleanModeRun.ts` | Mode vue message original vs nettoyé |
| `app/mail/mailSecurityDisplay.ts` | Barrel signaux sécurité fil |
| `app/mail/mailSecurityDefaultsRun.ts` | Signaux sécurité par défaut |
| `app/mail/mailSecurityDisplaySignalsRun.ts` | Affichage findings / tier CSS |
| `app/mail/mailSecurityLlmAugmentRun.ts` | Enrichissement LLM async + cache |
| `app/mail/composeFormLabels.ts` | Libellés compose (type brouillon, horodatage révision) |
| `app/mail/settingsAccountsFormState.ts` | Scratch identité formulaire comptes (DOM) |
| `app/mail/settingsRenderHelpers.ts` | Barrel profil comptes + deps panneau IA |
| `app/mail/settingsAccountsFormProfileRun.ts` | `settingsDraftProfile`, merge OAuth/snap |
| `app/mail/settingsSemanticStatsRenderRun.ts` | Bloc HTML stats embeddings sémantiques |
| `app/mail/threadAiStreamDom.ts` | Barrel stream IA fil/QA/agent + assist UI |
| `app/mail/threadAiStreamPaintRun.ts` | RAF peinture résumé / QA / brouillon agent |
| `app/mail/threadAiSummaryScopeRun.ts` | Portée résumé IA vs fil courant |
| `app/mail/threadAgentUiHelpersRun.ts` | Étapes / skills assistant réponse |
| `app/mail/composeComposerBridge.ts` | Ré-exports éditeur compositeur (markdown, preview, PJ, chips) |
| `app/mail/composeMarkdownEditor.ts` | Barrel éditeur markdown compositeur |
| `app/mail/composeMarkdownEditorState.ts` | Corps / canonical / undo stacks |
| `app/mail/composeMarkdownLineEditsRun.ts` | Listes, titres, wrap sélection |
| `app/mail/composeMarkdownToolbarRun.ts` | `applyMarkdownAction` (dispatch) |
| `app/mail/composeMarkdownToolbarUrlPromptRun.ts` | Lien / image (modale URL) |
| `app/mail/composeMarkdownToolbarInlineRun.ts` | Gras, titres, listes, table, code |
| `app/mail/composeDraftPreview.ts` | Aperçu brouillon (`preview_draft`) + debounce |
| `app/mail/composePersistDraft.ts` | Lecture DOM → `state.draft` avant envoi / preview |
| `app/mail/composeRecipientChipsWire.ts` | Chips À/Cc/Cci + `composeChipsHandle` |
| `app/mail/composeHtmlDropzone.ts` | Glisser-déposer PJ (navigateur) |
| `app/mail/composeDraftRevisionAutosave.ts` | Debounce révisions locales + `scheduleDraftRevisionSave` |
| `app/mail/composeDraftPayload.ts` | Normalisation brouillon pour invoke Rust |
| `app/mail/composeDraftSession.ts` | Id session, reset état révisions, contenu « significatif » |
| `app/mail/composeDraftLocalSave.ts` | Barrel révisions / Sauvés / orphelins |
| `app/mail/composeDraftLocalSaveContext.ts` | `registerComposeDraftLocalSaveDeps` |
| `app/mail/composeDraftRevisionSaveRun.ts` | Révision locale + upsert silencieux |
| `app/mail/composeDraftSavedListRun.ts` | Enregistrer dans « Sauvés » |
| `app/mail/composeDraftOrphanBootRun.ts` | Modale sessions brouillon orphelines au boot |
| `app/mail/composeLayoutState.ts` | `syncPreviewOpenFromComposeLayout` |
| `app/mail/newsletterRulesWireRun.ts` | Barrel + `tryHandleNewsletterRulesWire` |
| `app/mail/newsletterRulesDomainWireRun.ts` | Wire règles domaine (paramètres) |
| `app/mail/newsletterRulesMessageWireRun.ts` | Wire règles depuis message fil |
| `app/mail/newsletterRulesRefreshThreadRun.ts` | Refresh fil après changement règle |
| `app/mail/newsletterRulesMatch.ts` | Correspondance expéditeur ↔ règle newsletter |
| `app/mail/composeDraftRevisions.ts` | Liste révisions brouillon |
| `app/mail/composeDraftRevisionDiff.ts` | Barrel diff vs révision |
| `app/mail/composeDraftRevisionDiffContext.ts` | `registerComposeDraftRevisionDiffDeps` |
| `app/mail/composeDraftRevisionDiffAlgoRun.ts` | Myers diff lignes brouillon |
| `app/mail/composeDraftRevisionDiffRun.ts` | `computeDraftDiffAgainstRevision` |
| `app/mail/composeOrphanDraftSession.ts` | Reprise / rejet brouillons orphelins |
| `app/mail/composePickAttachments.ts` | Picker pièces jointes Tauri |
| `app/mail/composeCloseFlow.ts` | Barrel fermeture compositeur |
| `app/mail/composeCloseFlowContext.ts` | `registerComposeCloseFlowDeps` |
| `app/mail/composeCloseDraftClearRun.ts` | `clearDraftSession` |
| `app/mail/composeCloseNavigateRun.ts` | `leaveComposeViewAfterClose` |
| `app/mail/composeCloseDiscardRun.ts` | `discardCurrentDraftSession` |
| `app/mail/composeCloseFinalizeRun.ts` | `finalizeCloseComposeFromUser` |
| `app/mail/composeAttachmentsAction.ts` | Retrait PJ compositeur |
| `app/mail/cycleComposeLayout.ts` | Cycle split / write / preview / historique |
| `app/mail/llmQueueCancel.ts` | Annulation file jobs LLM |
| `app/mail/composeSendDraftRun.ts` | `sendDraft` (validation + orchestration) |
| `app/mail/composeSendDraftPlanRun.ts` | Analyse `plan_split_send` |
| `app/mail/composeSendDraftInvokeRun.ts` | Invoke `send_draft` + post-envoi |
| `app/mail/composeSendDraftFinishRun.ts` | Fin envoi compose, deps registry, notices IMAP split |
| `app/mail/composeSendDraftSplitRun.ts` | `confirmAndExecuteSplitSend` |
| `app/mail/composeViewNavigation.ts` | `enterComposeView` (historique nav) |
| `app/mail/mailListThreadFilter.ts` | Filtres liste (`threadsVisibleInList`, suivi) |
| `app/mail/micAudioUtil.ts` | WAV 16 kHz mono + base64 (dictée) |
| `app/mail/micStreamAccess.ts` | Accès micro navigateur / messages permission |
| `app/mail/composeMicPtt.ts` | Push-to-talk (raccourci, correspondance touche) |
| `app/mail/composeMicUiHints.ts` | Titres micro / aria (compose + Q&R fil) |
| `app/mail/composeDictationRewrite.ts` | Réécriture segment dicté (ton) |
| `app/mail/composeMicDictation.ts` | Barrel dictée (`micAction`, PTT) |
| `app/mail/composeMicDictationContext.ts` | État module enregistreur / PTT |
| `app/mail/composeMicDictationApplyRun.ts` | Cible compose vs thread-QA, injection texte |
| `app/mail/composeMicDictationPttRun.ts` | `bindMicPushToTalk` |
| `app/mail/composeMicDictationMicActionRun.ts` | Toggle dictée (idle ↔ recording) |
| `app/mail/composeMicDictationStartRun.ts` | Démarrage enregistrement micro |
| `app/mail/composeMicDictationStopRun.ts` | Stop + transcription + application cible |
| `app/mail/accountDefaultPrefs.ts` | Compte/dossier par défaut, filtre liste, boîte valide |
| `app/mail/mailListPreviewClean.ts` | Aperçu liste sans HTML/CSS bruit |
| `app/mail/aiCacheKeySegment.ts` | Segment clé cache LLM (`ai_cache_llm_segment`) |
| `app/mail/folderManagerPathUtil.ts` | Chemins dossiers IMAP (délimiteur, reparent) |
| `app/mail/llmJobQueue.ts` | File jobs LLM (`withLlmQueue`, annulation) |
| `app/mail/composeAiComposeLlm.ts` | Réécriture / grammaire IA dans le compositeur |
| `app/mail/switchActiveAccountAction.ts` | Changement de compte actif (liste, digest, sauvés) |
| `app/mail/statusBarProgressJobs.ts` | Barrel jobs barre d’état |
| `app/mail/statusBarProgressQueueRun.ts` | Upsert / clear jobs + schedule paint |
| `app/mail/statusBarProgressGatherRun.ts` | Agrégation jobs (sync, org, LLM, …) |
| `app/mail/statusBarProgressPaintRun.ts` | Peinture DOM barre de progression |
| `app/mail/llmPrefetchProgressDom.ts` | Barre progression prefetch LLM |
| `app/mail/navBreadcrumbSegments.ts` | Segments fil d’Ariane navigation |
| `app/mail/oauthEphemeralRedirectWarn.ts` | Toast redirect OAuth éphémère |
| `app/mail/searchMailboxBrowseExit.ts` | Sortie mode recherche (navigation dossier) |
| `app/mail/syncImapAccountContext.ts` | Compte/timeout sync IMAP selon vue |
| `app/mail/appNavigationStack.ts` | Barrel pile navigation |
| `app/mail/appNavigationStackContext.ts` | `registerAppNavigationStackDeps` |
| `app/mail/appNavigationSnapshotRun.ts` | `captureCurrentNav`, `beginNavigation` |
| `app/mail/appNavigationSnapshotLabelsRun.ts` | Labels fil d’Ariane par vue |
| `app/mail/appNavigationApplyRun.ts` | Re-export `applyNavSnapshot` |
| `app/mail/appNavigationApplyViewsRun.ts` | Restauration champs nav + dispatch vues |
| `app/mail/appNavigationApplyViewsMailRun.ts` | Snapshot liste / fil / réglages / compose |
| `app/mail/appNavigationApplyViewsContactsRun.ts` | Snapshot carnet / fiche contact |
| `app/mail/appNavigationApplyViewsOrgRun.ts` | Snapshot Organiser v1/v2 / dossiers |
| `app/mail/appNavigationHistoryRun.ts` | Barrel `goBack`, inbox, fil d’Ariane |
| `app/mail/appNavigationHistoryBackRun.ts` | Pile nav : retour / avant |
| `app/mail/appNavigationHistoryJumpRun.ts` | Inbox, index fil d’Ariane |
| `app/mail/accountRowNormalize.ts` | Normalisation ligne compte (`list_accounts`) |
| `app/mail/accountsLoadFromBackend.ts` | Chargement comptes backend |
| `app/mail/folderManagerPanelState.ts` | État recherche panneau dossiers |
| `app/mail/orgApplyStatusMessage.ts` | Libellés progression Organiser |
| `app/mail/threadShellLayout.ts` | Layout lecture fil / panneau IA shell |
| `app/mail/settingsLlmRuntime.ts` | Barrel statut LLM, llama-server, modale moteurs |
| `app/mail/settingsLlmRuntimeStatusRun.ts` | `refreshLlmRuntimeStatus`, cache GGUF |
| `app/mail/settingsLlmRuntimeLlamaDetectRun.ts` | Détection binaire `llama-server` |
| `app/mail/settingsGeneralPrefsPersistRun.ts` | Persistance prefs générales depuis le DOM |
| `app/mail/settingsAiModalShellRun.ts` | Ouverture / fermeture modale IA réglages |
| `app/mail/settingsAiDomWireRun.ts` | Barrel listeners DOM prefs IA |
| `app/mail/settingsAiDomWireModalRun.ts` | Barrel listeners modale réglages IA |
| `app/mail/settingsAiDomWireModalChangeRun.ts` | Change/input debounced modale IA |
| `app/mail/settingsAiDomWireModalHandlersRun.ts` | Handlers select moteur / preset modale IA |
| `app/mail/settingsAiDomWireEnginesRun.ts` | Barrel wire llama-server + prefs arrière-plan |
| `app/mail/settingsAiDomWireLlamaServerRun.ts` | Checkboxes spawn / override CPU llama-server |
| `app/mail/settingsAiDomWireBackgroundPrefsRun.ts` | Prefs arrière-plan IA + recherche sémantique |
| `app/mail/settingsAiDomWirePersistRun.ts` | `persistAiPrefsImmediateFromDom` |
| `app/mail/settingsAiRuntimeWireActionsRun.ts` | Dispatch wire runtime IA (statut, reco, mode) |
| `app/mail/settingsAiRuntimeStatusWireRun.ts` | Sauvegarde prefs, refresh statut / rescan matériel |
| `app/mail/settingsAiRuntimeRecommendedWireRun.ts` | Poids recommandés, setup LLM recommandé |
| `app/mail/settingsAiRuntimeEngineModeWireRun.ts` | Bascule mode moteur local / cloud / hybride |
| `app/mail/settingsAiPrefetchWireActionsRun.ts` | Barrel wire prefetch IA (modèles / index) |
| `app/mail/settingsAiPrefetchLlmWireRun.ts` | Wire prefetch / annulation modèle LLM |
| `app/mail/settingsAiPrefetchSemanticWireRun.ts` | Wire MiniLM, réindex sémantique, compteurs |
| `app/mail/settingsAiPrefetchWhisperWireRun.ts` | Wire prefetch Whisper GGML |
| `app/mail/settingsGeneralPrefsWireActionsRun.ts` | Wire prefs générales + compte par défaut |
| `app/mail/settingsNavWireActionsRun.ts` | Wire navigation réglages (onglets, reload comptes) |
| `app/mail/settingsAiModalShellWireActionsRun.ts` | Wire sous-modale IA (open/close/tabs) |
| `app/mail/settingsShellWireActionsRun.ts` | Barrel wire shell réglages |
| `app/mail/threadReplyWireActionsRun.ts` | Barrel wire fil (compose + liens) |
| `app/mail/threadReplyComposeWireRun.ts` | Wire reply / forward |
| `app/mail/threadReplyMailLinksWireRun.ts` | Wire PJ, contacts, désabonnement |
| `app/mail/threadNavWireActionsRun.ts` | Wire navigation fil / sidebar |
| `app/mail/addressBookSidebarWireActionsRun.ts` | Dispatch wire carnet (sidebar réglages) |
| `app/mail/addressBookSidebarSyncWireRun.ts` | Refresh liste, réindex carnet |
| `app/mail/addressBookSidebarCrudWireRun.ts` | Édition / save / delete / favori carnet |
| `app/mail/contactsWireActionsRun.ts` | Barrel actions wire contacts / vCard |
| `app/mail/contactsWireActionsListRun.ts` | Navigation liste contacts, refresh, ouverture fil |
| `app/mail/contactsWireActionsDetailRun.ts` | Dispatch wire fiche contact |
| `app/mail/contactsDetailComposeWireRun.ts` | Compose depuis fiche contact |
| `app/mail/contactsDetailProfileWireRun.ts` | Favori, profil IA, recherche domaine |
| `app/mail/contactsDetailSearchWireRun.ts` | Recherches depuis fiche contact |
| `app/mail/contactsWireActionsAddressBookRun.ts` | Import / export vCard carnet |
| `app/mail/searchViewsWireActionsRun.ts` | Barrel vues enregistrées, chips, filtres liste |
| `app/mail/searchViewsSavedWireActionsRun.ts` | Vues enregistrées, lot recherche, suggestions |
| `app/mail/searchViewsClearFiltersWireActionsRun.ts` | Barrel effacer chips / filtres recherche |
| `app/mail/searchViewsClearFiltersWireRun.ts` | Dispatch effacer chips / portée recherche |
| `app/mail/searchViewsClearFiltersTextRun.ts` | Texte, filtre liste, filtres NL |
| `app/mail/searchViewsClearFiltersCriteriaRun.ts` | Expéditeur, dossier, compte, tags, NL rule |
| `app/mail/searchViewsClearFiltersScopeRun.ts` | Bascule portée compte / dossier |
| `app/mail/searchViewsListWireRun.ts` | Dispatch filtres liste, load-more, digest |
| `app/mail/searchViewsListFilterWireRun.ts` | Filtres liste + pagination « load-more » |
| `app/mail/searchViewsListDigestWireRun.ts` | Fermer panneau digest dossier |
| `app/mail/listThreadWireActionsRun.ts` | Barrel fil liste / déplacement / brouillons |
| `app/mail/listThreadMoveWireActionsRun.ts` | Barrel déplacement / meta liste fil |
| `app/mail/listThreadMoveActionsWireRun.ts` | Corbeille, archive, lu/suivi, modale déplacer |
| `app/mail/listThreadMetaWireRun.ts` | Retag org, lu/non-lu, suivi fil (liste) |
| `app/mail/listThreadMailboxWireActionsRun.ts` | Modale gérer dossier IMAP |
| `app/mail/listThreadSavedDraftWireActionsRun.ts` | Brouillons enregistrés liste |
| `app/mail/listThreadQuickWireActionsRun.ts` | Copie suggestion quick reply |
| `app/mail/threadLlmWireActionsRun.ts` | Barrel IA fil / QA / démo (wire) |
| `app/mail/threadLlmQuickReplyWireActionsRun.ts` | Envoi / insertion quick reply |
| `app/mail/threadLlmAiUiWireActionsRun.ts` | Synthèse, traduction, digest, Q&A fil |
| `app/mail/threadLlmDemoWireActionsRun.ts` | Reset / suppression boîte démo playground |
| `app/mail/settingsApiKeysPersistRun.ts` | Re-export clés API (trousseau) |
| `app/mail/settingsApiKeysPersistHelpersRun.ts` | Garde Tauri + refresh modale moteurs |
| `app/mail/settingsApiKeysCloudRun.ts` | Clé cloud combinée OpenRouter + dictée |
| `app/mail/settingsApiKeysIndividualRun.ts` | Barrel clés OpenRouter, dictée, llama-server |
| `app/mail/settingsApiKeysDictationRun.ts` | Persist / clear clé dictée |
| `app/mail/settingsApiKeysOpenrouterRun.ts` | Persist / clear clé OpenRouter |
| `app/mail/settingsApiKeysLlamaServerRun.ts` | Persist / clear clé llama-server |
| `app/mail/settingsPathsRefresh.ts` | Chemins app (`app_paths`) |
| `app/mail/settingsSemanticEmbeddingCounts.ts` | Comptes embeddings sémantiques |
| `app/mail/settingsOpenView.ts` | Ouverture vue Paramètres |
| `app/mail/settingsAiPrefsPersistDom.ts` | Persistance prefs IA depuis le DOM |
| `app/mail/savedDraftsMailboxCountRefresh.ts` | Compteur dossier Brouillons sauvés |
| `app/mail/composeTauriNativeFileDrop.ts` | Bind drag-drop natif Tauri (compose) |
| `app/mail/composeTauriNativeFileDropApplyRun.ts` | Highlight + fusion PJ droppées |
| `app/mail/threadStatusJobCounts.ts` | Compteurs jobs traduction (barre d’état) |
| `app/mail/composeSendDraftAction.ts` | Ré-export `sendDraft()` |
| `app/mail/composeAttachmentPaths.ts` | Join chemins PJ (champ caché) |
| `app/mail/composeDraftRecipients.ts` | Cc/Bcc visibles (`draftHasRecipientsExtra`) |
| `app/mail/mailboxImapFallback.ts` | Dossier IMAP par défaut (`pickImapMailboxFallback`) |
| `app/mail/switchMailboxAction.ts` | Facade `switchMailbox()` ; `registerSwitchMailboxRunDeps({ loadMailView })` |
| `app/mail/switchMailboxRun.ts` | Changement de dossier IMAP (sidebar) |
| `app/mail/contactsViewNavigation.ts` | Carnet : `openContactsView`, `openContactDetailView` |
| `app/mail/loadAddressBookSidebarCount.ts` | Compteur contacts sidebar |
| `app/mail/mailUnsubscribeLinks.ts` | Barrel liens désinscription HTML |
| `app/mail/mailUnsubscribeHrefScoreRun.ts` | Score / tri href désinscription |
| `app/mail/mailUnsubscribeLinkDetectRun.ts` | Heuristiques anchor désinscription |
| `app/mail/mailUnsubscribeLinkDomRun.ts` | Collecte DOM + masquage sections déplacées |
| `app/mail/addressBookListState.ts` | Cache liste carnet + `refreshAddressBookList()` |
| `app/mail/orgOpenOrganizationMailbox.ts` | Ouvrir un dossier depuis Organiser |
| `app/mail/orgRowSyncMailbox.ts` | Sync IMAP d’une ligne org (rapport via `orgOrganizationReportRefresh`) |
| `app/mail/orgDeleteMailboxOneAction.ts` | Suppression dossier vide (org) |
| `app/mail/orgRefreshMailboxesAfterImap.ts` | Rafraîchir `state.mailboxes` après changement IMAP |
| `app/mail/orgOrganizationReportRefresh.ts` | Rescan rapports Organiser v1/v2 |
| `app/mail/orgOrganizationOpenViews.ts` | Ouverture vues Organiser v1/v2 |
| `app/mail/orgApplyRun.ts` | Barrel apply org v1 |
| `app/mail/orgApplyRunContext.ts` | `registerOrgApplyRunDeps()` |
| `app/mail/orgApplyConfirmRun.ts` | Confirm + preview apply org v1 |
| `app/mail/orgApplyExecuteRun.ts` | Exécution apply org v1 |
| `app/mail/orgV2ApplyRun.ts` | Barrel apply org v2 |
| `app/mail/orgV2ApplyContext.ts` | `registerOrgV2ApplyRunDeps()` |
| `app/mail/orgV2ApplyBatchRun.ts` | Orchestration apply org v2 |
| `app/mail/orgV2ApplyChunkLoopRun.ts` | Boucle chunks `orgApplyProposal` |
| `app/mail/orgV2ApplyOutcomeRun.ts` | Toasts, IMAP refresh, rapport org v2 |
| `app/mail/orgV2ApplyConfirmRun.ts` | Confirm + preview avant apply org v2 |
| `app/mail/orgV2ProposalUi.ts` | Ignorer / reporter / mémoire dossiers org v2 |
| `app/mail/folderManagerActions.ts` | Barrel vue Dossiers IMAP |
| `app/mail/folderManagerContext.ts` | `registerFolderManagerRunDeps` |
| `app/mail/folderManagerTreeRun.ts` | Arbre, sélection dossier, ouverture vue |
| `app/mail/folderManagerCrudRun.ts` | Barrel CRUD dossier (gestionnaire) |
| `app/mail/folderManagerSyncRun.ts` | Sync dossier IMAP |
| `app/mail/folderManagerMailboxCrudRun.ts` | Créer / renommer dossier |
| `app/mail/folderManagerMoveRun.ts` | Déplacer dossier (reparent) |
| `app/mail/folderManagerConfirmRun.ts` | Archiver / supprimer dossier (confirm) |
| `app/mail/threadListActions.ts` | Barrel actions liste fils |
| `app/mail/threadListActionsContext.ts` | Deps + `sourceMailboxForThread` |
| `app/mail/threadListMoveRun.ts` | Barrel corbeille / archive / déplacer |
| `app/mail/threadListMoveTrashArchiveRun.ts` | `onThreadMove` trash / archive |
| `app/mail/threadListMoveDialogRun.ts` | Modale déplacement dossier |
| `app/mail/threadListMoveTargetRun.ts` | `onThreadMoveTo`, `confirmMoveDialog` |
| `app/mail/threadListMoveOptimisticRun.ts` | UI optimiste liste avant confirm IMAP |
| `app/mail/threadListReadFollowRun.ts` | Lu/non-lu, suivi |
| `app/mail/folderManagerDnD.ts` | Glisser-déposer dossiers / fils (vue Dossiers) |
| `app/lib/sidebarUiPref.ts` | Préférence sidebar repliée (localStorage) |
| `app/mail/newsletterRuleInput.ts` | Lecture/normalisation règles expéditeurs auto (UI) |
| `app/mail/threadAiSummaryState.ts` | Reset état synthèse / agent fil |
| `app/mail/threadMessageAnchor.ts` | Id DOM ancre message fil |
| `app/mail/threadScrollToMessage.ts` | Scroll + surbrillance message + `registerThreadScrollToMessageDeps()` |
| `app/mail/mailListView.ts` | Barrel loaders liste / sidebar |
| `app/mail/mailListViewContext.ts` | `registerMailListDeps`, fusion pages threads |
| `app/mail/mailListMailboxLoadRun.ts` | `loadMailView` (orchestration dossier standard) |
| `app/mail/mailListLoadUnifiedRun.ts` | Page boîte unifiée |
| `app/mail/mailListLoadSavedDraftsRun.ts` | Liste brouillons enregistrés |
| `app/mail/mailListSearchContextRun.ts` | `loadThreadsForSearchContext` |
| `app/mail/mailListSidebarRun.ts` | Compteurs filtre inbox + non-lus sidebar |
| `app/mail/mailListRouterRun.ts` | `reloadCurrentThreadList`, `applyListFilter` |
| `app/mail/mailboxPanelContext.ts` | Contexte dossier (gestionnaire, payload `list_threads`) |
| `app/mail/mailboxSidebarStats.ts` | Compteurs non lus sidebar |
| `app/core/accountContext.ts` | `currentAccount()` |
| `app/lib/threadIdsMatch.ts` | Comparaison d’identifiants fil |

### Rendu UI (`app/ui/render/`)

Pont **`registerRenderDeps()`** dans `renderDeps.ts` : callbacks câblés via **`appRenderRegistry.ts`** (fil d’Ariane, tags fil, etc.).

| Fichier | Contenu |
| ------- | ------- |
| `listChrome.ts` | Badges sidebar, bannières compte, fil d’Ariane |
| `searchBadgeChip.ts` | Puce critère de recherche |
| `searchRender.ts` | Barre recherche, badges, modale, actions vue enregistrée |
| `modalsRender.ts` | Déplacer, mailbox, citations, compose, image, split send, reprise brouillon |
| `statusFooterRender.ts` | Barre d’état globale, chips activité, progression inline |
| `aiQuickPanelRender.ts` | Panneau rapide fonctionnalités IA (sidebar + barre) |
| `aiFeatureTogglesRender.ts` | HTML toggles IA (compact / paramètres) |
| `sidebarRender.ts` | Barre latérale dossiers / vues |
| `mainViewRender.ts` | Routage vue principale (`renderMain`) |
| `listRender.ts` | Liste inbox (`renderList`, lignes fil) |
| `threadViewRender.ts` | Vue fil (`renderThread`, messages, sécurité) |
| `composerRender.ts` | Compositeur (`renderComposer`, historique brouillon) |
| `settingsRender.ts` | Paramètres (onglets, modale IA réglages) |
| `aiPanelRender.ts` | Panneau Détails / brief dossier / agent IA |
| `orgSampleRowRender.ts` | Ligne échantillon vue Organiser |
| `app/mail/wireEventsDomOrchestratorRun.ts` | Barrel `wireEvents()` |
| `app/mail/wireEventsDomOrchestratorComposeRun.ts` | Signal AbortController compose + chips / @ autocomplete |
| `app/mail/wireEventsDomOrchestratorDomainRun.ts` | Enchaîne les `wireEventsDom*Run` par domaine |
| `app/mail/handleActionRun.ts` | Point d’entrée actions UI (`data-action`) |
| `app/mail/wireEventsContext.ts` | Refs UI (abort compose, prefs IA immédiats, carnet d’adresses) |
| `app/mail/wireEventsDepsContext.ts` | Mutateurs contexte wire (capture compte, édition carnet) |
| `app/mail/wireEventsDomSettingsAiRun.ts` | Délègue à `settingsAiDomWireRun` |
| `app/mail/wireEventsDomContactsAgentRun.ts` | Barrel contacts + dispatch `[data-action]` |
| `app/mail/wireEventsDomContactsListRun.ts` | Barrel recherche / scroll liste contacts |
| `app/mail/wireEventsDomContactsListSearchRun.ts` | `#contacts-list-search` debounce 280ms |
| `app/mail/wireEventsDomContactsListScrollRun.ts` | Scroll infini `#contacts-thread-list` |
| `app/mail/wireEventsDomDataActionDispatchRun.ts` | Barrel clic `data-action` + change agent/brief |
| `app/mail/wireEventsDomDataActionClickRun.ts` | Clic `[data-action]` → `handleAction` |
| `app/mail/wireEventsDomDataActionChangeRun.ts` | Barrel listener `change` dispatch |
| `app/mail/wireEventsDomDataActionAgentChangeRun.ts` | Agent skills / mode assist |
| `app/mail/wireEventsDomDataActionMailboxBriefChangeRun.ts` | Sélecteur brief dossier |
| `app/mail/wireEventsDomInboxThreadRun.ts` | Barrel inbox/fil (liste, org, PJ, chrome, modales org) |
| `app/mail/wireEventsDomInboxThreadChromeRun.ts` | Coques modales stop-prop + boutons ton |
| `app/mail/wireEventsDomInboxListRun.ts` | Barrel navigation liste + moves |
| `app/mail/wireEventsDomInboxListNavRun.ts` | Barrel navigation liste |
| `app/mail/wireEventsDomInboxListSidebarNavRun.ts` | Toast, clic boîtes `[data-mailbox]` |
| `app/mail/wireEventsDomInboxListOpenThreadNavRun.ts` | Lignes fil + digest → `openThread` |
| `app/mail/wireEventsDomInboxListMoveRun.ts` | Barrel moves liste |
| `app/mail/wireEventsDomInboxListTrashArchiveRun.ts` | Boutons trash / archive |
| `app/mail/wireEventsDomInboxListFolderMoveRun.ts` | Select déplacement fil + `#move-target-select` |
| `app/mail/wireEventsDomOrgMailboxRun.ts` | Barrel actions org (inline + modales confirm) |
| `app/mail/wireEventsDomOrgMailboxInlineRun.ts` | Barrel actions org inline |
| `app/mail/wireEventsDomOrgMailboxDeleteSyncRun.ts` | Supprimer une boîte, sync IMAP |
| `app/mail/wireEventsDomOrgMailboxV2IgnoreRun.ts` | Ignorer / réintégrer boîtes org v2 |
| `app/mail/wireEventsDomOrgConfirmModalsRun.ts` | Checkboxes confirmation modales org |
| `app/mail/wireEventsDomThreadAttachmentsRun.ts` | Barrel PJ fil + hydrate HTML |
| `app/mail/wireEventsDomThreadAttachmentButtonsRun.ts` | Boutons download/open PJ |
| `app/mail/wireEventsDomComposeSearchAccountRun.ts` | Barrel compose / recherche / compte (DOM) |
| `app/mail/wireEventsDomComposeEditorRun.ts` | Barrel wire composeur (preview, body, champs, toolbar) |
| `app/mail/wireEventsDomComposeEditorFieldsRun.ts` | Sujet, dropzone PJ, quick reply Enter |
| `app/mail/wireEventsDomComposePreviewRun.ts` | Attache clic preview compose |
| `app/mail/wireEventsDomComposePreviewClickRun.ts` | Liens mail + lightbox image preview |
| `app/mail/wireEventsDomComposeBodyRun.ts` | Barrel textarea + toolbar markdown |
| `app/mail/wireEventsDomComposeBodyTextareaRun.ts` | Barrel `#compose-body` listeners |
| `app/mail/wireEventsDomComposeBodyInputRun.ts` | Input → preview + autosave révision |
| `app/mail/wireEventsDomComposeBodyPasteRun.ts` | Collage image → markdown inline |
| `app/mail/wireEventsDomComposeBodyMarkdownShortcutsRun.ts` | Ctrl+B/I/K/U |
| `app/mail/wireEventsDomComposeMarkdownToolbarRun.ts` | Boutons `[data-md]` |
| `app/mail/wireEventsDomSearchBarRun.ts` | Barrel `#search-input` / modale |
| `app/mail/wireEventsDomSearchBarFieldRun.ts` | Barrel listeners par champ recherche |
| `app/mail/wireEventsDomSearchBarDraftFieldRun.ts` | Focus + draft + refresh tags |
| `app/mail/wireEventsDomSearchBarCommitFieldRun.ts` | Enter / `search` → commit |
| `app/mail/wireEventsDomAccountFormRun.ts` | Barrel formulaire compte réglages |
| `app/mail/wireEventsDomAccountSelectRun.ts` | `#account-select` → `switchActiveAccount` |
| `app/mail/wireEventsDomAccountEmailPresetRun.ts` | Email domain preset + touch champs serveur |
| `app/mail/wireEventsDomThreadQaRun.ts` | Saisie Q&A fil (`#thread-qa-input`) |
| `app/mail/appShellRenderChromeRun.ts` | Barrel capture / scroll / focus post-render |
| `app/mail/appShellRenderAccountsCaptureRun.ts` | Snapshot identité formulaire comptes avant render |
| `app/mail/appShellRenderScrollRestoreRun.ts` | Scroll sidebar, org, modale IA |
| `app/mail/appShellRenderFocusRun.ts` | Focus prompt texte + modale recherche |
| `app/mail/composeViewWireActions.ts` | Entrée vue compose (`enterComposeView`, session, preview layout) |
| `app/mail/composeWireActionsRun.ts` | Barrel fermeture compose wire, révision, grammaire |
| `app/mail/composeWireCloseRun.ts` | Fermer compose sans sauver / sauver et fermer |
| `app/mail/composeWireRevisionRestoreRun.ts` | Restaurer révision brouillon (wire) |
| `app/mail/composeWireGrammarRun.ts` | Appliquer suggestion grammaire compose |
| `app/mail/composeCloseWireActionsRun.ts` | Wire fermeture compose / brouillons orphelins |
| `app/mail/composeDraftHistoryWireActionsRun.ts` | Wire historique versions brouillon |
| `app/mail/agentAssistWireActionsRun.ts` | Barrel agent assist + sync / corbeille (wire) |
| `app/mail/agentAssistSessionWireActionsRun.ts` | Préparer réponse agent, insertion brouillon |
| `app/mail/agentAssistComposeWireActionsRun.ts` | Mic, quick replies compose, synthèse expéditeur |
| `app/mail/agentAssistMailboxWireActionsRun.ts` | Enregistrer compte, sync, vider corbeille, bulk |
| `app/mail/accountSetupWireActionsRun.ts` | Wire setup compte / OAuth réglages |
| `app/mail/modalsWireActionsRun.ts` | Wire modales confirm / text prompt |
| `app/mail/composeEntryWireActionsRun.ts` | Wire action `compose` (nouveau brouillon / reply) |
| `app/mail/searchModalWireActionsRun.ts` | Wire modale recherche + assist NL |
| `app/mail/settingsLlamaBinaryWireActionsRun.ts` | Wire binaire llama-server (detect, winget, chemin) |
| `app/mail/threadSecurityWireActionsRun.ts` | Wire actions sécurité fil |
| `app/mail/orgFolderNavWireActionsRun.ts` | Wire navigation org / contacts / FM |
| `app/mail/composeSettingsWireDispatchRun.ts` | Dispatch modales, réglages, compte |
| `app/mail/threadComposeWireDispatchRun.ts` | Dispatch fil + compose + recherche modale |
| `app/mail/inboxSearchWireDispatchRun.ts` | Dispatch contacts, agent, recherche, liste |
| `app/mail/orgFolderWireDispatchRun.ts` | Dispatch org v1/v2, FM, nav |
| `app/mail/composeWireDispatchRun.ts` | Dispatch compose close / historique / éditeur |
| `app/mail/threadViewWireDispatchRun.ts` | Dispatch UI fil / reply / sécurité |
| `app/mail/settingsAiWireDispatchRun.ts` | Dispatch prefs IA runtime / prefetch / dictée |
| `app/mail/settingsApiKeysWireActionsRun.ts` | Wire clés API (persist / clear) |
| `app/mail/composeEditorWireActionsRun.ts` | Dispatch wire éditeur compose |
| `app/mail/composeEditorLayoutWireRun.ts` | Layout, preview, Cc/Bcc, options avancées |
| `app/mail/composeEditorSendWireRun.ts` | Envoi, confirmation envoi fractionné |
| `app/mail/composeEditorAttachmentsWireRun.ts` | Picker et retrait PJ compose |
| `app/mail/composeEditorAiWireRun.ts` | Rewrite / grammaire IA compose |
| `app/mail/threadViewUiWireActionsRun.ts` | Barrel wire UI fil |
| `app/mail/threadViewUiAiWireRun.ts` | Panneau IA, quick reply, digest |
| `app/mail/threadViewUiModalsWireRun.ts` | Citations, tags, image, mode message |
| `app/mail/folderManagerWireActionsRun.ts` | Dispatch wire gestionnaire (`fm-*`) |
| `app/mail/folderManagerWireCrudRun.ts` | Wire CRUD / sync dossier |
| `app/mail/folderManagerWireArchiveRun.ts` | Wire archivage dossier |
| `app/mail/folderManagerWireDeleteRun.ts` | Wire suppression dossier |
| `app/mail/folderManagerWireTreeRun.ts` | Wire arbre (verrou, nœuds, inbox) |
| `app/mail/composeAssistWireActions.ts` | Assist IA compose (résumé expéditeur, quick replies) |
| `app/mail/addressBookWireActions.ts` | Carnet d’adresses (fiche contact, compteur sidebar) |
| `app/mail/accountWireActions.ts` | Compte / micro / brouillons sauvegardés |
| `app/mail/accountSettingsRun.ts` | Barrel save/delete/OAuth/discovery (voir `account*Run.ts`) |
| `app/mail/accountSaveRun.ts` | Re-export `saveAccount`, `saveAccountProgrammatic` |
| `app/mail/accountSaveFormRun.ts` | `saveAccountFromSettingsForm` |
| `app/mail/accountSaveFormRequestRun.ts` | Lecture / validation formulaire compte |
| `app/mail/accountSaveFormPersistRun.ts` | Invoke save + reload mailboxes |
| `app/mail/accountSaveProgrammaticRun.ts` | Enregistrement programmatique (OAuth finish) |
| `app/mail/accountDeleteRun.ts` | `deleteSettingsAccount` |
| `app/mail/accountServerDiscoveryRun.ts` | Barrel détection IMAP/SMTP |
| `app/mail/accountServerDiscoverySnapRun.ts` | Snap serveurs (OAuth / preset) |
| `app/mail/accountServerDiscoveryFormRun.ts` | Action détection formulaire compte |
| `app/mail/threadSecurityActionsRun.ts` | Newsletter rapide, déplacer spam, filtre #security |
| `app/mail/accountOAuthDesktopConnectRun.ts` | Entrées OAuth Google / Microsoft (desktop) |
| `app/mail/accountOAuthDesktopConnectCoreRun.ts` | Invoke login + enchaînement finish compte |
| `app/mail/accountOAuthFinishRun.ts` | Orchestration post-login OAuth nouveau compte |
| `app/mail/accountOAuthWizardPhaseRun.ts` | Phases UI assistant OAuth compte |
| `app/mail/accountOAuthFinishReadyRun.ts` | Inbox, sync, fin wizard après save OAuth |
| `threadTagsRender.ts` | Modale / chips tags fil |
| `actionBriefHtml.ts` | HTML brief d’action IA |

Libs associées : `attachmentSize.ts`, `searchBadgeLabel.ts`, …

Outils : `tools/extract-source.mjs` (source par défaut `app/mail/appModuleRegistry.ts`, `--source=` ou `RUSTYMAIL_EXTRACT_SOURCE`), `tools/extract-application-fns.mjs`, `tools/degrade-extract-lib-modals.mjs`, `tools/degrade-extract-batch2.mjs`, `tools/degrade-extract-batch3.mjs`.

## Prochaines extractions (ordre suggéré)

1. Consolider doc README (doublons table modules) après merge PR #1
2. ~~Découpage registries / shell~~ — **fait** sur cette branche (`*Run.ts`, plus de `application.ts`)
3. `@ts-nocheck` DOM wire : typer progressivement `wireEventsDom*`
4. **Timer `loop-app-slim-e449`** : objectif atteint — à désactiver ; ne plus viser `application.ts` / `deps.ts` (supprimés)

`npm run verify:ts` · `npm test`
