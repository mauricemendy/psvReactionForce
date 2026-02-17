# Analyse technique — Outil de calcul de force de reaction PSV

**Revue d'ingenierie dans le style de Richard Ay, P.E.**
**Date : 17 fevrier 2026**

---

## 1. Resume executif

Cet outil est un calculateur web de **force de reaction de soupapes de surete** (PSV — Pressure Safety Valves). Il implemente la formule simplifiee :

```
F = Kf x A x P1   (daN)
```

L'outil est disponible en deux versions : une application web autonome (`index.html`) et un add-on Google Sheets (`code.gs` + `sidebar.html`). Il offre un mode de calcul simple (une soupape) et un mode batch (calcul en serie avec import/export CSV et generation de rapports PDF).

La revue qui suit examine la **validite technique de la methode de calcul**, la **conformite aux standards**, les **limites de l'outil**, et formule des **recommandations d'amelioration**.

---

## 2. Fondement theorique — La force de reaction d'une PSV

### 2.1 Contexte physique

Lorsqu'une soupape de surete s'ouvre, le fluide sous pression est evacue a grande vitesse a travers l'orifice de decharge. Conformement a la troisieme loi de Newton, cette ejection de masse cree une **force de reaction** qui agit sur la tuyauterie et la structure supportant la soupape. Cette force doit etre prise en compte dans le dimensionnement des supports de tuyauterie et de l'ancrage de la soupape.

Le calcul rigoureux de cette force de reaction est defini par la norme **API 520 Part II** (Installation), section sur les forces de reaction, et s'exprime generalement sous la forme :

```
F = W x V / g  +  A x (P2 - Pa)
```

ou :
- **W** = debit massique de decharge (kg/s)
- **V** = vitesse d'ejection du fluide a la sortie (m/s)
- **g** = acceleration gravitationnelle (9.81 m/s2)
- **P2** = pression statique a la sortie de la soupape
- **Pa** = pression atmospherique
- **A** = section de sortie

### 2.2 Formule implementee dans l'outil

L'outil utilise une **formule simplifiee empirique** :

```
F = Kf x A x P1   (daN)
```

ou :
- **Kf** = facteur empirique dependant du DN de sortie et du type de fluide
- **A** = section de l'orifice de decharge (cm2) — designation ASME standard
- **P1** = pression de decharge absolue (bar abs), incluant la surpression

Cette formule est une **approximation a usage pratique** qui condense les termes de quantite de mouvement et de pression statique dans un facteur unique **Kf**. Ce type de formule simplifiee est couramment utilise dans l'industrie petroliere et petrochimique pour les estimations de conception. On la retrouve dans certaines notes techniques de constructeurs de soupapes (par exemple, les guides techniques de Consolidated, Crosby, ou Leser).

### 2.3 Analyse des facteurs Kf

Les valeurs de Kf implementees sont :

| DN (mm) | Gaz  | Vapeur d'eau |
|---------|------|--------------|
| 50      | 1.9  | 2.0          |
| 65      | 1.9  | 2.0          |
| 80      | 1.5  | 1.6          |
| 100     | 1.5  | 1.6          |
| 150     | 1.3  | 1.3          |
| 200     | 1.1  | 1.1          |
| >200    | 1.1  | 1.1          |

**Observations :**

1. **Dependance au DN** : Le facteur Kf decroit lorsque le DN augmente. Cela est physiquement coherent : un DN plus grand implique une vitesse d'ejection plus faible pour une meme section d'orifice, et donc un ratio force/pression plus faible.

2. **Dependance au fluide** : La vapeur d'eau presente des facteurs legerement superieurs au gaz pour les petits DN (50-100 mm). Au-dela de DN 150, les facteurs convergent. Cela peut s'expliquer par les proprietes thermodynamiques differentes (rapport des chaleurs specifiques gamma, masse molaire) qui influencent la vitesse sonique a la sortie.

3. **Convergence pour les grands DN** : Au-dela de DN 200, le facteur est constant a 1.1. C'est une simplification qui suppose que les effets de bord et de contraction du jet deviennent negligeables pour les grandes sections.

4. **Absence de facteur pour les liquides** : L'outil ne prend en charge que le gaz et la vapeur d'eau. Les soupapes sur service liquide ou diphasique ne sont pas couvertes. C'est une limitation significative pour une utilisation generalisee.

### 2.4 Sections d'orifice ASME

Les sections d'orifice utilisees correspondent aux **designations standard API 526** :

| Orifice | Section (cm2) | Orifice | Section (cm2) |
|---------|---------------|---------|---------------|
| D       | 0.71          | N       | 28            |
| E       | 1.26          | P       | 41.2          |
| F       | 1.98          | Q       | 71.2          |
| G       | 3.24          | R       | 103           |
| H       | 5.06          | T       | 168           |
| J       | 8.3           | V       | 271           |
| K       | 11.86         | W       | 406           |
| L       | 18.41         |         |               |
| M       | 23.2          |         |               |

