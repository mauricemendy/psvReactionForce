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

Exemple : `2" × 3" CL300` → orifices G, H, J possibles → **J retenu**
(8,3 cm² / 1,287 in²).

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

### ⚠ Table API 526 non encore validée

Les combinaisons corps / orifice / classe embarquées reprennent les
configurations usuelles du marché mais **n'ont pas été confrontées à la norme
API 526** (document payant). Chaque entrée porte `verified: false`, un bandeau
le signale dans l'interface, et la suite de tests en publie l'inventaire à
chaque exécution.

La table est isolée dans un seul bloc littéral (`index.html`, section
`DATA TABLES`, avec son miroir dans `config.gs`). Une fois la norme obtenue, la
mise à jour consiste à remplacer ce bloc et basculer `verified` à `true` — le
moteur, l'interface et les tests n'ont pas à être modifiés.

**Où trouver la donnée dans API STD 526-2023 (7ᵉ éd.).** Il n'existe pas de table
unique de dimensions : la norme consacre **une table par lettre d'orifice**.

| Table (SI) | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Orifice | D | E | F | G | H | J | K | L | M | N | P | Q | R | T |

Les tables 17 à 30 sont vraisemblablement les mêmes en unités US. Seules les
colonnes NPS entrée / NPS sortie / classe sont utiles ; les cotes centre-à-face
n'entrent dans aucune des trois équations du moteur.

**Constat établi, pas encore intégré.** L'entrée `1.5x2` est incomplète : elle ne
déclare que F, G et H alors que `1½D2` et `1½E2` existent. La correction n'a pas
été appliquée car il reste à déterminer si D et E sont offerts à toutes les
classes ou seulement à certaines — auquel cas le mécanisme `byRating` s'applique
et le résultat change. Sans effet sur l'orifice retenu (H reste le maximum), mais
la liste des candidats affichée est fausse.

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
