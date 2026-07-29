/**
 * PSV Reaction Force Calculator v3.0
 * Batterie de tests du module de dimensionnement par enveloppe
 * (API 526 pour l'orifice, API 520 Part I pour le debit, Part II pour l'effort).
 *
 * Execute avec : node tests/test_api_sizing.js
 *
 * Contrairement a test_v2.js qui redefinit les donnees, ce fichier
 * EXECUTE le moteur reellement embarque dans index.html : le bloc de
 * script est extrait puis evalue jusqu'a la premiere reference au DOM.
 * Les valeurs testees sont donc celles que l'utilisateur obtient.
 *
 * Couvre :
 *   1. Module A - retro-ingenierie de l'orifice (API 526)
 *   2. Module B - debit gaz (API 520 Part I)
 *   3. Module B - debit vapeur d'eau (API 520 Part I)
 *   4. Module C - force de reaction (API 520 Part II)
 *   5. Integrite et synchronisation des tables (index.html <-> config.gs)
 *   6. Audit des entrees API 526 non validees (non bloquant)
 *   7. Non-regression : le mode simple n'est pas touche
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ============================================================
// TEST FRAMEWORK MINIMAL (identique a test_v2.js)
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
  if (!(Math.abs(actual - expected) <= tolerance)) {
    throw new Error(`${message || 'assertClose'}: expected ~${expected} (±${tolerance}), got ${actual}`);
  }
}

/** Ecart relatif, en pourcentage. */
function relDiff(a, b) {
  return Math.abs(a - b) / Math.abs(b) * 100;
}

// ============================================================
// CHARGEMENT DU MOTEUR REEL DEPUIS index.html
// ============================================================
const indexPath = path.join(__dirname, '..', 'index.html');
const configGsPath = path.join(__dirname, '..', 'config.gs');

const indexHtml = fs.readFileSync(indexPath, 'utf-8');
const configGs = fs.readFileSync(configGsPath, 'utf-8');

const scriptMatch = indexHtml.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/);
if (!scriptMatch) {
  console.error('IMPOSSIBLE d\'extraire le bloc <script> de index.html');
  process.exit(1);
}
const jsCode = scriptMatch[1];

// Le moteur est constitue de fonctions pures declarees AVANT le premier
// document.getElementById(). On coupe juste avant pour pouvoir l'evaluer
// hors navigateur.
const domMarker = '// DOM ELEMENTS - SIMPLE MODE';
const domIndex = jsCode.indexOf(domMarker);
if (domIndex === -1) {
  console.error('Marqueur DOM introuvable dans index.html');
  process.exit(1);
}
const engineSource = jsCode.slice(0, jsCode.lastIndexOf('// ============================', domIndex));

const EXPORTS = [
  'api526Table', 'api526Orifices', 'pipeIdTable', 'fluidPresets', 'areaTable',
  'validNps', 'validRatings', 'validSchedules', 'API_CONST',
  'selectMaxOrifice', 'coefficientC', 'coefficientCUS', 'napierKN',
  'criticalFlowPressure', 'ratedFlow', 'outletArea', 'reactionForce',
  'computeApiSizing', 'buildApiDisclaimer', 'formatDlf',
  'bargToKPaAbs', 'psigToKPaAbs', 'celsiusToK', 'fahrenheitToK',
  'cm2ToMm2', 'cm2ToIn2', 'api526Key'
];

const sandbox = { Math, JSON, Number, String, Object, Array, console, isNaN, parseFloat, parseInt };
vm.createContext(sandbox);
vm.runInContext(
  engineSource + '\nthis.__api = { ' + EXPORTS.map(n => n + ': ' + n).join(', ') + ' };',
  sandbox
);
const api = sandbox.__api;

// config.gs est evalue lui aussi, pour permettre une comparaison profonde
// des tables plutot qu'une recherche textuelle approximative.
const cfgSandbox = {};
vm.createContext(cfgSandbox);
vm.runInContext(configGs + '\nthis.__cfg = PSV_CONFIG;', cfgSandbox);
const cfg = cfgSandbox.__cfg;

// Cas de reference partage : specification SRS, corps 2x3 CL300, air.
function srsCase(overrides) {
  return Object.assign({
    npsIn: '2', npsOut: '3', rating: 300, schedule: 'STD',
    p1KPa: api.bargToKPaAbs(20 * 1.1),
    tempK: api.celsiusToK(150),
    M: 28.96, k: 1.4, Z: 1, phase: 'gas', dlf: 2.0, config: 'CFG-1'
  }, overrides || {});
}


// ============================================================
suite('1. Module A - retro-ingenierie de l\'orifice (API 526)');
// ============================================================

test('Cas de reference SRS : 2x3 CL300 retient l\'orifice J', () => {
  const r = api.selectMaxOrifice('2', '3', 300);
  assert(r.ok, 'la requete doit aboutir');
  assertEqual(r.orifice, 'J', 'orifice retenu');
  assertClose(r.areaIn2, 1.287, 0.002, 'aire en in2 (valeur SRS)');
  assertClose(r.areaCm2, 8.3, 0.001, 'aire en cm2');
});

test('Cas SRS : en CL300 les candidats sont H et J, H est ecarte', () => {
  // La SRS annoncait « G, H et J possibles » pour le corps 2x3. La norme
  // precise : G n'est offert qu'en 1500# et 2500#. En CL300 le corps ne
  // propose que H et J. L'orifice retenu (J) est inchange.
  const r = api.selectMaxOrifice('2', '3', 300);
  assertEqual(r.candidates.join(','), 'H,J', 'candidats en CL300');
  assertEqual(r.rejected.join(','), 'H', 'orifices ecartes');
});

