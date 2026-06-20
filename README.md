# SophroCR — Outil de génération de comptes-rendus

Vanessa Slous · sophroslous.fr

Génère automatiquement le compte-rendu Word (.docx) d'une séance de
sophrologie caycédienne, à partir d'une transcription collée à la main
et de l'API Claude (Anthropic).

C'est une V1 volontairement simple : pas de transcription audio
automatique, pas de base de données, pas de connexion. Tu colles le
texte de la séance, tu remplis le formulaire, tu cliques sur
"Générer", tu relis, tu télécharges le Word.

## Structure du projet

```
sophrocr/
├── server.js                       → serveur Express (les 2 routes API)
├── generate_cr.js                  → génère le fichier .docx (mise en forme)
├── prompts/
│   ├── system_prompt.txt           → règles de rédaction envoyées à Claude
│   └── reference_caycedienne.txt   → connaissance métier envoyée à Claude
├── public/
│   └── index.html                  → la page web (formulaire + aperçu)
├── package.json
├── .env.example                    → modèle pour ta clé API
└── .gitignore
```

## Installation (la première fois)

1. Installe [Node.js](https://nodejs.org/) (version 18 ou plus récente) si ce n'est pas déjà fait.
2. Ouvre un terminal dans le dossier `sophrocr`.
3. Installe les dépendances :
   ```
   npm install
   ```
4. Crée ton fichier de configuration :
   ```
   cp .env.example .env
   ```
5. Ouvre `.env` dans un éditeur de texte et remplace la valeur par ta vraie clé API Anthropic :
   ```
   ANTHROPIC_API_KEY=sk-ant-ta-vraie-cle-ici
   ```
   (Tu obtiens cette clé sur [console.anthropic.com](https://console.anthropic.com), dans la section API Keys. Garde-la secrète — ne la mets jamais sur GitHub.)

## Lancer l'outil en local

```
npm start
```

Tu devrais voir :
```
✓ Serveur lancé : http://localhost:3000
```

Ouvre cette adresse dans ton navigateur (Safari, Chrome...). C'est l'app.

## Utilisation

1. Remplis le formulaire (client, date, séance, motif, technique(s), phase optionnelle).
2. Colle la transcription de la séance dans la grande zone de texte.
3. Clique sur "Générer le compte-rendu" — Claude rédige le texte en quelques secondes.
4. Relis et corrige si besoin directement dans la zone de prévisualisation.
5. Clique sur "Télécharger le Word" — le fichier `.docx` est téléchargé, formaté selon la charte graphique de Vanessa.

## Comment ça marche techniquement

1. `public/index.html` envoie les métadonnées + la transcription à `POST /api/generate`.
2. `server.js` assemble un message pour Claude : le `system_prompt.txt` (les règles caycédiennes)
   + `reference_caycedienne.txt` (le vocabulaire/techniques) en system prompt, et la transcription
   + métadonnées en message utilisateur.
3. Claude répond avec le texte du CR structuré en 4 sections + résumé exécutif.
4. Ce texte est affiché pour relecture. Quand tu cliques "Télécharger", le texte (corrigé ou non)
   est envoyé à `POST /api/download`.
5. `generate_cr.js` découpe ce texte par section (`parseCR`) et construit le fichier Word avec la
   bibliothèque `docx`, en respectant la charte graphique (couleurs, polices, encadrés).

## Limites actuelles (V1)

- Pas de transcription audio automatique — il faut coller le texte (depuis Dictaphone iOS, Turboscribe, etc.)
- Pas d'historique des CR générés — chaque session est indépendante
- Pas d'authentification — à ne pas héberger sur une URL publique sans protection
- Tourne uniquement en local pour l'instant (`localhost`)

## Prochaine étape : déploiement en ligne

Pour que ta mère puisse l'utiliser depuis n'importe où (pas seulement sur ton ordinateur),
il faudra héberger ce projet sur un service comme [Railway](https://railway.app) ou
[Render](https://render.com). C'est une étape séparée — dis-moi quand tu veux t'y attaquer.

## Prochaine étape : transcription automatique

Pour ajouter l'upload audio + transcription automatique avec diarisation (AssemblyAI),
il faudra une nouvelle route serveur + une zone d'upload dans le frontend. C'est un ajout
indépendant qui ne casse rien de l'existant — pour plus tard.
