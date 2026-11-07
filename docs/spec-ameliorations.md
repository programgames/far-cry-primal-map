# Spécification — améliorations de la carte de progression (v2.1)

Date : 2026-11-06. Statut : **validée ; lots A, B et C implémentés et vérifiés le 2026-11-06.**

Les termes *ramassé*, *terminée*, *débloqué*, *découvert*, *révélé* et *élément non suivi* ont le sens de [`GLOSSARY.md`](../GLOSSARY.md).

> **Version 3 (2026-11-06) :** les données et le fond de carte de MapGenie sont remplacés par ceux du jeu
> (`tools/game/build_data.py`, `build_tiles.py`) ; les coordonnées sont celles du jeu, en mètres. Les mentions
> de MapGenie ci-dessous décrivent la version 2. Distribution : `tools/package.js` (voir le README).

## Principes

- La sauvegarde du jeu reste la seule source de la progression. Aucune saisie manuelle.
- Les préférences d'affichage (filtres, interrupteurs, onglet) restent dans le navigateur (`localStorage`), comme aujourd'hui.
- Chaque lot se livre seul et se vérifie sur la partie réelle de l'utilisateur.

## Découpage en lots

| Lot | Points | Nature | Risque |
| --- | --- | --- | --- |
| A | 1, 2, 3, 4, 5, 7, 8, 9 | Affichage seulement, données déjà disponibles | Faible |
| B | 6, 12 | Nouvelles données statiques (index) + affichage | Moyen |
| C | 10, 11 | Décodage de nouvelles parties de la sauvegarde | Élevé : étude d'abord, puis décision |

---

## Lot A — affichage

### 1. Masquer les éléments faits

- **Besoin :** voir d'abord ce qui reste à faire.
- **Comportement :**
  - Un interrupteur « Masquer les éléments faits » apparaît en haut de l'onglet Filtres.
  - Activé, il retire de la carte et de la liste des lieux chaque élément suivi qui a atteint son état visé.
  - Les éléments non suivis restent visibles (ils n'ont pas d'état).
  - Les compteurs des filtres ne changent pas (ils comptent toujours tout).
  - Quand une nouvelle sauvegarde coche un élément, il disparaît tout de suite si l'interrupteur est activé.
- **Valeur par défaut :** désactivé. La valeur choisie est mémorisée.
- **Acceptation :** interrupteur activé, Bracelet wenja montre 22 icônes au lieu de 25 sur votre partie actuelle (3 ramassés).
- **Fichiers :** `public/index.html`, `public/app.js`, `public/styles.css`.

### 2. Zones de chasse masquées par défaut

- **Comportement :** au premier chargement (aucune préférence mémorisée), les catégories du groupe « Zones de chasse » sont décochées. Si l'utilisateur les coche, ce choix est mémorisé et respecté ensuite.
- **Migration :** la clé de préférences passe de `oros.ui.v2` à `oros.ui.v3`, pour appliquer ce défaut une fois à l'installation de la mise à jour.
- **Acceptation :** dans un navigateur sans préférence, aucune icône d'animal n'apparaît ; le groupe « Zones de chasse » est décoché et affiche toujours son nombre (210).

### 3. Un seul pourcentage clair

- **Comportement :** le panneau de résumé affiche :
  - en grand : « 23,6 % » avec le libellé « Progression du jeu » (valeur `Progression` de la sauvegarde) ;
  - la barre suit ce pourcentage ;
  - en petit, en dessous : « 77 / 406 éléments de la carte · 4 h 36 de jeu ».
- Le pourcentage calculé par la carte (19 %) n'est plus affiché.
- **Acceptation :** un seul symbole « % » est visible dans le panneau.

### 4. Bulle plus précise

- **Comportement :** la ligne d'état de la bulle dit toujours l'état visé, puis l'état actuel s'il existe :
  - fait : « ✓ Débloqué » (inchangé) ;
  - pas fait, sans état : « Pas encore débloqué » (inchangé) ;
  - pas fait, révélé : « Pas encore débloqué · révélé sur la carte du jeu » ;
  - même règle pour *découvert* : « Pas encore découvert · révélé sur la carte du jeu ».
- La même phrase apparaît sous le nom dans la liste des lieux.
- **Acceptation :** la bulle du Bûcher de la sagaie ardente affiche « Pas encore débloqué · révélé sur la carte du jeu ».

### 5. Liste des lieux : à faire en premier

- **Comportement :**
  - La liste trie les lieux en trois blocs : à faire, faits, non suivis. L'ordre actuel reste à l'intérieur de chaque bloc.
  - L'interrupteur du point 1 s'applique aussi à la liste.
- **Acceptation :** sur votre partie, le premier lieu de la liste n'a pas de coche.

