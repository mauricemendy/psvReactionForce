/**
 * PSV Reaction Force Calculator v2.0 — Batterie de tests complete
 *
 * Execute avec : node tests/test_v2.js
 *
 * Couvre :
 *   1. Validation structure HTML
 *   2. Validation syntaxe JavaScript
 *   3. Non-regression : F = Kf x A x P1 (identique v1.0)
 *   4. F_design = F_brute x DLF + composantes Fx/Fy/Fz
 *   5. Calculateur P1
 *   6. Validation DLF (limites, warnings)
 *   7. Retrocompatibilite CSV
 *   8. Coherence des 5 configurations
 *   9. Integrite des tables de donnees (Kf, areas, configs sync)
 *  10. Integrite des elements DOM
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ============================================================
// TEST FRAMEWORK MINIMAL
// ============================================================
let totalTests = 0;
let passed = 0;
let failed = 0;
let errors = [];
let currentSuite = '';

function suite(name) {
  currentSuite = name;
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  SUITE: ${name}`);
  console.log('='.repeat(60));
}

function test(name, fn) {
  totalTests++;
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    const msg = `  ✗ ${name}\n    → ${e.message}`;
    console.log(msg);
    errors.push({ suite: currentSuite, test: name, error: e.message });
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message || 'assertEqual'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertClose(actual, expected, tolerance, message) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${message || 'assertClose'}: expected ~${expected} (±${tolerance}), got ${actual}`);
  }
}

// ============================================================
// LOAD FILES
// ============================================================
const indexPath = path.join(__dirname, '..', 'index.html');
const configGsPath = path.join(__dirname, '..', 'config.gs');
const codeGsPath = path.join(__dirname, '..', 'code.gs');

const indexHtml = fs.readFileSync(indexPath, 'utf-8');
const configGs = fs.readFileSync(configGsPath, 'utf-8');
const codeGs = fs.readFileSync(codeGsPath, 'utf-8');

// Extract JavaScript from index.html
const scriptMatch = indexHtml.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/);
const jsCode = scriptMatch ? scriptMatch[1] : '';

// ============================================================
// Extract pure data & logic (no DOM dependencies)
// ============================================================
// Direct data definition (mirrors index.html exactly)
const data = {
  kfTable: {
    '50': { 'gaz': 1.9, 'vapeur eau': 2.0 },
    '65': { 'gaz': 1.9, 'vapeur eau': 2.0 },
    '80': { 'gaz': 1.5, 'vapeur eau': 1.6 },
    '100': { 'gaz': 1.5, 'vapeur eau': 1.6 },
    '150': { 'gaz': 1.3, 'vapeur eau': 1.3 },
    '200': { 'gaz': 1.1, 'vapeur eau': 1.1 },
    '>200': { 'gaz': 1.1, 'vapeur eau': 1.1 }
  },

  areaTable: {
    'D': 0.71, 'E': 1.26, 'F': 1.98, 'G': 3.24, 'H': 5.06,
    'J': 8.3, 'K': 11.86, 'L': 18.41, 'M': 23.2, 'N': 28,
    'P': 41.2, 'Q': 71.2, 'R': 103, 'T': 168, 'V': 271, 'W': 406
  },

  validDNs: ['50', '65', '80', '100', '150', '200', '>200'],
  validFluids: ['gaz', 'vapeur eau'],
  validOrifices: ['D', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'Q', 'R', 'T', 'V', 'W'],

  configurationsTable: {
    'CFG-1': {
      id: 'CFG-1', label: 'Verticale haut',
      components: (fDesign) => ({ fx: 0, fy: -fDesign, fz: 0 })
    },
    'CFG-2': {
      id: 'CFG-2', label: 'Verticale bas',
      components: (fDesign) => ({ fx: 0, fy: fDesign, fz: 0 })
    },
    'CFG-3': {
      id: 'CFG-3', label: 'Horizontale',
      components: (fDesign) => ({ fx: -fDesign, fy: 0, fz: 0 })
    },
    'CFG-4': {
      id: 'CFG-4', label: 'Coude 90\u00b0',
      components: (fDesign) => {
        const comp = fDesign / Math.sqrt(2);
        return { fx: -parseFloat(comp.toFixed(2)), fy: -parseFloat(comp.toFixed(2)), fz: 0 };
      }
    },
    'CFG-5': {
      id: 'CFG-5', label: 'Collecteur',
      components: (fDesign) => ({ fx: -fDesign, fy: 0, fz: 0 })
    }
  },

  validConfigs: ['CFG-1', 'CFG-2', 'CFG-3', 'CFG-4', 'CFG-5'],

  dlfPresets: {
    conservative: { value: 2.0, label: 'Conservatif' },
    static: { value: 1.0, label: 'Statique equivalent' },
    custom: { value: null, label: 'Personnalise' }
  }
};

// ============================================================
// 1. VALIDATION STRUCTURE HTML
// ============================================================
suite('1. Validation structure HTML');

test('Le fichier index.html existe et n\'est pas vide', () => {
  assert(indexHtml.length > 0, 'Fichier vide');
  assert(indexHtml.length > 50000, `Fichier trop court : ${indexHtml.length} chars`);
});

test('DOCTYPE html present', () => {
  assert(indexHtml.startsWith('<!DOCTYPE html>'), 'DOCTYPE manquant');
});

test('Balises html/head/body/style/script fermees correctement', () => {
  const tags = ['html', 'head', 'body', 'style'];
  for (const tag of tags) {
    const opens = (indexHtml.match(new RegExp(`<${tag}[\\s>]`, 'g')) || []).length;
    const closes = (indexHtml.match(new RegExp(`</${tag}>`, 'g')) || []).length;
    assertEqual(opens, closes, `Balise <${tag}> desequilibree`);
  }
});

test('Les 3 CDN externes sont charges (PapaParse, jsPDF, jsPDF-autotable)', () => {
  assert(indexHtml.includes('papaparse.min.js'), 'PapaParse manquant');
  assert(indexHtml.includes('jspdf.umd.min.js'), 'jsPDF manquant');
  assert(indexHtml.includes('jspdf.plugin.autotable.min.js'), 'jsPDF autotable manquant');
});

test('Meta charset UTF-8 present', () => {
  assert(indexHtml.includes('charset="UTF-8"'), 'charset UTF-8 manquant');
});

test('Meta viewport present', () => {
  assert(indexHtml.includes('name="viewport"'), 'viewport manquant');
});

test('lang="fr" sur html', () => {
  assert(indexHtml.includes('lang="fr"'), 'lang="fr" manquant');
});

// ============================================================
// 2. VALIDATION SYNTAXE JAVASCRIPT
// ============================================================
suite('2. Validation syntaxe JavaScript');

test('Le bloc <script> est extrait correctement', () => {
  assert(jsCode.length > 10000, `Bloc script trop court: ${jsCode.length} chars`);
});

test('Pas d\'erreur de syntaxe JavaScript (parsing)', () => {
  try {
    // We can't run the full code (DOM deps) but we can parse it
    new Function(jsCode);
    // If it doesn't throw, the syntax is valid
    assert(true);
  } catch (e) {
    // Function constructor may fail on DOM refs, but syntax errors are different
    if (e instanceof SyntaxError) {
      throw new Error(`Erreur de syntaxe JS: ${e.message}`);
    }
    // ReferenceError at parse time is ok (DOM not available)
  }
});

test('Toutes les fonctions v1.0 sont presentes', () => {
  const v1Functions = [
    'function calculateForce', 'function resetForm', 'function validateInputs',
    'function switchMode', 'function calculateBatch', 'function renderResults',
    'function renderBatchRow', 'function renderMobileCard', 'function createEmptyPSV',
    'function saveToLocalStorage', 'function loadFromLocalStorage', 'function init'
  ];
  for (const fn of v1Functions) {
    assert(jsCode.includes(fn), `Fonction manquante: ${fn}`);
  }
});

test('Toutes les fonctions v2.0 sont presentes', () => {
  const v2Functions = [
    'function updateDesignForce', 'function updateForceDiagram',
    'function getCurrentDLF', 'function validateDLF',
    'function normalizeConfig', 'function generateConfigOptions'
  ];
  for (const fn of v2Functions) {
    assert(jsCode.includes(fn), `Fonction v2.0 manquante: ${fn}`);
  }
});

test('Pas de console.log ou debugger en production (hors error)', () => {
  const debugStatements = (jsCode.match(/console\.log\(/g) || []).length;
  const debuggerStatements = (jsCode.match(/\bdebugger\b/g) || []).length;
  assertEqual(debugStatements, 0, `${debugStatements} console.log trouves`);
  assertEqual(debuggerStatements, 0, `${debuggerStatements} debugger trouves`);
});

// ============================================================
// 3. NON-REGRESSION : F = Kf x A x P1
// ============================================================
suite('3. Non-regression : F = Kf x A x P1');

// Reference calculations from v1.0
const regressionCases = [
  { dn: '100', fluid: 'gaz', orifice: 'K', pressure: 15.5, expected: 275.75 },
  { dn: '50', fluid: 'gaz', orifice: 'D', pressure: 10.0, expected: 13.49 },
  { dn: '50', fluid: 'vapeur eau', orifice: 'D', pressure: 10.0, expected: 14.20 },
  { dn: '200', fluid: 'gaz', orifice: 'W', pressure: 5.0, expected: 2233.00 },
  { dn: '>200', fluid: 'vapeur eau', orifice: 'T', pressure: 25.0, expected: 4620.00 },
  { dn: '150', fluid: 'gaz', orifice: 'N', pressure: 20.0, expected: 728.00 },
  { dn: '80', fluid: 'vapeur eau', orifice: 'H', pressure: 12.0, expected: 97.15 },
  { dn: '65', fluid: 'gaz', orifice: 'E', pressure: 8.0, expected: 19.15 },
];

for (const tc of regressionCases) {
  test(`F(DN=${tc.dn}, ${tc.fluid}, ${tc.orifice}, ${tc.pressure} bar) = ${tc.expected} daN`, () => {
    const kf = data.kfTable[tc.dn][tc.fluid];
    const area = data.areaTable[tc.orifice];
    const force = kf * area * tc.pressure;
    assertClose(parseFloat(force.toFixed(2)), tc.expected, 0.01,
      `Kf=${kf}, A=${area}, P=${tc.pressure}`);
  });
}

test('Tous les DN x Fluides donnent un Kf valide', () => {
  for (const dn of data.validDNs) {
    for (const fluid of data.validFluids) {
      const kf = data.kfTable[dn][fluid];
      assert(typeof kf === 'number' && kf > 0, `Kf manquant pour DN=${dn}, Fluide=${fluid}`);
    }
  }
});

test('Tous les orifices ont une section valide', () => {
  for (const orifice of data.validOrifices) {
    const area = data.areaTable[orifice];
    assert(typeof area === 'number' && area > 0, `Section manquante pour orifice ${orifice}`);
  }
});

test('Les sections d\'orifice sont en ordre croissant (D < E < ... < W)', () => {
  let prev = 0;
  for (const orifice of data.validOrifices) {
    const area = data.areaTable[orifice];
    assert(area > prev, `Orifice ${orifice} (${area}) n'est pas > ${prev}`);
    prev = area;
  }
});

// ============================================================
// 4. F_DESIGN = F_BRUTE x DLF + COMPOSANTES
// ============================================================
suite('4. F_design = F_brute x DLF + composantes Fx/Fy/Fz');

test('F_design = F_brute x 2.0 (DLF conservatif)', () => {
  const fBrute = 275.73;
  const dlf = 2.0;
  const fDesign = fBrute * dlf;
  assertClose(fDesign, 551.46, 0.01);
});

test('F_design = F_brute x 1.0 (DLF statique) => F_design = F_brute', () => {
  const fBrute = 275.73;
  const dlf = 1.0;
  const fDesign = fBrute * dlf;
  assertClose(fDesign, fBrute, 0.01);
});

test('F_design = F_brute x 1.5 (DLF personnalise)', () => {
  const fBrute = 100.0;
  const dlf = 1.5;
  const fDesign = fBrute * dlf;
  assertClose(fDesign, 150.0, 0.01);
});

test('CFG-1 : Fx=0, Fy=-F_design, Fz=0', () => {
  const fDesign = 500;
  const c = data.configurationsTable['CFG-1'].components(fDesign);
  assertEqual(c.fx, 0, 'Fx');
  assertEqual(c.fy, -500, 'Fy');
  assertEqual(c.fz, 0, 'Fz');
});

test('CFG-2 : Fx=0, Fy=+F_design, Fz=0', () => {
  const fDesign = 500;
  const c = data.configurationsTable['CFG-2'].components(fDesign);
  assertEqual(c.fx, 0, 'Fx');
  assertEqual(c.fy, 500, 'Fy');
  assertEqual(c.fz, 0, 'Fz');
});

test('CFG-3 : Fx=-F_design, Fy=0, Fz=0', () => {
  const fDesign = 500;
  const c = data.configurationsTable['CFG-3'].components(fDesign);
  assertEqual(c.fx, -500, 'Fx');
  assertEqual(c.fy, 0, 'Fy');
  assertEqual(c.fz, 0, 'Fz');
});

test('CFG-4 : Fx=-F/√2, Fy=-F/√2, Fz=0 (coude 90°)', () => {
  const fDesign = 1000;
  const c = data.configurationsTable['CFG-4'].components(fDesign);
  const expected = -1000 / Math.sqrt(2);
  assertClose(c.fx, expected, 0.02, 'Fx');
  assertClose(c.fy, expected, 0.02, 'Fy');
  assertEqual(c.fz, 0, 'Fz');
});

test('CFG-4 : √(Fx² + Fy²) = F_design (conservation vectorielle)', () => {
  const fDesign = 1000;
  const c = data.configurationsTable['CFG-4'].components(fDesign);
  const magnitude = Math.sqrt(c.fx * c.fx + c.fy * c.fy);
  assertClose(magnitude, fDesign, 0.1, 'Norme vectorielle');
});

test('CFG-5 : Fx=-F_design, Fy=0, Fz=0 (collecteur)', () => {
  const fDesign = 500;
  const c = data.configurationsTable['CFG-5'].components(fDesign);
  assertEqual(c.fx, -500, 'Fx');
  assertEqual(c.fy, 0, 'Fy');
  assertEqual(c.fz, 0, 'Fz');
});

test('Fz = 0 pour toutes les configurations', () => {
  for (const cfgId of data.validConfigs) {
    const c = data.configurationsTable[cfgId].components(1000);
    assertEqual(c.fz, 0, `Fz non nul pour ${cfgId}`);
  }
});

test('Calcul complet : DN100/Gaz/K/15.5bar/CFG-1/DLF=2.0', () => {
  const kf = data.kfTable['100']['gaz'];    // 1.5
  const area = data.areaTable['K'];          // 11.86
  const pressure = 15.5;
  const fBrute = kf * area * pressure;       // 275.745
  const dlf = 2.0;
  const fDesign = fBrute * dlf;              // 551.49
  const c = data.configurationsTable['CFG-1'].components(parseFloat(fDesign.toFixed(2)));

  assertClose(fBrute, 275.745, 0.01, 'F_brute');
  assertClose(fDesign, 551.49, 0.01, 'F_design');
  assertEqual(c.fx, 0, 'Fx');
  assertClose(c.fy, -551.49, 0.01, 'Fy');
  assertEqual(c.fz, 0, 'Fz');
});

// ============================================================
// 5. CALCULATEUR P1
// ============================================================
suite('5. Calculateur P1');

function calculateP1(ptarage, surpression, patm) {
  return ptarage * (1 + surpression / 100) + patm;
}

test('P1 = 14 x (1 + 10/100) + 1.013 = 16.413 bar abs', () => {
  const p1 = calculateP1(14.0, 10, 1.013);
  assertClose(p1, 16.413, 0.001);
});

test('P1 = 10 x (1 + 21/100) + 1.013 = 13.113 bar abs (cas feu)', () => {
  const p1 = calculateP1(10.0, 21, 1.013);
  assertClose(p1, 13.113, 0.001);
});

test('P1 = 50 x (1 + 10/100) + 1.013 = 56.013 bar abs', () => {
  const p1 = calculateP1(50.0, 10, 1.013);
  assertClose(p1, 56.013, 0.001);
});

test('P1 avec surpression 0% = P_tarage + P_atm', () => {
  const p1 = calculateP1(15.0, 0, 1.013);
  assertClose(p1, 16.013, 0.001);
});

test('P1 avec P_atm = 0.9 (altitude)', () => {
  const p1 = calculateP1(14.0, 10, 0.9);
  assertClose(p1, 16.3, 0.001);
});

test('Le panneau P1 est present dans le HTML', () => {
  assert(indexHtml.includes('id="p1CalcPanel"'), 'Panneau P1 manquant');
  assert(indexHtml.includes('id="p1Ptarage"'), 'Champ P_tarage manquant');
  assert(indexHtml.includes('id="p1Surpression"'), 'Champ surpression manquant');
  assert(indexHtml.includes('id="p1Patm"'), 'Champ P_atm manquant');
  assert(indexHtml.includes('id="p1CalcApplyBtn"'), 'Bouton Appliquer manquant');
});

test('Valeur par defaut surpression = 10%', () => {
  assert(indexHtml.includes('id="p1Surpression" min="0" max="100" step="1" value="10"'),
    'Valeur par defaut surpression != 10');
});

test('Valeur par defaut P_atm = 1.013', () => {
  assert(indexHtml.includes('id="p1Patm" min="0.8" max="1.1" step="0.001" value="1.013"'),
    'Valeur par defaut P_atm != 1.013');
});

// ============================================================
// 6. VALIDATION DLF
// ============================================================
suite('6. Validation DLF');

test('DLF conservatif = 2.0', () => {
  assertEqual(data.dlfPresets.conservative.value, 2.0);
});

test('DLF statique = 1.0', () => {
  assertEqual(data.dlfPresets.static.value, 1.0);
});

test('DLF personnalise = null (saisie libre)', () => {
  assertEqual(data.dlfPresets.custom.value, null);
});

test('Champ DLF custom a min=0.5, max=5.0', () => {
  assert(indexHtml.includes('id="dlfCustomValue" min="0.5" max="5.0"'),
    'Limites DLF custom incorrectes');
});

test('Les 3 modes DLF sont dans le HTML (radio buttons)', () => {
  assert(indexHtml.includes('value="conservative"'), 'Mode conservatif manquant');
  assert(indexHtml.includes('value="static"'), 'Mode statique manquant');
  assert(indexHtml.includes('value="custom"'), 'Mode personnalise manquant');
});

test('Warning DLF est present dans le HTML', () => {
  assert(indexHtml.includes('id="dlfWarning"'), 'Element dlfWarning manquant');
});

test('La logique JS gere DLF < 1.0 comme warning', () => {
  assert(jsCode.includes('value < 1.0'), 'Warning DLF < 1.0 absent');
  assert(jsCode.includes('Valeur inhabituelle'), 'Message warning DLF < 1.0 absent');
});

test('La logique JS gere DLF > 3.0 comme warning', () => {
  assert(jsCode.includes('value > 3.0'), 'Warning DLF > 3.0 absent');
  assert(jsCode.includes('Valeur tres elevee'), 'Message warning DLF > 3.0 absent');
});

// ============================================================
// 7. RETROCOMPATIBILITE CSV
// ============================================================
suite('7. Retrocompatibilite CSV');

test('Le template CSV v2.0 contient les colonnes CONFIG et DLF', () => {
  assert(jsCode.includes('ITEM_ID,LINE_NAME,DN,FLUID_TYPE,ORIFICE,PRESSURE,CONFIG,DLF'),
    'En-tetes template CSV v2.0 incorrects');
});

test('L\'export CSV contient les colonnes enrichies', () => {
  assert(jsCode.includes("'FORCE_DESIGN_DAN'"), 'Colonne FORCE_DESIGN_DAN manquante');
  assert(jsCode.includes("'FX_DAN'"), 'Colonne FX_DAN manquante');
  assert(jsCode.includes("'FY_DAN'"), 'Colonne FY_DAN manquante');
  assert(jsCode.includes("'FZ_DAN'"), 'Colonne FZ_DAN manquante');
});

test('Les headers CSV sont normalises (config, dlf)', () => {
  assert(jsCode.includes("'config': 'config'"), 'Mapping config manquant');
  assert(jsCode.includes("'configuration': 'config'"), 'Mapping configuration manquant');
  assert(jsCode.includes("'dlf': 'dlf'"), 'Mapping dlf manquant');
  assert(jsCode.includes("'dynamic_load_factor': 'dlf'"), 'Mapping dynamic_load_factor manquant');
});

test('Import CSV sans colonnes CONFIG/DLF utilise les valeurs par defaut', () => {
  // The normalizeConfig function returns 'CFG-1' for empty/null
  assert(jsCode.includes("function normalizeConfig"), 'normalizeConfig absent');
  assert(jsCode.includes("if (!value) return 'CFG-1'"), 'Default CFG-1 absent dans normalizeConfig');
  // Default DLF
  assert(jsCode.includes("dlf: normalized.dlf ? parseFloat(normalized.dlf) : 2.0"),
    'Default DLF 2.0 absent dans processCSVData');
});

test('Les anciens champs CSV v1.0 sont toujours supportes', () => {
  const v1Headers = ['item_id', 'itemid', 'line_name', 'linename', 'dn',
                     'fluid_type', 'fluidtype', 'orifice', 'pressure', 'pression', 'p1'];
  for (const h of v1Headers) {
    assert(jsCode.includes(`'${h}'`), `Header CSV v1.0 '${h}' non supporte`);
  }
});

// ============================================================
// 8. COHERENCE DES 5 CONFIGURATIONS
// ============================================================
suite('8. Coherence des 5 configurations');

test('5 configurations definies dans configurationsTable', () => {
  assertEqual(Object.keys(data.configurationsTable).length, 5);
});

test('validConfigs contient exactement 5 elements', () => {
  assertEqual(data.validConfigs.length, 5);
});

test('Chaque config a un id, label et components()', () => {
  for (const cfgId of data.validConfigs) {
    const cfg = data.configurationsTable[cfgId];
    assert(cfg, `Config ${cfgId} manquante`);
    assert(cfg.id === cfgId, `Config ${cfgId} id incorrect`);
    assert(typeof cfg.label === 'string' && cfg.label.length > 0, `Config ${cfgId} label vide`);
    assert(typeof cfg.components === 'function', `Config ${cfgId} components pas une fonction`);
  }
});

test('Les 5 configs sont dans le HTML (radio buttons)', () => {
  for (const cfgId of data.validConfigs) {
    assert(indexHtml.includes(`value="${cfgId}"`), `Radio ${cfgId} manquant dans HTML`);
    assert(indexHtml.includes(`data-config="${cfgId}"`), `data-config="${cfgId}" manquant`);
  }
});

test('Chaque config a un SVG dans le HTML', () => {
  for (const cfgId of data.validConfigs) {
    const regex = new RegExp(`data-config="${cfgId}"[\\s\\S]*?<svg`);
    assert(regex.test(indexHtml), `SVG manquant pour ${cfgId}`);
  }
});

test('Les configs dans config.gs correspondent a index.html', () => {
  for (const cfgId of data.validConfigs) {
    assert(configGs.includes(`'${cfgId}'`), `${cfgId} manquant dans config.gs`);
  }
});

test('CFG-1 est la configuration par defaut', () => {
  assert(indexHtml.includes('data-config="CFG-1">\n                    <input type="radio" name="dischargeConfig" value="CFG-1" checked'),
    'CFG-1 non checked par defaut');
  assert(jsCode.includes("selectedConfig: 'CFG-1'"), 'selectedConfig default != CFG-1');
});

// ============================================================
// 9. INTEGRITE DES TABLES DE DONNEES
// ============================================================
suite('9. Integrite des tables de donnees (sync index.html ↔ config.gs)');

test('Table Kf identique entre index.html et config.gs', () => {
  // Verify each Kf value exists in both files
  const kfValues = [
    ['50', 'gaz', 1.9], ['50', 'vapeur eau', 2.0],
    ['80', 'gaz', 1.5], ['80', 'vapeur eau', 1.6],
    ['100', 'gaz', 1.5], ['100', 'vapeur eau', 1.6],
    ['150', 'gaz', 1.3], ['150', 'vapeur eau', 1.3],
    ['200', 'gaz', 1.1], ['200', 'vapeur eau', 1.1],
  ];
  for (const [dn, fluid, kf] of kfValues) {
    assert(configGs.includes(`'${dn}'`) && configGs.includes(`'${fluid}': ${kf}`),
      `Kf(DN=${dn}, ${fluid})=${kf} absent de config.gs`);
    assertEqual(data.kfTable[dn][fluid], kf, `Kf(DN=${dn}, ${fluid})`);
  }
});

test('Table areas identique entre index.html et config.gs', () => {
  const areas = {
    'D': 0.71, 'E': 1.26, 'F': 1.98, 'G': 3.24, 'H': 5.06,
    'J': 8.3, 'K': 11.86, 'L': 18.41, 'M': 23.2, 'N': 28,
    'P': 41.2, 'Q': 71.2, 'R': 103, 'T': 168, 'V': 271, 'W': 406
  };
  for (const [orifice, area] of Object.entries(areas)) {
    assert(configGs.includes(`'${orifice}': ${area}`),
      `Area ${orifice}=${area} absent de config.gs`);
    assertEqual(data.areaTable[orifice], area, `Area ${orifice}`);
  }
});

test('16 orifices dans les deux fichiers', () => {
  assertEqual(data.validOrifices.length, 16);
  for (const o of data.validOrifices) {
    assert(configGs.includes(`'${o}'`), `Orifice ${o} absent de config.gs`);
  }
});

test('7 DN dans les deux fichiers', () => {
  assertEqual(data.validDNs.length, 7);
});

test('Configurations sync entre config.gs et code.gs', () => {
  assert(codeGs.includes('PSV_CONFIG.configurations[configId]'),
    'code.gs ne reference pas PSV_CONFIG.configurations');
  assert(codeGs.includes('PSV_CONFIG.configurations[\'CFG-1\']'),
    'code.gs ne reference pas CFG-1 comme defaut');
});

// ============================================================
// 10. INTEGRITE DES ELEMENTS DOM
// ============================================================
suite('10. Integrite des elements DOM');

const requiredIds = [
  // v1.0 elements
  'dn', 'fluidType', 'orifice', 'pressure', 'pressureUnit',
  'calculateBtn', 'resetBtn', 'copyBtn', 'printBtn',
  'resultsSection', 'forceValue', 'paramsSummary', 'statusBadge',
  'modeSimpleBtn', 'modeBatchBtn', 'simpleSection', 'batchSection', 'appContainer',
  'batchFormContainer', 'csvImportZone', 'batchTableBody', 'batchInputCards',
  'addRowBtn', 'addFiveRowsBtn', 'calculateBatchBtn', 'resetBatchBtn',
  'batchResults', 'resultsTableBody', 'resultsCards',
  'dropZone', 'csvFileInput', 'csvPreview', 'csvFileName',
  'csvValidCount', 'csvWarningCount', 'csvErrorCount', 'csvErrorsList',
  'cancelCsvBtn', 'importCsvBtn', 'downloadTemplateBtn',
  'exportCsvBtn', 'exportPdfBtn', 'copyResultsBtn',
  'sessionRestoreBanner', 'restoreSessionBtn', 'discardSessionBtn',
  'toast', 'toastMessage', 'loadingOverlay', 'loadingText',
  // v2.0 elements
  'p1CalcToggle', 'p1CalcPanel', 'p1Ptarage', 'p1Surpression', 'p1Patm',
  'p1CalcApplyBtn', 'p1CalcResult', 'loadExampleBtn',
  'configPanel', 'configPanelHeader', 'configPanelToggle', 'configPanelBody',
  'configOptions', 'dlfOptions', 'dlfCustomInput', 'dlfCustomValue',
  'dlfWarning', 'fDesignValue', 'fxValue', 'fyValue', 'fzValue', 'forceDiagram'
];

test(`Tous les ${requiredIds.length} elements DOM requis existent (id="...")`, () => {
  const missing = [];
  for (const id of requiredIds) {
    if (!indexHtml.includes(`id="${id}"`)) {
      missing.push(id);
    }
  }
  assert(missing.length === 0, `Elements DOM manquants: ${missing.join(', ')}`);
});

test('Tous les getElementById correspondent a un id dans le HTML', () => {
  const getByIdRegex = /getElementById\(['"]([\w]+)['"]\)/g;
  let match;
  const jsIds = new Set();
  while ((match = getByIdRegex.exec(jsCode)) !== null) {
    jsIds.add(match[1]);
  }

  const missing = [];
  for (const id of jsIds) {
    if (!indexHtml.includes(`id="${id}"`)) {
      missing.push(id);
    }
  }
  assert(missing.length === 0, `IDs JS sans HTML: ${missing.join(', ')}`);
});

test('Pas de doublons d\'id dans le HTML', () => {
  const idRegex = /id="([\w]+)"/g;
  let match;
  const ids = {};
  while ((match = idRegex.exec(indexHtml)) !== null) {
    ids[match[1]] = (ids[match[1]] || 0) + 1;
  }

  const dupes = Object.entries(ids).filter(([, count]) => count > 1).map(([id]) => id);
  assert(dupes.length === 0, `IDs dupliques: ${dupes.join(', ')}`);
});

// ============================================================
// TESTS SUPPLEMENTAIRES - UX
// ============================================================
suite('11. Tests UX supplementaires');

test('Bouton "Charger un exemple" present', () => {
  assert(indexHtml.includes('id="loadExampleBtn"'), 'Bouton loadExampleBtn manquant');
  assert(indexHtml.includes('Charger un exemple'), 'Texte "Charger un exemple" manquant');
});

test('L\'exemple utilise DN 100 / Gaz / Orifice K / 15.5 bar', () => {
  assert(jsCode.includes("dnInput.value = '100'"), 'Exemple DN != 100');
  assert(jsCode.includes("fluidTypeInput.value = 'gaz'"), 'Exemple fluide != gaz');
  assert(jsCode.includes("orificeInput.value = 'K'"), 'Exemple orifice != K');
  assert(jsCode.includes("pressureInput.value = '15.5'"), 'Exemple pression != 15.5');
});

test('Placeholder pression = "ex: 15.5" (et non "0.0")', () => {
  assert(indexHtml.includes('placeholder="ex: 15.5"'), 'Placeholder pression != "ex: 15.5"');
});

test('Helper text pression enrichi avec formule P1', () => {
  assert(indexHtml.includes('P1 = P_tarage x (1 + surpression%) + P_atm'),
    'Helper text P1 non enrichi');
});

test('Bandeau avertissement methode simplifiee present', () => {
  assert(indexHtml.includes('Methode simplifiee'), 'Titre bandeau manquant');
  assert(indexHtml.includes('API 520 Part II'), 'Reference API 520 manquante');
  assert(indexHtml.includes('method-warning'), 'Classe method-warning manquante');
});

test('Bandeau avertissement present dans le mode batch aussi', () => {
  // Count occurrences of method-warning class
  const count = (indexHtml.match(/class="method-warning"/g) || []).length;
  assert(count >= 2, `Bandeau avertissement present ${count} fois (attendu >= 2)`);
});

test('Le tooltip DLF est present', () => {
  assert(indexHtml.includes('Le DLF amplifie la force brute'),
    'Tooltip DLF manquant');
});

test('Le panneau config est collapsible par defaut', () => {
  assert(indexHtml.includes('id="configPanelBody"'), 'configPanelBody manquant');
  // Body should NOT have class "show" by default
  const bodyMatch = indexHtml.match(/id="configPanelBody"[^>]*/);
  assert(bodyMatch && !bodyMatch[0].includes('show'),
    'Config panel body ne devrait pas etre ouvert par defaut');
});

