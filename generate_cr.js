/**
 * ============================================================
 *  GÉNÉRATEUR DE COMPTE-RENDU — SOPHROLOGIE CAYCÉDIENNE
 *  Vanessa Slous · sophroslous.fr
 * ============================================================
 *
 *  Génère le fichier Word (.docx) du compte-rendu de séance
 *  à partir du texte produit par l'API Claude.
 *
 *  Appelez generateCR(data) avec :
 *    data.client     → prénom du client (string)
 *    data.date       → date de la séance (string, ex. "17 juin 2026")
 *    data.seance     → numéro de séance (string)
 *    data.motif      → motif de suivi (string)
 *    data.techniques → techniques pratiquées (string)
 *    data.phase      → phase du protocole (string, peut être vide)
 *    data.cr         → texte du CR généré par Claude (string)
 *
 *  Retourne un Buffer (.docx) prêt à être envoyé en téléchargement.
 * ============================================================
 */

const {
  Document, Packer, Paragraph, TextRun,
  Table, TableRow, TableCell,
  AlignmentType, BorderStyle, WidthType, ShadingType,
  LevelFormat, Footer, PageNumber
} = require('docx');

// ── CHARTE GRAPHIQUE ─────────────────────────────────────────
// NE PAS MODIFIER sans accord de Vanessa Slous
const COLORS = {
  teal:       "2E7D8A",   // Titres de sections, filets
  plum:       "5B3A6E",   // Titres H2, regroupements thématiques
  lightTeal:  "E8F4F6",   // Fond résumé exécutif
  lightPlum:  "F0EBF5",   // Fond note clinique
  dark:       "1A1A1A",   // Corps de texte
  gray:       "666666",   // Texte secondaire, pied de page
  border:     "CCCCCC",   // Filets de tableaux
};

// Largeur de contenu en DXA (A4, marges 21mm)
const CONTENT_W = 9506;

// ── BORDURES ─────────────────────────────────────────────────
const borderThin = { style: BorderStyle.SINGLE, size: 1, color: COLORS.border };
const allBorders = { top: borderThin, bottom: borderThin, left: borderThin, right: borderThin };
const noBorder   = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const noBorders  = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

// ── HELPERS ──────────────────────────────────────────────────

/** Paragraphe vide pour espacement */
function sp(before = 80) {
  return new Paragraph({ children: [new TextRun("")], spacing: { before, after: 0 } });
}

/** Titre de section H1 — Georgia gras teal avec filet bas */
function h1(text) {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size: 26, color: COLORS.teal, font: "Georgia" })],
    spacing: { before: 280, after: 80 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: COLORS.teal, space: 1 } }
  });
}

/** Corps de texte standard */
function body(text, opts = {}) {
  return new Paragraph({
    children: [new TextRun({ text, size: 20, font: "Calibri", color: COLORS.dark, ...opts })],
    spacing: { before: 40, after: 40 }
  });
}

/** Bullet point */
function bullet(text) {
  return new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    children: [new TextRun({ text, size: 20, font: "Calibri", color: COLORS.dark })],
    spacing: { before: 30, after: 30 }
  });
}

/**
 * Bloc encadré avec fond coloré
 * Utilisé pour : résumé exécutif, note clinique
 */
function box(paragraphs, bg = COLORS.lightTeal) {
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [CONTENT_W],
    rows: [new TableRow({
      children: [new TableCell({
        borders: allBorders,
        width: { size: CONTENT_W, type: WidthType.DXA },
        shading: { fill: bg, type: ShadingType.CLEAR },
        margins: { top: 120, bottom: 120, left: 160, right: 160 },
        children: paragraphs
      })]
    })]
  });
}

// ── PARSEUR DU TEXTE CLAUDE ───────────────────────────────────
/**
 * Découpe le texte brut renvoyé par Claude (structure en 4
 * sections + résumé exécutif) en sections exploitables pour
 * la mise en forme Word.
 *
 * Stratégie : scan linéaire — on localise chaque en-tête de
 * section ancré en début de ligne (^, flag m), puis on découpe
 * le texte entre positions consécutives. Cela élimine tout
 * risque de chevauchement si "1.", "2." ou un mot-clé de section
 * apparaît à l'intérieur du corps d'une autre section.
 */