### 7. Vue de départ

- **Comportement :** au chargement, la carte cadre la zone jouable d'Oros (les lieux du jeu) en remplissant la hauteur de l'écran, sans la limite actuelle de zoom 11 qui laisse un grand fond noir. « Recentrer la carte » utilise le même cadrage.
- **Acceptation :** sur un écran de 1568 × 751 px, la zone jouable occupe toute la hauteur de la carte.

### 8. Lignes entre les tuiles

- **Comportement :** aucune ligne sombre visible entre les tuiles, à tous les zooms.
- **Cause trouvée :** les lignes apparaissent seulement aux zooms fractionnaires (Leaflet laisse voir le niveau de tuiles précédent entre les tuiles). Agrandir les tuiles d'un pixel les rend claires au lieu de sombres, sans les supprimer.
- **Solution retenue :** zoom par niveaux entiers (`zoomSnap: 1`). Conséquence pour le point 7 : la vue de départ prend le niveau entier qui fait tenir Oros dans l'écran.
- **Acceptation :** aucune ligne visible au zoom 12 dans Chrome.

### 9. Informations inutiles

- **Comportement :**
  - Le badge « 623 lieux · carte hors-ligne » disparaît.
  - Le chemin du fichier de sauvegarde disparaît du pied du panneau. Il apparaît en info-bulle au survol de la ligne « Sauvegarde du … ».
- **Acceptation :** le pied du panneau ne contient plus que « Recentrer la carte ».

---

## Lot B — nouvelles données statiques

### 6. Missions rangées par personnage

- **Besoin :** suivre chaque ligne de missions dans l'ordre du jeu.
- **Comportement :**
  - L'onglet Missions garde trois groupes : Histoire, Spécialistes, Village.
  - Dans « Spécialistes », un sous-groupe par personnage, avec son compteur (par exemple « Jayma 2/3 »).
  - Dans chaque sous-groupe, les missions suivent l'ordre du jeu (ordre des numéros de code).
  - Les titres passent en casse normale (« Les Wenja capturés ») ; les noms propres gardent leur majuscule.
- **Données :**
  - Famille de code → personnage : table écrite à la main dans `tools/game/build_index.py`, vérifiée avec les pages de personnages de `E:\fcp-wiki-fr` (titres français officiels). Familles concernées : `smc`, `smcm`, `smcn`, `smg`, `smh`, `sms`, `smw`, `owma`, `shv`, `shc`, `shl`.
  - Casse : la fonction `nice_case` de `E:\fcp-extract\scripts\build_fr.py` (déjà utilisée pour les lieux).
- **Acceptation :** chaque mission « Spécialistes » appartient à un sous-groupe nommé ; aucun titre n'est entièrement en majuscules.
- **Implémenté autrement (meilleure source) :** les groupes et l'ordre viennent de la palette `Modèle:FCP missions` du wiki FR (lignes « L'histoire de Sayla », « … de Tensay », etc., avec les titres officiels en casse normale), au lieu d'une table écrite à la main. 52 missions sur 64 y sont ; les 12 autres vont dans le groupe de leur famille (Conclusion, Missions de grotte…), avec une casse corrigée par les noms propres du wiki. Les groupes sont à plat (pas de niveau « Spécialistes »).

### 12. Missions situées sur la carte

- **Besoin :** savoir où aller pour lancer une mission.
- **Comportement :**
  - Dans l'onglet Missions, une mission qui a une position porte un bouton « Voir sur la carte ».
  - Un clic centre la carte sur le donneur de la mission et affiche un repère temporaire avec le titre.
  - Une mission sans position n'a pas de bouton.
- **Données :** marqueurs de carte du jeu dont le nom contient le code de la mission et `giver` ou `missionlocation` (`work/markers.json`). 77 codes en ont un. `build_index.py` ajoute la position (convertie par `calib.json`) à chaque mission de `missionList`.
- **Acceptation :** « Les Wenja capturés » (`mis_030`) a un bouton qui centre la carte sur son donneur.
- **Résultat :** 55 missions sur 64 ont une position. Les 9 autres (par exemple « La chasse », « En chasse ») n'ont pas de marqueur de donneur dans les données du jeu.

---

## Lot C — nouvelles parties de la sauvegarde (étude d'abord)

Chaque point commence par une étude limitée. L'étude se termine par une décision : implémenter, ou abandonner et l'expliquer.

### 10. Brouillard de guerre

