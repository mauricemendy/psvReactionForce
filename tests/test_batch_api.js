/**
 * PSV Reaction Force Calculator v4.0
 * Batch mixte — methode de calcul par ligne (Kf ou dimensionnement API)
 *
 * Execute avec : node tests/test_batch_api.js
 *
 * Comme test_api_sizing.js, ce fichier EXECUTE le moteur reellement
 * embarque dans index.html plutot que d'en redefinir une copie.
 *
 * Couvre le LOT 1 de la refonte :
 *   1. Modele de donnees et heritage des reglages de lot
 *   2. Couplage valeur / unite sur les surcharges (exigence comite 2.3)
 *   3. Regle DLF unifiee sur les trois modes (exigence comite 2.2)
 *   4. Session localStorage : versionnage, migration, test de vacuite
 *   5. Reordonnancement des onglets
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ============================================================
// TEST FRAMEWORK MINIMAL (identique aux deux autres suites)
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
    console.log(`  ✗ ${name}\n    → ${e.message}`);
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
  if (!(Math.abs(actual - expected) <= tolerance)) {
    throw new Error(`${message || 'assertClose'}: expected ~${expected} (±${tolerance}), got ${actual}`);
  }
}

// ============================================================
// CHARGEMENT DU MOTEUR REEL
// ============================================================
const indexPath = path.join(__dirname, '..', 'index.html');
const indexHtml = fs.readFileSync(indexPath, 'utf-8');

const scriptMatch = indexHtml.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/);
if (!scriptMatch) {
  console.error('IMPOSSIBLE d\'extraire le bloc <script> de index.html');
  process.exit(1);
}
const jsCode = scriptMatch[1];

const domMarker = '// DOM ELEMENTS - SIMPLE MODE';
const domIndex = jsCode.indexOf(domMarker);
if (domIndex === -1) {
  console.error('Marqueur DOM introuvable dans index.html');
  process.exit(1);
}
const engineSource = jsCode.slice(0, jsCode.lastIndexOf('// ============================', domIndex));

const EXPORTS = [
  'createEmptyPSV', 'createBatchDefaults', 'resolvePsvParams', 'hasOverride',
  'psvHasContent', 'migratePsvList', 'PSV_CONTENT_FIELDS', 'PSV_SCHEMA_VERSION',
  'BATCH_METHODS', 'checkDlf',
  'DLF_MIN_BLOQUANT', 'DLF_SEUIL_JUSTIFICATION', 'DLF_SEUIL_ELEVE',
  'computeApiSizing', 'bargToKPaAbs', 'celsiusToK'
];

const sandbox = { Math, JSON, Number, String, Object, Array, console, isNaN, parseFloat, parseInt };
vm.createContext(sandbox);
vm.runInContext(
  engineSource + '\nthis.__api = { ' + EXPORTS.map(n => n + ': ' + n).join(', ') + ' };',
  sandbox
);
const api = sandbox.__api;


// ============================================================
suite('1. Modele de donnees et heritage des reglages de lot');
// ============================================================

test('Une ligne neuve est en methode Kf, sans surcharge active', () => {
  const psv = api.createEmptyPSV();
  assertEqual(psv.method, 'kf', 'methode par defaut');
  ['M', 'k', 'Z', 'phase', 'ksh', 'schedule', 'overpressure', 'psetUnit', 'tempUnit']
    .forEach(champ => {
      assertEqual(psv[champ], '', `${champ} doit etre vide (= heriter)`);
      assertEqual(api.hasOverride(psv[champ]), false, `${champ} ne doit pas etre une surcharge`);
    });
  assertEqual(psv.hasRuptureDisc, null, 'disque de rupture : null = heriter');
});

test('Une ligne sans surcharge herite integralement du lot', () => {
  const d = api.createBatchDefaults();
  const r = api.resolvePsvParams(api.createEmptyPSV(), d);
  assertClose(r.M, d.M, 1e-9, 'M');
  assertClose(r.k, d.k, 1e-9, 'k');
  assertClose(r.Z, d.Z, 1e-9, 'Z');
  assertClose(r.overpressure, d.overpressure, 1e-9, 'surpression');
  assertEqual(r.phase, d.phase, 'phase');
  assertEqual(r.schedule, d.schedule, 'schedule');
  assertEqual(r.hasRuptureDisc, false, 'disque de rupture');
});

test('Une surcharge de ligne l\'emporte sur le reglage de lot', () => {
  const d = api.createBatchDefaults();
  const psv = Object.assign(api.createEmptyPSV(), { M: 16.04, k: 1.31, schedule: '80' });
  const r = api.resolvePsvParams(psv, d);
  assertClose(r.M, 16.04, 1e-9, 'M surcharge');
  assertClose(r.k, 1.31, 1e-9, 'k surcharge');
  assertEqual(r.schedule, '80', 'schedule surcharge');
  assertClose(r.Z, d.Z, 1e-9, 'Z non surcharge, herite');
});

test('Zero est une surcharge valide, pas une absence', () => {
  // Piege classique : un test de verite ferait passer 0 pour « vide ».
  const psv = Object.assign(api.createEmptyPSV(), { overpressure: 0 });
  assertEqual(api.hasOverride(0), true, 'hasOverride(0)');
  assertClose(api.resolvePsvParams(psv, api.createBatchDefaults()).overpressure, 0, 1e-9,
    'la surpression 0 doit etre retenue');
});

test('resolvePsvParams est pure : ni la ligne ni le lot ne sont modifies', () => {
  const d = api.createBatchDefaults();
  const psv = Object.assign(api.createEmptyPSV(), { M: 2.016 });
  const avantLigne = JSON.stringify(psv);
  const avantLot = JSON.stringify(d);
  api.resolvePsvParams(psv, d);
  assertEqual(JSON.stringify(psv), avantLigne, 'la ligne ne doit pas etre modifiee');
  assertEqual(JSON.stringify(d), avantLot, 'les reglages ne doivent pas etre modifies');
});

test('Le disque de rupture se surcharge dans les deux sens', () => {
  const d = api.createBatchDefaults();
  d.hasRuptureDisc = true;
  assertEqual(api.resolvePsvParams(api.createEmptyPSV(), d).hasRuptureDisc, true, 'herite de true');
  const psv = Object.assign(api.createEmptyPSV(), { hasRuptureDisc: false });
  assertEqual(api.resolvePsvParams(psv, d).hasRuptureDisc, false, 'surcharge a false');
});

test('EXIGENCE COMITE : la surpression heritee est bien 10 % et non 21 %', () => {
  // Parametre qui influe le plus sur P1, donc sur le debit nominal.
  // Un lot regle a 10 % (ASME Section VIII) ne doit jamais laisser
  // filtrer les 21 % du cas incendie.
  const d = api.createBatchDefaults();
  assertClose(d.overpressure, 10, 1e-9, 'la valeur de lot par defaut est 10 %');

  const ligne = api.createEmptyPSV();
  assertClose(api.resolvePsvParams(ligne, d).overpressure, 10, 1e-9, 'heritage a 10 %');

  // Effet reel sur le calcul : 10 % et 21 % ne donnent pas le meme debit.
  const commun = {
    npsIn: '2', npsOut: '3', rating: 300, schedule: 'STD',
    tempK: api.celsiusToK(150), M: 28.96, k: 1.4, Z: 1, phase: 'gas', dlf: 2.0
  };
  const a10 = api.computeApiSizing(Object.assign({}, commun, { p1KPa: api.bargToKPaAbs(20 * 1.10) }));
  const a21 = api.computeApiSizing(Object.assign({}, commun, { p1KPa: api.bargToKPaAbs(20 * 1.21) }));
  assert(a21.flow.w > a10.flow.w, 'le cas incendie doit donner un debit superieur');

  // Et le cas incendie reste accessible par surcharge de lot.
  d.overpressure = 21;
  assertClose(api.resolvePsvParams(ligne, d).overpressure, 21, 1e-9, 'surcharge de lot a 21 %');
});


// ============================================================
suite('2. Couplage valeur / unite (exigence comite 2.3)');
// ============================================================

test('Une ligne API ordinaire ne declenche AUCUN avertissement d\'unite', () => {
  // pset et temp sont les champs PRIMAIRES d'une ligne API, pas des
  // surcharges : ils sont toujours lus dans l'unite du lot. Un
  // avertissement ici se declencherait sur 100 % des lignes normales.
  const psv = Object.assign(api.createEmptyPSV(), {
    method: 'api', npsIn: '2', npsOut: '3', rating: 300, pset: 20, temp: 150
  });
  const r = api.resolvePsvParams(psv, api.createBatchDefaults());
  assertEqual(r.unitWarnings.length, 0, 'aucun avertissement attendu');
  assertEqual(r.psetUnit, 'barg', 'unite du lot appliquee');
  assertEqual(r.tempUnit, 'C', 'unite du lot appliquee');
});

test('Une ligne qui surcharge son unite est signalee', () => {
  // Le risque reel : 200 lu en °F alors que le lot est en °C donne
  // 366 K au lieu de 473 K, sans que rien ne l'indique.
  const psv = Object.assign(api.createEmptyPSV(), {
    method: 'api', temp: 200, tempUnit: 'F'
  });
  const r = api.resolvePsvParams(psv, api.createBatchDefaults());
  assertEqual(r.unitWarnings.length, 1, 'un avertissement attendu');
  assert(/temperature/.test(r.unitWarnings[0]), 'doit nommer la grandeur');
  assert(/en F/.test(r.unitWarnings[0]), 'doit citer l\'unite de la ligne');
  assert(/lot est en C/.test(r.unitWarnings[0]), 'doit citer l\'unite du lot');
  assert(/200/.test(r.unitWarnings[0]), 'doit rappeler la valeur saisie');
  assertEqual(r.tempUnit, 'F', 'l\'unite de ligne est bien retenue');
});

test('Surcharger l\'unite avec la MEME valeur que le lot ne signale rien', () => {
  const psv = Object.assign(api.createEmptyPSV(), { temp: 150, tempUnit: 'C' });
  const r = api.resolvePsvParams(psv, api.createBatchDefaults());
  assertEqual(r.unitWarnings.length, 0, 'aucun ecart, aucun avertissement');
});

test('La regle vaut pour la pression comme pour la temperature', () => {
  const psv = Object.assign(api.createEmptyPSV(), {
    pset: 300, psetUnit: 'psig', temp: 200, tempUnit: 'F'
  });
  const r = api.resolvePsvParams(psv, api.createBatchDefaults());
  assertEqual(r.unitWarnings.length, 2, 'les deux grandeurs doivent etre signalees');
  assert(r.unitWarnings.some(w => /pression de tarage/.test(w)), 'pression signalee');
  assert(r.unitWarnings.some(w => /temperature/.test(w)), 'temperature signalee');
});

test('Un lot entier dans une autre unite ne signale rien', () => {
  // Si le lot est en psig/°F, les lignes qui n'en surchargent pas
  // l'unite sont coherentes : rien a signaler.
  const d = api.createBatchDefaults();
  d.psetUnit = 'psig'; d.tempUnit = 'F';
  const psv = Object.assign(api.createEmptyPSV(), { pset: 300, temp: 200 });
  const r = api.resolvePsvParams(psv, d);
  assertEqual(r.unitWarnings.length, 0, 'aucun avertissement');
  assertEqual(r.psetUnit, 'psig', 'unite du lot');
  assertEqual(r.tempUnit, 'F', 'unite du lot');
});


// ============================================================
suite('3. Regle DLF unifiee (exigence comite 2.2)');
// ============================================================

test('Un DLF sous 1.0 est une erreur BLOQUANTE', () => {
  [0.5, 0.9, 0.99].forEach(v => {
    const verdict = api.checkDlf(v);
    assertEqual(verdict.level, 'error', `DLF ${v} doit etre refuse`);
    assert(/soutenu/.test(verdict.message), 'le message doit expliquer pourquoi');
    assert(/B31/.test(verdict.message), 'le message doit citer le code');
  });
});

test('DLF = 1.0 reste accepte : c\'est le preset « statique equivalent »', () => {
  assertEqual(api.checkDlf(1.0).level, 'warning', 'accepte, mais a justifier');
  assertEqual(api.DLF_MIN_BLOQUANT, 1.0, 'borne bloquante');
});

test('Entre 1.0 et 2.0, avertissement de justification', () => {
  [1.0, 1.1, 1.5, 1.99].forEach(v => {
    const verdict = api.checkDlf(v);
    assertEqual(verdict.level, 'warning', `DLF ${v}`);
    assert(/time-history/.test(verdict.message), 'doit exiger une analyse temporelle');
  });
});

test('Le seuil 2.0 absorbe le seuil 1.1 demande par le comite', () => {
  // Le comite demandait un avertissement sous 1.1 ; le seuil SRS de 2.0
  // est plus strict et le couvre. On verrouille la couverture.
  assertEqual(api.checkDlf(1.09).level, 'warning', 'sous 1.1');
  assertEqual(api.DLF_SEUIL_JUSTIFICATION, 2.0, 'seuil de justification');
});

test('De 2.0 a 3.0, aucun signalement', () => {
  [2.0, 2.5, 3.0].forEach(v => assertEqual(api.checkDlf(v).level, 'ok', `DLF ${v}`));
});

test('Au-dela de 3.0, avertissement de valeur elevee', () => {
  const verdict = api.checkDlf(3.5);
  assertEqual(verdict.level, 'warning', 'DLF 3.5');
  assert(/eleve/.test(verdict.message), 'le message doit signaler la valeur elevee');
  assertEqual(api.DLF_SEUIL_ELEVE, 3.0, 'seuil eleve');
});

test('Un DLF non numerique est refuse', () => {
  ['', 'abc', null, undefined, NaN].forEach(v => {
    assertEqual(api.checkDlf(v).level, 'error', `DLF ${JSON.stringify(v)} doit etre refuse`);
  });
});

test('Les trois modes passent par checkDlf', () => {
  assert(/function validateDLF\(value\) \{[\s\S]{0,400}checkDlf\(value\)/.test(jsCode),
    'mode simple');
  assert(/function refreshApiDlfWarning\(\) \{[\s\S]{0,200}checkDlf\(getApiDLF\(\)\)/.test(jsCode),
    'mode dimensionnement API');
  assert(/checkDlf\(psv\.dlf/.test(jsCode), 'mode batch');
});


// ============================================================
suite('4. Session localStorage — versionnage et migration');
// ============================================================

test('REGRESSION : un lot 100 % API n\'est PAS considere comme vide', () => {
  // C'etait le piege de cette refonte. L'ancien test de vacuite ne
  // regardait que dn / fluidType / orifice / pressure, tous absents d'une
  // ligne API : le lot etait jete silencieusement et l'utilisateur
  // perdait sa saisie sans aucun message.
  const ligneApi = Object.assign(api.createEmptyPSV(), {
    method: 'api', npsIn: '2', npsOut: '3', rating: 300, pset: 20, temp: 150
  });
  assertEqual(api.psvHasContent(ligneApi), true, 'une ligne API porte de la donnee');
  assertEqual(ligneApi.dn, '', 'et n\'a effectivement aucun champ Kf');
  assertEqual(ligneApi.orifice, '', 'ni orifice');
});

test('Le test de vacuite couvre les champs des DEUX methodes', () => {
  ['dn', 'fluidType', 'orifice', 'pressure'].forEach(c =>
    assert(api.PSV_CONTENT_FIELDS.indexOf(c) !== -1, `champ Kf ${c} manquant`));
  ['npsIn', 'npsOut', 'rating', 'pset', 'temp'].forEach(c =>
    assert(api.PSV_CONTENT_FIELDS.indexOf(c) !== -1, `champ API ${c} manquant`));
});

test('Une ligne reellement vide est bien detectee comme vide', () => {
  assertEqual(api.psvHasContent(api.createEmptyPSV()), false, 'ligne neuve');
  assertEqual(api.psvHasContent(null), false, 'null');
  assertEqual(api.psvHasContent({}), false, 'objet vide');
});

test('Une session sans version est migree en methode Kf', () => {
  // Forme d'avant le batch mixte : aucune cle `method`.
  const ancien = [
    { itemId: 'PSV-001', lineName: 'Vapeur HP', dn: '100', fluidType: 'gaz',
      orifice: 'K', pressure: 15.5, config: 'CFG-1', dlf: 2.0 }
  ];
  const migre = api.migratePsvList(ancien, 0);
  assertEqual(migre.length, 1, 'aucune ligne perdue');
  assertEqual(migre[0].method, 'kf', 'methode attribuee');
  assertEqual(migre[0].itemId, 'PSV-001', 'donnees preservees');
  assertEqual(migre[0].pressure, 15.5, 'pression preservee');
  assertEqual(migre[0].npsIn, '', 'les champs API sont initialises a vide');
  assertEqual(api.psvHasContent(migre[0]), true, 'la ligne migree porte de la donnee');
});

test('Une session deja au schema courant n\'est pas retouchee', () => {
  const courant = [Object.assign(api.createEmptyPSV(), { method: 'api', npsIn: '3' })];
  assertEqual(api.migratePsvList(courant, api.PSV_SCHEMA_VERSION), courant, 'objet inchange');
});

test('Une methode inconnue est ramenee a kf', () => {
  const migre = api.migratePsvList([{ itemId: 'X', method: 'bidon' }], 0);
  assertEqual(migre[0].method, 'kf', 'repli sur kf');
  assertEqual(api.BATCH_METHODS.join(','), 'kf,api', 'methodes reconnues');
});

test('Une donnee non exploitable ne fait pas tomber la migration', () => {
  assertEqual(api.migratePsvList(null, 0), null, 'null');
  assertEqual(api.migratePsvList('pas un tableau', 0), null, 'chaine');
});

test('La version du schema est enregistree et relue', () => {
  assertEqual(api.PSV_SCHEMA_VERSION, 4, 'version courante');
  assert(/localStorage\.setItem\('psv_calculator_schema_version'/.test(jsCode), 'ecriture');
  assert(/localStorage\.getItem\('psv_calculator_schema_version'\)/.test(jsCode), 'lecture');
  assert(/removeItem\('psv_calculator_schema_version'\)/.test(jsCode), 'purge');
});

test('Les reglages de lot sont persistes avec la session', () => {
  assert(/setItem\('psv_calculator_batch_defaults'/.test(jsCode), 'ecriture');
  assert(/function loadBatchDefaults\(\)/.test(jsCode), 'lecture');
  assert(/removeItem\('psv_calculator_batch_defaults'\)/.test(jsCode), 'purge');
});


// ============================================================
suite('5. Reordonnancement des onglets');
// ============================================================

test('L\'ordre des onglets est Simple, Dimensionnement API, Batch', () => {
  const iSimple = indexHtml.indexOf('id="modeSimpleBtn"');
  const iApi = indexHtml.indexOf('id="modeApiBtn"');
  const iBatch = indexHtml.indexOf('id="modeBatchBtn"');
  assert(iSimple > -1 && iApi > -1 && iBatch > -1, 'les trois boutons doivent exister');
  assert(iSimple < iApi, 'Simple avant Dimensionnement API');
  assert(iApi < iBatch, 'Dimensionnement API avant Batch');
});

test('L\'ordre du DOM suit l\'ordre des onglets', () => {
  // Compte pour l'ordre de lecture et pour l'impression PDF.
  const iSimple = indexHtml.indexOf('id="simpleSection"');
  const iApi = indexHtml.indexOf('id="apiSection"');
  const iBatch = indexHtml.indexOf('id="batchSection"');
  assert(iSimple < iApi, 'section Simple avant section API');
  assert(iApi < iBatch, 'section API avant section Batch');
});

test('Les URL ?mode=api et ?mode=batch restent valides', () => {
  assert(/mode === 'batch' \|\| mode === 'api'/.test(jsCode), 'les deux modes pilotent l\'URL');
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
