# Audit — décisions Organiser et RAG

**Date :** 2026-09-27  
**Périmètre :** `main` (`dae0103`) + lecture de la PR [#6](https://github.com/nico2511/RustyMail/pull/6) (`cursor/updater-org-lecture-572a`, mergeable, non mergée).  
**Cette PR :** audit seulement. Aucun code produit, aucune table, aucun prompt modifié.

## Verdict

**Oui, avec nuances.** Mémoriser les actions validées pour qu’elles influencent la prochaine orientation est le bon besoin. L’appeler « RAG » est utile seulement si l’on vise une **mémoire de décisions** lue par le LLM Organiser. Ce n’est pas une raison d’ajouter un magasin vectoriel tiers, ni de réindexer les mails.

| Option | Pertinence | Pourquoi |
| --- | --- | --- |
| **(A)** Indexer les mails pour un RAG de contexte | Déjà là, et insuffisant pour la demande | MiniLM + `message_embeddings` servent la **recherche**. Organiser ne les interroge pas. Un vecteur de mail ne dit pas « l’utilisateur a validé d’archiver ce type de fil ». |
| **(B)** Mémoriser les décisions validées (few-shot / préférence) | **C’est la demande** | Une courte liste structurée, injectée au prochain prompt, et un filtre déterministe pour ne pas reproposer le même lot. |
| **(C)** Un store RAG dédié (vecteurs de décisions, ou pire un service cloud) | Pas pour la première PR | Quelques dizaines de lignes tiennent dans le prompt. Un index MiniLM des décisions n’a de sens que si la table dépasse le budget de tokens. |

Ce que Nicolas appelle probablement « passer dans le RAG » : **les actions validées doivent peser sur les orientations suivantes**. Aujourd’hui elles sont enregistrées, puis surtout utilisées pour **cacher la même carte**. Elles ne sont pas relues par le modèle. Les embeddings de mails ne comblent pas ce trou.

Base d’implémentation recommandée : la PR #6, une fois mergée (ou en la rebasant). Elle fait de l’orientation LLM la sortie affichée. `main` seul n’a pas encore ce contrat (`diagnosis` / `recommendations` / `actions`).

---

## 1. Ce qui existe déjà

### 1.1 Recherche sémantique des mails — pas un RAG Organiser

`rustymail-semantic` calcule des embeddings **all-MiniLM-L6-v2** (ONNX, dimension 384, L2-normalisés). Les vecteurs vivent dans SQLite chiffré (SQLCipher), table `message_embeddings` :

```text
message_id PK, model_id, dim, vector BLOB, indexed_at
```

Fichiers : `crates/rustymail-semantic/src/{lib,minilm,cosine}.rs`, indexation et requête dans `crates/rustymail-infrastructure/src/semantic_search.rs`.

- Texte indexé : sujet + corps plain tronqué (~8 000 caractères), parfois enrichi d’entités. Pas le HTML brut.
- Modes UI : lexical (FTS), sémantique, hybride (`SearchMode`). Le score sémantique est un **cosinus en Rust** sur les lignes du compte (ou du dossier), pas un index ANN.
- Réindex : commandes compte / dossier / manquants ; option `aiBackgroundAutoSemanticIndex` (désactivée par défaut).
- Suppression : sync IMAP, vidage de dossier, `delete_account` retirent les vecteurs du compte. Les poids ONNX dans `models/all-MiniLM-L6-v2/` restent (partagés).

**Organiser n’appelle pas cette recherche.** Le rattachement des cartes LLM sans ids passe par `search_threads_by_keywords` → `match_keyword_rule` : sous-chaîne sur sujet + expéditeur (`org_scan.rs`). Aucun cosinus.

### 1.2 Mémoire Organiser — filtre d’exactitude, pas une préférence

Table `org_memory` (`crates/rustymail-infrastructure/src/org_memory.rs`), créée au migrate SQLite :

```text
org_memory (
  account_id, entry_kind, rule_key, scope_fingerprint,
  decision, snooze_until, thread_ids_json, created_at, updated_at
)
UNIQUE (account_id, entry_kind, rule_key, scope_fingerprint)
```

| `entry_kind` | Rôle | Décisions |
| --- | --- | --- |
| `proposal` | Une carte déjà traitée | `applied`, `dismissed`, `snoozed` |
| `mailbox_ignore` | Dossier exclu de l’analyse | `ignore` |
| `mailbox_auto_archive` | Dossier en archivage auto | `enabled` |

`scope_fingerprint` = SHA-256 de `rule_key` + **liste triée d’ids de fils**. `rule_key` vient de `explain_rule_id` (ex. `stale-inbox-read`) ou, à défaut, des deux premiers segments de l’id de carte (`llm-0` pour une carte IA, qui n’a pas de `explain_rule_id`).

`filter_proposals_with_memory` masque une carte seulement si **la même règle et le même ensemble de fils** sont déjà `applied`, `dismissed`, ou `snoozed` encore dans le délai (7 jours par défaut). Les dossiers ignorés sont retirés des refs.

Conséquence : valider « archiver les factures A, B, C » ne dit rien au scan suivant sur les factures D, E, F. La clé change, la carte revient, le modèle n’a pas vu la validation.

### 1.3 Autres mémoires — voisines, pas branchées sur l’orientation

| Store | Où | Lien avec Organiser |
| --- | --- | --- |
| `org_apply_history` | Undo d’un lot IMAP (`batch_id`, action, dossiers). Pas une préférence. | Écrit à l’apply. Jamais lu par le LLM. |
| `threads.tags` | Tags heuristiques (`org_retag`). | Scan « tags périmés » en v1 seulement. Pas une décision utilisateur. |
| `general.org_keyword_rules` | `app_prefs.json` : libellé, mots-clés, dossier cible. | Règles **saisies**, pas apprises. Le scan `CustomKeywordCluster` les applique en sous-chaîne. |
| `general.auto_archive_rules` | Préférences, opt-in. | Archivage planifié, hors file d’orientation. |
| `newsletter_rules` | SQLite, **globales au profil** (pas par compte). | Heuristique newsletter / corbeille. Non effacées par `delete_account`. |
| `activity_suggestion_memory` | Décisions accepter / ignorer / snooze des suggestions d’activité. | Même idée de suppression exacte. Pas de few-shot LLM. |
| `ai_cache` | Réponses LLM (résumé, traduction…) avec TTL. | Le WebView ne peut pas écrire. Organiser ne s’en sert pas comme mémoire de décisions. |
| `search_history` / `saved_searches` | Requêtes de recherche. | Hors Organiser. |

Il n’existe **aucune** table `org_decisions`, aucun few-shot, aucun vecteur de décision.

### 1.4 PR #6 comme base

[#6](https://github.com/nico2511/RustyMail/pull/6) est **mergeable** sur `main` au moment de cet audit (tête `2d996b1`, branche `cursor/updater-org-lecture-572a`). Elle mélange trois sujets (updater Windows, orientation Organiser, lecture HTML). Pour la suite RAG, seule la partie Organiser compte.

Ce qu’elle change, et qui rend la mémoire utile :

- La vue v2 n’affiche plus les cartes heuristiques. Les heuristiques sont un **contexte** (`format_org_heuristic_context`, 12 lignes max).
- La sortie validée est une orientation : `diagnosis`, `recommendations[]`, `actions[]` (`validate_org_orientation_shape`, prompt `org_proposals.system.txt`).
- Sans modèle joignable, ou si « Propositions Organiser » est off : message d’état, file vide, pas de texte inventé.
- `org_v2_with_llm_outcome` **refiltre** les actions LLM avec `org_memory`. Sur `main`, ce n’est pas le cas : `org_v2_scan_account_cmd` ajoute les `LlmCluster` **après** `filter_proposals_with_memory`, donc une carte IA déjà traitée peut revenir.

Ce qu’elle ne change pas : le prompt d’orientation ne charge pas `org_memory`. Le bloc utilisateur est le compte, les heuristiques, et un catalogue `threadId;mailbox;expéditeur;sujet` (plafond 120 fils, rogné au `n_ctx`). Les recommandations textuelles ne sont pas persistées : il n’y a pas de geste « valider cette recommandation ». Seules les **cartes d’action** passent par apply / dismiss / snooze, via le même `record_proposal_decision`.

Le cœur mail (IMAP, lecture, envoi) reste hors de ce module. À conserver.

---

## 2. Flux actuel : orientation → validation → apply

### Sur `main` (ce qui est livré)

```text
UI Organiser v2
  orgV2ScanAccount(includeLlm = featureOrgProposalsEnabled)
    → org_v2_scan_account
         scan heuristique (org_scan_account, include_llm ignoré)
         filtre kinds v2
         filter_proposals_with_memory     ← seule lecture de org_memory
    → si include_llm : org_scan_account_compute
         catalogue 120 fils + org_proposals_with_llm
         cartes LlmCluster ajoutées APRÈS le filtre mémoire
  UI : cartes (heuristiques + IA)

Dismiss / snooze 7 j
  → org_v2_record_decision_cmd → org_memory (proposal)

Apply (archive, move, trash, delete mailbox)
  → org_apply_proposal_cmd → IMAP + org_apply_history (undo)
  → si lot entièrement ok, sans erreur, non annulé :
       orgV2RecordDecision(..., "applied")
  → apply partiel, erreur ou annulation : PAS d’écriture "applied"
```

Écriture : `src/app/mail/orgV2ApplyOutcomeRun.ts` (`cleanSuccess` seulement), `src/app/mail/orgV2ProposalUi.ts` (dismiss, snooze). Lecture suivante : masquage exact, pas le prompt.

### Sur la PR #6 (orientation)

```text
org_v2_scan_account_compute
  heuristiques + mémoire          → contexte, pas la file affichée
  org_llm_orientation_for_account → JSON validé
  org_v2_with_llm_outcome
       si orientation ok : la file = actions LLM, refiltrées par org_memory
       sinon             : file vide + message

Affichage
  diagnostic + recommandations (texte, non validables une à une)
  cartes d’action (apply / dismiss / snooze) — même persistance qu’aujourd’hui
```

```text
  scan heuristique                org_memory (exact)
         │                              │
         ▼                              │ masque le même lot
  catalogue fils (120)                  │
         │                              │
         ▼                              │
  prompt LLM  ◄── ne lit PAS la mémoire ┘
         │
         ▼
  orientation validée (Rust)
         │
         ├── recommandations (affichées, non stockées)
         └── actions ── apply / dismiss / snooze
                              │
                              ▼
                         org_memory (fingerprint = ids de fils)
                         org_apply_history (undo seulement si apply)
```

Le geste « validé » qui existe vraiment est donc : **appliquer** (succès complet), **ignorer**, ou **reporter** une carte d’action. Le diagnostic et les puces de recommandation de la PR #6 ne sont pas des décisions.

---

## 3. Pourquoi (A) ne répond pas à Nicolas

Indexer plus de mails améliore « trouver des fils qui ressemblent à une facture ». Ça n’enregistre pas le choix. Après un apply, les fils ont souvent **changé de dossier** : leur embedding décrit le contenu, pas « l’utilisateur a choisi Archive/2026/09 plutôt que la corbeille ». Un nouveau fil similaire n’est pas relié à cette décision, sauf si l’on embed aussi la décision et qu’on la retrouve — ce qui est (B), éventuellement vectorisé plus tard, pas (A).

Garder MiniLM pour la recherche. Ne pas le détourner comme mémoire d’Organiser dans la première PR.

---

## 4. Architecture minimale proposée (PR suivante, après OK)

Objectif : au prochain run, le LLM voit un bloc court de décisions **généralisées**, et le filtre exact actuel continue d’empêcher de réafficher le même lot même si le modèle l’ignore.

### 4.1 Schéma SQLite (nouvelle table, même base SQLCipher)

Ne pas surcharger la clé unique de `org_memory`. Elle est faite pour un ensemble de fils, pas pour un motif réutilisable.

```text
org_decisions (
  id              INTEGER PRIMARY KEY,
  account_id      TEXT NOT NULL,
  pattern_key     TEXT NOT NULL,   -- voir ci-dessous
  decision        TEXT NOT NULL,   -- applied | dismissed | snoozed
  action          TEXT NOT NULL,   -- archive | move | trash | markRead | deleteMailbox | none
  target_mailbox  TEXT,            -- chemin IMAP cible, ou NULL
  rule_key        TEXT,            -- explain_rule_id si heuristique, sinon NULL
  source          TEXT NOT NULL,   -- heuristic | llm
  title           TEXT NOT NULL,   -- titre de carte, tronqué (80)
  keywords_json   TEXT NOT NULL DEFAULT '[]',  -- 0 à 6 jetons
  sender_domain   TEXT,            -- un domaine dominant, pas la liste d’adresses
  support_count   INTEGER NOT NULL DEFAULT 1,
  scope_fingerprint TEXT,          -- copie du fingerprint exact, pour le lien avec org_memory
  snooze_until    TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
)
UNIQUE (account_id, pattern_key)
INDEX (account_id, updated_at DESC)
```

`pattern_key` (normalisé, stable) :

```text
{action}|{target_mailbox ou -}|{rule_key ou -}|{sender_domain ou -}|{keywords triés}
```

Exemple : `archive|-|stale-inbox-read|-|-` ou `move|Finance|-|amazon.fr|invoice,receipt`.

Plafond : **200 lignes par compte**, éviction des plus anciennes à `support_count = 1`. Au-delà, on n’embed pas : on tronque.

`org_memory` reste pour le masquage exact et les dossiers ignorés. `org_decisions` est la préférence. `org_apply_history` reste l’undo.

### 4.2 Quand écrire

Même moments qu’aujourd’hui, dans `record_proposal_decision` (un seul endroit Rust, pas le WebView) :

| Événement | Écriture |
| --- | --- |
| Apply complet sans erreur (`cleanSuccess`) | `decision=applied`, `support_count += 1` sur le motif |
| Dismiss | `decision=dismissed` |
| Snooze | `decision=snoozed` + `snooze_until` |
| Apply partiel, annulé, ou en erreur | rien (comportement actuel, à garder) |
| Diagnostic / puces de recommandation | **rien**, tant qu’il n’y a pas un bouton de validation dédié |
| Ignore dossier | déjà `org_memory.mailbox_ignore` — le citer dans le bloc lu, sans dupliquer la table |

Dérivation du motif, côté Rust, depuis la carte :

- action effective + dossier cible ;
- `explain_rule_id` s’il existe ;
- sinon domaine de l’expéditeur le plus fréquent dans les refs (un seul) ;
- mots-clés déjà sur la carte (`llm_search_keywords` ou libellé de règle), max 6, minuscules.

Ne pas stocker de corps, de liste d’ids brute, ni d’adresse complète.

`delete_account` doit faire `DELETE FROM org_decisions WHERE account_id = ?` **et** le même delete sur `org_memory` et `org_apply_history`. Aujourd’hui ces deux tables **survivent** à la suppression du compte (les embeddings, eux, sont purgés). À corriger dans la PR d’implémentation, pas ici.

### 4.3 Comment le LLM lit la mémoire

Point de lecture unique : `org_llm_orientation_for_account` (PR #6). Sur `main`, l’équivalent est `org_proposals_with_llm` — à ne brancher qu’après la bascule orientation, sinon on nourrit un prompt qui n’est plus la sortie v2.

```text
Compte
+ bloc <prior-decisions>   budget dur : 8 lignes, ~600 caractères, AVANT le rognage du catalogue
+ heuristiques (déjà là en #6)
+ catalogue de fils (rogné au n_ctx comme aujourd’hui)
```

Lignes, tri `support_count` puis `updated_at` :

```text
applied ×4 | archive | règle stale-inbox-read
dismissed ×2 | trash | domaine example-bank.tld
applied ×3 | move → Finance | mots invoice,receipt | domaine amazon.fr
ignored mailbox | Newsletters/Promo
```

Enveloppe `untrusted_mail_content_block` (déjà utilisée en #6 pour les heuristiques et le catalogue). Le modèle traite ce bloc comme une donnée, pas comme une consigne. Le prompt système ajoute une règle courte : s’aligner sur les `applied`, ne pas reproposer un motif `dismissed`, ne pas inventer d’ids.

Filtre déterministe **en plus** du prompt (le modèle peut désobéir) :

- garder `filter_proposals_with_memory` (même ensemble de fils) ;
- si un motif `dismissed` a `support_count >= 2`, retirer l’action LLM dont le `pattern_key` recalculé est identique, et compter ça dans `memory.suppressed_count`.

Ne pas appliquer tout seul un motif `applied`, même après N validations. La confirmation (corbeille, suppression de dossier, archive) reste obligatoire. La mémoire influence la **proposition**, pas l’IMAP.

Pas de promotion silencieuse vers `org_keyword_rules` ou `auto_archive_rules`. Une PR ultérieure pourra proposer « en faire une règle » avec accord explicite.

### 4.4 Embeddings vs table

```text
message_embeddings     recherche UI (lexical / sémantique / hybride)     inchangé
org_memory             masquage du lot exact + dossiers exclus           inchangé dans son rôle
org_decisions          préférence lue par l’orientation                   nouveau
org_decision_vectors   option phase 2, seulement si > budget prompt       pas dans la PR 1
```

Phase 2, seulement si la table dépasse ce qui tient dans 8 lignes : embedder le **résumé de décision** (pas le mail) avec le même MiniLM local, cosinus top-8, toujours dans SQLite. Pas de nouveau modèle, pas de service.

### 4.5 Schéma de lecture

```text
validate / apply
        │
        ▼
 org_decisions  (motif, support, décision)     org_memory (ids exacts)
        │                                              │
        │  8 lignes, bloc non fiable                   │ filtre déterministe
        ▼                                              ▼
 prompt orientation  ──►  JSON  ──►  validate_org_orientation_shape
                                              │
                                              ▼
                                    actions affichées
                                    (jamais d’apply auto)
```

---

## 5. Risques (local-first, SECURITY)

| Risque | Garde |
| --- | --- |
| **Fuite vers un LLM tiers** | OpenRouter et toute URL non loopback passent déjà par `redact_pii_for_exfiltration` (e-mails, téléphones, IBAN, cartes, jetons). Le bloc décisions doit emprunter le même chemin : domaine et mots-clés seulement, pas d’adresse, pas de corps, pas de liste d’ids. Loopback (llama-server, Ollama sur `127.0.0.1`) reste non rédigé, comme le reste du courrier local (`docs/SECURITY.md`). |
| **Injection de prompt** | Titres de cartes et mots-clés viennent du modèle ou de l’utilisateur. Bloc `untrusted`, taille bornée. Ne pas concaténer le JSON d’historique brut. |
| **Biais** | Un vieux `applied` peut faire proposer toujours le même geste. Le bloc est un indice ; le filtre dur ne porte que sur les `dismissed` répétés et sur le lot exact. Afficher dans l’UI le nombre de motifs utilisés (à côté de `suppressedCount`, qui existe déjà). Prévoir un oubli par ligne (delete d’un `pattern_key`) dans la PR d’UI, pas un reset caché. |
| **Taille / `n_ctx`** | Le catalogue est déjà rogné (`ORG_LLM_OUTPUT_RESERVE` 2048 + marge). Réserver le budget décisions **avant** ce rognage, sinon les fils utiles disparaissent au profit de l’historique. |
| **Vie privée** | Tout reste dans `rustymail.sqlite3` (SQLCipher, clé trousseau). Pas de RAG cloud, pas de télémétrie. `delete_account` doit purger `org_decisions`, `org_memory`, `org_apply_history` — trou actuel sur les deux dernières. `newsletter_rules` est globale : ne pas y écrire une préférence de compte. |
| **Cœur mail** | Lecture de la mémoire uniquement derrière `AiFeature::OrgProposals` et le scan v2. IMAP, SMTP, lecture : aucun appel. Si le LLM est off, les décisions restent en base et ne produisent pas d’orientation inventée (contrat #6). |
| **Cartes IA instables** | `id = llm-0` change d’un run à l’autre. La clé de préférence est le motif (action, cible, domaine, mots-clés), pas cet id. |

---

## 6. Plan d’implémentation (PR suivante, après OK Nicolas)

À faire **après** merge de #6, sur une branche dédiée. Pas dans cette PR.

1. Migration `org_decisions` + tests d’upsert de motif (même pattern incrémente `support_count`, un autre pattern ne masque pas le premier).
2. Écriture dans `record_proposal_decision` aux trois décisions existantes. Pas d’écriture sur apply partiel.
3. Lecture bornée dans `org_llm_orientation_for_account`, bloc non fiable, budget avant rognage du catalogue.
4. Filtre déterministe : lot exact (`org_memory`) + motif `dismissed` répété. Compteur UI.
5. `delete_account` : purge `org_decisions`, `org_memory`, `org_apply_history`.
6. Tests : le prompt contient une décision `applied` précédente ; un motif rejeté deux fois ne revient pas sans dépendre du modèle ; un moteur qui exfiltre voit le bloc rédigé ; le cœur mail ne référence pas la table.
7. Hors de cette PR-là aussi : index vectoriel de décisions, promotion automatique en règle de mots-clés, validation individuelle des puces de recommandation, fusion v1/v2.

Critère d’acceptation pour Nicolas : après avoir validé « déplacer les factures vers Finance », une orientation suivante **mentionne** ce choix et propose le même geste sur de **nouveaux** fils, sans réafficher le lot déjà traité, et sans rien déplacer tant qu’il n’a pas confirmé.
