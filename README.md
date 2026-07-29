# PSV Reaction Force Calculator

Outil web de calcul des efforts de décharge des soupapes de sûreté (PSV).
Application autonome (`index.html`, aucun serveur) + add-on Google Sheets
(`code.gs` / `sidebar.html` / `config.gs`).

Trois modes :

| Mode | Méthode | Quand l'utiliser |
|------|---------|------------------|
| **Calcul Simple** | `F = Kf × A × P1` | L'orifice de la soupape est connu. Estimation rapide. |
| **Calcul Batch** | idem, en série | Plusieurs soupapes, import/export CSV, rapport PDF. |
| **Dimensionnement API** | API 526 + API 520 | **L'orifice est inconnu.** Borne supérieure défendable à partir des seules dimensions de brides. |

---

## Mode 1 & 2 — méthode simplifiée `F = Kf × A × P1`

```
F  = force de réaction (daN)
Kf = facteur dépendant de la nature du fluide et du DN de sortie
A  = section d'orifice de la soupape (cm²)
P1 = pression de décharge absolue incluant la surpression (bar abs)
     P1 = P_tarage × (1 + surpression/100) + P_atm
```

### Sections d'orifice (API 526, cm²)

| Orifice | Section | Orifice | Section |
|---------|---------|---------|---------|
| D | 0,71  | M | 23,2 |
| E | 1,26  | N | 28 |
| F | 1,98  | P | 41,2 |
| G | 3,24  | Q | 71,2 |
| H | 5,06  | R | 103 |
| J | 8,3   | T | 168 |
| K | 11,86 | V | 271 |
| L | 18,41 | W | 406 |

V et W proviennent de catalogues constructeurs et sont **hors API 526**.

### Facteurs Kf

| DN (mm) | Taille | Gaz | Vapeur d'eau |
|---------|--------|-----|--------------|
| 50   | 2"     | 1,9 | 2,0 |
| 65   | 2"1/2  | 1,9 | 2,0 |
| 80   | 3"     | 1,5 | 1,6 |
| 100  | 4"     | 1,5 | 1,6 |
| 150  | 6"     | 1,3 | 1,3 |
| 200  | 8"     | 1,1 | 1,1 |
| >200 | > 8"   | 1,1 | 1,1 |

Ces facteurs sont empiriques et ne sont tracés à aucune source normative
(cf. `ANALYSIS.md` §4.5). Pour les cas critiques (H₂, > 100 bar, diphasique),
appliquer l'API 520 Part II — ou utiliser le mode Dimensionnement API.

---

## Mode 3 — Dimensionnement par enveloppe (API 526 / API 520)

Répond au cas courant sur installations existantes : **la fiche fournisseur est
introuvable, l'orifice est inconnu.** Seule la géométrie des brides est
disponible. L'outil fait la rétro-ingénierie de l'orifice puis en déduit le
débit nominal et l'effort.

### Chaîne de calcul

**Module A — orifice maximal (API 526)**

`(NPS entrée, NPS sortie, classe de bride)` → jeu d'orifices admissibles → on
retient celui d'**aire maximale**. C'est le cœur de l'approche par enveloppe :
en l'absence de donnée fournisseur, on borne le problème par le plus gros
orifice que le corps de soupape peut recevoir.

Exemple : `2" × 3" CL300` → orifices H et J possibles → **J retenu**
(8,3 cm² / 1,287 in²).

**Le jeu d'orifices dépend de la classe de bride d'entrée**, et le sens est
contre-intuitif : *plus la classe monte, plus l'orifice maximal diminue* — le
corps encaisse la pression au détriment du passage. Sur un `3" × 4"` :

| Classe | 150 | 300 | 600 | 900 | 1500 |
|---|---|---|---|---|---|
| Orifice max | L | L | K | J | J |
| Aire (cm²) | 18,41 | 18,41 | 11,86 | 8,3 | 8,3 |

Ce n'est pas un défaut : ignorer cette dépendance conduit à surestimer l'orifice
d'un facteur 4 sur un `1½" × 2"` en 900#.

La norme fait aussi varier le **NPS de sortie** avec la classe : les orifices D
et E passent d'une sortie 2" (150# à 1500#) à une sortie 3" en 2500#.

**Module B — débit nominal (API 520 Part I)**

Gaz et vapeurs, écoulement critique :

```
C = 0,03948 × √( k × (2/(k+1))^((k+1)/(k-1)) )        [SI]
W = C × Kd × A × P1 × Kb × Kc × √( M / (Z × T) )       [kg/h, mm², kPa abs, K]
```

Vapeur d'eau (équation dédiée de la norme) :

```
W  = A × P1 × Kd × Kb × Kc × KN × KSH / 190,5
KN = 1                                            si P1 ≤ 10 339 kPa abs
KN = (0,02764·P1 − 1000) / (0,03324·P1 − 1061)    au-delà (correction de Napier)
```

**Module C — effort de décharge (API 520 Part II, décharge ouverte)**

```
T_e = T1 × 2/(k+1)                                (détente isentropique sonique)
v_e = √( 2 k R T1 / ((k+1) M) )
F_momentum = (W/3600) × v_e
P_e,abs    = F_momentum / (k × A_e)               (conservation du débit)
F_statique = F_momentum + (P_e,abs − P_atm) × A_e
F_design   = F_statique × DLF
```

`A_e` est la section intérieure du NPS de **sortie de la soupape** (schedule STD
par défaut, sélecteur 10S/STD/40/80).

### Hypothèses — à reprendre dans toute note de calcul