test('G n\'apparait en 2x3 qu\'a partir de la classe 1500', () => {
  [150, 300, 600, 900].forEach(rating => {
    assert(api.selectMaxOrifice('2', '3', rating).candidates.indexOf('G') === -1,
      `G ne doit pas etre propose en CL${rating}`);
  });
  assert(api.selectMaxOrifice('2', '3', 1500).candidates.indexOf('G') !== -1, 'G attendu en CL1500');
  assertEqual(api.selectMaxOrifice('2', '3', 2500).orifice, 'G', 'G seul en CL2500');
});

test('La regle de decision retient le MAXIMUM, pas le premier', () => {
  // 4x6 propose L, M, N, P : P (41.2 cm2) doit gagner.
  const r = api.selectMaxOrifice('4', '6', 300);
  assertEqual(r.orifice, 'P', 'orifice retenu pour 4x6');
  assertClose(r.areaCm2, 41.2, 0.001, 'aire');
});

test('Chaque entree de la table retourne bien son orifice d\'aire maximale', () => {
  Object.keys(api.api526Table).forEach(key => {
    const entry = api.api526Table[key];
    const parts = key.split('x');
    const r = api.selectMaxOrifice(parts[0], parts[1], entry.ratings[0]);
    assert(r.ok, `${key} doit aboutir`);
    const maxArea = Math.max.apply(null, entry.orifices.map(o => api.areaTable[o]));
    assertClose(r.areaCm2, maxArea, 1e-9, `${key} : aire maximale`);
  });
});

test('Combinaison de brides absente de la table -> erreur explicite', () => {
  const r = api.selectMaxOrifice('8', '8', 300);
  assert(!r.ok, 'doit echouer');
  assert(/API 526/.test(r.error), 'le message doit citer API 526');
  assert(/non-standard/.test(r.error), 'le message doit signaler le caractere non-standard');
});