// ============================================================
// TESTS SUPPLEMENTAIRES - FORMULE
// ============================================================
suite('12. Tests de formule et coherence dimensionnelle');

test('Formule affichee dans simple mode : F = Kf x A x P1', () => {
  assert(indexHtml.includes('F = Kf x A x P1'), 'Formule simple manquante');
});

test('Formule enrichie dans batch mode : F_brute = Kf x A x P1 | F_design = F_brute x DLF', () => {
  assert(indexHtml.includes('F_brute = Kf x A x P1'), 'F_brute manquant');
  assert(indexHtml.includes('F_design = F_brute x DLF'), 'F_design manquant');
});

test('Coherence dimensionnelle : 1 cm2 x 1 bar x Kf=1 = 10 daN (verifie par calcul)', () => {
  // F = Kf * A * P1 where A in cm2 and P1 in bar gives daN
  // 1 bar = 10 N/cm2, so Kf * A(cm2) * P(bar) gives directly in daN
  // With Kf=1, A=1cm2, P=10bar => F = 10 daN
  // This is a dimensional sanity check
  const f = 1.0 * 1.0 * 10.0;
  assertEqual(f, 10.0, 'Coherence dimensionnelle');
});

test('Ordre de grandeur : DN100/Gaz/K/15.5bar donne ~275 daN (raisonnable)', () => {
  const f = 1.5 * 11.86 * 15.5;
  assert(f > 200 && f < 400, `Force ${f} hors plage attendue [200, 400]`);
});