function parseCR(text) {
  const sections = {
    resume: "",
    presSophro: "",
    noteClinic: "",
    technique: "",
    techniqueHeader: "2. TECHNIQUE PRATIQUÉE",
    pheno: "",
    orientations: []
  };

  // Patterns ancrés en début de ligne, dans l'ordre fixe du document
  const HEADER_PATTERNS = [
    { key: "resume",    re: /^RÉSUMÉ EXÉCUTIF[^\n]*/im },
    { key: "preSophro", re: /^1\.\s*ÉCHANGES PRÉ-SOPHRONIQUES[^\n]*/im },
    { key: "technique", re: /^2\.\s*TECHNIQUE PRATIQUÉE[^\n]*/im },
    { key: "pheno",     re: /^3\.\s*PHÉNODESCRIPTION[^\n]*/im },
    { key: "orient",    re: /^4\.\s*ORIENTATIONS[^\n]*/im },
  ];

  // Localiser chaque en-tête ; garder seulement ceux trouvés
  const found = HEADER_PATTERNS.map(({ key, re }) => {
    const m = re.exec(text);
    return m ? { key, start: m.index, contentStart: m.index + m[0].length, header: m[0].trim() } : null;
  }).filter(Boolean);

  // Découper le contenu entre chaque paire d'en-têtes consécutifs
  for (let i = 0; i < found.length; i++) {
    const { key, contentStart } = found[i];
    const nextStart = found[i + 1]?.start ?? text.length;
    const content = text.slice(contentStart, nextStart).trim();

    if (key === "resume") {
      sections.resume = content;
    } else if (key === "technique") {
      sections.technique = content;
      sections.techniqueHeader = found[i].header;
    } else if (key === "pheno") {
      sections.pheno = content;
    } else if (key === "preSophro") {
      const noteMatch = content.match(/^Note clinique[\s\S]*$/im);
      if (noteMatch) {
        sections.noteClinic = noteMatch[0].trim();
        sections.presSophro = content.slice(0, noteMatch.index).trim();
      } else {
        sections.presSophro = content;
      }
    } else if (key === "orient") {
      sections.orientations = content
        .split("\n")
        .map(l => l.replace(/^[–\-•]\s*/, "").trim())
        .filter(l => l.length > 0);
    }
  }

  // Bug 3 — normaliser les références système : S3 → S#3, S1 → S#1
  // \bS(\d) : S à la frontière d'un mot suivi d'un chiffre.
  // S#3 n'est pas touché car S y est suivi de # (pas d'un chiffre).
  // SAVa, SDNc, etc. ne correspondent pas (S suivi d'une lettre).
  const norm = t => t.replace(/\bS(\d)/g, "S#$1");
  sections.resume       = norm(sections.resume);
  sections.presSophro   = norm(sections.presSophro);
  sections.noteClinic   = norm(sections.noteClinic);
  sections.technique    = norm(sections.technique);
  sections.pheno        = norm(sections.pheno);
  sections.orientations = sections.orientations.map(norm);

  return sections;
}

// ── FORMATEUR DU PRÉ-SOPHRONIQUE ─────────────────────────────
/**
 * Détecte les regroupements thématiques ("Mot(s) — texte...")
 * et les formate en italique gras prune, distincts du corps.
 */
function formatPreSophro(text) {
  const paragraphs = [];
  const lines = text.split("\n").filter(l => l.trim());

  for (const line of lines) {
    const themeMatch = line.match(/^([A-ZÀ-Ÿa-zà-ÿ\s''’]+)\s*[—–-]\s*(.+)/);
    if (themeMatch && themeMatch[1].length < 40) {
      paragraphs.push(new Paragraph({
        children: [
          new TextRun({ text: themeMatch[1].trim(), size: 20, font: "Calibri", italics: true, bold: true, color: COLORS.plum }),
          new TextRun({ text: " — " + themeMatch[2].trim(), size: 20, font: "Calibri", color: COLORS.dark })
        ],
        spacing: { before: 50, after: 30 }
      }));
    } else {
      paragraphs.push(body(line));
    }
  }
  return paragraphs;
}

// ── FONCTION PRINCIPALE ───────────────────────────────────────
/**
 * Génère le fichier Word et retourne un Buffer.
 * @param {Object} data - Données de la séance + texte CR
 * @returns {Promise<Buffer>}
 */
