# job-hunter-bot

Bot de veille d'offres d'emploi/missions remote. Une fois par jour (GitHub Actions), il :

1. collecte les offres de plusieurs sources en parallèle (une source qui plante ne bloque pas les autres) ;
2. filtre selon `config.json` (mots-clés, remote, âge) ;
3. supprime les offres déjà envoyées (MongoDB Atlas) ;
4. t'envoie **un seul email digest** (HTML + texte), groupé par source.

Aucun serveur à maintenir : le script démarre, travaille, s'arrête.

## Installation

Prérequis : Node.js 22+.

```bash
npm install
cp .env.example .env    # puis remplis les valeurs
npm test                # tests (aucun appel réseau, aucun email)
npm run dry-run         # tout sauf l'envoi d'email et l'écriture en base
npm start               # exécution réelle
```

`--dry-run` ne demande aucune variable d'environnement. Si `MONGODB_URI` est défini, la déduplication est lue (jamais écrite) ; sinon elle est ignorée.

## Variables d'environnement

| Variable | Rôle |
| --- | --- |
| `MONGODB_URI` | Chaîne de connexion MongoDB Atlas |
| `GMAIL_USER` | Adresse Gmail expéditrice |
| `GMAIL_APP_PASSWORD` | Mot de passe d'application Gmail (pas le mot de passe du compte) |
| `EMAIL_TO` | Destinataire du digest (ton email) |
| `ENABLE_AI_SCORING` | `true` pour activer la notation IA (optionnel) |
| `ANTHROPIC_API_KEY` | Clé API Anthropic, requise si le scoring est activé (optionnel) |

Aucun secret n'est écrit dans le code ni dans les logs. `.env` est ignoré par git.

## Créer le cluster MongoDB Atlas gratuit