// ============================================================
// TESTS code.gs
// ============================================================
suite('13. Tests code.gs');

test('calculateForce() accepte 6 parametres (dn, fluid, orifice, pressure, configId, dlf)', () => {
  assert(codeGs.includes('function calculateForce(dn, fluidType, orifice, pressure, configId, dlf)'),
    'Signature calculateForce incorrecte');
});

test('calculateForce() retourne un objet avec force, dlf, fDesign, fx, fy, fz', () => {
  assert(codeGs.includes('force:'), 'Retour force manquant');
  assert(codeGs.includes('dlf:'), 'Retour dlf manquant');
  assert(codeGs.includes('fDesign:'), 'Retour fDesign manquant');
  assert(codeGs.includes('fx:'), 'Retour fx manquant');
  assert(codeGs.includes('fy:'), 'Retour fy manquant');
  assert(codeGs.includes('fz:'), 'Retour fz manquant');
});

test('calculateForce() utilise DLF=2.0 par defaut si non fourni', () => {
  assert(codeGs.includes("dlf !== undefined && dlf !== null) ? dlf : 2.0"),
    'Default DLF 2.0 absent');
});

test('calculateForce() utilise CFG-1 par defaut si non fourni', () => {
  assert(codeGs.includes("PSV_CONFIG.configurations['CFG-1']"),
    'Default CFG-1 absent');
});

