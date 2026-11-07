<!-- (c) 2026 William Li -->

<!-- fr translation of MANUAL.md. Translate the text; keep every {#anchor src=…} exactly as it is. -->

# Outil de profil ICC — Manuel d’utilisation {#icc-profile-tool-user-manual src=38bba1de}

**Outil de profil ICC** (profiletool) est un outil fonctionnant dans le navigateur pour inspecter, valider et éditer en aller-retour les profils couleur **ICC.1** et **ICC.2 (iccMAX)**. Il s’exécute entièrement dans votre navigateur — sans envoi de fichier ni installation — grâce à une compilation WebAssembly d’[iccDEV](https://github.com/InternationalColorConsortium/iccDEV), l’implémentation de démonstration officielle d’IccProfLib publiée par l’ICC.

**Ce que vous pouvez faire :**

- **Parcourir l’en-tête** — chaque champ de l’en-tête de profil de 128 octets, décodé en chaînes lisibles.
- **Parcourir le répertoire des balises** — chaque balise avec sa signature, son type, son décalage en octets, sa taille et ses octets de remplissage. Cliquez sur une balise pour déplier sa description complète propre à son type (la même sortie que la vue « Describe » de `wxProfileDump` d’iccDEV) et — pour les balises qui en comportent une — une **visualisation** intégrée : courbes de reproduction des tons, diagrammes de chromaticité, images de CLUT et de gamut, nuages de points des couleurs nommées, ainsi qu’un **évaluateur de transformation** en un point.
- **Valider** — exécuter la liste de contrôle de l’ICC Profile Assessment Working Group (Sécurité / Conformité / Qualité), chaque contrôle avec son verdict, filtrable par catégorie.
- **Éditer en aller-retour** — convertir le profil en XML ou en JSON, le modifier dans l’éditeur de code intégré, le reconvertir en ICC et le revalider. Le bouton d’enregistrement télécharge le binaire modifié.
- **Chaîner des profils** — dans l’onglet **Lier**, faites glisser des profils du pool dans une chaîne ordonnée, puis figez-la en **DeviceLink**, **transformez une image** à travers elle (avec un contrôle complet de l’encodage de sortie, de la compression, de la disposition planaire et de l’intégration du profil ICC) ou **transformez un jeu de données colorimétriques**.
- **Travailler en HDR** — vérifier un profil au regard des règles des profils HDR ColorSpace d’ICC.1 (clause 8.7.1), lire ses points de code cICP et tracer sa courbe de gain adaptative pour n’importe quelle réserve d’affichage. L’onglet **HDR** affiche une image HDR sur votre écran, et **Paramètres → Environnement** indique ce dont ce navigateur et cet écran sont capables.
- **Lancer depuis chardata** — ouvrir directement ici un profil chargé dans [chardata](https://chardata.colourbill.com/), les octets étant transmis dans le navigateur via `postMessage`.
- **Lancer avec une URL** — ouvrir un lien qui désigne à l’outil un profil hébergé sur le web et, en option, l’onglet à afficher (par ex. `…/profiletool#url=…&tab=VAL`).

Tout s’exécute côté client. Les octets du profil ne quittent jamais l’onglet du navigateur.

<div class="note">
<strong>La prise en charge d’ICC.2 (iccMAX) est partielle.</strong> Les profils ICC.2 se chargent, s’inspectent, se valident et font l’aller-retour comme les profils ICC.1 — la liste de contrôle de validation comprend des contrôles propres à iccMAX, les PCS spectraux et les balises multi-processing-element sont décodés, et les moteurs de transformation sont compilés avec la pile iccMAX complète. Ne sont pas encore couverts : les flux <strong>ICS</strong> (Interchange Color Space) en plusieurs parties, le choix d’un <em>sous-profil</em> V5 lors de l’application d’une transformation, et la recherche inverse sur certains profils ICC.2. Attendez-vous à des lacunes sur les fonctions ICC.2 les plus exotiques ; elles sont comblées version après version.
</div>

<div class="note">
<strong>La prise en charge des profils HDR ColorSpace suit un projet de norme.</strong> Les contrôles HDR, les vues de <code>headroomAdaptiveGainCurveTag</code> et l’onglet HDR implémentent l’amendement HDR d’ICC.1 dans son état actuel. L’amendement n’est pas encore publié ; certains détails peuvent donc changer d’ici là.
</div>

---

## Sommaire {#contents src=54605fa3}

1. [L’espace de travail](#1-the-workspace)
2. [Panneau des paramètres](#2-settings-panel)
3. [Vues du profil](#3-profile-views)
   - [En-tête](#3-1-header)
   - [Balises](#3-2-tags)
   - [Validation](#3-3-validation)
   - [Analyse](#3-4-analysis)
   - [XML](#3-5-xml)
   - [JSON](#3-6-json)
4. [Onglet Lier](#4-combine-tab)
   - [Construire une chaîne](#4-1-building-a-chain)
   - [Créer un DeviceLink](#4-2-make-devicelink)
   - [Transformer une image](#4-3-transform-image)
   - [Transformer des données](#4-4-transform-data)
   - [Changement d’observateur](#4-5-observer-change)
   - [Onglets Comparer et Spectral](#4-6-compare-and-spectral-tabs)
   - [Onglet HDR](#4-7-hdr-tab)
5. [Édition aller-retour](#5-round-trip-editing)
6. [Lancement depuis chardata](#6-launching-from-chardata)
7. [Lancement avec une URL](#7-launching-with-a-url)
8. [Mobile](#8-mobile)
9. [Limites et sécurité](#9-limits-and-security)

---

## 1. L’espace de travail {#1-the-workspace src=4bc9350f}

profiletool est un **atelier multi-profils**. La fenêtre comporte trois parties :

- le volet **Profils** sur la gauche — le *pool* de tout ce que vous avez chargé ;
- le **canevas** à droite, avec cinq onglets en haut — **Profil**, **Comparer**, **Lier**, **Spectral**, **HDR** ;
- le volet **Paramètres** sur le bord droit (voir [Panneau des paramètres](#2-settings-panel)).

### Charger des profils {#loading-profiles src=2cd0f653}

Chargez des fichiers de l’une des deux manières suivantes :

- Cliquez sur **Charger des profils** en haut du volet Profils et choisissez un ou plusieurs fichiers, ou
- **Glissez-déposez** des fichiers sur le volet Profils.

Vous pouvez charger des profils `.icc` / `.icm` *et* des images. Déposez un fichier **TIFF, PNG, JPEG, HEIC ou AVIF** : l’outil en extrait le **profil ICC intégré** et l’ajoute au pool. Il ne lit que les métadonnées du fichier, jamais les pixels. Pour HEIC et AVIF, il parcourt les boîtes du fichier ; cela fonctionne donc dans tous les navigateurs, y compris ceux qui ne savent pas afficher ces formats. Un fichier **JPEG XL** est en revanche refusé : son profil est compressé dans le flux de code, que profiletool ne décompresse pas encore. Les vidéos et les fichiers raw d’appareil photo qui partagent le conteneur de HEIC (MP4, QuickTime, Canon CR3) ne sont pas traités comme des images. Un fichier **OpenEXR** ou **Radiance HDR** (`.hdr`) est refusé avec le motif : aucun de ces formats ne prévoit d’emplacement pour un profil ICC. OpenEXR décrit sa couleur par des chromaticités, Radiance HDR par une ligne d’en-tête `PRIMARIES` facultative. Pour *visualiser* une image, utilisez l’[onglet HDR](#4-7-hdr-tab). Un bouton **＋ Nouveau depuis .cube** crée un DeviceLink à partir d’une LUT `.cube`. Le résultat est ajouté au pool et ouvert dans l’onglet **Profil** ; rien n’est téléchargé tant que vous ne cliquez pas sur **Enregistrer le profil ICC**.

Un profil est accepté si ses 36 premiers octets contiennent la signature `acsp` et s’il passe l’analyse par `ValidateIccProfile` d’IccProfLib. Les fichiers refusés sont listés dans un récapitulatif des rejets avec le motif précis ; leurs octets ne sont pas conservés.

### Le volet Profils {#the-profiles-pane src=04750126}

Les profils chargés sont regroupés en sections repliables par **classe de profil** (Input, Display, Output, DeviceLink, ColorSpace, Abstract, Named Color, …). Les **Profils HDR ColorSpace** de la clause 8.7.1 d’ICC.1 ont en revanche leur propre section en tête (ce sont des profils de classe ColorSpace, extraits pour cela de la section ColorSpace), subdivisée selon le transfert en **Transfert linéaire** et **Transfert non linéaire (PQ, HLG)**, le transfert figurant en badge sur chaque ligne. Cette distinction compte dans l’[onglet HDR](#4-7-hdr-tab), où seul un profil à transfert linéaire peut être assigné à une image OpenEXR ou Radiance HDR. Chaque ligne affiche le nom du fichier et des badges indiquant la classe, l’espace couleur, la version et la taille ; un profil qui n’a pu être que partiellement analysé est signalé. Utilisez le bouton **A–Z** pour faire défiler les ordres de tri (ordre de chargement → croissant → décroissant), le **×** d’une ligne pour la retirer, et la poignée du bord droit du volet pour le redimensionner — ou le replier entièrement.

Cliquez pour sélectionner une ligne ; Ctrl/Cmd-clic pour l’ajouter ou la retirer de la sélection, Maj-clic pour sélectionner une plage. **Faites glisser des lignes du pool sur un onglet** pour les mettre à l’œuvre.

<div class="note">
<strong>Le pool ne dure que le temps de la session.</strong> Rien n’est envoyé et rien n’est conservé — votre système de fichiers reste le stockage durable. Recharger la page vide le pool.
</div>

### Les onglets {#the-tabs src=034c9677}

| Onglet | Rôle |
|---|---|
| **Profil** | Inspecte **un seul** profil — en-tête, balises, validation, analyse, XML, JSON. Déposer un nouveau profil ici remplace le profil courant. |
| **Comparer** | Superpose les gamuts de **deux profils ou plus**. |
| **Lier** | Chaîne des profils en un DeviceLink, ou transforme une image / un jeu de données à travers eux. |
| **Spectral** | Assemble des images spectrales monocanal en un seul TIFF multicanal. |
| **HDR** | Affiche **une** image HDR sur votre écran, avec une commande SDR ↔ HDR. Voir [Onglet HDR](#4-7-hdr-tab). |

Spectral et HDR acceptent directement des fichiers image plutôt que des profils du pool. Chacun des autres onglets conserve son propre ensemble de profils, affichés sous forme de pastilles amovibles sous la barre d’onglets, avec un badge de comptage sur l’onglet lui-même. Le premier profil chargé s’ouvre automatiquement dans l’onglet **Profil** ; ensuite, faites glisser depuis le pool vers l’onglet de votre choix. Déposer des fichiers directement sur un onglet les charge dans le pool *et* les place sur cet onglet en une seule action.

<div class="note">
<strong>Limite de taille :</strong> le chargeur refuse tout fichier de plus de 256 Mo. Les profils réels font normalement bien moins de 10 Mo ; ce plafond sert uniquement à empêcher un dépôt ou un postMessage malveillant d’épuiser le tas WASM de l’onglet.
</div>

---

## 2. Panneau des paramètres {#2-settings-panel src=3bf599d9}

Ouvrez les paramètres en cliquant sur le bouton **⚙** du bord droit de l’écran (ou sur l’icône d’engrenage en haut à droite sur mobile). Le panneau glisse par-dessus le contenu sans le redimensionner.

Deux autres boutons se trouvent sous ⚙ :

- **?** ouvre ce guide **dans l’application**, dans un volet qui glisse par-dessus la fenêtre. Son en-tête comporte un champ de recherche — tapez pour surligner les occurrences, puis utilisez `Enter` / `Shift+Enter` (ou les boutons `˄` `˅`) pour les parcourir ; `Escape` efface la recherche, et un second `Escape` ferme le volet.
- **✉** ouvre le formulaire de contact de colourbill.com dans un nouvel onglet du navigateur.

Le panneau comporte deux groupes, **Affichage** et **Environnement**. Pour élargir ou rétrécir le panneau, faites glisser son bord gauche (220–560 px) ; la largeur est mémorisée.

### Arrière-plan {#background src=1450fe76}

Bascule l’application entre les thèmes **Clair**, **Sombre** et **Système** (qui suit la préférence du système d’exploitation). Le choix est conservé d’une session à l’autre. En mode **Système**, l’application s’abonne à `prefers-color-scheme` et bascule automatiquement quand le thème du système change ; choisir explicitement Clair ou Sombre détache cet écouteur.

### Format des nombres {#number-format src=af65622c}

Choisit l’affichage des valeurs numériques dans toutes les vues du profil — **Hexadécimal** ou **Décimal**.

### Langue {#language src=38c60535}

Remplace la langue de l’interface. **Par défaut du système (…)** détecte la langue du navigateur et utilise la langue prise en charge la plus proche, son nom natif figurant entre parenthèses pour que vous voyiez laquelle a été retenue. La traduction couvre l’habillage de l’application : le volet Profils, les libellés des onglets, les outils Lier, Spectral et HDR, les vues de courbe de gain HDR dans Balises, le panneau des paramètres y compris Environnement et ses explications, et l’habillage de ce guide. Certains textes ne sont pas traduits :
- Les chaînes produites par IccProfLib — descriptions de balises, messages de validation, noms des champs d’en-tête — proviennent de la bibliothèque C++ en anglais.
- Le nom de l’option du navigateur reste en anglais pour correspondre à la propre page d’options du navigateur.
- Le journal **Événements d’affichage** du panneau Environnement reste en anglais, afin de pouvoir être collé tel quel dans un rapport de bogue.
- Ce guide suit le même réglage, sauf ses sections HDR, qui restent en anglais tant que la prise en charge du HDR est en bêta et que leur texte évolue encore. Une section révisée en anglais depuis la dernière mise à jour de sa traduction s’affiche aussi en anglais, avec une note, jusqu’à ce que la traduction soit rattrapée.

Langues prises en charge : English, Français, Deutsch, Italiano, Español, Português (PT), Português (BR), Svenska, 中文（简体）, 中文（繁體）, 日本語, 한국어. Le panneau des paramètres de chardata propose le même ensemble, si bien que changer la langue dans une application offre une expérience de lecture cohérente dans l’autre.

### Environnement {#environment src=2eb1ea2c}

Indique ce dont **ce** navigateur, cette plateforme et cet écran sont capables, afin que vous puissiez voir pourquoi un format ou une fonction HDR n’est pas disponible. De haut en bas :

- **Résumé** — le navigateur et le système d’exploitation, et si l’écran se déclare HDR.
- **Options du navigateur** (Chrome, Edge, Opera, Brave) — indique si *Experimental Web Platform features* est activée. Cette option active le canvas HDR et permet à la page de lire la réserve HDR d’un écran.
  - Quand l’option est connue comme désactivée, l’encadré est mis en évidence. Il est marqué **requis** si ce navigateur ne dispose d’aucun WebGPU utilisable, le canvas HDR étant alors la seule voie de rendu HDR. Sinon, il est marqué **facultatif**.
  - L’inspection des profils n’en a jamais besoin.
  - Une page web ne peut ni ouvrir ni modifier les options du navigateur. Cliquez sur **Copier**, collez l’adresse dans la barre d’adresse, réglez l’option sur *Enabled*, puis relancez le navigateur.
- **Caractéristiques de l’écran** — **Écran HDR**, **Gamut étendu** (sRVB, Display P3 ou Rec. 2020), **Rapport de pixels** et le **Chemin canvas HDR** utilisé (`float16-canvas`, `webgpu` ou aucun). Ces valeurs s’actualisent d’elles-mêmes quand vous faites glisser la fenêtre vers un écran où elles diffèrent. Le basculement a lieu dès que la majeure partie de la fenêtre se trouve sur le nouvel écran.
- **Identifier les écrans** (navigateurs Chromium) — demande l’autorisation de savoir sur quel moniteur se trouve la fenêtre. Une fois l’autorisation accordée, le panneau s’actualise même entre des moniteurs identiques en apparence, nomme l’**Écran actuel** et affiche la **Réserve HDR** quand le navigateur l’expose (Chrome avec l’option ci-dessus), par exemple *1,35 diaphragme (≈2,55× le blanc SDR)*. Si vous refusez l’autorisation, modifiez-la dans les paramètres du site.
  - La réserve est la marge au-dessus du blanc SDR ; sur la dalle HDR intégrée d’un portable, elle **diminue quand vous augmentez la luminosité** (le blanc SDR devient plus lumineux alors que le pic de la dalle ne bouge pas) et augmente quand vous la baissez. Pour visionner du HDR, baissez la luminosité.
  - Sous Windows, une nouvelle valeur arrive quelques secondes après un changement de luminosité, une fois que le pilote d’affichage l’a communiquée. Elle s’actualise aussi quand la fenêtre passe sur un autre écran ou que Chrome redevient l’application active.
- **Événements d’affichage** — un journal repliable des 20 dernières actualisations et de ce qui a déclenché chacune. Il est utile pour signaler un problème d’affichage.
- **Tableau des formats** — une ligne par format (profil ICC, TIFF, PNG, JPEG, OpenEXR, Radiance HDR, AVIF, HEIC/HEIF, JPEG XL), avec trois questions :
  - **Inspecter** : le profil intégré peut-il être lu ?
  - **Afficher** : les pixels peuvent-ils être affichés ?
  - **HDR** : le rendu peut-il dépasser le blanc ?

  Survolez une ligne pour connaître la raison d’un ✕ ; les formats qui ne peuvent pas être affichés sont listés avec leurs raisons sous le tableau. Un point signale les formats que profiletool décode lui-même, qui fonctionnent de la même façon dans tous les navigateurs. **Inspecter** vaut ✓ pour tous les formats sauf JPEG XL, dont le profil est compressé dans le flux de code.

---

## 3. Vues du profil {#3-profile-views src=ccf59d34}

Faites glisser un profil du pool vers l’onglet **Profil** pour l’inspecter. L’onglet affiche une barre avec le nom du fichier et un bouton **Enregistrer le profil ICC** (plus une pastille *● Modifié — non enregistré* dès que vous l’avez modifié), et en dessous la visionneuse : une barre de titre (nom du fichier · taille en octets · version d’IccProfLib · badge de validité) et sa propre barre d’onglets.

Le badge résume le rapport de **Validation** : **Réussi** en vert quand aucun contrôle n’échoue ni n’avertit, **Avertissement** en orange quand au moins un contrôle émet un avertissement, **Échec** en rouge quand un contrôle échoue.

<div class="note">
<strong>Profils partiellement analysés :</strong> si un profil est suffisamment endommagé pour que le validateur ne puisse le lire que structurellement, un bandeau d’avertissement apparaît et seuls les onglets <strong>En-tête</strong> et <strong>Balises</strong> sont disponibles — Validation, Analyse, XML et JSON sont masqués, car le profil ne doit pas être appliqué.
</div>

### 3.1 En-tête {#3-1-header src=45c71bd0}

Un tableau à deux colonnes de tous les champs de l’en-tête binaire de 128 octets du profil ICC. Les valeurs sont décodées en chaînes lisibles (signatures développées, dates formatées, valeurs en virgule fixe converties) à l’aide de `CIccInfo` d’IccProfLib. L’**ID du profil** (empreinte MD5 tirée de l’en-tête) est affiché dans un bandeau mis en évidence en haut.

### 3.2 Balises {#3-2-tags src=90f22730}

Une grille à six colonnes de toutes les balises du répertoire des balises du profil :

| Colonne | Signification |
|---|---|
| `#` | Position dans le répertoire (à partir de 1) |
| `Name` | Nom long lisible (par ex. `profileDescriptionTag`) |
| `ID` | Signature de 4 caractères (par ex. `desc`) |
| `Offset` | Décalage en octets depuis le début du fichier |
| `Size` | Taille en octets des données de la balise |
| `Pad` | Octets de remplissage entre cette balise et la suivante |

La signature du **type** de la balise (par ex. `descType`, `mft2`, `mAB`) est affichée avec le décalage et la taille en haut de la balise dépliée.

Les balises sont triées par décalage. La colonne **Rembourrage** est codée par couleur — `Pad < 0` (balises qui se chevauchent, non conforme) s’affiche en rouge ; `Pad > 3` (remplissage supérieur à la spécification) s’affiche en orange.

**Cliquez sur une ligne** pour la déplier sur place (en accordéon — une seule balise ouverte à la fois). Le détail déplié se termine toujours par la description complète propre au type — l’équivalent de l’exécution de `CIccTag::Describe(verbosity = 100)` d’IccProfLib. Pour les balises contenant de grandes CLUT ou courbes (par ex. `A2B0`, `B2A0`), elle inclut chaque cellule de grille ou point de courbe.

Au-dessus de cette description, les balises dont les données se prêtent à une visualisation affichent une ou plusieurs **visualisations intégrées**, chacune dans une section repliable :

| Type de balise | Visualisations |
|---|---|
| Courbes de tons (`rTRC`/`gTRC`/`bTRC`/`kTRC`) | La courbe de reproduction des tons tracée face à la droite identité ; la table de la courbe est repliée en dessous. |
| Colorants RVB (`rXYZ`/`gXYZ`/`bXYZ`) et point blanc (`wtpt`) | Un diagramme de chromaticité CIE 1931 où la primaire concernée (ou le point blanc) est mise en évidence ; les données du colorant ou du point blanc sont affichées en dessous. |
| Transformations LUT (`A2B0–3`, `B2A0–3`, `gamt`, `pre0–2`) | Les courbes de tons côté entrée et côté sortie (superposées, codées par couleur selon le colorant, avec une légende pour afficher ou masquer les tracés) ; le treillis de la CLUT sous forme d’image ; l’**image de gamut** (pour la `gamutTag` du profil, codée par couleur — neutre = dans le gamut, rouge = hors gamut) ; l’**évaluateur** (ci-dessous) ; et la table de données brutes, repliée. |
| Tables de couleurs nommées / de colorants (`ncl2`/`nmcl`/`clrt`/`clot`) | Un nuage de points des couleurs sur les diagrammes CIELAB a\*b\* (et CIE xy) ; les tables sont repliées en dessous. |
| Points de code indépendants du codage (`cicp`) | **Points de code** : primaires de couleur, caractéristiques de transfert, coefficients de matrice et indicateur de pleine plage, chacun nommé selon la définition de l’UIT-T H.273. Les valeurs que H.273 n’attribue pas sont signalées, de même que les octets réservés non nuls. |
| Courbe de gain adaptative (`headroomAdaptiveGainCurveTag`) | **Gain pour une réserve d’affichage**, plus **Courbe de gain** quand la balise stocke des images alternatives. Voir *Courbes de gain HDR (HAGC)* ci-dessous. |

<div class="note">
<strong>Les données mal formées ne sont jamais masquées.</strong> Si une courbe ou un autre élément visualisable échoue à la validation d’IccProfLib — par exemple une courbe de tons avec un gamma dégénéré de 0 — la section affiche quand même ce qu’elle peut, avec un avertissement ⚠ indiquant le motif exact fourni par la bibliothèque, plutôt que d’omettre silencieusement le graphique.
</div>

#### L’évaluateur de transformation {#the-transform-evaluator src=c70f94b4}

Pour les transformations LUT (balises `A2B*` / `B2A*` / d’aperçu), la section **Évaluer** applique la transformation de cette balise précise à une couleur unique que vous fournissez, en utilisant directement IccProfLib — sans moteur couleur externe. Le sens suit la balise (`A2B*` va du périphérique vers le PCS ; `B2A*` du PCS vers le périphérique), et l’intention de rendu est implicite dans la balise (`…0` perceptive, `…1` colorimétrique relative, `…2` saturation).

- Saisissez l’entrée soit sous forme de valeurs **en virgule flottante** (canaux du périphérique, ou PCS en unités Lab/XYZ usuelles), soit, quand la balise comporte une CLUT, par indice de **point de grille** (la position d’un nœud du treillis).
- La sortie est affichée **à la fois** dans l’encodage interne normalisé 0–1 et en unités usuelles (Lab/XYZ pour un résultat PCS).

La balise de gamut (`gamt`) n’a pas d’évaluateur — il s’agit d’une carte à un canal dans/hors gamut et non d’une transformation inversible ; son image de gamut est affichée à la place.

### 3.3 Validation {#3-3-validation src=b72d6c69}

Exécute la liste de contrôle de l’**ICC Profile Assessment Working Group** sur le profil chargé et la présente sous forme de rapport. Les contrôles proviennent de l’outil `iccPawgReport` d’iccDEV, compilé en un module WebAssembly distinct qui n’est téléchargé qu’à la première ouverture de cet onglet. (Le même rapport alimente le badge de validité de la barre de titre, et il est accessible depuis un lancement par URL sous le nom `VAL` ou sous l’ancien nom `PAWG`.)

Chaque contrôle est rangé sous **Sécurité**, **Conformité** ou **Qualité**, et porte un verdict. Les profils à contenu HDR reçoivent un quatrième groupe, **HDR**. Son premier contrôle indique si le profil est un **profil HDR ColorSpace** ICC.1 conforme (clause 8.7.1), et les suivants vérifient les métadonnées HDR sur lesquelles repose cette clause :

| Verdict | Signification |
|---|---|
| **Réussi** (PASS) | Le contrôle a réussi |
| **Avertissement** (WARN) | Un point non bloquant qui mérite d’être examiné |
| **Échec** (FAIL) | Le profil ne satisfait pas le contrôle |
| **Lacune** (GAP) | Le contrôle n’a pas pu être entièrement évalué (par ex. pas encore implémenté) |
| **N/A** | Le contrôle ne s’applique pas à ce profil |
| **Non exécuté** (NOT RUN) | Le contrôle a été ignoré |

La ligne de synthèse en haut comptabilise chaque verdict dans une pastille colorée. **Cliquez sur une pastille pour filtrer** le rapport en dessous — un halo bleu marque les catégories actuellement affichées, et les pastilles à zéro élément sont inactives. Par exemple, désactivez **Réussi** et **N/A** pour vous concentrer sur les avertissements et les échecs.

### 3.4 Analyse {#3-4-analysis src=9478bc94}

Des analyses de qualité à l’échelle du profil, dérivées de ses transformations couleur — calculées par un module WebAssembly dédié (le moteur de visualisation d’iccDEV) qui n’est téléchargé qu’à la première ouverture de cet onglet, et tracées dans le style propre à l’application.

Chaque analyse est une section repliable et **toutes sont initialement fermées**. C’est voulu : chaque section coûte un passage complet de transformation sur le profil, si bien qu’en ouvrir une relève de votre choix explicite, plutôt que de lancer six analyses dès que vous changez d’onglet. Les résultats sont mis en cache ; rouvrir une section est donc instantané. Une section qui ne s’applique pas au profil chargé affiche à la place une courte note *non applicable* (par exemple, un profil d’affichage matrice/TRC n’a pas de CLUT périphérique↔PCS à analyser).

#### Statistiques du profil {#profile-statistics src=f2d4f2db}

Des métriques à l’échelle du profil pour **une** intention de rendu sélectionnée, pilotées par deux listes déroulantes et une case à cocher :

- **Intention de rendu** — Perceptive / Colorimétrique relative / Saturation / Colorimétrique absolue.
- **Type d’aller-retour** — la métrique de précision à rapporter (voir ci-dessous).
- **Utiliser les balises MPE (couleur)** — désactivée = les tables de conversion colorimétriques ; activée = les balises multi-processing-element / couleur. Elle n’a aucun effet sur l’aperçu dans le gamut, où elle est désactivée.

Le tableau affiche le **volume de gamut** (en ΔE\*ab³, délimité par la transformation `A2B` périphérique → PCS, mesuré en voxélisant la frontière et en comptant les cellules incluses) à côté des valeurs **min / moyenne / écart-type / P90 / max** de ΔE\*ab de l’aller-retour sélectionné. En dessous se trouve un histogramme de distribution des ΔE — barres de fréquence relative avec une courbe de fréquence cumulée — ainsi que les valeurs `L, a, b` de la pire erreur et, pour PRMG, l’indication si le profil implique le Perceptual Reference Medium Gamut.

Les quatre types d’aller-retour :

- **Aperçu dans le gamut (RT0)** — une grille de valeurs périphérique convertie vers le PCS, ramenée au périphérique, puis de nouveau vers le PCS ; ΔE\*ab mesuré entre les deux passages PCS. Un contrôle rapide de stabilité dans le gamut.
- **Inversion + gamut (RT1)** — ΔE\*ab entre le PCS de chaque couleur périphérique et son PCS après un aller-retour Lab → périphérique → Lab. Reflète la précision de l’inversion *et* le mappage de gamut.
- **Reproductibilité (RT2)** — ΔE\*ab entre le premier et le second aller-retour : la stabilité d’un aller-retour répété, indépendamment de l’écrêtage de gamut du premier passage.
- **Interopérabilité PRMG** — les couleurs PCS situées dans le Perceptual Reference Medium Gamut, soumises à un seul aller-retour ; la distribution des ΔE indique l’interopérabilité entre profils.

Sous l’histogramme, **ΔE d’aller-retour par clarté** répond à la question que les chiffres de synthèse ne peuvent pas trancher : *où* dans l’échelle des tons l’inversion peine, et *jusqu’où dans le gamut* le problème s’étend.

Il échantillonne 32 niveaux de clarté. À chaque niveau, il prend 64 points **sur la frontière du gamut**, puis les répète en les rapprochant de l’axe neutre à 80 %, 50 % et 20 % de leur chroma — 8 192 points au total, chacun tracé individuellement, avec des séparateurs en pointillés entre les niveaux.

Lisez-le bande par bande. Dans une bande, les points vont de la surface du gamut à gauche jusqu’au neutre à droite ; l’erreur devrait donc **décroître** le long de la bande : les couleurs proches de la frontière sont les plus difficiles à inverser, les couleurs proches du neutre les plus faciles. Une bande dont l’erreur reste élevée jusqu’au neutre révèle un profil en difficulté à cette clarté. Les pics les plus hauts marquent les niveaux de clarté où la frontière du gamut elle-même est la moins bien inversée.

Chaque point de départ est dans le gamut par construction ; ce que vous voyez est donc un véritable désaccord entre `B2A` et `A2B`, et non des couleurs écrêtées parce qu’inatteignables. Notez que ce graphique a son **propre** échantillonnage — volontairement pondéré vers la frontière du gamut — si bien que sa moyenne et son maximum sont plus élevés que ceux du tableau ci-dessus et ne leur sont pas comparables. Il suit l’intention de rendu, mais pas le type d’aller-retour.

Un profil dépourvu des transformations périphérique↔PCS nécessaires à une métrique affiche une note *non applicable* ; un espace périphérique trop vaste pour être échantillonné est signalé comme ignoré plutôt que comme une erreur.

#### Colorimétrie des extrêmes {#extrema-colorimetry src=be6c9597}

Les extrémités de la plage de reproduction du profil — les valeurs qu’un opérateur d’impression lit généralement en premier.

- **Point blanc** — la couleur d’un **colorant nul**, c’est-à-dire le support nu.
- **Point noir** — obtenu en faisant passer le noir PCS (L\*=0, a\*=b\*=0) par la table `B2A` sélectionnée pour obtenir l’encrage que le profil *choisit* pour le noir, puis en relisant cet encrage par `A2B1`.
- Les deux sont affichés en colorimétrie **relative** et **absolue**. L’absolue montre la couleur propre du support (un papier blanc bleuté donne par exemple L\* 95, b\* −4) ; la relative la rapporte à un blanc parfait. Si les deux colonnes sont identiques, c’est normal — le blanc du support correspond simplement à l’illuminant. Un profil sans balise de point blanc du support n’affiche que la relative.
- **Encrage au point noir** et **TAC** — l’encre par canal à ce noir, et leur somme : la couverture totale (total area coverage), c’est-à-dire la limite d’encrage.

Comme chaque table `B2A` choisit son propre encrage pour le noir, le point noir diffère réellement selon l’intention — d’où le sélecteur d’intention de rendu.

En dessous, **Aplat et chroma maximal** : pour chaque angle d’encre (C, M, Y, R, G, B et K), sa position en teinte / chroma / clarté, et le point le plus chromatique rencontré en chemin depuis le support nu. Ces lignes sont mesurées via `A2B1` et **ne changent donc pas avec le sélecteur d’intention**. Sur un profil bien construit, les deux lignes coïncident. Quand le chroma maximal est atteint *avant* l’aplat, la ligne est signalée : au-delà de ce point, l’encre supplémentaire n’ajoute plus de chroma, elle ne fait qu’assombrir.

**Profils de sortie (imprimante) uniquement** — l’analyse suppose qu’un colorant nul correspond au support nu. Le tableau par teinte exige en outre un espace périphérique **CMJN ou CMJ** : un profil n-couleurs (nCLR) nomme ses canaux dans un ordre quelconque, si bien qu’on ne peut pas savoir quel canal est le « cyan », et le tableau le signale plutôt que de deviner.

#### Encrage de l’axe neutre {#neutral-axis-inking src=aa5449e4}

Balaie l’axe neutre (a\*=b\*=0) du blanc (L\*=100) au noir (L\*=0) à travers la table `B2A` (PCS → périphérique) du profil et trace la quantité de chaque colorant que le profil dépose le long de ce parcours — la courbe classique de GCR / de construction du neutre. Une courbe par canal du périphérique, codée par couleur selon le colorant.

Une courbe supplémentaire est tracée par-dessus la séparation :

- **L\* en sortie (tonalité)** — la reproduction des tons : la clarté effectivement atteinte par l’axe neutre après un aller-retour par le profil. Sa forme renseigne sur deux points. Un affaissement sous la diagonale signifie que les gris sont rendus plus sombres que demandé. Plus utile encore, la courbe **s’aplatit à la clarté la plus sombre que le profil peut atteindre** — ce plateau *est* le point noir du support, et il doit concorder avec la section Colorimétrie des extrêmes ci-dessus.

**Profils de sortie (imprimante) uniquement** ; les autres classes de profils affichent une note.

#### Utilisation d’encre dans les ombres {#ink-usage-in-shadows src=e62016b7}

Quatre trajets rectilignes à travers le plan a\*b\* à une clarté constante, volontairement sombre — 0°, 45°, 90° et 135° — passent par la table `B2A` sélectionnée, et la séparation obtenue est tracée pour chacun.

Comme tous les échantillons d’un trajet partagent la même valeur de L\*, tout saut brusque ou toute inversion d’un colorant provient uniquement du traitement de la teinte et du chroma. C’est la signature d’un artefact de mappage de gamut dans les ombres, du genre qui apparaît à l’impression sous forme de banding ou de dérive de couleur soudaine dans les zones sombres. Les trajets partent de loin hors du gamut, le traversent et ressortent de l’autre côté ; vous voyez donc aussi où le profil commence à écrêter.

Le plan de clarté est choisi automatiquement : à mi-chemin entre l’angle Bleu du profil et le plus sombre de C, M, Y, R et G. Pour les tables perceptive et saturation, la clarté est d’abord étirée du point noir du support jusqu’au noir PCS — ces tables attendent le noir à cet endroit — et la section indique à la fois le plan compensé et le plan brut.

**Profils de sortie (imprimante) uniquement**, avec la même restriction CMJN/CMJ que le tableau par teinte ci-dessus (le plan est dérivé des angles d’encre).

#### Chemins d’encrage primaire par le neutre {#primary-inking-paths-through-neutral src=cb510c25}

Trois trajets — Cyan→Rouge, Magenta→Vert, Jaune→Bleu — partant chacun d’un angle primaire, passant **par l’axe neutre** à la clarté médiane de leurs deux extrémités, jusqu’à l’angle opposé, parcourus à travers la table `B2A` sélectionnée et tracés sous forme de séparation.

C’est le pendant dans le gamut de l’Utilisation d’encre dans les ombres. Là, les trajets sortent volontairement du gamut pour révéler les artefacts de mappage de gamut ; ici, **chaque échantillon est dans le gamut par construction** — les deux extrémités sont les primaires du profil lui-même et le pivot se trouve sur l’axe neutre. Un saut, un coude ou une inversion d’un colorant le long de l’un de ces trajets ne peut donc pas être imputé à l’écrêtage de gamut : c’est un défaut de régularité de la CLUT. Le pivot neutre est au milieu de chaque graphique, là où vous devriez voir une construction du neutre équilibrée.

Pour les tables perceptive et saturation, la clarté bénéficie d’une compensation du point noir selon l’intention, exactement comme dans Utilisation d’encre dans les ombres.

**Profils de sortie (imprimante) uniquement**, avec la même restriction CMJN/CMJ (les angles proviennent de la même source que le tableau par teinte).

#### Statistiques d’utilisation d’encre {#ink-usage-statistics src=191fd7cd}

La quantité de chaque colorant déposée par le profil, en couverture moyenne et en **part du total** — la signature de consommation d’encre de la séparation.

Le tableau additionne chaque colorant le long de l’axe neutre et indique sa couverture moyenne et son pourcentage de l’encre totale déposée. La colonne de part est le diagnostic : c’est l’empreinte de construction du neutre du profil (un équilibre des gris chargé en cyan se lit différemment d’un équilibre chargé en noir), et elle est indépendante du nombre d’échantillons prélevés.

Un second tableau — l’utilisation d’encre sur **toutes les couleurs sur et dans le gamut** — est indiqué *à venir* : il nécessite une construction de la frontière du gamut qui n’est pas encore réalisée.

**Profils de sortie (imprimante) uniquement.**

#### Image CLUT {#clut-image src=a3fec568}

La table de conversion couleur d’une transformation périphérique↔PCS, disposée en mosaïque dans une image, avec un sélecteur de la table d’intention de rendu à afficher (`A2B0`–`A2B3`, `B2A0`–`B2A3` et les tables d’aperçu). Utile pour repérer d’un coup d’œil un dommage structurel dans une table. Zoomez, déplacez et réinitialisez avec les commandes du canevas.

Quand vous sélectionnez une **table `B2A` (PCS → périphérique)**, une **image de couverture d’encre en niveaux de gris pour chaque colorant** apparaît sous le treillis — les séparations par encre, plus sombre signifiant davantage de cette encre. Une indication en haut de la section vous y renvoie, car la section s’ouvre sur une table `A2B` (dont la sortie est en L\*a\*b\*, pas en encres). Pour une **sortie n-couleurs (nCLR)** — 5, 6 ou 7 couleurs — sans aperçu couleur simple, l’image principale est **gérée en couleur via la transformation `A2B` directe du profil** afin de rester rendue en vraies couleurs plutôt qu’en un gris monocanal.

#### Image de gamut {#gamut-image src=92f58c0f}

La carte dans/hors gamut de la balise de gamut : neutre là où une couleur PCS est reproductible, rouge là où elle sort du gamut du périphérique. Présente uniquement quand le profil comporte une balise `gamt`.

### 3.5 XML {#3-5-xml src=dfd43c4e}

Convertit le profil en XML (via IccLibXML, le même module d’écriture que celui qu’utilise l’outil en ligne de commande `iccToXml` d’iccDEV) et l’affiche dans un éditeur CodeMirror avec coloration syntaxique. Modifiez le XML et cliquez sur **Convertir en ICC** pour revenir au binaire ; la visionneuse revalide le profil et le bouton **Enregistrer le profil ICC** de la barre de l’onglet Profil télécharge le résultat.

Un indicateur de **modification** s’affiche quand le texte de l’éditeur diffère de la dernière sortie du convertisseur, pour que vous sachiez d’un coup d’œil si vos modifications ont été appliquées. Si la conversion échoue, l’erreur d’analyse d’IccLibXML s’affiche au-dessus de l’éditeur avec la ligne / colonne en cause.

### 3.6 JSON {#3-6-json src=59c3f2e5}

Même principe que l’onglet XML, mais avec une représentation JSON du profil produite par l’enveloppe du validateur (`json-wrapper.cpp`). Modifiez, cliquez sur **Convertir en ICC**, enregistrez. La forme JSON est plus compacte et plus facile à manipuler par script ; la forme XML est plus familière si vous avez utilisé les outils en ligne de commande d’iccDEV.

---

## 4. Onglet Lier {#4-combine-tab src=735d6198}

profiletool conserve chaque profil chargé dans un **pool de profils** à gauche. En haut se trouvent cinq onglets — **Profil** (la visionneuse de profil unique décrite ci-dessus), **Comparer**, **Lier**, **Spectral** et **HDR**. L’onglet **Lier** est celui où vous enchaînez des profils pour les mettre à l’œuvre : créer un **DeviceLink**, **transformer une image** ou **transformer un jeu de données colorimétriques** à travers la chaîne.

### 4.1 Construire une chaîne {#4-1-building-a-chain src=83ab772c}

Faites glisser un ou plusieurs profils du pool dans la carte Lier pour les ajouter à la chaîne, dans l’ordre. La chaîne est une **pile verticale** : la source est en haut, la destination en bas. Chaque profil apporte **une transformation**, et l’outil affiche l’espace couleur en entrée et en sortie de celle-ci (par ex. `RGB → Lab`), l’**espace de connexion** étant indiqué sur le trait entre les étapes. Le moteur valide toute la chaîne en direct et indique le flux de bout en bout (par ex. *Chaîne : RGB → CMYK*) ou explique, étape par étape, où la connexion échoue.

- **Réordonnez** une étape en faisant glisser sa poignée (`⠿`) ou avec les boutons ▲ / ▼ ; retirez-en une avec ×.
- **Inverser le sens** — le bouton ⇅ de la transformation de tête inverse le sens de la chaîne, avec répercussion sur les étapes suivantes.
- **Intention de rendu** — choisissez-en une pour toute la chaîne avec *Intention de rendu (tout)*, ou remplacez-la pour une étape donnée avec sa propre liste déroulante. Survolez l’une ou l’autre commande pour obtenir une description de l’intention sélectionnée. Au-delà des quatre intentions de base, un profil qui comporte les tables nécessaires propose aussi les variantes *no D2Bx/B2Dx* et *+ BPC* (compensation du point noir).

<div class="note">
<strong>Profil HDR ColorSpace dans la chaîne.</strong> Un profil HDR ColorSpace ICC.1 n’a pas de balises TRC — la clause 8.7 n’en définit aucune pour un profil ColorSpace — si bien qu’une transformation qui le traverse utilise son <code>AToB0Tag</code>. Cette table est le rendu HDR&#8594;SDR que la clause 8.7.1.5 exige pour les logiciels sans traitement HDR. La carte le signale quand une chaîne contient un profil HDR ColorSpace : le DeviceLink, l’image ou les données produits reflètent ce repli SDR, et non le comportement HDR du profil.
</div>

### 4.2 Créer un DeviceLink {#4-2-make-devicelink src=2cb72a0d}

Fige toute la chaîne en un seul profil **DeviceLink** (un portage dans le navigateur de `iccApplyToLink` d’iccDEV). Nommez-le et cliquez sur **Créer un DeviceLink** ; le résultat arrive dans le pool et dans l’accumulateur de Lier comme n’importe quel autre profil, prêt à être inspecté dans l’onglet Profil ou réutilisé dans une autre chaîne.

### 4.3 Transformer une image {#4-3-transform-image src=461fcd83}

Déposez une image matricielle (TIFF, PNG ou JPEG) dans l’emplacement image et cliquez sur **Transformer l'image** pour la faire passer par la chaîne (un portage dans le navigateur de `iccApplyProfiles`). L’image est d’abord validée par une sonde lisant uniquement l’en-tête — son espace couleur doit correspondre à l’entrée de la chaîne. Le résultat est **téléchargé** ; les images ne sont jamais stockées dans le pool.

Quand une image valide est chargée, un panneau **Options de sortie de l'image** apparaît, avec les réglages de destination qui reprennent ceux de l’outil en ligne de commande `iccApplyProfiles` :

- **Encodage** — *Identique à la source*, 8 bits, 16 bits ou **Flottant (32 bits)**.
- **Compression** — Aucune, **LZW** ou **ZIP** (Deflate).
- **Planaire** — plans **Entrelacé** (chunky) ou **Séparé**.
- **Interpolation CMM** — **Tétraédrique** ou **Linéaire**.
- **Intégrer le profil ICC** — balise la sortie avec le dernier profil de la chaîne (celui de l’espace de sortie).

Le réglage par défaut conserve une sortie RVB/Gris en PNG ; choisir un réglage propre au TIFF (flottant, LZW/ZIP ou plans séparés) bascule le conteneur en TIFF.

<div class="note">
<strong>Profils intégrés :</strong> si l’image déposée comporte son propre profil ICC intégré, un bandeau propose de l’<strong>extraire</strong> — le profil est ajouté au pool et placé en tête de chaîne (comme espace source) en un clic.
</div>

### 4.4 Transformer des données {#4-4-transform-data src=96934eec}

Déposez un jeu de données colorimétriques (CGATS/IT8, CSV, CxF ou JSON) dans l’emplacement données et cliquez sur **Transformer les données** pour faire passer chaque échantillon par la chaîne (l’équivalent de `iccApplyNamedCmm`). L’outil lit les types de données présents dans le jeu (périphérique / Lab / XYZ / spectral) et fournit ceux dont l’entrée de la chaîne a besoin ; une entrée **spectrale** est convertie en colorimétrie avec le calculateur canonique d’iccDEV, selon l’**Observateur** et l’**Illuminant** que vous choisissez. Les échantillons en double peuvent être filtrés (médiane ou moyenne). Le résultat s’ouvre dans un tableau que vous pouvez **Enregistrer** au format CSV.

### 4.5 Changement d’observateur {#4-5-observer-change src=738ba4d4}

L’onglet Lier contient **deux** cartes de création. Au-dessus du pipeline de liaison, la carte **Changement d’observateur** construit un profil d’affichage matrice/TRC v4.3 à partir d’un profil d’affichage RVB V5 et d’un profil d’observateur V5 (PCC). Faites glisser les deux sur la carte — ils sont automatiquement dirigés vers les emplacements **Affichage RVB V5** et **Observateur V5 (PCC)** selon leur classe de profil — puis cliquez sur **Créer le profil d’affichage V4**, donnez-lui un nom et cliquez sur **Créer**. Le résultat rejoint le pool et cet onglet. Un profil qui n’est ni l’un ni l’autre est ignoré avec un avertissement.

### 4.6 Onglets Comparer et Spectral {#4-6-compare-and-spectral-tabs src=b934d7e3}

L’onglet **Comparer** superpose les frontières de gamut de deux profils du pool ou plus — une enveloppe 3D plus une coupe 2D en clarté — pour voir où ils diffèrent. Lorsque les profils sont des profils HDR ColorSpace, une note **Affichage du repli SDR** explique que chaque gamut est construit à partir du rendu SDR de l’`AToB0Tag`, et non de la plage HDR du profil, qui ne peut pas être représentée dans un PCS borné. L’onglet **Spectral** assemble un ensemble d’images spectrales monocanal (déposées dans l’ordre des canaux) en un seul TIFF multicanal (`iccSpecSepToTiff`).

## 5. Édition aller-retour {#5-round-trip-editing src=595f380b}

Les onglets XML et JSON peuvent tous deux réécrire le profil au format binaire ICC. Le déroulement type :

1. **Chargez** un profil ICC.
2. Ouvrez l’onglet **XML** ou **JSON**. Cliquez sur **Convertir en XML** / **Convertir en JSON** pour remplir l’éditeur.
3. **Modifiez** dans l’éditeur intégré à la page. Un indicateur de modification apparaît à côté de la barre d’outils.
4. Cliquez sur **Convertir en ICC**. L’enveloppe construit un nouveau profil, relance la validation et met à jour les onglets En-tête / Balises / Validation.
5. Une pastille **● Modifié — non enregistré** apparaît à côté du nom du fichier dans la barre de l’onglet Profil.
6. Cliquez sur **Enregistrer le profil ICC**. Les octets modifiés sont téléchargés sous le nom `<original>-edited.icc`.

Les deux éditeurs sont indépendants — modifier le XML puis le JSON ne mélange pas les deux chemins. Ce sont les octets ICC produits le plus récemment qui sont enregistrés.

<div class="note">
<strong>Mise en garde :</strong> la fidélité de la conversion dépend de ce que IccLibXML / l’enveloppe JSON prennent en charge pour chaque type de balise. Si un type de balise n’est pas représentable, l’aller-retour perdra des détails ; consultez l’onglet Validation après la reconversion pour vérifier que tout s’analyse toujours correctement.
</div>

L’onglet Balises met en évidence toute balise dont les octets diffèrent de ceux du chargement initial, ce qui permet de voir facilement ce que vos modifications ont changé.

---

## 6. Lancement depuis chardata {#6-launching-from-chardata src=b39a6805}

Dans **chardata**, après avoir chargé un profil ICC, cliquez sur **Afficher le fichier** pour ouvrir la visionneuse intégrée à la page, puis sur **Lancer l’éditeur**. Un nouvel onglet s’ouvre ici avec `?source=chardata` dans l’URL.

Le transfert se fait entièrement dans le navigateur :

1. profiletool s’ouvre, détecte `?source=chardata` et envoie `{type:'profiletool:ready'}` à `window.opener` via `postMessage`.
2. chardata répond avec `{type:'profiletool:load', filename, bytes}`.
3. profiletool accepte les octets (après avoir vérifié l’origine de l’expéditeur par rapport à une liste d’autorisation et la taille par rapport au plafond de 256 Mo), lance la validation et affiche le profil.

Aucun envoi, aucun aller-retour avec un serveur. Le flux est à sens unique — les modifications faites ici s’enregistrent en cliquant sur **Enregistrer le profil ICC** et ne sont pas renvoyées à chardata.

---

## 7. Lancement avec une URL {#7-launching-with-a-url src=f9a8d871}

Vous pouvez ouvrir l’outil avec un lien qui indique un profil à charger — et l’onglet à afficher — à l’aide d’un **fragment d’URL** (la partie qui suit `#`) :

```
https://chardata.colourbill.com/profiletool#url=<profile-url>&tab=<tab>
```

Les deux paramètres sont facultatifs :

- **`url=`** — l’adresse web d’où le profil est récupéré. Les octets sont téléchargés dans votre navigateur puis suivent exactement le même chemin qu’un fichier local : le contrôle d’en-tête `acsp`, le `ValidateIccProfile` complet, le plafond de taille de 256 Mo et le repli au mieux pour les profils impossibles à analyser. Rien n’est envoyé — les octets récupérés alimentent uniquement le validateur et ne sont jamais renvoyés.
- **`tab=`** — la vue à ouvrir une fois le profil chargé.

Un exemple complet :

```
https://chardata.colourbill.com/profiletool#url=https://example.org/profiles/sRGB.icc&tab=VAL
```

<div class="note">
<strong>Pourquoi un fragment plutôt qu’une chaîne de requête ?</strong> La partie qui suit <code>#</code> n’est jamais envoyée à un serveur web ; l’adresse du profil que vous inspectez reste donc sur votre propre machine.
</div>

### Noms des onglets {#tab-names src=d3a4dbae}

`tab=` accepte deux schémas de nommage interchangeables et insensibles à la casse. Les codes **courts** sont la forme recommandée :

| Vue | Code court | Nom long |
|---|---|---|
| En-tête | `HEADER` | `Header` |
| Balises | `TAGS` | `Tags` |
| Validation | `VAL` | `Validation` |
| Analyse | `ANALYSIS` | `Analysis` |
| XML | `XML` | `XML` |
| JSON | `JSON` | `JSON` |

Les noms longs sont les libellés anglais des onglets, sans espaces ; ils restent en anglais quelle que soit la langue de l’interface. Les deux schémas restent stables même si les libellés visibles sont renommés, afin que les liens existants continuent de fonctionner. L’onglet Validation répond aussi à l’ancien code `PAWG` (il s’intitulait autrefois « Profile Assessment WG »). Une valeur de `tab=` non reconnue est ignorée et la vue En-tête s’ouvre.

<div class="note">
<strong>Conditions pour <code>url=</code> :</strong> le profil doit être servi en <strong>HTTPS</strong>, et le serveur qui l’héberge doit autoriser les lectures cross-origin (un en-tête <code>Access-Control-Allow-Origin</code> / CORS permissif). Si l’une de ces conditions manque, le navigateur bloque le téléchargement et l’outil affiche une erreur de récupération. Si l’URL du profil contient elle-même <code>&</code> ou <code>#</code> (sa propre chaîne de requête), encodez en pourcentage toute la valeur de <code>url=</code> pour que ces caractères ne terminent pas le fragment prématurément.
</div>

---

## 8. Mobile {#8-mobile src=cb948e3c}

Sur les écrans de moins de 700 px de large :

- Le panneau des paramètres se replie en un tiroir qui glisse depuis la droite.
- Un bouton flottant **⚙** en haut à droite ouvre / ferme les paramètres.
- Un bouton **?** sous ⚙ ouvre ce guide dans son volet coulissant.
- Un bouton **✉** ouvre le formulaire de contact dans un nouvel onglet du navigateur.
- Toucher l’arrière-plan assombri ferme le tiroir ouvert.
- Le tableau des balises passe d’une grille large à des cartes empilées, pour que chaque colonne reste lisible sans défilement horizontal ; une balise se déplie toujours sur place.
- **Le toucher remplace le glisser-déposer.** iOS ne gère pas le glisser-déposer ; faire glisser un profil du pool vers un onglet n’y fonctionne donc pas. À la place, **touchez les profils pour les sélectionner, puis touchez l’onglet** voulu — le résultat est le même qu’avec le glisser-déposer. Le pool affiche ce rappel quand un écran tactile est utilisé.
- **Sur iPhone et iPad, les sélecteurs de fichiers listent tous les fichiers.** iOS compare un filtre de type de fichier aux types qu’il connaît, et il n’en connaît aucun pour `.icc`, `.icm`, `.cube` ou `.exr` ; filtrer griserait donc précisément les fichiers que vous voulez ouvrir. Choisissez le profil par son nom ; tout ce qui n’est pas un profil est quand même refusé, avec un motif, après le chargement.

Toutes les fonctions sont disponibles ; la mise en page s’adapte à l’écran plus petit.

---

## 9. Limites et sécurité {#9-limits-and-security src=ce1e9474}

profiletool n’effectue aucune requête réseau après le chargement initial de la page. Le validateur, le convertisseur XML, le convertisseur JSON et les codecs d’image sont tous du WebAssembly compilé à partir de sources C++ et s’exécutent entièrement côté client. L’onglet HDR affiche une image déposée via une URL d’objet locale ; l’image ne quitte donc jamais l’onglet. **Identifier les écrans** interroge le navigateur, et non un serveur, pour savoir sur quel moniteur se trouve la fenêtre.

| Limite | Où | Remarques |
|---|---|---|
| **256 Mo** | postMessage / chargement de fichier | Refuse de charger tout fichier plus volumineux ; empêche l’épuisement du tas par une fenêtre d’origine malveillante |
| **32 Mo** | Convertisseurs XML et JSON | Le garde-fou JS (`MAX_XML_BYTES` / `MAX_JSON_BYTES`) et les enveloppes C++ (`kMaxXmlBytes` / `kMaxJsonBytes`) appliquent tous deux cette limite ; le côté C++ fait foi de manière indépendante |
| **Protection contre les bombes d’entités XML** | Convertisseur XML | Tout XML contenant `<!DOCTYPE` ou `<!ENTITY`, ou un octet NUL, est rejeté avant que libxml2 ne le voie. Les propres limites d’expansion d’entités de libxml2 sont aussi actives ; ce contrôle constitue donc une seconde ligne de défense contre les entrées de type « billion laughs » |
| **512 Mo** | Fichier de l’onglet HDR | Vérifié d’après la taille du fichier avant toute lecture ; reprend le plafond d’entrée de 512 Mo des codecs d’image |
| **40 mégapixels**, **64 pixels par octet** | Décodage Radiance HDR (onglet HDR) | Tous deux vérifiés d’après l’en-tête et la taille du fichier avant toute allocation de mémoire pour les pixels ; le second refuse les bombes de décompression à marqueurs de répétition |
| **Budget de décodage EXR** | Décodage OpenEXR | Largeur × hauteur × canaux × 4 octets doit tenir dans 512 Mo, vérifié d’après l’en-tête avant que le décodeur n’alloue quoi que ce soit |
| **Parcours des boîtes HEIC/AVIF** | Extraction du profil | Les tailles des boîtes sont vérifiées sans débordement, l’imbrication est limitée à 8, un profil à 64 Mo (par fichier, au total) et les associations d’éléments à 65 536 |
| **Liste d’autorisation des origines** | Lancement par postMessage | Seules l’origine identique et les origines de développement de chardata peuvent envoyer des octets `profiletool:load` |
| **HTTPS + CORS** | Lancement `#url=` | Un profil lancé par URL doit être servi en HTTPS par un hôte qui autorise les lectures cross-origin ; les octets récupérés alimentent uniquement le validateur et ne sont jamais renvoyés |

Le lancement `#url=` (ajouté en 1.1.5) est le seul cas où l’outil effectue une requête vers une autre origine après le chargement de la page : il élargit la directive `connect-src` de la Content-Security-Policy à `https:` afin que le profil désigné puisse être récupéré. Le chargement de scripts n’est **pas** élargi — seules les récupérations de données le sont.

Si vous devez inspecter un profil qui dépasse ces limites, compilez iccDEV à partir des sources et utilisez les outils natifs en ligne de commande — ils n’ont pas de plafonds côté JS.

### Licence {#licence src=e7a2a884}

profiletool est publié sous licence MIT. L’application inclut aussi des composants tiers sous leurs propres licences : IccProfLib d’iccDEV (International Color Consortium), LibTIFF, libpng, zlib, libxml2, JSON for Modern C++, le runtime Emscripten et des paquets JavaScript dont React, Plotly et CodeMirror. Ce logiciel est basé en partie sur les travaux de l’Independent JPEG Group. Les avis complets se trouvent dans [THIRD-PARTY-NOTICES.txt](THIRD-PARTY-NOTICES.txt).

### Couverture d’ICC.2 (iccMAX) {#icc-2-iccmax-coverage src=3d2b33e8}

Les profils **ICC.1** et **ICC.2** sont tous deux pris en charge, mais la couverture d’ICC.2 est **incomplète**. Le chargement, les vues de l’en-tête et des balises, la validation, l’aller-retour XML/JSON et les moteurs de transformation comprennent tous ICC.2 ; les lacunes connues sont les flux d’échange **ICS** en plusieurs parties, le choix d’un **sous-profil** V5 lors de l’application d’une transformation, et la recherche inverse sur certains profils ICC.2. Un profil utilisant une construction ICC.2 non prise en charge est signalé par l’onglet Validation plutôt que mal lu en silence.
