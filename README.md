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