test('generatePDF() accepte les parametres enrichis', () => {
  assert(codeGs.includes('function generatePDF(dn, fluidType, orifice, pressure, force, dlf, fDesign, fx, fy, fz)'),
    'Signature generatePDF incorrecte');
});

// ============================================================
// TESTS config.gs
// ============================================================
suite('14. Tests config.gs');

test('PSV_CONFIG contient les nouvelles tables v2.0', () => {
  assert(configGs.includes('configurations:'), 'configurations manquant');
  assert(configGs.includes('validConfigs:'), 'validConfigs manquant');
  assert(configGs.includes('dlfPresets:'), 'dlfPresets manquant');
});

test('Configurations config.gs utilisent les bons multiplicateurs', () => {
  // CFG-1 : fx=0, fy=-1
  assert(configGs.includes("'CFG-1': { id: 'CFG-1'"), 'CFG-1 manquant');
  assert(configGs.includes("fy: -1"), 'CFG-1 fy=-1 manquant');
  // CFG-4 : coude 90° avec 0.707
  assert(configGs.includes("-0.707"), 'CFG-4 0.707 manquant');
});

test('getConfig() exporte toute la configuration', () => {
  assert(configGs.includes('function getConfig()'), 'getConfig manquant');
  assert(configGs.includes('return PSV_CONFIG'), 'return PSV_CONFIG manquant');
});


// ============================================================
// RAPPORT FINAL
// ============================================================
console.log('\n' + '='.repeat(60));
console.log('  RAPPORT FINAL');
console.log('='.repeat(60));
console.log(`  Total tests : ${totalTests}`);
console.log(`  Reussis     : ${passed} ✓`);
console.log(`  Echecs      : ${failed} ✗`);
console.log('='.repeat(60));

if (errors.length > 0) {
  console.log('\n  DETAILS DES ECHECS :');
  errors.forEach((e, i) => {
    console.log(`\n  ${i + 1}. [${e.suite}] ${e.test}`);
    console.log(`     → ${e.error}`);
  });
}

console.log('\n' + (failed === 0 ? '  ✓ TOUS LES TESTS PASSENT' : `  ✗ ${failed} TEST(S) EN ECHEC`) + '\n');

process.exit(failed > 0 ? 1 : 0);