test('Classe de bride indisponible pour ce corps -> erreur explicite', () => {
  // 6x10 n'existe qu'en 300# et 600# (API 526-2023, table 15).
  const r = api.selectMaxOrifice('6', '10', 2500);
  assert(!r.ok, 'doit echouer');
  assert(/2500#/.test(r.error), 'le message doit citer la classe demandee');
  assert(/300#, 600#/.test(r.error), 'le message doit lister les classes prevues');
});

test('Les classes valides de chaque entree sont toutes acceptees', () => {
  Object.keys(api.api526Table).forEach(key => {
    const parts = key.split('x');
    api.api526Table[key].ratings.forEach(rating => {
      const r = api.selectMaxOrifice(parts[0], parts[1], rating);
      assert(r.ok, `${key} CL${rating} doit aboutir`);
    });
  });
});

test('Les orifices V et W (hors API 526) ne sont JAMAIS proposes', () => {
  Object.keys(api.api526Table).forEach(key => {
    const parts = key.split('x');
    api.api526Table[key].ratings.forEach(rating => {
      const r = api.selectMaxOrifice(parts[0], parts[1], rating);
      assert(r.candidates.indexOf('V') === -1, `${key} ne doit pas proposer V`);
      assert(r.candidates.indexOf('W') === -1, `${key} ne doit pas proposer W`);
    });
  });
});

test('L\'orifice maximal DIMINUE quand la classe de bride monte', () => {
  // Comportement contre-intuitif mais conforme a la norme : le corps
  // encaisse la pression au detriment du passage. Verrouille ici parce
  // qu'un lecteur presse pourrait le prendre pour un bug.
  const suite3x4 = [150, 300, 600, 900, 1500].map(r => api.selectMaxOrifice('3', '4', r).areaCm2);
  for (let i = 1; i < suite3x4.length; i++) {
    assert(suite3x4[i] <= suite3x4[i - 1],
      `3x4 : l'aire ne doit pas croitre avec la classe (${suite3x4.join(' -> ')})`);
  }
  assertEqual(api.selectMaxOrifice('3', '4', 150).orifice, 'L', '3x4 CL150');
  assertEqual(api.selectMaxOrifice('3', '4', 600).orifice, 'K', '3x4 CL600');
  assertEqual(api.selectMaxOrifice('3', '4', 1500).orifice, 'J', '3x4 CL1500');
});

test('Le cas 1.5x2 CL900 : E et non H (regression corrigee)', () => {
  // Avant integration de la norme, la table a plat renvoyait H (5.06 cm2)
  // pour toute classe. La norme n'offre que D et E a partir de 900#.
  const r = api.selectMaxOrifice('1.5', '2', 900);
  assertEqual(r.orifice, 'E', 'orifice retenu en CL900');
  assertClose(r.areaCm2, 1.26, 0.001, 'aire');
  assertEqual(api.selectMaxOrifice('1.5', '2', 150).orifice, 'F', 'F en CL150');
});

test('byRating fait foi partout ou il est defini', () => {
  Object.keys(api.api526Table).forEach(key => {
    const entry = api.api526Table[key];
    const parts = key.split('x');
    entry.ratings.forEach(rating => {
      const attendu = entry.byRating[rating];
      assert(Array.isArray(attendu), `${key} CL${rating} : byRating manquant`);
      const r = api.selectMaxOrifice(parts[0], parts[1], rating);
      assertEqual(r.candidates.join(','), attendu.join(','), `${key} CL${rating}`);
    });
  });
});

test('Le rating accepte indifferemment une chaine ou un nombre', () => {
  assertEqual(api.selectMaxOrifice('2', '3', '300').orifice, 'J', 'rating en chaine');
  assertEqual(api.selectMaxOrifice('2', '3', 300).orifice, 'J', 'rating numerique');
});


// ============================================================
suite('2. Module B - debit massique gaz (API 520 Part I)');
// ============================================================

test('Coefficient C : k = 1.4 -> 356 (table API 520, unites US)', () => {
  assertClose(api.coefficientCUS(1.4), 356, 0.5, 'C_US(1.4)');
});

test('Coefficient C : k = 1.4 -> 0.02702 (table API 520, unites SI)', () => {
  assertClose(api.coefficientC(1.4), 0.02702, 0.00002, 'C_SI(1.4)');
});

test('Coefficient C : autres valeurs des tables API 520', () => {
  assertClose(api.coefficientCUS(1.0), 315, 1, 'C_US(1.0)');
  assertClose(api.coefficientCUS(1.1), 327, 1, 'C_US(1.1)');
  assertClose(api.coefficientCUS(1.2), 337, 1, 'C_US(1.2)');
  assertClose(api.coefficientCUS(1.3), 347, 1, 'C_US(1.3)');
  assertClose(api.coefficientCUS(1.6), 373, 1, 'C_US(1.6)');
});

test('Cas limite k = 1.0 : pas de NaN (l\'exposant diverge)', () => {
  const c = api.coefficientC(1.0);
  assert(!isNaN(c), 'C ne doit pas etre NaN');
  assert(isFinite(c), 'C doit etre fini');
  // Limite analytique : C = 0.03948 x sqrt(1/e)
  assertClose(c, 0.03948 * Math.sqrt(1 / Math.E), 1e-9, 'limite analytique');
});

test('Continuite de C au voisinage de k = 1', () => {
  assertClose(api.coefficientC(1.0), api.coefficientC(1.0001), 1e-5, 'continuite a droite');
});

test('Controle croise : debit vs flux massique bloque theorique', () => {
  // G_theorique = P1 x sqrt(k M / (R T)) x (2/(k+1))^((k+1)/(2(k-1)))
  const P1 = 2301.32e3, T = 423.15, M = 28.96, k = 1.4, A = 8.3e-4, Kd = 0.975;
  const G = P1 * Math.sqrt(k * M / (8314 * T)) * Math.pow(2 / (k + 1), (k + 1) / (2 * (k - 1)));
  const wTheorique = G * A * Kd * 3600;

  const r = api.ratedFlow({ areaMm2: 830, p1KPa: 2301.32, tempK: T, M: M, k: k, Z: 1, phase: 'gas' });
  assert(relDiff(r.w, wTheorique) < 0.5, `ecart ${relDiff(r.w, wTheorique).toFixed(2)} % > 0.5 % (moteur ${r.w.toFixed(0)}, theorie ${wTheorique.toFixed(0)} kg/h)`);
});

test('W est proportionnel a P1', () => {
  const base = { areaMm2: 830, tempK: 423.15, M: 28.96, k: 1.4, Z: 1, phase: 'gas' };
  const w1 = api.ratedFlow(Object.assign({}, base, { p1KPa: 1000 })).w;
  const w2 = api.ratedFlow(Object.assign({}, base, { p1KPa: 2000 })).w;
  assertClose(w2 / w1, 2, 1e-9, 'doublement de P1');
});

test('W est proportionnel a l\'aire d\'orifice', () => {
  const base = { p1KPa: 2000, tempK: 423.15, M: 28.96, k: 1.4, Z: 1, phase: 'gas' };
  const w1 = api.ratedFlow(Object.assign({}, base, { areaMm2: 500 })).w;
  const w2 = api.ratedFlow(Object.assign({}, base, { areaMm2: 1500 })).w;
  assertClose(w2 / w1, 3, 1e-9, 'triplement de l\'aire');
});

test('W varie en sqrt(M) et en 1/sqrt(Z T)', () => {
  const base = { areaMm2: 830, p1KPa: 2000, k: 1.4, phase: 'gas' };
  const wM1 = api.ratedFlow(Object.assign({}, base, { tempK: 400, M: 16, Z: 1 })).w;
  const wM4 = api.ratedFlow(Object.assign({}, base, { tempK: 400, M: 64, Z: 1 })).w;
  assertClose(wM4 / wM1, 2, 1e-9, 'M x4 -> W x2');

  const wT1 = api.ratedFlow(Object.assign({}, base, { tempK: 300, M: 28.96, Z: 1 })).w;
  const wT4 = api.ratedFlow(Object.assign({}, base, { tempK: 1200, M: 28.96, Z: 1 })).w;
  assertClose(wT1 / wT4, 2, 1e-9, 'T x4 -> W /2');

  const wZ4 = api.ratedFlow(Object.assign({}, base, { tempK: 300, M: 28.96, Z: 4 })).w;
  assertClose(wT1 / wZ4, 2, 1e-9, 'Z x4 -> W /2');
});

test('Kd vaut 0.975 par defaut, Kb et Kc valent 1.0', () => {
  const r = api.ratedFlow({ areaMm2: 830, p1KPa: 2000, tempK: 400, M: 28.96, k: 1.4, Z: 1, phase: 'gas' });
  assertEqual(r.kd, 0.975, 'Kd par defaut');
  assertEqual(r.kb, 1.0, 'Kb (decharge atmospherique)');
  assertEqual(r.kc, 1.0, 'Kc (sans disque de rupture)');
});

test('Le disque de rupture amont applique Kc = 0.9 (-10 % de debit)', () => {
  const input = srsCase();
  const sans = api.computeApiSizing(input);
  const avec = api.computeApiSizing(Object.assign({}, input, { hasRuptureDisc: true }));
  assertEqual(avec.flow.kc, api.API_CONST.KC_WITH_DISC, 'Kc avec disque');
  assertClose(avec.flow.w / sans.flow.w, 0.9, 1e-9, 'ratio des debits');
});

test('Z absent ou invalide retombe sur 1.0 (approche conservative)', () => {
  const ref = api.ratedFlow({ areaMm2: 830, p1KPa: 2000, tempK: 400, M: 28.96, k: 1.4, Z: 1, phase: 'gas' });
  const sansZ = api.ratedFlow({ areaMm2: 830, p1KPa: 2000, tempK: 400, M: 28.96, k: 1.4, phase: 'gas' });
  assertEqual(sansZ.z, 1.0, 'Z par defaut');
  assertClose(sansZ.w, ref.w, 1e-9, 'debit identique');
});

test('Ecoulement critique : P_cf > P_atm pour une PSV usuelle', () => {
  const r = api.computeApiSizing(srsCase());
  assert(r.flow.pcf > api.API_CONST.P_ATM_KPA, 'P_cf doit depasser l\'atmosphere');
  assertEqual(r.warnings.length, 0, 'aucun avertissement attendu sur ce cas');
});

test('Ecoulement sous-critique -> avertissement explicite', () => {
  // P1 a peine au-dessus de l'atmosphere : la detente ne peut pas bloquer.
  const r = api.ratedFlow({ areaMm2: 830, p1KPa: 110, tempK: 400, M: 28.96, k: 1.4, Z: 1, phase: 'gas' });
  assert(r.warnings.length > 0, 'un avertissement est attendu');
  assert(/sous-critique/.test(r.warnings[0]), 'le message doit mentionner le regime sous-critique');
});


// ============================================================
suite('3. Module B - debit massique vapeur d\'eau (API 520 Part I)');
// ============================================================

test('La constante SI 190.5 est coherente avec les 51.5 des unites US', () => {
  // W_US = 51.5 x A_in2 x P1_psia  ->  conversion en kg/h, mm2, kPa
  const A_mm2 = 830, P1_kPa = 2000;
  const wUS = 51.5 * (A_mm2 / 645.16) * (P1_kPa / 6.894757) * 0.453592; // kg/h
  const wSI = A_mm2 * P1_kPa / api.API_CONST.STEAM_SI_DIVISOR;
  assert(relDiff(wSI, wUS) < 0.2, `ecart SI/US ${relDiff(wSI, wUS).toFixed(3)} % > 0.2 %`);
});

test('KN vaut exactement 1 en dessous de 10 339 kPa abs', () => {
  assertEqual(api.napierKN(101.325), 1, 'a l\'atmosphere');
  assertEqual(api.napierKN(5000), 1, 'a 50 bar abs');
  assertEqual(api.napierKN(10339), 1, 'au seuil exact');
});

test('Au seuil, KN vaut 0.9957 : la petite discontinuite est celle de la norme', () => {
  // L'API 520 Part I n'applique la correction de Napier qu'au-DELA de
  // 1500 psia. La correlation ne valant pas exactement 1 a cette borne,
  // le passage du seuil introduit un saut de 0.4 %. C'est le comportement
  // de la norme, pas un defaut d'implementation : on le verrouille ici.
  assertClose(api.napierKN(10339.001), 0.99568, 0.0005, 'juste au-dessus du seuil');
  assertEqual(api.napierKN(10339), 1, 'exactement au seuil, KN = 1');
});

test('KN croit avec P1 au-dela du seuil (correction de Napier)', () => {
  const k1 = api.napierKN(12000);
  const k2 = api.napierKN(18000);
  const k3 = api.napierKN(22057);
  assert(k2 > k1 && k3 > k2, `KN doit croitre : ${k1} -> ${k2} -> ${k3}`);
  assert(k1 > 0.99 && k3 < 1.5, `KN hors plage physique : ${k1} .. ${k3}`);
});

test('KN reproduit les valeurs de la correlation en unites US', () => {
  // KN_US = (0.1906 x P1_psia - 1000) / (0.2292 x P1_psia - 1061)
  [1600, 2000, 2500, 3000].forEach(psia => {
    const kPa = psia * 6.894757;
    const attendu = (0.1906 * psia - 1000) / (0.2292 * psia - 1061);
    assert(relDiff(api.napierKN(kPa), attendu) < 0.5,
      `${psia} psia : moteur ${api.napierKN(kPa).toFixed(4)} vs US ${attendu.toFixed(4)}`);
  });
});

test('L\'equation vapeur est bien selectionnee par phase = steam', () => {
  const r = api.ratedFlow({ areaMm2: 830, p1KPa: 2000, tempK: 500, M: 18.015, k: 1.135, phase: 'steam' });
  assertEqual(r.equation, 'steam', 'equation retenue');
  assertEqual(r.kn, 1, 'KN sous le seuil');
  assertEqual(r.ksh, 1.0, 'KSH par defaut');
});

test('Le debit vapeur est independant de M, k, T et Z', () => {
  const a = api.ratedFlow({ areaMm2: 830, p1KPa: 2000, tempK: 500, M: 18.015, k: 1.135, Z: 1, phase: 'steam' });
  const b = api.ratedFlow({ areaMm2: 830, p1KPa: 2000, tempK: 900, M: 18.015, k: 1.30, Z: 0.8, phase: 'steam' });
  assertClose(a.w, b.w, 1e-9, 'W identique (l\'equation vapeur ne depend que de A et P1)');
});

test('KSH = 1.0 est conservatif : toute valeur inferieure reduit le debit', () => {
  const base = { areaMm2: 830, p1KPa: 2000, tempK: 500, M: 18.015, k: 1.135, phase: 'steam' };
  const sature = api.ratedFlow(base).w;
  const surchauffe = api.ratedFlow(Object.assign({}, base, { ksh: 0.85 })).w;
  assert(surchauffe < sature, 'KSH < 1 doit reduire W');
  assertClose(surchauffe / sature, 0.85, 1e-9, 'proportionnalite a KSH');
});

test('KSH = 1.0 declenche un avertissement de tracabilite', () => {
  const r = api.ratedFlow({ areaMm2: 830, p1KPa: 2000, tempK: 500, M: 18.015, k: 1.135, phase: 'steam' });
  assert(r.warnings.some(w => /KSH/.test(w)), 'un avertissement KSH est attendu');
});

test('Au-dela de la pression critique de l\'eau -> avertissement', () => {
  const r = api.ratedFlow({ areaMm2: 830, p1KPa: 25000, tempK: 700, M: 18.015, k: 1.30, phase: 'steam' });
  assert(r.warnings.some(w => /Napier/.test(w)), 'un avertissement Napier est attendu');
});


// ============================================================
suite('4. Module C - force de reaction (API 520 Part II)');
// ============================================================

test('Le terme de quantite de mouvement reproduit la constante 366 de l\'API 520 Part II', () => {
  // F = (W/366) x sqrt(k T_e / ((k+1) M))  [lbf, lb/h, °R]
  const W = 13171, T = 423.15, M = 28.96, k = 1.4;
  const fUS_lbf = (W / 0.453592 / 366) * Math.sqrt(k * (T * 1.8) / ((k + 1) * M));
  const fUS_N = fUS_lbf * 4.4482216;

  const r = api.reactionForce({ wKgH: W, tempK: T, M: M, k: k, aeM2: 47.69e-4, dlf: 2.0 });
  assert(relDiff(r.fMomentumN, fUS_N) < 1,
    `ecart ${relDiff(r.fMomentumN, fUS_N).toFixed(2)} % > 1 % (moteur ${r.fMomentumN.toFixed(0)} N, API ${fUS_N.toFixed(0)} N)`);
});

test('La temperature statique en sortie vaut T1 x 2/(k+1)', () => {
  const r = api.reactionForce({ wKgH: 10000, tempK: 400, M: 28.96, k: 1.4, aeM2: 47.69e-4, dlf: 2 });
  assertClose(r.tExitK, 400 * 2 / 2.4, 1e-9, 'T_e statique');
});

test('La vitesse en sortie est la vitesse sonique locale', () => {
  const T = 400, M = 28.96, k = 1.4;
  const r = api.reactionForce({ wKgH: 10000, tempK: T, M: M, k: k, aeM2: 47.69e-4, dlf: 2 });
  // v = sqrt(k R T_e / M) avec T_e = T x 2/(k+1)
  const vSonique = Math.sqrt(k * 8314 * r.tExitK / M);
  assertClose(r.vExit, vSonique, 1e-6, 'v_e = vitesse du son a T_e');
});

test('Identite P_e,abs = F_momentum / (k x A_e)', () => {
  const ae = 47.69e-4;
  const r = api.reactionForce({ wKgH: 13171, tempK: 423.15, M: 28.96, k: 1.4, aeM2: ae, dlf: 2 });
  assertClose(r.peAbsKPa * 1000, r.fMomentumN / (1.4 * ae), 1e-6, 'identite de conservation du debit');
});

test('F_statique = F_momentum x (1 + 1/k) - P_atm x A_e', () => {
  const ae = 47.69e-4, k = 1.4;
  const r = api.reactionForce({ wKgH: 13171, tempK: 423.15, M: 28.96, k: k, aeM2: ae, dlf: 2 });
  const attendu = r.fMomentumN * (1 + 1 / k) - api.API_CONST.P_ATM_KPA * 1000 * ae;
  assertClose(r.fStaticN, attendu, 1e-6, 'forme fermee');
});

test('F_design = F_statique x DLF', () => {
  [1.0, 1.5, 2.0, 3.2].forEach(dlf => {
    const r = api.reactionForce({ wKgH: 13171, tempK: 423.15, M: 28.96, k: 1.4, aeM2: 47.69e-4, dlf: dlf });
    assertClose(r.fDesignN, r.fStaticN * dlf, 1e-9, `DLF = ${dlf}`);
  });
});

test('L\'effort croit de facon monotone avec le debit', () => {
  let precedent = 0;
  [5000, 10000, 15000, 20000].forEach(w => {
    const r = api.reactionForce({ wKgH: w, tempK: 423.15, M: 28.96, k: 1.4, aeM2: 47.69e-4, dlf: 2 });
    assert(r.fStaticN > precedent, `W = ${w} doit donner un effort superieur`);
    precedent = r.fStaticN;
  });
});

test('Conversions d\'unites de l\'effort (N / daN / lbf)', () => {
  const r = api.reactionForce({ wKgH: 13171, tempK: 423.15, M: 28.96, k: 1.4, aeM2: 47.69e-4, dlf: 2 });
  assertClose(r.fStaticDaN, r.fStaticN / 10, 1e-9, 'daN');
  assertClose(r.fStaticLbf, r.fStaticN / 4.4482216, 1e-9, 'lbf');
  assertClose(r.fDesignDaN, r.fDesignN / 10, 1e-9, 'daN (design)');
});

test('Sortie surdimensionnee : terme de pression borne a 0 + avertissement', () => {
  // Un A_e enorme fait chuter P_e sous l'atmosphere : pas de poussee negative.
  const r = api.reactionForce({ wKgH: 500, tempK: 423.15, M: 28.96, k: 1.4, aeM2: 1.0, dlf: 2 });
  assertEqual(r.pressureTermN, 0, 'terme de pression borne');
  assertClose(r.fStaticN, r.fMomentumN, 1e-9, 'seul le terme de quantite de mouvement subsiste');
  assert(r.warnings.some(w => /pas bloque/.test(w)), 'un avertissement est attendu');
});

test('Aire de sortie A_e = pi x DI^2 / 4', () => {
  const ae = api.outletArea('3', 'STD');
  assertClose(ae, Math.PI * Math.pow(77.92 / 1000, 2) / 4, 1e-12, 'A_e pour 3" STD');
  assertClose(ae * 1e4, 47.69, 0.01, 'A_e en cm2');
});

test('Sch 40 = STD jusqu\'au NPS 10 (ASME B36.10M)', () => {
  api.validNps.forEach(nps => {
    assertEqual(api.pipeIdTable[nps]['40'], api.pipeIdTable[nps]['STD'], `NPS ${nps}`);
  });
});

test('Le diametre interieur decroit quand le schedule s\'epaissit', () => {
  api.validNps.forEach(nps => {
    const row = api.pipeIdTable[nps];
    assert(row['10S'] > row['STD'], `NPS ${nps} : 10S doit etre plus large que STD`);
    assert(row['STD'] > row['80'], `NPS ${nps} : STD doit etre plus large que Sch 80`);
    assert(row.od > row['10S'], `NPS ${nps} : DE doit depasser tous les DI`);
  });
});

test('Un schedule plus epais reduit A_e donc augmente l\'effort (conservatisme)', () => {
  const std = api.computeApiSizing(srsCase({ schedule: 'STD' }));
  const s80 = api.computeApiSizing(srsCase({ schedule: '80' }));
  assert(s80.aeM2 < std.aeM2, 'Sch 80 doit avoir une aire plus faible');
  assert(s80.force.fStaticN > std.force.fStaticN, 'et donc un effort superieur');
});

test('Schedule inconnu -> erreur explicite de l\'orchestrateur', () => {
  const r = api.computeApiSizing(srsCase({ schedule: '160' }));
  assert(!r.ok, 'doit echouer');
  assertEqual(r.stage, 'C', 'echec au module C');
});


// ============================================================
suite('5. Integrite et synchronisation des tables');
// ============================================================

test('Toutes les lettres citees dans api526Table existent dans areaTable', () => {
  Object.keys(api.api526Table).forEach(key => {
    api.api526Table[key].orifices.forEach(o => {
      assert(typeof api.areaTable[o] === 'number', `${key} cite l'orifice inconnu ${o}`);
    });
  });
});

test('api526Table ne contient que des orifices de la liste API 526 (D a T)', () => {
  Object.keys(api.api526Table).forEach(key => {
    api.api526Table[key].orifices.forEach(o => {
      assert(api.api526Orifices.indexOf(o) !== -1, `${key} cite l'orifice hors norme ${o}`);
    });
  });
});

test('api526Orifices exclut bien V et W', () => {
  assert(api.api526Orifices.indexOf('V') === -1, 'V ne doit pas y figurer');
  assert(api.api526Orifices.indexOf('W') === -1, 'W ne doit pas y figurer');
  assertEqual(api.api526Orifices.length, 14, 'D a T = 14 lettres');
});

test('Les orifices de chaque corps sont listes par aire croissante', () => {
  Object.keys(api.api526Table).forEach(key => {
    const orifices = api.api526Table[key].orifices;
    for (let i = 1; i < orifices.length; i++) {
      assert(api.areaTable[orifices[i]] > api.areaTable[orifices[i - 1]],
        `${key} : ${orifices[i]} devrait avoir une aire superieure a ${orifices[i - 1]}`);
    }
  });
});

test('Les classes de bride declarees appartiennent a validRatings', () => {
  Object.keys(api.api526Table).forEach(key => {
    api.api526Table[key].ratings.forEach(r => {
      assert(api.validRatings.indexOf(r) !== -1, `${key} declare la classe inconnue ${r}`);
    });
  });
});

test('Les NPS cites par api526Table existent dans pipeIdTable', () => {
  Object.keys(api.api526Table).forEach(key => {
    key.split('x').forEach(nps => {
      assert(api.pipeIdTable[nps], `NPS ${nps} (issu de ${key}) absent de pipeIdTable`);
      assert(api.validNps.indexOf(nps) !== -1, `NPS ${nps} absent de validNps`);
    });
  });
});

test('Le NPS de sortie est toujours superieur au NPS d\'entree', () => {
  Object.keys(api.api526Table).forEach(key => {
    const parts = key.split('x').map(parseFloat);
    assert(parts[1] > parts[0], `${key} : la sortie doit etre plus grande que l'entree`);
  });
});

test('pipeIdTable couvre tous les NPS de validNps', () => {
  api.validNps.forEach(nps => {
    assert(api.pipeIdTable[nps], `NPS ${nps} manquant`);
    api.validSchedules.forEach(sch => {
      assert(typeof api.pipeIdTable[nps][sch] === 'number', `NPS ${nps} schedule ${sch} manquant`);
    });
  });
});

test('Chaque preset fluide declare M, k et une phase valide', () => {
  Object.keys(api.fluidPresets).forEach(key => {
    const p = api.fluidPresets[key];
    assert(typeof p.M === 'number' && p.M > 0, `${key} : M invalide`);
    assert(typeof p.k === 'number' && p.k >= 1, `${key} : k invalide`);
    assert(p.phase === 'gas' || p.phase === 'steam', `${key} : phase invalide`);
    assert(typeof p.label === 'string' && p.label.length > 0, `${key} : label manquant`);
  });
});

test('Les presets vapeur portent la masse molaire de l\'eau', () => {
  ['steam-sat', 'steam-sh'].forEach(key => {
    assertClose(api.fluidPresets[key].M, 18.015, 0.001, `${key} : M`);
    assertEqual(api.fluidPresets[key].phase, 'steam', `${key} : phase`);
  });
});

test('api526Table est strictement identique entre index.html et config.gs', () => {
  // Comparaison PROFONDE : config.gs est reellement evalue, pas cherche
  // par regex. Une regex s'arreterait a la premiere accolade et ne verrait
  // pas les byRating imbriques — elle passerait sur une table desynchronisee.
  assertEqual(JSON.stringify(cfg.api526Table), JSON.stringify(api.api526Table),
    'les deux tables doivent etre identiques cle a cle');
});

test('pipeIdTable est strictement identique entre index.html et config.gs', () => {
  assertEqual(JSON.stringify(cfg.pipeIdTable), JSON.stringify(api.pipeIdTable),
    'les deux tables doivent etre identiques');
});

test('Les autres tables v3.0 sont identiques entre index.html et config.gs', () => {
  assertEqual(JSON.stringify(cfg.fluidPresets), JSON.stringify(api.fluidPresets), 'fluidPresets');
  assertEqual(JSON.stringify(cfg.api526Orifices), JSON.stringify(api.api526Orifices), 'api526Orifices');
  assertEqual(JSON.stringify(cfg.validNps), JSON.stringify(api.validNps), 'validNps');
  assertEqual(JSON.stringify(cfg.validRatings), JSON.stringify(api.validRatings), 'validRatings');
  assertEqual(JSON.stringify(cfg.validSchedules), JSON.stringify(api.validSchedules), 'validSchedules');
  assertEqual(JSON.stringify(cfg.apiConst), JSON.stringify(api.API_CONST), 'constantes API');
});

test('Les constantes API sont synchronisees entre index.html et config.gs', () => {
  ['0.975', '0.03948', '190.5', '10339', '22057', '101.325', '8314'].forEach(v => {
    assert(configGs.indexOf(v) !== -1, `constante ${v} absente de config.gs`);
  });
});

test('config.gs declare bien toutes les nouvelles cles v3.0', () => {
  ['api526Table:', 'api526Orifices:', 'pipeIdTable:', 'fluidPresets:',
   'validNps:', 'validRatings:', 'validSchedules:', 'apiConst:'].forEach(cle => {
    assert(configGs.indexOf(cle) !== -1, `${cle} absent de config.gs`);
  });
});


// ============================================================
suite('6. Chaine complete et bloc de reserves');
// ============================================================

test('Cas de reference SRS bout en bout', () => {
  const r = api.computeApiSizing(srsCase());
  assert(r.ok, 'le calcul doit aboutir');
  assertEqual(r.orifice.orifice, 'J', 'orifice');
  assertClose(r.input.p1KPa, 2301.32, 0.5, 'P1 = 20 x 1.1 bar + 1.013 bar');
  assert(r.flow.w > 0, 'debit positif');
  assert(r.force.fStaticN > 0, 'effort positif');
  assertClose(r.force.fDesignN, r.force.fStaticN * 2.0, 1e-9, 'DLF applique');
});

test('P1 respecte P_set x (1 + surpression/100) + P_atm', () => {
  assertClose(api.bargToKPaAbs(20 * 1.10), 2301.325, 0.001, 'surpression 10 %');
  assertClose(api.bargToKPaAbs(20 * 1.21), 2521.325, 0.001, 'surpression 21 % (incendie)');
});

test('Conversions d\'unites d\'entree', () => {
  assertClose(api.celsiusToK(0), 273.15, 1e-9, '0 °C');
  assertClose(api.fahrenheitToK(32), 273.15, 1e-9, '32 °F');
  assertClose(api.fahrenheitToK(212), 373.15, 1e-9, '212 °F');
  assertClose(api.psigToKPaAbs(0), 101.325, 1e-9, '0 psig');
  assertClose(api.psigToKPaAbs(14.5038), 201.325, 0.01, '1 bar en psig');
  assertClose(api.cm2ToIn2(6.4516), 1, 1e-9, '1 in2');
  assertClose(api.cm2ToMm2(8.3), 830, 1e-9, 'cm2 -> mm2');
});

test('La chaine vapeur aboutit et emprunte bien l\'equation vapeur', () => {
  const r = api.computeApiSizing(srsCase({ npsIn: '3', npsOut: '4', rating: 600, phase: 'steam', M: 18.015, k: 1.135 }));
  assert(r.ok, 'le calcul doit aboutir');
  assertEqual(r.flow.equation, 'steam', 'equation vapeur');
  assertEqual(r.orifice.orifice, 'K', 'orifice max pour 3x4 en CL600');
  assert(r.force.fDesignN > 0, 'effort positif');
});

test('Le bloc de reserves reprend tous les elements exiges par la SRS', () => {
  const r = api.computeApiSizing(srsCase());
  const texte = api.buildApiDisclaimer(r);
  ['Bounding Approach', 'API 526', 'Rated Flow', 'DLF', '2.0',
   'orifice reel', 'invalidee'].forEach(fragment => {
    assert(texte.indexOf(fragment) !== -1, `le bloc doit contenir « ${fragment} »`);
  });
  assert(texte.indexOf('orifice J') !== -1, 'le bloc doit citer l\'orifice retenu');
});

test('Le DLF reellement utilise apparait dans le bloc de reserves', () => {
  const r = api.computeApiSizing(srsCase({ dlf: 1.5 }));
  assert(api.buildApiDisclaimer(r).indexOf('DLF) de 1.5') !== -1, 'DLF 1.5 attendu dans le texte');
});

test('formatDlf affiche 2 -> "2.0" et preserve les decimales', () => {
  assertEqual(api.formatDlf(2), '2.0', 'entier');
  assertEqual(api.formatDlf(1.5), '1.5', 'une decimale');
  assertEqual(api.formatDlf(1.75), '1.75', 'deux decimales');
});

test('unverifiedTable est faux : la table est confrontee a la norme', () => {
  const r = api.computeApiSizing(srsCase());
  assertEqual(r.unverifiedTable, false, 'la table est validee');
  assertEqual(r.warnings.length, 0, 'plus d\'avertissement de table non validee');
});


// ============================================================
suite('7. Audit API 526 (non bloquant) + non-regression');
// ============================================================

test('AUDIT BLOQUANT : toute entree API 526 doit etre validee', () => {
  // Etait informatif tant que la norme n'etait pas disponible. Maintenant
  // que la table est confrontee a API STD 526-2023, ce test echoue si une
  // entree non validee reapparait — c'est le garde-fou contre une
  // regression silencieuse de la donnee.
  const aValider = Object.keys(api.api526Table).filter(k => !api.api526Table[k].verified);
  assertEqual(aValider.length, 0,
    `entrees non validees : ${aValider.join(', ')} — confronter aux tables 3 a 16 de la norme`);
});

test('Chaque entree declare un byRating complet et coherent', () => {
  Object.keys(api.api526Table).forEach(key => {
    const e = api.api526Table[key];
    assert(e.byRating, `${key} : byRating manquant`);

    const clesByRating = Object.keys(e.byRating).map(Number).sort((a, b) => a - b);
    const ratings = e.ratings.slice().sort((a, b) => a - b);
    assertEqual(clesByRating.join(','), ratings.join(','),
      `${key} : byRating et ratings desynchronises`);

    // `orifices` doit etre exactement l'union des jeux par classe.
    const union = {};
    e.ratings.forEach(r => e.byRating[r].forEach(o => { union[o] = true; }));
    const attendu = api.api526Orifices.filter(o => union[o]);
    assertEqual(e.orifices.join(','), attendu.join(','),
      `${key} : orifices n'est pas l'union de byRating`);
  });
});

test('Le moteur Kf du mode simple est intact', () => {
  assertEqual(api.areaTable['J'], 8.3, 'aire de l\'orifice J');
  assertEqual(api.areaTable['V'], 271, 'orifice V toujours present dans la table generale');
  assertEqual(api.areaTable['W'], 406, 'orifice W toujours present dans la table generale');
  assert(/const kfTable = \{/.test(jsCode), 'kfTable toujours declaree');
  assert(/kf \* area \* pressure/.test(jsCode), 'la formule F = Kf x A x P1 est inchangee');
});

test('Le troisieme mode est bien cable dans l\'interface', () => {
  assert(indexHtml.indexOf('id="modeApiBtn"') !== -1, 'bouton de mode present');
  assert(indexHtml.indexOf('id="apiSection"') !== -1, 'section presente');
  assert(/switchMode\('api'\)/.test(jsCode), 'le bouton appelle switchMode');
  assert(/mode === 'batch' \|\| mode === 'api'/.test(jsCode), 'l\'URL gere le mode api');
});

test('Les elements DOM du mode API sont tous presents', () => {
  ['apiNpsIn', 'apiNpsOut', 'apiRating', 'apiSchedule', 'apiConfig',
   'apiPset', 'apiOverpressure', 'apiTemp', 'apiM', 'apiK', 'apiZ',
   'apiRuptureDisc', 'apiKsh', 'apiCalculateBtn', 'apiResetBtn', 'apiExampleBtn',
   'apiOrificeLetter', 'apiFlowValue', 'apiFStaticValue', 'apiFDesignValue',
   'apiFxValue', 'apiFyValue', 'apiFzValue', 'apiDisclaimerText',
   'apiIntermediates', 'apiWarnings', 'api526RefTable', 'apiDlfWarning'].forEach(id => {
    assert(indexHtml.indexOf('id="' + id + '"') !== -1, `#${id} manquant`);
  });
});

test('La mention Rated Capacity exigee par la SRS est affichee', () => {
  assert(indexHtml.indexOf('Rated Capacity') !== -1, 'mention Rated Capacity');
  assert(indexHtml.indexOf('Required Capacity') !== -1, 'mise en garde Required Capacity');
});

test('Le bandeau cite l\'edition de reference et la dependance a la classe', () => {
  assert(indexHtml.indexOf('API STD 526-2023') !== -1, 'edition de reference');
  assert(indexHtml.indexOf('Table API 526 non validee') === -1,
    'l\'ancien bandeau « non validee » doit avoir disparu');
});

test('La table de reference UI detaille une ligne par couple corps / classe', () => {
  // 10 corps, dont les classes cumulent 40 combinaisons.
  const attendu = Object.keys(api.api526Table)
    .reduce((n, k) => n + api.api526Table[k].ratings.length, 0);
  assert(attendu > Object.keys(api.api526Table).length,
    'la table de reference doit etre plus fine que le nombre de corps');
  assert(/e\.ratings\.forEach/.test(jsCode), 'le rendu doit iterer sur les classes');
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
