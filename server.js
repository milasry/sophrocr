/**
 * ============================================================
 *  SERVEUR — Outil de génération de comptes-rendus
 *  Vanessa Slous · sophroslous.fr
 * ============================================================
 *
 *  Lancer en local :   npm install   puis   npm start
 *  Variables nécessaires (voir .env.example) :
 *    ANTHROPIC_API_KEY=sk-ant-xxxxx
 * ============================================================
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const { generateCR } = require('./generate_cr');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '5mb' })); // transcriptions can be long
app.use(express.static(path.join(__dirname, 'public')));

// Charger les documents de référence une fois au démarrage
const SYSTEM_PROMPT = fs.readFileSync(
  path.join(__dirname, 'prompts', 'system_prompt.txt'), 'utf-8'
);
const REFERENCE_DOC = fs.readFileSync(
  path.join(__dirname, 'prompts', 'reference_caycedienne.txt'), 'utf-8'
);

/**
 * POST /api/generate
 * Body attendu : { client, date, seance, motif, techniques, phase, notes, transcription }
 * Retourne : { cr: "<texte généré par Claude>" }
 *
 * Le frontend appelle d'abord cette route pour obtenir le texte,
 * l'affiche pour relecture, puis appelle /api/download pour le .docx.
 */
app.post('/api/generate', async (req, res) => {
  try {
    const { client, date, seance, motif, techniques, phase, notes, transcription } = req.body;

    if (!transcription || !transcription.trim()) {
      return res.status(400).json({
        error: "La transcription est vide. Vérifiez la qualité de l'enregistrement, ou collez une transcription manuellement."
      });
    }
    if (!client || !date || !seance || !motif || !techniques) {
      return res.status(400).json({ error: "Merci de remplir tous les champs obligatoires du formulaire." });
    }

    const userMessage = [
      `Génère le compte-rendu.`,
      `Client : ${client}`,
      `Date : ${date}`,
      `Séance n° : ${seance}`,
      `Motif : ${motif}`,
      `Technique(s) : ${techniques}`,
      phase ? `Phase : ${phase}` : null,
      notes ? `Notes personnelles : ${notes}` : null,
      ``,
      `TRANSCRIPTION (avec locuteurs identifiés si disponibles) :`,
      transcription
    ].filter(Boolean).join('\n');

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Clé API Anthropic manquante côté serveur. Vérifiez le fichier .env." });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        system: `${SYSTEM_PROMPT}\n\n=== DOCUMENT DE RÉFÉRENCE CAYCÉDIENNE ===\n${REFERENCE_DOC}`,
        messages: [{ role: 'user', content: userMessage }]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Erreur API Anthropic:', response.status, errText);
      return res.status(502).json({
        error: "La génération du compte-rendu a échoué. Veuillez réessayer dans quelques instants."
      });
    }

    const data = await response.json();
    const crText = data.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n');

    res.json({ cr: crText });

  } catch (err) {
    console.error('Erreur /api/generate:', err);
    res.status(500).json({ error: "Une erreur inattendue est survenue. Veuillez réessayer." });
  }
});

/**
 * POST /api/download
 * Body attendu : { client, date, seance, motif, techniques, phase, cr }
 * (le texte "cr" est celui renvoyé/édité après /api/generate)
 * Retourne : le fichier .docx en téléchargement direct.
 */
app.post('/api/download', async (req, res) => {
  try {
    const { client, date, seance, motif, techniques, phase, cr } = req.body;

    if (!cr || !cr.trim()) {
      return res.status(400).json({ error: "Aucun texte de compte-rendu à mettre en forme." });
    }

    const buffer = await generateCR({ client, date, seance, motif, techniques, phase, cr });

    const safeClient = (client || 'client').replace(/[^a-zA-Z0-9À-ÿ]/g, '_');
    const filename = `CR_${safeClient}_S${seance || ''}.docx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);

  } catch (err) {
    console.error('Erreur /api/download:', err);
    res.status(500).json({ error: "La mise en forme du fichier Word a échoué." });
  }
});

app.listen(PORT, () => {
  console.log(`✓ Serveur lancé : http://localhost:${PORT}`);
});