async function generateCR(data) {
  const { client, date, seance, motif, techniques, phase, cr } = data;
  const sections = parseCR(cr);

  const entete = [
    `Client : ${client}`,
    `Date : ${date}`,
    `Séance n° ${seance}`,
    `Motif : ${motif}`,
    `Technique(s) : ${techniques}`,
    phase ? `Phase : ${phase}` : null
  ].filter(Boolean).join("   |   ");

  const doc = new Document({
    numbering: {
      config: [{
        reference: "bullets",
        levels: [{
          level: 0,
          format: LevelFormat.BULLET,
          text: "–",
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 480, hanging: 240 } } }
        }]
      }]
    },
    styles: {
      default: { document: { run: { font: "Calibri", size: 20 } } }
    },
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 }, // A4
          margin: { top: 1190, right: 1190, bottom: 1190, left: 1190 } // 21mm
        }
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            children: [
              new TextRun({ text: `Vanessa Slous · sophroslous.fr     —     `, size: 16, font: "Calibri", color: COLORS.gray }),
              new TextRun({ children: [PageNumber.CURRENT], size: 16, font: "Calibri", color: COLORS.gray })
            ],
            alignment: AlignmentType.CENTER,
            border: { top: { style: BorderStyle.SINGLE, size: 2, color: COLORS.border, space: 1 } },
            spacing: { before: 80 }
          })]
        })
      },
      children: [
        // ── TITRE ──────────────────────────────────────────────
        new Paragraph({
          children: [new TextRun({ text: "COMPTE-RENDU DE SÉANCE", bold: true, size: 30, color: COLORS.teal, font: "Georgia" })],
          spacing: { before: 0, after: 60 }
        }),
        new Paragraph({
          children: [new TextRun({ text: entete, size: 18, font: "Calibri", color: COLORS.gray })],
          spacing: { before: 0, after: 0 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: COLORS.teal, space: 1 } }
        }),
        sp(120),

        // ── RÉSUMÉ EXÉCUTIF ────────────────────────────────────
        box(
          [
            new Paragraph({
              children: [new TextRun({ text: "RÉSUMÉ EXÉCUTIF", bold: true, size: 20, font: "Calibri", color: COLORS.teal })],
              spacing: { before: 0, after: 60 }
            }),
            ...sections.resume.split("\n").filter(l => l.trim()).map(l => body(l.trim()))
          ],
          COLORS.lightTeal
        ),
        sp(),

        // ── 1. ÉCHANGES PRÉ-SOPHRONIQUES ──────────────────────
        h1("1. ÉCHANGES PRÉ-SOPHRONIQUES"),
        sp(60),
        ...formatPreSophro(sections.presSophro),

        sections.noteClinic ? sp(60) : sp(0),
        sections.noteClinic ? box(
          [
            new Paragraph({
              children: [new TextRun({ text: "Note clinique", bold: true, italics: true, size: 20, font: "Calibri", color: COLORS.plum })],
              spacing: { before: 0, after: 40 }
            }),
            ...sections.noteClinic
              .replace(/Note clinique\s*[—–-]?\s*/i, "")
              .split("\n").filter(l => l.trim()).map(l => body(l.trim()))
          ],
          COLORS.lightPlum
        ) : sp(0),
        sp(),

        // ── 2. TECHNIQUE PRATIQUÉE ─────────────────────────────
        h1(sections.techniqueHeader || "2. TECHNIQUE PRATIQUÉE"),
        sp(60),
        ...sections.technique.split("\n").filter(l => l.trim()).map(l => body(l.trim())),
        sp(),

        // ── 3. PHÉNODESCRIPTION ────────────────────────────────
        h1("3. PHÉNODESCRIPTION"),
        sp(60),
        ...sections.pheno.split("\n").filter(l => l.trim()).map(l => body(l.trim())),
        sp(),

        // ── 4. ORIENTATIONS ────────────────────────────────────
        h1("4. ORIENTATIONS"),
        sp(60),
        ...sections.orientations.map(o => bullet(o)),
        sp()
      ]
    }]
  });

  return await Packer.toBuffer(doc);
}

module.exports = { generateCR, parseCR };
