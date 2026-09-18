# Front-end (`src/`)

Découpage progressif du monolithe historique. **`src/main.ts`** enregistre les modules puis lance **`boot()`** ; le câblage vit dans **`app/mail/*`** (dont `appModuleRegistry.ts`).

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
| `app/mail/mailboxDigestFetchRun.ts` | `llm_inbox_digest`, bannières erreur |
| `app/mail/mailboxDigestRenderRun.ts` | Bouton toolbar Brief |
| `app/mail/idleAiCachePrefetch.ts` | Barrel préchargement cache LLM au idle |
| `app/mail/searchQueryContext.ts` | Payload recherche, `isSearchActive`, critères engagés, dossier effectif |
| `app/mail/searchThreadsRun.ts` | Exécution `searchThreads()` |
| `app/mail/fetchOpenThread.ts` | `fetchOpenThreadOrNotify()` |
| `app/mail/openThreadView.ts` | `openThread()` + `registerOpenThreadDeps()` |
| `app/mail/searchCommitQuery.ts` | Barrel commit barre recherche |
| `app/mail/searchCommitContext.ts` | `registerSearchCommitDeps` |
| `app/mail/searchCommitStructuralRun.ts` | Parse barre → état, snapshots brouillon, apply NL |
| `app/mail/searchCommitBarRun.ts` | `commitSearchQuery`, clear, toasts, reload |
| `app/mail/searchNlQueryInvoke.ts` | `llm_search_nl` invoke + application état / fallbacks lexicaux |
| `app/mail/searchNlAssistRun.ts` | Action « recherche NL » (prompt + `llm_search_nl`) |
| `app/mail/searchCommitNlBarRun.ts` | Commit barre recherche via NL (`llm_search_nl` depuis la barre) |
| `app/mail/searchBarUi.ts` | Modale recherche, `syncSearchBarChrome` |
| `app/mail/searchMailboxResolve.ts` | Résolution chemin dossier (liste + recherche) |
| `app/mail/searchAccountResolve.ts` | Email canonique NL, expéditeurs recherche, compte depuis ref barre |
| `app/mail/savedSearchViews.ts` | Barrel vues enregistrées |
| `app/mail/savedSearchViewsHelpers.ts` | Sync brouillon recherche, nom suggéré, règle newsletter |
| `app/mail/savedSearchListRun.ts` | Liste / refresh / marquer vue active vue |
| `app/mail/savedSearchCrudRun.ts` | Enregistrer, appliquer, supprimer une vue |
| `app/mail/savedSearchSuggestionsRun.ts` | Suggestions de vues (activité) |
| `app/mail/searchLaunchQueries.ts` | Barrel lancements recherche |
| `app/mail/searchLaunchContext.ts` | `registerSearchLaunchDeps` |
| `app/mail/searchLaunchPresetsRun.ts` | Tag, contact, domaine |
| `app/mail/searchLaunchHashAutocompleteRun.ts` | Hits `#` autocomplete + filtres inbox |
| `app/mail/searchTagCatalog.ts` | `refreshSearchTagCatalog` + `registerSearchTagCatalogDeps()` |
| `app/mail/searchAtAutocompleteWire.ts` | Câblage `@` / `#` (recherche + compose) + `registerSearchAtAutocompleteWireDeps()` |
| `app/mail/searchViewContext.ts` | Critères vue enregistrée / contexte recherche inbox + `registerSearchViewContextDeps()` |
| `app/mail/searchViewBatch.ts` | Barrel actions lot recherche / vue enregistrée |
| `app/mail/searchViewBatchContext.ts` | Job batch + `registerSearchViewBatchDeps` |
| `app/mail/searchViewBulkActionsRun.ts` | Marquer lus / archiver (lot) |
| `app/mail/searchFluxAffinerRun.ts` | Affiner le flux (LLM + dossier IMAP) |
| `app/lib/tagFamilyForInvoke.ts` | Normalisation famille tag pour invoke Rust |
| `app/mail/bulkTrashList.ts` | Corbeille lot (liste visible) + `registerBulkTrashListDeps()` |
| `app/mail/emptyTrashMailbox.ts` | Vider corbeille dossier + `registerEmptyTrashMailboxDeps()` |
| `app/mail/appNavActions.ts` | Facades `goBack` / `navigateToInbox` / fil d’Ariane |
| `app/mail/mailboxManageAction.ts` | CRUD dossier IMAP (modale gérer) + `registerMailboxManageActionDeps()` |
| `app/mail/threadActivityTracking.ts` | Activité fil / recherche (suggestions vues enregistrées) |
| `app/mail/syncInboxAction.ts` | Facade `syncInbox()` |
| `app/mail/syncInboxRun.ts` | Orchestration `syncInbox`, re-exports watch / push refresh |
| `app/mail/syncInboxBatchRun.ts` | Cibles IMAP, batches `sync_mailboxes`, aliases |
| `app/mail/syncInboxListReloadRun.ts` | Rechargement liste + fil ouvert après sync |
| `app/mail/syncInboxPushRefreshRun.ts` | `refreshUiAfterImapPush` (IDLE) |
| `app/mail/syncInboxImapWatch.ts` | Focus dossier pour watch IMAP |
| `app/mail/composeThreadReply.ts` | Répondre / transférer depuis un fil + `registerComposeThreadReplyDeps()` |
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
| `app/mail/threadAiWireTranslateRun.ts` | Traduction fil/message + hydrate cache |
| `app/mail/threadAiWireQuickReplyRun.ts` | Réponses rapides fil / compose |
| `app/mail/threadAiWireQaDigestRun.ts` | Q&A fil + brief dossier |
| `app/mail/agentWireActions.ts` | Facades agent assist (prepare reply, telemetry, plan) |
| `app/mail/agentPrepareReplyRun.ts` | Barrel assistant réponse |
| `app/mail/agentPrepareReplyStartRun.ts` | `agentPrepareReplyStart` |
| `app/mail/agentPrepareReplyPipelineRun.ts` | Phases LLM (facts, draft stream, cohérence, plan) |
| `app/mail/agentPrepareReplyContinueRun.ts` | `agentPrepareReplyContinue` |
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
| `app/mail/orgFolderWireActions.ts` | Facades org v2, gestionnaire dossiers, contacts |
| `app/mail/mailContentWireActions.ts` | Hydratation HTML fil, PJ, lightbox images |
| `app/mail/mailAttachmentActions.ts` | Téléchargement / ouverture PJ (confirm risque) |
| `app/mail/appShellRender.ts` | Barrel rendu DOM shell |
| `app/mail/appShellRenderRefs.ts` | Refs wire (compose, carnet, prefs IA immédiates) |
| `app/mail/appShellRenderContext.ts` | `registerAppShellWireContext` + `registerRender` |
| `app/mail/appShellRenderRun.ts` | `renderAppShell` |
| `app/mail/loadBootDeferredPrefs.ts` | Orchestration prefs différées au boot |
| `app/mail/bootDeferredPrefsFetchRun.ts` | `get_app_prefs`, statuts clés API |
| `app/mail/bootDeferredPrefsListenersRun.ts` | Events bootstrap modèles / prefetch LLM |
| `app/mail/bootDeferredPrefsAfterLoadRun.ts` | Wizard, compte défaut, filtre liste, brief gate |
| `app/ui/wireEvents/depsContext.ts` | Mutateurs contexte wireEvents (capture compte, carnet) |
| `app/mail/appModuleRegistry.ts` | Orchestrateur `registerAllAppModules()` (~20 lignes) |
| `app/mail/appRenderRegistry.ts` | `registerAppRenderDeps()` (barrel) |
| `app/mail/appRenderRegistryPagesRun.ts` | Rendu pages Organiser / Dossiers |
| `app/mail/appRenderRegistryDepsRun.ts` | Assemblage objet `RenderDeps` |
| `app/mail/appSearchWireRegistry.ts` | Liste + recherche + vues enregistrées / batch |
| `app/mail/appThreadWireRegistry.ts` | Ouverture fil, actions liste, changement boîte |
| `app/mail/appComposeWireRegistry.ts` | Compose, brouillons, file LLM |
| `app/mail/appAccountOrgWireRegistry.ts` | Compte, réglages, org/dossiers, nav + services digest/prefetch |
| `app/mail/savedDraftOpenRun.ts` | Ouvrir un brouillon enregistré dans le composeur |
| `app/mail/appRuntimeFallbacks.ts` | Fallback `app_status` / `capabilities` hors Tauri |
| `app/mail/appBootRun.ts` | Séquence `boot()` (status, comptes, sync initiale, listeners) |
| `app/mail/appShellBindings.ts` | Barrel raccourcis clavier / souris / flush brouillon |
| `app/mail/appShellInputGuards.ts` | Overlays bloquant navigation / raccourcis |
| `app/mail/appShellKeyboardRun.ts` | `bindKeyboard` |
| `app/mail/appShellMouseNavRun.ts` | Boutons souris retour / avant |
| `app/mail/appShellDraftFlushRun.ts` | Flush révisions brouillon (visibility) |
| `app/mail/mailEmailHtmlSanitize.ts` | DOMPurify + liens/images + `sanitizeEmailHtml()` |
| `app/mail/idleAiCachePrefetchContext.ts` | `initIdleAiCachePrefetch`, gen / abort |
| `app/mail/idleAiCachePrefetchScheduleRun.ts` | Planification debounce / idle |
| `app/mail/idleAiCachePrefetchPassRun.ts` | Pass synthèse / traduction prefetch |
| `app/mail/mailHtmlShadowHydrate.ts` | Barrel shadow DOM message HTML |
| `app/mail/mailHtmlImageLightboxRun.ts` | Lightbox, résolution `cid:` |
| `app/mail/mailHtmlShadowInnerRun.ts` | Styles + inner HTML shadow |
| `app/mail/mailHtmlShadowHydrateRun.ts` | Hydratation DOM + clics shadow |
| `app/mail/threadMessageSort.ts` | Tri messages fil, dates (`parseMaybeDate`, `dayKey`) |
| `app/mail/threadLangGuessSamples.ts` | Échantillon texte + `normalizeIso639Primary` |
| `app/mail/threadLangGuess.ts` | Barrel heuristiques langue + offres traduction |
| `app/mail/threadLangGuessHints.ts` | Indices mots par langue (ISO) |
| `app/mail/threadLangGuessDetectRun.ts` | Détection ISO639 depuis texte / tags |
| `app/mail/threadLangGuessOfferRun.ts` | `shouldOffer*Translate` |
| `app/mail/threadViewUiHelpers.ts` | Barrel participants fil, zen summary, mode vue message |
| `app/mail/threadViewUiMojibakeRun.ts` | Réparation mojibake UTF-8 + résumé zen texte |
| `app/mail/threadViewUiParticipantsRun.ts` | Expéditeurs uniques, dédup participant, `isOwnSender` |
| `app/mail/threadViewUiRecipientPresenceRun.ts` | Diff To/Cc par message (événements présence) |
| `app/mail/threadViewUiLayoutRun.ts` | Lanes arbre fil, accent expéditeur, cible réponse rapide |
| `app/mail/threadViewUiZenHtmlRun.ts` | Fragments HTML résumé zen (listes / paragraphes) |
| `app/mail/threadViewUiCleanModeRun.ts` | Mode vue message original vs nettoyé |
| `app/mail/mailSecurityDisplay.ts` | Signaux sécurité + enrichissement LLM async |
| `app/mail/composeFormLabels.ts` | Libellés compose (type brouillon, horodatage révision) |
| `app/mail/settingsAccountsFormState.ts` | Scratch identité formulaire comptes (DOM) |
| `app/mail/settingsRenderHelpers.ts` | Profil comptes + bloc stats sémantiques + deps panneau IA |
| `app/mail/threadAiStreamDom.ts` | Peinture stream IA fil/QA/agent + libellés assist |
| `app/mail/composeComposerBridge.ts` | Ré-exports éditeur compositeur (markdown, preview, PJ, chips) |
| `app/mail/composeMarkdownEditor.ts` | Barrel éditeur markdown compositeur |
| `app/mail/composeMarkdownEditorState.ts` | Corps / canonical / undo stacks |
| `app/mail/composeMarkdownLineEditsRun.ts` | Listes, titres, wrap sélection |
| `app/mail/composeMarkdownToolbarRun.ts` | `applyMarkdownAction` |
| `app/mail/composeDraftPreview.ts` | Aperçu brouillon (`preview_draft`) + debounce |
| `app/mail/composePersistDraft.ts` | Lecture DOM → `state.draft` avant envoi / preview |
| `app/mail/composeRecipientChipsWire.ts` | Chips À/Cc/Cci + `composeChipsHandle` |
| `app/mail/composeHtmlDropzone.ts` | Glisser-déposer PJ (navigateur) |
| `app/mail/composeDraftRevisionAutosave.ts` | Debounce révisions locales + `scheduleDraftRevisionSave` |
| `app/mail/composeDraftPayload.ts` | Normalisation brouillon pour invoke Rust |
| `app/mail/composeDraftSession.ts` | Id session, reset état révisions, contenu « significatif » |
| `app/mail/composeDraftLocalSave.ts` | Révisions, upsert Sauvés, orphelins au boot |
| `app/mail/composeLayoutState.ts` | `syncPreviewOpenFromComposeLayout` |
| `app/mail/newsletterRulesMatch.ts` | Correspondance expéditeur ↔ règle newsletter |
| `app/mail/composeDraftRevisions.ts` | Liste révisions brouillon |
| `app/mail/composeDraftRevisionDiff.ts` | Diff vs révision |
| `app/mail/composeOrphanDraftSession.ts` | Reprise / rejet brouillons orphelins |
| `app/mail/composePickAttachments.ts` | Picker pièces jointes Tauri |
| `app/mail/composeCloseFlow.ts` | Fermeture compositeur, discard, `clearDraftSession` |
| `app/mail/composeAttachmentsAction.ts` | Retrait PJ compositeur |
| `app/mail/cycleComposeLayout.ts` | Cycle split / write / preview / historique |
| `app/mail/llmQueueCancel.ts` | Annulation file jobs LLM |
| `app/mail/composeSendDraftRun.ts` | Envoi brouillon + split send |
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
| `app/mail/composeMicDictationMicActionRun.ts` | Enregistrement + transcription |
| `app/mail/accountDefaultPrefs.ts` | Compte/dossier par défaut, filtre liste, boîte valide |
| `app/mail/mailListPreviewClean.ts` | Aperçu liste sans HTML/CSS bruit |
| `app/mail/aiCacheKeySegment.ts` | Segment clé cache LLM (`ai_cache_llm_segment`) |
| `app/mail/folderManagerPathUtil.ts` | Chemins dossiers IMAP (délimiteur, reparent) |
| `app/mail/llmJobQueue.ts` | File jobs LLM (`withLlmQueue`, annulation) |
| `app/mail/composeAiComposeLlm.ts` | Réécriture / grammaire IA dans le compositeur |
| `app/mail/switchActiveAccountAction.ts` | Changement de compte actif (liste, digest, sauvés) |
| `app/mail/statusBarProgressJobs.ts` | Jobs barre d’état + peinture DOM |
| `app/mail/llmPrefetchProgressDom.ts` | Barre progression prefetch LLM |
| `app/mail/navBreadcrumbSegments.ts` | Segments fil d’Ariane navigation |
| `app/mail/oauthEphemeralRedirectWarn.ts` | Toast redirect OAuth éphémère |
| `app/mail/searchMailboxBrowseExit.ts` | Sortie mode recherche (navigation dossier) |
| `app/mail/syncImapAccountContext.ts` | Compte/timeout sync IMAP selon vue |
| `app/mail/appNavigationStack.ts` | Barrel pile navigation |
| `app/mail/appNavigationStackContext.ts` | `registerAppNavigationStackDeps` |
| `app/mail/appNavigationSnapshotRun.ts` | `captureCurrentNav`, `beginNavigation` |
| `app/mail/appNavigationApplyRun.ts` | Restauration snapshot (`applyNavSnapshot`) |
| `app/mail/appNavigationHistoryRun.ts` | `goBack`, `goForward`, inbox, fil d’Ariane |
| `app/mail/accountRowNormalize.ts` | Normalisation ligne compte (`list_accounts`) |
| `app/mail/accountsLoadFromBackend.ts` | Chargement comptes backend |
| `app/mail/folderManagerPanelState.ts` | État recherche panneau dossiers |
| `app/mail/orgApplyStatusMessage.ts` | Libellés progression Organiser |
| `app/mail/threadShellLayout.ts` | Layout lecture fil / panneau IA shell |
| `app/mail/settingsLlmRuntime.ts` | Barrel statut LLM, llama-server, modale moteurs |
| `app/mail/settingsLlmRuntimeStatusRun.ts` | `refreshLlmRuntimeStatus`, cache GGUF |
| `app/mail/settingsLlmRuntimeLlamaDetectRun.ts` | Détection binaire `llama-server` |
| `app/mail/settingsLlmRuntimeUiRun.ts` | Modale moteurs, slider contexte, toggles moteur |
| `app/mail/settingsPathsRefresh.ts` | Chemins app (`app_paths`) |
| `app/mail/settingsSemanticEmbeddingCounts.ts` | Comptes embeddings sémantiques |
| `app/mail/settingsOpenView.ts` | Ouverture vue Paramètres |
| `app/mail/settingsAiPrefsPersistDom.ts` | Persistance prefs IA depuis le DOM |
| `app/mail/savedDraftsMailboxCountRefresh.ts` | Compteur dossier Brouillons sauvés |
| `app/mail/composeTauriNativeFileDrop.ts` | Glisser-déposer natif Tauri (PJ compose) |
| `app/mail/threadStatusJobCounts.ts` | Compteurs jobs traduction (barre d’état) |
| `app/mail/composeSendDraftAction.ts` | Ré-export `sendDraft()` |
| `app/mail/composeAttachmentPaths.ts` | Join chemins PJ (champ caché) |
| `app/mail/composeDraftRecipients.ts` | Cc/Bcc visibles (`draftHasRecipientsExtra`) |
| `app/mail/mailboxImapFallback.ts` | Dossier IMAP par défaut (`pickImapMailboxFallback`) |
| `app/mail/switchMailboxAction.ts` | Facade `switchMailbox()` ; `registerSwitchMailboxRunDeps({ loadMailView })` |
| `app/mail/switchMailboxRun.ts` | Changement de dossier IMAP (sidebar) |
| `app/mail/contactsViewNavigation.ts` | Carnet : `openContactsView`, `openContactDetailView` |
| `app/mail/loadAddressBookSidebarCount.ts` | Compteur contacts sidebar |
| `app/mail/mailUnsubscribeLinks.ts` | Détection / tri liens désinscription HTML |
| `app/mail/addressBookListState.ts` | Cache liste carnet + `refreshAddressBookList()` |
| `app/mail/orgOpenOrganizationMailbox.ts` | Ouvrir un dossier depuis Organiser |
| `app/mail/orgRowSyncMailbox.ts` | Sync IMAP d’une ligne org (rapport via `orgOrganizationReportRefresh`) |
| `app/mail/orgDeleteMailboxOneAction.ts` | Suppression dossier vide (org) |
| `app/mail/orgRefreshMailboxesAfterImap.ts` | Rafraîchir `state.mailboxes` après changement IMAP |
| `app/mail/orgOrganizationReportRefresh.ts` | Rescan rapports Organiser v1/v2 |
| `app/mail/orgOrganizationOpenViews.ts` | Ouverture vues Organiser v1/v2 |
| `app/mail/orgApplyRun.ts` | Appliquer propositions org v1 + `registerOrgApplyRunDeps()` |
| `app/mail/orgV2ApplyRun.ts` | Barrel apply org v2 |
| `app/mail/orgV2ApplyContext.ts` | `registerOrgV2ApplyRunDeps()` |
| `app/mail/orgV2ApplyBatchRun.ts` | Confirm + application par chunks |
| `app/mail/orgV2ProposalUi.ts` | Ignorer / reporter / mémoire dossiers org v2 |
| `app/mail/folderManagerActions.ts` | Barrel vue Dossiers IMAP |
| `app/mail/folderManagerContext.ts` | `registerFolderManagerRunDeps` |
| `app/mail/folderManagerTreeRun.ts` | Arbre, sélection dossier, ouverture vue |
| `app/mail/folderManagerCrudRun.ts` | Sync / créer / renommer / déplacer dossier |
| `app/mail/folderManagerConfirmRun.ts` | Archiver / supprimer dossier (confirm) |
| `app/mail/threadListActions.ts` | Barrel actions liste fils |
| `app/mail/threadListActionsContext.ts` | Deps + `sourceMailboxForThread` |
| `app/mail/threadListMoveRun.ts` | Corbeille, archive, déplacer |
| `app/mail/threadListReadFollowRun.ts` | Lu/non-lu, suivi |
| `app/mail/folderManagerDnD.ts` | Glisser-déposer dossiers / fils (vue Dossiers) |
| `app/lib/sidebarUiPref.ts` | Préférence sidebar repliée (localStorage) |
| `app/mail/newsletterRuleInput.ts` | Lecture/normalisation règles expéditeurs auto (UI) |
| `app/mail/threadAiSummaryState.ts` | Reset état synthèse / agent fil |
| `app/mail/threadMessageAnchor.ts` | Id DOM ancre message fil |
| `app/mail/threadScrollToMessage.ts` | Scroll + surbrillance message + `registerThreadScrollToMessageDeps()` |
| `app/mail/mailListView.ts` | Barrel loaders liste / sidebar |
| `app/mail/mailListViewContext.ts` | `registerMailListDeps`, fusion pages threads |
| `app/mail/mailListMailboxLoadRun.ts` | `loadMailView` (unifiée, brouillons, dossier) |
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
| `wireEvents.ts` | `wireEvents()` (câblage DOM) |
| `wireEvents/handleActionInboxSearch.ts` | Inbox / recherche — dispatch vers sous-handlers |
| `wireEvents/handleActionContactsWireRun.ts` | Contacts + import/export vCard |
| `wireEvents/handleActionAgentAssistWireRun.ts` | Agent, mic, sync, corbeille bulk |
| `wireEvents/handleActionSearchViewsWireRun.ts` | Vues enregistrées, chips recherche, filtres liste |
| `wireEvents/handleActionListThreadWireRun.ts` | Fil liste, déplacement, brouillons sauvés |
| `wireEvents/handleActionOrgFolder.ts` | Org / dossiers — dispatch vers sous-handlers |
| `wireEvents/handleActionOrgFolderNavRun.ts` | Ouverture vues org / contacts / FM |
| `wireEvents/handleActionFolderManagerRun.ts` | Actions gestionnaire dossiers (`fm-*`) |
| `wireEvents/handleActionOrgV2WireRun.ts` | Wire org v2 (scan, apply, modales) |
| `wireEvents/handleActionOrgV1WireRun.ts` | Wire org v1 (scan, apply, retag) |
| `wireEvents/handleActionComposeSettings.ts` | Paramètres / comptes / prefs IA — **typé** |
| `wireEvents/handleActionThreadCompose.ts` | Compose / fil / brouillons — **typé** |
| `wireEvents/wireEventsContext.ts` | Refs UI (abort compose, prefs IA immédiats, carnet d’adresses) |
| `app/mail/composeViewWireActions.ts` | Entrée vue compose (`enterComposeView`, session, preview layout) |
| `app/mail/composeAssistWireActions.ts` | Assist IA compose (résumé expéditeur, quick replies) |
| `app/mail/addressBookWireActions.ts` | Carnet d’adresses (fiche contact, compteur sidebar) |
| `app/mail/accountWireActions.ts` | Compte / micro / brouillons sauvegardés |
| `app/mail/accountSettingsRun.ts` | Barrel save/delete/OAuth/discovery (voir `account*Run.ts`) |
| `app/mail/accountSaveRun.ts` | `saveAccount`, `saveAccountProgrammatic` |
| `app/mail/accountDeleteRun.ts` | `deleteSettingsAccount` |
| `app/mail/accountServerDiscoveryRun.ts` | Détection IMAP/SMTP (formulaire + OAuth snap) |
| `app/mail/accountOAuthFinishRun.ts` | Post-login OAuth nouveau compte |
| `wireEvents/depsCore.ts` | invoke, toast, state, render, loaders, nav, modales — réexporte `depsContext` |
| `wireEvents/depsSearchMail.ts` | inbox, recherche, agent, carnet, entrée compose |
| `wireEvents/depsComposeThread.ts` | compose, fil, LLM compose |
| `wireEvents/depsSettingsAccount.ts` | réglages, OAuth, prefs IA, setup compte |
| `wireEvents/depsOrgFolder.ts` | org / gestionnaire dossiers |
| `threadTagsRender.ts` | Modale / chips tags fil |
| `actionBriefHtml.ts` | HTML brief d’action IA |

Libs associées : `attachmentSize.ts`, `searchBadgeLabel.ts`, …

Outils : `tools/extract-source.mjs` (source par défaut `app/mail/appModuleRegistry.ts`, `--source=` ou `RUSTYMAIL_EXTRACT_SOURCE`), `tools/extract-application-fns.mjs`, `tools/degrade-extract-lib-modals.mjs`, `tools/degrade-extract-batch2.mjs`, `tools/degrade-extract-batch3.mjs`.

## Prochaines extractions (ordre suggéré)

1. Découper `wireEvents/handleActionThreadCompose`, `handleActionComposeSettings`
2. Poursuivre le découpage render / wire si de nouveaux god-modules apparaissent

`npm run verify:ts` · `npm test`