- **Besoin :** voir les zones de la carte jamais explorées.
- **Faits connus :** la sauvegarde contient `CFogOfWarService / FogData`, avec `Size = 2902` et un bloc `Data` de 2 902 octets. Le format est inconnu (grille de bits probable, environ 150 × 150 cases).
- **Étude :**
  1. Comparer `FogData` entre `1.save` et `2.save`, puis avant et après une exploration courte en jeu.
  2. Afficher le bloc comme une image de bits à plusieurs largeurs, et chercher la forme d'Oros.
- **Décision « oui » si :** l'image obtenue montre les zones explorées à leur place sur la carte (calage vérifié sur 3 points connus).
- **Comportement si oui :** un calque sombre et semi-transparent couvre les zones non explorées. Un interrupteur dans les filtres l'active ; il est désactivé par défaut.
- **Résultat de l'étude (2026-11-06) : oui, implémenté.**
  - `FogData.Data` est un flux **LZO1X** (sa taille varie avec l'exploration : 2 902, puis 3 014 octets). Décompressé, il donne 131 072 octets : une grille de **1024 × 1024 bits** (1 = exploré ; ligne 0 au nord ; bit de poids faible = case la plus à l'ouest).
  - Calage : la grille couvre le monde de −5 000 à +5 000 m (cases de 9,77 m). 98,8 % des lieux découverts de la sauvegarde tombent dans une case explorée ; à l'écran, toutes les coches vertes sont dans la zone claire.
  - Code : `public/savefile.js` (décodeur, `fogBitmap`), route `/api/fog`, bords dans `game-index.json` (`fog`), interrupteur « Assombrir les zones inexplorées ».

### 11. Compétences et artisanat

- **Besoin :** voir les compétences obtenues et les améliorations d'armes restantes.
- **Faits connus :**
  - La sauvegarde liste 47 compétences (`Abilities.abilityName`, hash de 32 bits) et 214 objets avec un niveau (`Item.iCurrentLevel`).
  - Les noms français des compétences existent (`strings.json`, section `Abilities`, 171 textes), mais leur lien avec les hash de la sauvegarde n'est pas trouvé.
  - Les recettes d'artisanat sont dans `work/ndb/craftingrecipe` (241 recettes) ; leur lien avec les objets de la sauvegarde n'est pas trouvé.
- **Étude :** chercher la base des compétences du jeu (fichier `.ndb` ou `.fcb` qui relie nom interne, hash et texte) dans les archives extraites, puis dans `primal_main.dat` si besoin.
- **Décision « oui » si :** au moins 90 % des compétences de la sauvegarde reçoivent un nom français.
- **Comportement si oui :** un onglet « Compétences » liste les arbres de compétences, avec les compétences obtenues cochées ; une section « Artisanat » liste les armes et leur niveau actuel sur le niveau maximal.
- **Résultat de l'étude, artisanat (2026-11-06) : oui, implémenté.**
  - Lien trouvé : `Item.d8f2aab5` (nom inconnu) = `arkArchetype` de la recette dans `craftingrecipe` ; `Item.bCraftedAtLeastOnce` = 1 si l'objet a été fabriqué.
  - Les améliorations sont les recettes de type 5, rangées en chaînes (`arkPreRequisiteRecipe`) avec leur niveau (`iCurrentLevel` + 1). Les entrées « XX - Archived » et l'identifiant 0 (niveau final fictif) sont écartés : 55 améliorations en 25 groupes.
  - Affichage : onglet « Atelier », un groupe par objet (Arc, Gourdin, Carquois…), chaque niveau coché s'il est fabriqué. Votre partie : 16 sur 55.
  - Limite constatée : la sauvegarde peut marquer un niveau supérieur fabriqué sans le niveau précédent (Gourdin 3 et 4 sans le 2). L'onglet affiche la sauvegarde telle quelle.
- **Résultat de l'étude, compétences (2026-11-06) : oui, implémenté.**
  - `abilityName` = CRC32 du nom interne (`SP_TameAnimalsA`…). Les 47 hash de la sauvegarde sont tous retrouvés, surtout dans `generated/nomadobjecttemplates.fcb`, converti en XML (`work/fcb/nomadobjecttemplates.fcb.converted.xml`), qui donne aussi le texte français (`locidLocalizedSkillName`).
  - Arbres et ordre : page « Compétences (Far Cry Primal) » du wiki FR (8 arbres, de Takkar à Roshani). Ses 80 compétences sont toutes reliées au jeu.
  - Affichage : l'onglet s'appelle « Compétences » ; il montre les arbres, puis la section « Atelier ». Votre partie : 33 compétences sur 80.

---

## Hors périmètre

- Modifier la sauvegarde du jeu (lecture seule, toujours).
- Suivi des zones de chasse et des clins d'œil (le jeu ne les enregistre pas).
- Plusieurs parties ou plusieurs comptes : l'application lit toujours la sauvegarde la plus récente.
