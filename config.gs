// ============================================
// config.gs — Source de verite unique
// Les tables Kf, sections d'orifice et listes
// de valeurs valides sont definies ICI et
// uniquement ici pour le contexte Google Sheets.
// ============================================

var PSV_CONFIG = {
  kfTable: {
    '50':   { 'gaz': 1.9, 'vapeur eau': 2.0 },
    '65':   { 'gaz': 1.9, 'vapeur eau': 2.0 },
    '80':   { 'gaz': 1.5, 'vapeur eau': 1.6 },
    '100':  { 'gaz': 1.5, 'vapeur eau': 1.6 },
    '150':  { 'gaz': 1.3, 'vapeur eau': 1.3 },
    '200':  { 'gaz': 1.1, 'vapeur eau': 1.1 },
    '>200': { 'gaz': 1.1, 'vapeur eau': 1.1 }
  },

  areaTable: {
    'D': 0.71, 'E': 1.26, 'F': 1.98, 'G': 3.24, 'H': 5.06,
    'J': 8.3,  'K': 11.86, 'L': 18.41, 'M': 23.2, 'N': 28,
    'P': 41.2, 'Q': 71.2,  'R': 103,   'T': 168,  'V': 271, 'W': 406
  },

  validDNs: ['50', '65', '80', '100', '150', '200', '>200'],

  validFluids: [
    { value: 'gaz', label: 'Gaz' },
    { value: 'vapeur eau', label: "Vapeur d'eau" }
  ],

  validOrifices: ['D', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'Q', 'R', 'T', 'V', 'W'],

  // v2.0 - Discharge configurations
  configurations: {
    'CFG-1': { id: 'CFG-1', label: 'Verticale haut',   fx: 0,  fy: -1, fz: 0 },
    'CFG-2': { id: 'CFG-2', label: 'Verticale bas',    fx: 0,  fy: 1,  fz: 0 },
    'CFG-3': { id: 'CFG-3', label: 'Horizontale',      fx: -1, fy: 0,  fz: 0 },
    'CFG-4': { id: 'CFG-4', label: 'Coude 90°',        fx: -0.707, fy: -0.707, fz: 0 },
    // CFG-5 : systeme ferme (collecteur / torche). Aucun jet a l'atmosphere,
    // la quantite de mouvement est conservee dans le reseau : une force
    // ponctuelle statique n'est pas applicable (hors ASME B31.3 / API 521).
    // Les composantes sont mises a zero et le drapeau `blocked` invite le
    // consommateur (add-on Sheets) a rejeter la ligne avec le message.
    'CFG-5': { id: 'CFG-5', label: 'Collecteur',       blocked: true,
               blockedMessage: 'Systeme ferme : calcul statique non applicable. Requis : profil de forces desequilibrees (time history) aux coudes du reseau de torche.',
               fx: 0,  fy: 0,  fz: 0 },
    // CFG-6 : sortie dirigee vers le bas, la reaction est ASCENDANTE.
    'CFG-6': { id: 'CFG-6', label: 'Col de cygne',     fx: 0,  fy: 1,  fz: 0 },
    // CFG-7 : l'extremite comporte un coude d'elevation θ. Les constantes
    // ci-dessous correspondent au defaut θ = 45° (fy = fz = -1/√2).
    // Le drapeau `elevation` signale que la composition depend de θ ; les
    // outils qui exploitent θ doivent recalculer fy = -sin θ, fz = -cos θ.
    'CFG-7': { id: 'CFG-7', label: 'Laterale (Z)',     elevation: true, elevationDefault: 45,
               fx: 0,  fy: -0.707, fz: -0.707 },
    'CFG-8': { id: 'CFG-8', label: 'Inclinee 45°',     fx: -0.707, fy: -0.707, fz: 0 }
  },

  validConfigs: ['CFG-1', 'CFG-2', 'CFG-3', 'CFG-4', 'CFG-5', 'CFG-6', 'CFG-7', 'CFG-8'],

  // v2.0 - DLF presets
  dlfPresets: {
    conservative: { value: 2.0, label: 'Conservatif' },
    static:       { value: 1.0, label: 'Statique equivalent' },
    custom:       { value: null, label: 'Personnalise' }
  },

  // ================================================================
  // v3.0 - Dimensionnement par enveloppe (API 526 / API 520)
  // Miroir des tables de index.html. Toute modification ici doit
  // etre repercutee la-bas (et inversement) : la synchronisation
  // est verifiee par tests/test_api_sizing.js, suite 5.
  // ================================================================

  // Source : API STD 526-2023 (7e ed.), tables 3 a 16 (SI) — une table
  // par lettre d'orifice, inversees ici vers la cle corps -> orifices.
  //   Table  3   4   5   6   7   8   9  10  11  12  13  14  15  16
  //   Orif.  D   E   F   G   H   J   K   L   M   N   P   Q   R   T
  //
  // byRating fait foi : le jeu d'orifices depend de la classe d'entree,
  // et l'orifice maximal DIMINUE quand la classe monte. `orifices`
  // n'est que l'union, tenue pour l'affichage.
  // Detail des reserves : voir le commentaire dans index.html.
  api526Table: {
    '1x2': {
      orifices: ['D', 'E'], ratings: [150, 300, 600],
      byRating: { 150: ['D', 'E'], 300: ['D', 'E'], 600: ['D', 'E'] },
      verified: true
    },
    '1.5x2': {
      orifices: ['D', 'E', 'F'], ratings: [150, 300, 600, 900, 1500],
      byRating: { 150: ['F'], 300: ['F'], 600: ['F'], 900: ['D', 'E'], 1500: ['D', 'E'] },
      verified: true
    },
    '1.5x3': {
      orifices: ['D', 'E', 'F', 'G', 'H'], ratings: [150, 300, 600, 900, 1500, 2500],
      byRating: {
        150: ['G', 'H'], 300: ['G', 'H'], 600: ['G'],
        900: ['F', 'G'], 1500: ['F'], 2500: ['D', 'E', 'F']
      },
      verified: true
    },
    '2x3': {
      orifices: ['G', 'H', 'J'], ratings: [150, 300, 600, 900, 1500, 2500],
      byRating: {
        150: ['H', 'J'], 300: ['H', 'J'], 600: ['H'],
        900: ['H'], 1500: ['G', 'H'], 2500: ['G']
      },
      verified: true
    },
    '3x4': {
      orifices: ['J', 'K', 'L'], ratings: [150, 300, 600, 900, 1500],
      byRating: {
        150: ['J', 'K', 'L'], 300: ['J', 'K', 'L'], 600: ['J', 'K'],
        900: ['J'], 1500: ['J']
      },
      verified: true
    },
    '3x6': {
      orifices: ['K'], ratings: [900, 1500],
      byRating: { 900: ['K'], 1500: ['K'] },
      verified: true
    },
    '4x6': {
      orifices: ['L', 'M', 'N', 'P'], ratings: [150, 300, 600, 900, 1500],
      byRating: {
        150: ['L', 'M', 'N', 'P'], 300: ['L', 'M', 'N', 'P'],
        600: ['L', 'M', 'N', 'P'], 900: ['L', 'M', 'N', 'P'], 1500: ['L']
      },
      verified: true
    },
    '6x8': {
      orifices: ['Q', 'R'], ratings: [150, 300, 600],
      byRating: { 150: ['Q', 'R'], 300: ['Q', 'R'], 600: ['Q'] },
      verified: true
    },
    '6x10': {
      orifices: ['R'], ratings: [300, 600],
      byRating: { 300: ['R'], 600: ['R'] },
      verified: true
    },
    '8x10': {
      orifices: ['T'], ratings: [150, 300],
      byRating: { 150: ['T'], 300: ['T'] },
      verified: true
    }
  },

  // Le Tableau 1 de l'API 526 debute a D et s'arrete DEFINITIVEMENT a T.
  // U, V, W (« Super Capacity ») sont des conceptions proprietaires hors
  // norme : filtrage par liste blanche, jamais proposes par le module.
  api526Orifices: ['D', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'Q', 'R', 'T'],

  // Aires effectives normalisees — API 526 Tableau 1, en mm2.
  // Distincte de areaTable (cm2, mode Kf herité) qui arrondit a 3
  // chiffres significatifs et s'ecarte jusqu'a 0.31 % de la norme.
  api526AreaMm2: {
    'D': 71,    'E': 126,   'F': 198,   'G': 325,   'H': 506,
    'J': 830,   'K': 1186,  'L': 1841,  'M': 2323,  'N': 2800,
    'P': 4116,  'Q': 7129,  'R': 10323, 'T': 16774
  },

  validNps: ['1', '1.5', '2', '3', '4', '6', '8', '10'],

  validRatings: [150, 300, 600, 900, 1500, 2500],

  // Diametres interieurs (mm) - ASME B36.10M / B36.19M
  pipeIdTable: {
    '1':   { od: 33.4,  '10S': 27.86,  'STD': 26.64,  '40': 26.64,  '80': 24.30 },
    '1.5': { od: 48.3,  '10S': 42.76,  'STD': 40.94,  '40': 40.94,  '80': 38.14 },
    '2':   { od: 60.3,  '10S': 54.76,  'STD': 52.48,  '40': 52.48,  '80': 49.22 },
    '3':   { od: 88.9,  '10S': 82.80,  'STD': 77.92,  '40': 77.92,  '80': 73.66 },
    '4':   { od: 114.3, '10S': 108.20, 'STD': 102.26, '40': 102.26, '80': 97.18 },
    '6':   { od: 168.3, '10S': 161.50, 'STD': 154.08, '40': 154.08, '80': 146.36 },
    '8':   { od: 219.1, '10S': 211.58, 'STD': 202.74, '40': 202.74, '80': 193.70 },
    '10':  { od: 273.1, '10S': 264.72, 'STD': 254.56, '40': 254.56, '80': 242.92 }
  },

  validSchedules: ['10S', 'STD', '40', '80'],

  fluidPresets: {
    'air':       { label: 'Air',                M: 28.96,  k: 1.40,  phase: 'gas' },
    'n2':        { label: 'Azote (N2)',         M: 28.01,  k: 1.40,  phase: 'gas' },
    'o2':        { label: 'Oxygene (O2)',       M: 32.00,  k: 1.40,  phase: 'gas' },
    'h2':        { label: 'Hydrogene (H2)',     M: 2.016,  k: 1.41,  phase: 'gas' },
    'ch4':       { label: 'Methane (CH4)',      M: 16.04,  k: 1.31,  phase: 'gas' },
    'c2h6':      { label: 'Ethane (C2H6)',      M: 30.07,  k: 1.19,  phase: 'gas' },
    'c3h8':      { label: 'Propane (C3H8)',     M: 44.10,  k: 1.13,  phase: 'gas' },
    'co2':       { label: 'Dioxyde de carbone', M: 44.01,  k: 1.29,  phase: 'gas' },
    'nh3':       { label: 'Ammoniac (NH3)',     M: 17.03,  k: 1.31,  phase: 'gas' },
    'steam-sat': { label: 'Vapeur saturee',     M: 18.015, k: 1.135, phase: 'steam' },
    'steam-sh':  { label: 'Vapeur surchauffee', M: 18.015, k: 1.30,  phase: 'steam' }
  },

  apiConst: {
    R_UNIVERSAL: 8314,
    P_ATM_KPA: 101.325,
    KD_DEFAULT: 0.975,
    KB_DEFAULT: 1.0,
    KC_NO_DISC: 1.0,
    KC_WITH_DISC: 0.9,
    C_SI_FACTOR: 0.03948,
    STEAM_SI_DIVISOR: 190.5,
    NAPIER_MIN_KPA: 10339,
    NAPIER_MAX_KPA: 22057
  }
};

/**
 * Retourne la configuration pour le sidebar (appele via google.script.run)
 */
function getConfig() {
  return PSV_CONFIG;
}
