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
    'CFG-5': { id: 'CFG-5', label: 'Collecteur',       fx: -1, fy: 0,  fz: 0 }
  },

  validConfigs: ['CFG-1', 'CFG-2', 'CFG-3', 'CFG-4', 'CFG-5'],

  // v2.0 - DLF presets
  dlfPresets: {
    conservative: { value: 2.0, label: 'Conservatif' },
    static:       { value: 1.0, label: 'Statique equivalent' },
    custom:       { value: null, label: 'Personnalise' }
  }
};

/**
 * Retourne la configuration pour le sidebar (appele via google.script.run)
 */
function getConfig() {
  return PSV_CONFIG;
}
