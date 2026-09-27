# Lecture — état du nettoyage HTML

Chaîne : HTML MIME → `clean_html_builtin` (générique, puis Amazon / Deblock / GitHub si le signal est fort) → `CleanedMessageView.cleanedHtmlBody` → ombre DOM + `sanitizeEmailHtml` (DOMPurify et gardes).

Les images distantes restent bloquées tant que la personne ne demande pas à les charger. Le cœur mail ne dépend pas d’un LLM pour ce nettoyage.

## Ce qui tient

- Générique : scripts, styles, MSO/VML, citations Gmail, pixels 1×1, signatures repliées, rapports de transfert Outlook.
- Amazon et Deblock : digests sur fixtures d’intégration existantes.
- GitHub : digest des notifications quand l’expéditeur est `github.com` / `githubnoreply.com` (test d’intégration ajouté). Un simple mot « github » dans le HTML, ou un sujet « GitHub … » sans URL github.com, ne réécrit plus le corps.
- Affichage : les digests GitHub utilisent les mêmes règles de tableau que Amazon et Deblock.

## Correctifs de cette passe

- Le passage générique retire aussi `video`, `audio`, `svg` et `source` (règles v10).
- Un pixel 2×2 ou 3×3 n’est retiré que s’il pointe vers un hôte de tracking. Un petit fichier sans ce signal est conservé.
- Côté lecture, les balises actives (`style`, `video`, `svg`, `source`, …) sont retirées avec leur contenu avant DOMPurify, pour ne pas laisser une feuille CSS (et ses `url()`) en texte visible. Les `srcset` restants sont vidés. Les `data:image/svg+xml` ne sont pas acceptés sur les images.

## Hors scope

- Juger le phishing des liens GitHub ou Amazon qui ont l’air légitimes (reste du côté `mail_security`).
- Replier les citations Gmail au lieu de les retirer : choix actuel, le fil cité HTML n’est pas réaffiché dans la vue nettoyée.
- Un expéditeur non Amazon dont le HTML ressemble au pied de page Amazon peut encore prendre le passage faible Amazon (strip de tableaux). Les fixtures Amazon fortes ne changent pas.
- Pas de politique « texte seul par défaut ». La vue d’origine, si elle est ouverte, passe par le même DOMPurify.