**Verification** : Les designations d'orifice (D a W) et les sections correspondantes sont conformes a la norme **API 526 (Flanged Steel Pressure-relief Valves)**. Les valeurs sont correctes et coherentes avec les catalogues des principaux constructeurs.

**Note** : Les orifices A, B et C (tres petites sections) ne sont pas inclus. Cela est acceptable pour la majorite des applications industrielles, ces petits orifices etant rarement utilises sur les installations de process.

---

## 3. Validation technique — Points forts

### 3.1 Coherence dimensionnelle

Verifions la coherence des unites :

```
F = Kf x A x P1
[daN] = [sans dimension] x [cm2] x [bar abs]
```

En unites SI :
- 1 bar = 10^5 Pa = 10^5 N/m2
- 1 cm2 = 10^-4 m2
- Donc : A x P1 = [cm2] x [bar] = 10^-4 x 10^5 = 10 N = 1 daN

La coherence dimensionnelle est **correcte** : le produit A (cm2) x P1 (bar) donne directement des daN quand Kf est sans dimension. C'est elegant et bien pense.

### 3.2 Ordre de grandeur

Exemple de verification — PSV sur service gaz, DN 100, orifice K, P1 = 15 bar abs :

```
F = 1.5 x 11.86 x 15 = 266.85 daN ≈ 2669 N ≈ 600 lbf
```

C'est un ordre de grandeur raisonnable pour une soupape de taille moyenne sur un service gaz a pression moderee. A titre de comparaison, un calcul par la methode API 520 Part II donnerait une valeur du meme ordre de grandeur (typiquement entre 400 et 800 lbf selon les conditions exactes).

### 3.3 Qualite de l'implementation logicielle

- **Calcul deterministe** : la fonction `calculateForce()` est une multiplication directe de trois facteurs issus de tables. Pas de risque d'erreur iterative ou de convergence.
- **Validation des entrees** : le mode batch valide chaque champ (ITEM_ID obligatoire, DN valide, pression > 0, detection des doublons).
- **Persistance de session** : sauvegarde automatique toutes les 30 secondes en localStorage avec expiration a 24h.
- **Export** : CSV et PDF disponibles pour la tracabilite et l'archivage.

---

## 4. Limitations et points d'attention

### 4.1 Nature empirique de la formule

**C'est le point le plus important de cette revue.**

La formule `F = Kf x A x P1` est une **simplification empirique**. Elle ne correspond pas directement a la methode de calcul de l'API 520 Part II, qui est la reference normative pour le calcul des forces de reaction des soupapes de surete.

La formule API 520 Part II pour un fluide compressible en ecoulement critique est :

```
F = W * sqrt(k*T / (M * (k+1))) * sqrt(2/(k+1))^((k+1)/(k-1)) / 366  +  A_out * (P_out - P_atm)
```

ou les termes de debit massique, temperature, masse molaire et rapport des chaleurs specifiques sont explicitement pris en compte.

**Consequence** : l'outil ne permet pas de parametrer les conditions specifiques du fluide (temperature, masse molaire, k). Les facteurs Kf sont des moyennes qui peuvent ne pas etre conservatifs dans certaines conditions.

### 4.2 Fluides non couverts

