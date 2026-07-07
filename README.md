# SophroCR — Session Reports for Caycedian Sophrology

Private tool for **Vanessa Slous**, Caycedian sophrologist · [sophroslous.fr](https://sophroslous.fr)

Automatically transcribes session audio recordings (via AssemblyAI), generates structured session reports (via Claude / Anthropic), and exports them as formatted Word documents.

---

## Features

- **Automatic audio transcription** — upload one or more audio files, two-speaker diarization (sophrologist / client), French transcription via AssemblyAI
- **Manual transcription** — direct text input for cases without audio or when the service is unavailable
- **Report generation** — Claude produces a structured report in 4 sections following Caycedian rules: Pre-sophronic exchanges, Technique practiced, Phenomenological description, Orientations + Executive summary
- **Word preview** — visual rendering of the document before download (accurate layout)
- **Word download (.docx)** — formatted document matching the practice's visual identity
- **History** — browse and re-download past reports (stored in database), with full in-place editing
- **Authentication** — password-protected access, HMAC-SHA256 signed cookie, brute-force protection (10 attempts / 15 min per IP)
- **Non-indexed** — excluded from search engines (`robots.txt` + `X-Robots-Tag` header)

---

## Project structure

```
sophrocr/
├── server.js              → Express: auth, audio upload, transcription, report generation, history
├── generate_cr.js         → parseCR() (section parser) + Word document builder (docx)
├── prompts/
│   └── system_prompt.txt  → Caycedian rules and report structure sent to Claude
├── public/
│   ├── index.html         → main app (tabs: Session · History · Settings)
│   ├── rgpd.html          → privacy & GDPR page
│   └── robots.txt         → blocks search engine indexing
├── .env.example           → configuration template
├── package.json
└── .gitignore
```

---

## Tech stack

| Layer | Technology |
|-------|------------|
| Backend | Node.js + Express |
| Transcription | AssemblyAI (diarization, French) |
| Report generation | Anthropic Claude (`claude-sonnet-4-6`) |
| Word | `docx` library |
| History | PostgreSQL (Neon) |
| Frontend | Vanilla HTML/CSS/JS |

---

## Local setup

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or later
- An [Anthropic](https://console.anthropic.com) account (API key)
- An [AssemblyAI](https://www.assemblyai.com) account (API key)
- A PostgreSQL database (e.g. [Neon](https://neon.tech), free tier)

### Steps

```bash
# 1. Install dependencies
npm install

# 2. Create the configuration file
cp .env.example .env

# 3. Fill in your keys in .env (see comments in the file)
# 4. Start the server
npm start
```

Open `http://localhost:3000` in your browser.

---

## Environment variables

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic API key (report generation) |
| `ASSEMBLYAI_API_KEY` | AssemblyAI API key (audio transcription) |
| `DATABASE_URL` | Full PostgreSQL connection string (report history) |
| `PORT` | Server port (default: 3000) |
| `ACCESS_PASSWORD` | Access password (leave empty = no protection) |
| `COOKIE_SECRET` | HMAC key for signing session cookies |

Generate `COOKIE_SECRET`:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Deployment (Railway)

1. Create a project on [Railway](https://railway.app)
2. Choose **Deploy from GitHub repo** → select this repository
3. In the service → **Variables** tab → add all variables from the table above
4. In **Settings → Networking → Generate Domain** to get a public URL
5. Railway auto-detects `npm start` and redeploys on every `git push`

The Railway-generated URL is random (not guessable) + the password prevents any unauthorized access.

> **Note**: the password and any custom prompt edited via the UI are stored in the database — they survive redeploys.

---

## Security & privacy

- Audio files are **never stored** permanently — deleted immediately after upload to AssemblyAI
- Transcriptions are **not saved** to the database
- Only the written reports and session metadata are retained (deletable from the History tab)
- AssemblyAI and Anthropic do not use API data to train their models (contractual commitment)
- See the built-in [GDPR page](public/rgpd.html) for full details

---

# SophroCR — Comptes-rendus de séances de sophrologie

Outil privé de **Vanessa Slous**, sophrologue caycédienne · [sophroslous.fr](https://sophroslous.fr)

Transcrit automatiquement les enregistrements audio de séances (via AssemblyAI), génère un compte-rendu structuré (via Claude / Anthropic) et le télécharge en fichier Word formaté.

---

## Fonctionnalités

- **Transcription audio automatique** — upload d'un ou plusieurs fichiers audio, diarisation en deux locuteurs (sophrologue / client), transcription en français via AssemblyAI
- **Transcription manuelle** — zone de saisie directe pour les cas sans audio ou en cas de panne
- **Génération du CR** — Claude produit un CR structuré en 4 sections selon les règles caycédiennes : Échanges pré-sophroniques, Technique pratiquée, Phénodescription, Orientations + Résumé exécutif
- **Aperçu Word** — rendu visuel du document avant téléchargement (mise en page fidèle)
- **Téléchargement .docx** — document Word formaté aux couleurs de la charte graphique
- **Historique** — consultation et retéléchargement des CR passés (stockés en base de données)
- **Authentification** — accès protégé par mot de passe, cookie signé HMAC-SHA256, anti-brute-force (10 tentatives / 15 min par IP)
- **Non indexé** — exclu des moteurs de recherche (`robots.txt` + header `X-Robots-Tag`)

---

## Structure du projet

```
sophrocr/
├── server.js              → Express : auth, upload audio, transcription, génération CR, historique
├── generate_cr.js         → parseCR() (découpe les sections) + constructeur Word (docx)
├── prompts/
│   └── system_prompt.txt  → règles caycédiennes et structure de CR envoyées à Claude
├── public/
│   ├── index.html         → app principale (onglets : Séance · Historique · Paramètres)
│   ├── rgpd.html          → page confidentialité & RGPD
│   └── robots.txt         → bloque l'indexation par les moteurs de recherche
├── .env.example           → modèle de configuration
├── package.json
└── .gitignore
```

---

## Stack technique

| Couche | Technologie |
|--------|-------------|
| Backend | Node.js + Express |
| Transcription | AssemblyAI (diarisation, français) |
| Génération CR | Anthropic Claude (`claude-sonnet-4-6`) |
| Word | bibliothèque `docx` |
| Historique | PostgreSQL (Neon) |
| Frontend | HTML/CSS/JS vanilla |

---

## Installation locale

### Prérequis

- [Node.js](https://nodejs.org/) v18 ou plus récent
- Un compte [Anthropic](https://console.anthropic.com) (clé API)
- Un compte [AssemblyAI](https://www.assemblyai.com) (clé API)
- Une base de données PostgreSQL (ex. [Neon](https://neon.tech), gratuit)

### Étapes

```bash
# 1. Installer les dépendances
npm install

# 2. Créer le fichier de configuration
cp .env.example .env

# 3. Renseigner les clés dans .env (voir commentaires dans le fichier)
# 4. Lancer le serveur
npm start
```

Ouvrir `http://localhost:3000` dans le navigateur.

---

## Variables d'environnement

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Clé API Anthropic (génération CR) |
| `ASSEMBLYAI_API_KEY` | Clé API AssemblyAI (transcription audio) |
| `DATABASE_URL` | URL PostgreSQL complète (historique des CR) |
| `PORT` | Port du serveur (défaut : 3000) |
| `ACCESS_PASSWORD` | Mot de passe d'accès (laisser vide = pas de protection) |
| `COOKIE_SECRET` | Clé HMAC pour signer les cookies de session |

Générer `COOKIE_SECRET` :
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Déploiement (Railway)

1. Créer un projet sur [Railway](https://railway.app)
2. Choisir **Deploy from GitHub repo** → sélectionner ce dépôt
3. Dans le service → onglet **Variables** → ajouter toutes les variables du tableau ci-dessus
4. Dans **Settings → Networking → Generate Domain** pour obtenir l'URL publique
5. Railway détecte automatiquement `npm start` et redéploie à chaque `git push`

L'URL générée par Railway est aléatoire (non devinable) + le mot de passe empêche tout accès non autorisé.

> **Note** : le mot de passe et le prompt personnalisé modifiés via l'interface sont stockés en base de données — ils survivent aux redéploiements.

---

## Sécurité & confidentialité

- Les fichiers audio ne sont **jamais stockés** durablement — supprimés dès envoi à AssemblyAI
- Les transcriptions ne sont **pas enregistrées** en base de données
- Seuls les comptes-rendus rédigés et les métadonnées de séance sont conservés (supprimables depuis l'Historique)
- AssemblyAI et Anthropic n'utilisent pas les données de l'API pour entraîner leurs modèles (engagement contractuel)
- Voir la [page RGPD](public/rgpd.html) intégrée à l'outil pour le détail complet
