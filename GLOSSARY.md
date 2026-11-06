# Carte d'Oros — progression Far Cry Primal

Carte locale d'Oros qui affiche la progression d'une partie de Far Cry Primal, lue dans la sauvegarde du jeu.

## Source

**Sauvegarde**:
Le fichier de partie écrit par le jeu ; c'est la seule source de la progression affichée.
_Avoid_: save, progression manuelle, cochage

**Partie**:
La progression d'un joueur dans la campagne, telle que la sauvegarde la plus récente la décrit.
_Avoid_: emplacement, slot

## Éléments

**Élément**:
Une chose du jeu dont la sauvegarde connaît l'état : mission, objet à collectionner, lieu, grotte, feu, avant-poste.
_Avoid_: lieu (au sens générique), marqueur, point

**Objet à collectionner**:
Un objet unique placé dans le monde et compté pour le 100 % : Main de Daysha, Bracelet Wenja, Masque Izila, Totem, Peinture rupestre, Cache de chasseur.
_Avoid_: collectible, ressource

**Ressource**:
Une matière qui réapparaît après la cueillette (bois, pierre, silex, sacs) ; elle ne compte pas dans la progression.
_Avoid_: objet à collectionner

**Élément non suivi**:
Un repère affiché pour information seulement, sans état, parce que le jeu n'en enregistre aucun : zone de chasse.
_Avoid_: élément manuel, élément à faire

## États

**État visé**:
L'état qui compte un élément comme fait ; il dépend de sa catégorie (ramassé pour un objet à collectionner, débloqué pour un bûcher…).
_Avoid_: objectif, état final

**Ramassé**:
État d'un objet à collectionner que le joueur a pris.
_Avoid_: trouvé, collecté, complété

**Terminée**:
État d'une mission que le joueur a finie.
_Avoid_: complétée, faite, validée

**Découvert**:
État d'un lieu que le joueur a visité lui-même.
_Avoid_: exploré, trouvé

**Révélé**:
État d'un lieu visible sur la carte du jeu sans visite du joueur.
_Avoid_: découvert, connu

**Débloqué**:
État d'un feu, d'un avant-poste ou d'un refuge qui sert de point de voyage rapide.
_Avoid_: capturé, conquis, complété