- **Liquides** : les soupapes sur service liquide generent des forces de reaction differentes (pas d'ecoulement sonique). La formule n'est pas applicable.
- **Diphasique** : les services diphasiques (liquide + vapeur) ne sont pas pris en charge.
- **Gaz specifiques** : pas de distinction entre differents gaz (air, H2, CH4, C3H8...), alors que la masse molaire et le rapport des chaleurs specifiques influencent significativement la force de reaction.

### 4.3 Pression de decharge

L'outil demande la **pression de decharge absolue (P1)**. Il est important de bien definir ce terme :
- Est-ce la pression de tarage + surpression + pression atmospherique ?
- Ou la pression de refoulement ?

Le README indique : *"P1 : Pression de decharge absolue incluant la surpression"*, ce qui correspond a la pression en amont de l'orifice au moment de la decharge. C'est correct, mais une note clarificatrice serait utile :

```
P1 = P_tarage x (1 + surpression%) + P_atm
```

### 4.4 Absence de contre-pression

L'outil ne prend pas en compte la **contre-pression** (backpressure) en aval de la soupape. Pour les soupapes a decharge ouverte (atmospherique), cela n'est pas critique. Mais pour les soupapes raccordees a un collecteur de torche, la contre-pression peut reduire significativement la force de reaction, et son omission conduit a un resultat conservatif (ce qui est acceptable pour le dimensionnement des supports).

### 4.5 Pas de reference normative explicite

L'outil ne cite pas de source normative pour les facteurs Kf. Ces valeurs semblent provenir de notes internes de constructeurs ou de guides de conception proprietaires. Pour un usage en ingenierie de detail, il serait souhaitable de tracer la source de ces coefficients.

---

## 5. Architecture logicielle

### 5.1 Structure du projet

```
psvReactionForce/
├── index.html      # Application web autonome (~93 Ko, ~3160 lignes)
│                   #   HTML + CSS + JavaScript tout-en-un
├── code.gs         # Backend Google Apps Script
├── sidebar.html    # Interface Google Sheets
├── README.md       # Documentation minimale
└── LICENSE          # MIT
```

### 5.2 Observations sur l'architecture

**Points forts :**
- Application autonome sans serveur backend — deploiement trivial
- Design system coherent (variables CSS, responsive mobile-first)
- Mode batch bien concu avec import CSV et export multi-format
- Utilisation judicieuse des bibliotheques externes (PapaParse, jsPDF)

**Points d'amelioration :**
- **Fichier monolithique** : 93 Ko en un seul fichier HTML. Pour la maintenabilite, une separation HTML/CSS/JS serait preferable.
- **Tables de donnees en dur dans le code** : les facteurs Kf et les sections d'orifice sont codes en dur a trois endroits differents (index.html, code.gs, sidebar.html). Tout changement de valeur doit etre replique manuellement, ce qui est une source d'erreurs.
- **Pas de tests unitaires** : la logique de calcul n'est pas testee automatiquement.
- **Code Google Sheets** : la fonction `generatePDF()` (code.gs:39-74) ecrase le contenu de la feuille active (`sheet.clear()`) avant de generer le PDF. C'est destructif et potentiellement dangereux pour les donnees existantes de l'utilisateur.

### 5.3 Points de securite

- **Pas de vulnerabilite XSS** critique identifiee, mais l'utilisation de `innerHTML` dans certaines fonctions de rendu (lignes 2008-2014, 2119-2171 de index.html) meriterait une sanitization des entrees utilisateur.
- **Pas de donnees sensibles** manipulees — le risque securitaire est faible.

---

## 6. Recommandations

### 6.1 Recommandations techniques (priorite haute)

1. **Documenter la source des facteurs Kf** : tracer l'origine de ces coefficients (norme, guide constructeur, etude interne). Un outil de calcul d'ingenierie doit avoir des references verifiables.

2. **Ajouter un avertissement** : mentionner clairement que cette methode est une approximation simplifiee et que pour les cas critiques (hautes pressions, gaz legers comme H2, services diphasiques), un calcul selon API 520 Part II est requis.

3. **Clarifier la definition de P1** : ajouter la formule explicite `P1 = P_set x (1 + accumulation) + P_atm` dans l'interface utilisateur.

4. **Ajouter le support des liquides** : meme avec une formule simplifiee differente, couvrir les services liquides elargirait significativement l'utilite de l'outil.

### 6.2 Recommandations logicielles (priorite moyenne)

5. **Centraliser les tables de donnees** : utiliser une source unique pour les facteurs Kf et les sections d'orifice, partagee entre les trois fichiers.

6. **Separer le monolithe** : extraire le CSS et le JavaScript de `index.html` dans des fichiers dedies.

7. **Ajouter des tests** : implementer des tests unitaires pour la logique de calcul (meme de simples assertions dans un fichier de test).

8. **Corriger la generation PDF** (Google Sheets) : ne pas ecraser la feuille active. Utiliser une feuille temporaire ou generer le PDF directement sans modifier le classeur.

### 6.3 Ameliorations futures (priorite basse)

9. **Calcul API 520 complet** : offrir une option de calcul detaille avec les parametres thermodynamiques du fluide (k, M, T).

10. **Base de donnees de fluides** : integrer les proprietes thermodynamiques des gaz courants pour permettre un calcul plus precis.

11. **Visualisation** : ajouter un schema de la soupape avec la direction de la force de reaction.

12. **Internationalisation** : l'interface est en francais mais le titre est en anglais. Uniformiser ou ajouter un support multilingue.

---

## 7. Conclusion

Cet outil est un **calculateur pratique et bien realise** pour l'estimation rapide des forces de reaction des soupapes de surete en service gaz et vapeur. La coherence dimensionnelle est correcte, les tables d'orifice sont conformes a API 526, et l'implementation logicielle est solide avec un mode batch particulierement bien concu.

Cependant, l'outil presente des **limitations inherentes a sa methode simplifiee** : les facteurs Kf ne sont pas traces a une source normative, les conditions specifiques du fluide ne sont pas parametrables, et les services liquides/diphasiques ne sont pas couverts. Pour un usage en ingenierie de detail ou sur des cas critiques, un calcul conforme a l'**API 520 Part II** reste necessaire.

En l'etat, l'outil est adapte pour :
- Les estimations preliminaires de conception
- Les verifications rapides sur site
- Le dimensionnement conservatif des supports de tuyauterie

Il **ne doit pas etre utilise** comme seule reference pour :
- Les etudes de detail avec rapport d'ingenierie
- Les services critiques (H2, haute pression, diphasique)
- Les cas ou la contre-pression est significative

---

*Revue preparee dans le style methodique et rigoureux de Richard Ay, P.E.*
*"Un bon calcul d'ingenierie est un calcul dont on peut tracer chaque hypothese."*