1. Crée un compte sur [mongodb.com/atlas](https://www.mongodb.com/atlas) et un **cluster M0 (gratuit)**.
2. **Database Access** : crée un utilisateur avec mot de passe, rôle *Read and write to any database*.
3. **Network Access** : ajoute `0.0.0.0/0` (les IP des runners GitHub changent à chaque exécution). La sécurité repose alors sur le mot de passe : utilise-en un long et aléatoire.
4. **Connect > Drivers** : copie la chaîne `mongodb+srv://...` et remplace `<password>`. Ajoute un nom de base avant le `?`, par exemple `.../job-hunter?retryWrites=true`.
5. Colle-la dans `MONGODB_URI`.

Le bot crée tout seul la collection `seen_jobs`, l'index unique sur `id` et un index TTL de 90 jours sur `firstSeenAt` (la collection ne grossit pas indéfiniment).

## Créer le mot de passe d'application Gmail

Idéalement sur **un compte Gmail dédié au bot**.

1. Active la **validation en 2 étapes** : [myaccount.google.com/security](https://myaccount.google.com/security).
2. Va sur [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords), crée un mot de passe d'application (nom : `job-hunter-bot`).
3. Copie les 16 caractères dans `GMAIL_APP_PASSWORD` (sans espaces) et l'adresse du compte dans `GMAIL_USER`.
4. `EMAIL_TO` : ton adresse de réception (peut être la même).

## Déployer sur GitHub Actions

1. Pousse le projet sur un repo GitHub privé.
2. **Settings > Secrets and variables > Actions > New repository secret** : crée `MONGODB_URI`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `EMAIL_TO`.
3. Le workflow [.github/workflows/job-hunter-bot.yml](.github/workflows/job-hunter-bot.yml) tourne chaque jour à **06:00 UTC (09:00 à Madagascar)**.
4. **Lancement manuel** : onglet **Actions > job-hunter-bot > Run workflow**.

Le job échoue (code de sortie non nul, donc visible dans GitHub) si toutes les sources échouent, si MongoDB est injoignable ou si l'envoi de l'email échoue. Les offres ne sont marquées « vues » qu'**après** un envoi réussi : rien n'est perdu si l'email échoue.

Attention : GitHub désactive les workflows planifiés après 60 jours sans activité sur le repo ; un commit ou un lancement manuel les réactive.

## Configuration (`config.json`)

| Clé | Rôle |
| --- | --- |
| `include` | Au moins un de ces mots-clés (mot entier) doit apparaître dans titre/description/tags |
| `exclude` | Aucun de ces mots-clés ne doit apparaître |
| `remoteOnly` | Rejette les offres dont le lieu n'est pas remote (lieu vide = gardé) |
| `excludeLocations` | Écarte les lieux contenant ces fragments (ex. `us only`) : inutiles depuis Madagascar |
| `maxAgeDays` | Ignore les offres plus vieilles (date inconnue = gardée) |
| `sendEmptyDigest` | `true` pour recevoir un email même sans nouvelle offre |
| `scoring` | `minScore`, `maxJobsScored`, `model` (voir bonus) |
| `sources` | Active/désactive chaque source |

Note : `include`/`exclude` portent aussi sur la description, donc un « exclude » comme `stage` peut écarter une offre qui le mentionne en passant, et un « include » comme `react` peut laisser passer une offre qui le cite seulement dans sa liste d'outils. Ajuste les mots-clés selon le bruit que tu observes.

## Bonus : notation IA (désactivée par défaut)

Avec `ENABLE_AI_SCORING=true` et `ANTHROPIC_API_KEY`, chaque exécution envoie les nouvelles offres (au plus `maxJobsScored`) à l'API Claude en **une seule requête**, avec un modèle économique (`scoring.model`). Chaque offre reçoit une note de 0 à 10 et une phrase de justification ; le digest est trié par score et masque les offres sous `minScore` (défaut 5). Si l'appel échoue, le digest part sans score. Pour l'activer en CI, ajoute les deux variables au workflow (secret pour la clé).

## Ajouter une source

1. Inspecte la vraie réponse de la source (curl), lis ses conditions d'utilisation et son `robots.txt`.
2. Crée `src/sources/<nom>.ts` : une fonction pure `parseXxx(raw): Job[]` (testable) et un `Source` (`{ name, fetch }`). Utilise `fetchJson`/`fetchText` de [src/http.ts](src/http.ts) (User-Agent, timeout 10 s, 2 essais) et génère un `id` stable `"<nom>:<id>"`.
3. Ajoute-la dans [src/sources/index.ts](src/sources/index.ts) et `"<nom>": true` dans `config.json`.
4. Ajoute son lien d'attribution dans `SOURCE_INFO` ([src/notify.ts](src/notify.ts)).
5. Enregistre une réponse réelle (réduite) dans `tests/fixtures/` et écris le test dans `tests/sources.test.ts`.

## Sources et limites connues

| Source | Méthode | Remarques |
| --- | --- | --- |
| Remote OK | API JSON `remoteok.com/api` | Lien + mention de la source obligatoires (inclus dans le digest). Peu de lieux renseignés. |
| Remotive | API JSON `remotive.com/api/remote-jobs` | Catégorie `software-dev`. Offres retardées de 24 h, max ~4 appels/jour (1 par exécution), lien + mention obligatoires. Son `robots.txt` liste `/api/*` mais l'API est documentée publique par Remotive. Ne renvoie que peu d'offres. |
| We Work Remotely | Flux RSS (full-stack, front-end, back-end) | La région (« USA Only », « EMEA Only »…) sert de lieu. |
| Himalayas | API JSON de recherche (react, typescript, node.js, full stack) | Lien de candidature fourni par l'API et crédit visible dans le digest. 20 résultats par requête. |
| Hacker News | API Algolia, dernier thread « Who is hiring? » | Posts en texte libre : entreprise/lieu déduits de la 1re ligne ; thread publié le 1er du mois, donc `maxAgeDays: 7` les écarte après une semaine. |
| GetYourJob | HTML rendu côté serveur de `getyourjob.pro/offers` (+ `?q=` react, typescript, node) + cheerio | Site orienté France : la plupart des offres sont « Hybride »/« Sur site » et sont écartées par `remoteOnly` ; seules les « Full remote » passent. Dates relatives (« il y a 2 j »). Voir ci-dessous. |
| PortalJob | **Désactivée par défaut** | Voir ci-dessous. |

### GetYourJob

`robots.txt` autorise `/offers` (seul `/api/` est interdit, il n'est pas utilisé). Les CGU interdisent l'extraction *massive* des offres (« scraping, robots hors des usages autorisés ») : le bot reste donc à **4 pages de liste publiques par jour**, sans compte ni `/api/`, avec un User-Agent explicite et un lien vers l'offre d'origine dans le digest. Si tu veux être plus prudent, désactive `getyourjob` dans `config.json` ou contacte le site (`contact@getyourjob.pro`). Le connecteur dépend de la structure HTML de la page (cartes `h3 > a[href^="/jobs/"]`) : si le site change, le test sur fixture et le log `[getyourjob] 0 offres` le signaleront.

### PortalJob

La page `/emploi/liste` ne contient **pas** les offres dans son HTML : elles sont chargées côté client par `POST /api/emploi/annonces`, qui répond `403 Access not allowed` à un client sans session. Ce bot n'utilise ni session, ni cookie, ni contournement de protection : le connecteur [src/sources/portaljob.ts](src/sources/portaljob.ts) est donc prêt (il lit les props Inertia et le HTML rendu côté serveur) mais renvoie 0 offre aujourd'hui, et `portaljob` est à `false` dans `config.json`. Les options sont : demander à PortalJob un flux/API officiel, ou un navigateur automatisé (Playwright), ce qui est à décider explicitement avant de l'ajouter.

Hors périmètre v1 : LinkedIn, Indeed et Glassdoor ne sont pas scrapés.
