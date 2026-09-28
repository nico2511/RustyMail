# Lecture — état du nettoyage HTML

Le mail se lit comme une **discussion**. Le nettoyage générique sert ce mode : retirer le bruit qui gêne l’échange (trackers, styles, citations bruyantes, signatures lourdes), sans réécrire le courrier en carte digest.

Chaîne : HTML MIME → `clean_html_builtin` (générique, puis Amazon / Deblock / GitHub **seulement** si le signal expéditeur est fort) → `CleanedMessageView.cleanedHtmlBody` → ombre DOM + `sanitizeEmailHtml` (DOMPurify et gardes).

Les images distantes restent bloquées tant que la personne ne demande pas à les charger. Le cœur mail ne dépend pas d’un LLM pour ce nettoyage.

## Deux chemins, pas un modèle unique

| Chemin | Rôle |
| --- | --- |
| **Générique** (règles v11) | Lecture personne-à-personne. Le corps reste le message. Les citations Gmail et les `blockquote type="cite"` deviennent un `<details class="rm-mail-folded-quote">` fermé : la réponse est devant, l’historique se rouvre. Une citation qui est tout le message reste visible. La signature Gmail rejoint `rm-mail-signature` (masquée, comme les autres queues de signature). |
| **Plugins Amazon, Deblock, GitHub** | Digests newsletter / notification. Ils ne sont pas étendus au courrier générique. Un mot « unsubscribe » ou « privacy » dans une discussion ne déclenche pas une réécriture. |

`cleanedText` (synthèses, traduction, questions sur le fil) suit le corps affiché : le rapport de conversation Outlook quand il existe, sinon le texte du HTML nettoyé **sans** la citation repliée ni la signature masquée. Sans HTML, on garde le texte plain après signature et citations `>`.

Les mentions légales du plain (`dimmedBlocks`) ne sont plus seulement coupées : dans la vue texte, elles sont dans un bloc « Mentions masquées ».

## Ce qui tient

- Générique : scripts, styles, MSO/VML, pixels de tracking, signatures repliées, rapports de transfert Outlook (tours visibles, pas un digest).
- Amazon, Deblock, GitHub : digests inchangés sur leurs fixtures.
- Affichage : filet CSS sur `.gmail_quote` restant, sauf à l’intérieur d’une citation repliée. `.rm-mail-signature` reste masquée.

## Frontière volontaire

Le chrome marketing (préheader caché, barre sociale, pied légal, tableaux de mise en page) n’est **pas** retiré par le générique. Ces heuristiques abîment un fil de discussion et copieraient le rendu digest. Elles restent dans les plugins quand l’expéditeur est reconnu.

## Hors scope

- Juger le phishing des liens qui ont l’air légitimes (reste du côté `mail_security`).
- Un séparateur `-----Original Message-----` sans marqueurs Outlook : le corps cité reste dans le fil. Le rapport Outlook couvre les chaînes De / Envoyé / Objet.
- Un expéditeur non Amazon dont le HTML ressemble au pied de page Amazon peut encore prendre le passage faible Amazon (strip de tableaux). Les fixtures Amazon fortes ne changent pas.
- Pas de politique « texte seul par défaut ». La vue d’origine, si elle est ouverte, passe par le même DOMPurify.

## Suite envisagée

Généraliser le digest Deblock : un éditeur de découpe (pas le composer) marque header / body / footer, puis le template de lecture s’applique aux autres mails du même expéditeur et de la même structure. [CADRAGE_DIGEST_TEMPLATES.md](CADRAGE_DIGEST_TEMPLATES.md). Ce n’est pas le comportement actuel. Le plugin Deblock reste la découpe compilée. Le courrier personne-à-personne reste sur le générique, et l’ouverture d’un mail ne dépend pas d’un LLM.
