# Feuille de route de Maquette

Décidée avec l'utilisateur le 2026-10-28. Le nouveau look passe en dernier et sera dessiné avec Maquette elle-même.

## En cours
- Interface en anglais (traduction de toute l'interface ; consignes de Claude inchangées).

## Chantiers, dans l'ordre
0. ~~**Enregistrement automatique**~~ — fait le 2026-10-29 (2 s après la dernière modification, 10 s au plus en continu ; option « Auto-save » du menu du fichier). Demande d'origine : le fichier `.maquette` s'enregistre tout seul quelques secondes après chaque modification (aujourd'hui, seule une copie de secours est écrite toutes les 5 s ; le vrai fichier attend Ctrl+S). Fichier jamais enregistré : reste en copie de secours jusqu'au premier « Save as ».
1. ~~**Fenêtre Variables**~~ — fait.  une vraie fenêtre (modal) au centre, couleurs à gauche, styles de texte à droite, à la place du petit panneau flottant.
2. ~~**Curseur de Claude**~~ — fait, avec apparition progressive de ce qu'il crée.  un curseur nommé glisse vers l'élément modifié et l'entoure un instant, depuis le chat intégré et depuis le MCP.
3. ~~**Maquette sans l'app ouverte**~~ — fait le 2026-10-29 (outil `fichier`, relais qui lance l'app sans fenêtre, arrêt après 10 min sans appel). Prévu : Claude ouvre, modifie et enregistre un `.maquette` en mode sans fenêtre (captures par un rendu invisible) ; app ouverte = passage par l'app comme aujourd'hui.
4. **Plusieurs Claude en parallèle** : un curseur et une couleur par agent ; **sélecteur Variants (1–4) dans la zone de saisie du chat**, un agent par variante, chaque version posée à côté de l'original avec un bouton « Garder ».
5. **Interactions et animations** : états (survol, appuyé, focus), transitions, animations d'entrée au défilement et boucles, mode aperçu ▶ vivant, liens entre pages (prototype). Claude peut les poser.
6. **Composants** : ~~maîtres et instances liées avec surcharges~~ — fait le 2026-10-29. Reste : variantes (normal, survol, désactivé) et propriétés de composant.
7. **Partir de l'existant** :
   - site → maquette (adresse d'un site client → calques modifiables, vrais textes, images, couleurs) ;
   - capture → maquette (image d'un site → calques reconstruits par Claude) ;
   - ~~import des fichiers `.pen`~~ — fait le 2026-10-29 (avec calque vecteur, remplissage image, flous, dégradé conique, icônes Phosphor/Feather/Material Rounded).
8. **Bibliothèque perso** :
   - sections réutilisables d'un fichier à l'autre, utilisables par Claude ;
   - marque par client (couleurs, polices, logo) appliquée à chaque nouvelle page.
9. **Livrer** :
   - export HTML en un seul fichier (pour WordPress, projet Devi « Avance pour toi ») ;
   - export Astro + Tailwind ;
   - présentation client : prototype cliquable desktop + mobile, à envoyer par lien ;
   - mises en scène dans des appareils (ordinateur, téléphone, tablette).
10. **Qualité automatique** :
    - contrôle avant livraison (contraste, texte trop petit sur mobile, espacements, images lourdes, liens morts), correction en un clic par Claude ;
    - bouton « annuler toute la réponse de Claude » dans le chat ;
    - historique de versions nommées.
11. **Autres idées notées** : responsive (ordinateur, tablette, mobile), notes épinglées sur le canevas traitées par Claude, recadrage d'image et point focal, photos Unsplash/Pexels.
12. **Nouveau look** (s'éloigner de Figma), dessiné dans Maquette.