| Paramètre | Valeur | Justification |
|-----------|--------|---------------|
| `Kd` | 0,975 | Coefficient de décharge des soupapes API certifiées. |
| `Kb` | 1,0 | Décharge à l'atmosphère : pas de contre-pression. |
| `Kc` | 1,0 (0,9 avec disque de rupture amont) | API 520 Part I. |
| `KSH` | 1,0 par défaut | Vapeur saturée. `KSH ≤ 1` toujours, donc `KSH = 1` **maximise** W : choix conservatif cohérent avec l'approche par enveloppe. Surchargeable. |
| `Z` | 1,0 par défaut | Approche conservative si inconnu. |
| `DLF` | 2,0 par défaut | Toute valeur < 2,0 déclenche un avertissement et exige une justification par analyse temporelle (time-history). |
| Pertes de charge | non calculées | Détente critique supposée à l'atmosphère, sans calcul itératif de perte de charge en ligne d'échappement. Simplification admise pour un pré-dimensionnement, **à condition de la documenter** — d'où la présente section. |

### Cohérence avec la constante 366 de l'API 520 Part II

La norme écrit `F = (W/366) × √(k·T_e/((k+1)·M)) + A_e·P_e` (unités US). Le `T_e`
qui y figure est la température de **stagnation** : le facteur 2 de la détente
sonique est absorbé dans la constante. L'implémentation dérive l'effort des
principes de base en SI et reproduit cette constante à 0,4 % près (l'arrondi de
la norme) — vérifié par test automatisé.

### Périmètre exclu

- **Écoulements diphasiques** : hors périmètre (modèles HEM/DIERS trop lourds
  pour un outil de pré-dimensionnement).
- **Liquides** : non couverts (pas d'écoulement sonique).
- **Soupapes non-API 526** : la base de données ne les couvre pas. Si l'orifice
  réel s'avère non standard et supérieur à la borne API 526, l'analyse doit être
  invalidée et recalculée.
- Orifices **V et W** : jamais proposés par ce mode (hors norme).

### Provenance de la table API 526

La table embarquée est l'inversion des **tables 3 à 16 d'API STD 526-2023**
(7ᵉ éd.). Il n'existe pas de table unique de dimensions dans la norme : elle
consacre **une table par lettre d'orifice**.

| Table (SI) | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Orifice | D | E | F | G | H | J | K | L | M | N | P | Q | R | T |

Les tables 17 à 30 sont les mêmes en unités US. Seules les colonnes NPS entrée /
NPS sortie / classe sont utilisées ; les cotes centre-à-face n'entrent dans
aucune des trois équations du moteur.

Elle couvre 10 corps et 39 combinaisons corps × classe, isolée dans un seul bloc
littéral (`index.html`, section `DATA TABLES`) avec son miroir dans `config.gs`.
Les deux sont comparées **en profondeur** par la suite de tests — `config.gs` est
réellement évalué, pas cherché par expression régulière — et un test d'audit
**bloquant** échoue si une entrée non validée réapparaît.

Dans le code, c'est `byRating` qui fait foi : `orifices` n'est que l'union des
jeux par classe, tenue pour l'affichage.

**Réserve.** Certaines combinaisons basse pression sur grands corps
(typiquement 150×150) n'existent dans la norme que pour des métallurgies
spécifiques — inox austénitique, Alloy 20. Elles sont conservées pour couvrir
l'exhaustivité des cas permis : les inclure va dans le sens conservatif de
l'approche par enveloppe, mais un corps en acier au carbone peut ne pas les
proposer.

### Aires d'orifice : deux tables, volontairement

Le module API n'utilise **pas** la table `areaTable` du mode Kf. Il s'appuie sur
`api526AreaMm2`, transcription du **Tableau 1** de la norme (*Standard Effective
Orifice Areas and Letter Designations*) en mm² :

| D | E | F | G | H | J | K | L | M | N | P | Q | R | T |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 71 | 126 | 198 | 325 | 506 | 830 | 1186 | 1841 | 2323 | 2800 | 4116 | 7129 | 10323 | 16774 |

`areaTable` arrondit à trois chiffres significatifs et s'écarte jusqu'à **0,31 %**
du Tableau 1 (T : 16 800 mm² au lieu de 16 774). L'écart est physiquement
négligeable — `W` et `F` sont proportionnels à l'aire — mais il empêcherait un
vérificateur de retrouver le résultat depuis la norme. Les deux tables restent
séparées : modifier `areaTable` changerait les résultats du mode Kf, qui a sa
propre calibration empirique.

**La nomenclature s'arrête définitivement à T.** Les lettres U, V et W que l'on
rencontre dans des fiches fournisseurs (*Super Capacity*, *Extra-Large*) relèvent
de conceptions propriétaires hors API 526, sans cotes ni limites
pression/température prévisibles. Le filtrage se fait par liste blanche : toute
désignation non standard est écartée, quelle qu'elle soit.

---

## Tests

```bash
node tests/test_v2.js          # 91 tests — modes Simple et Batch (méthode Kf)
node tests/test_api_sizing.js  # 76 tests — mode Dimensionnement API
```

`test_api_sizing.js` extrait et exécute le moteur réellement embarqué dans
`index.html` : les valeurs testées sont celles que l'utilisateur obtient. La
suite vérifie notamment les coefficients `C` contre les tables de l'API 520, la
correction de Napier contre sa forme en unités US, la constante 366 de l'API 520
Part II, et la synchronisation `index.html` ↔ `config.gs`.

## Licence

MIT — voir `LICENSE`.
