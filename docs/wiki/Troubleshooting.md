# Troubleshooting

## "Save not found" (*Sauvegarde introuvable*)

The app searches the Ubisoft Connect `savegames` folders on all your drives. If it finds nothing:

1. Start Far Cry Primal and play until the game saves once.
2. Click **⟳** in the map.
3. Still nothing? Click **Choose the save folder** (*Choisir le dossier des sauvegardes*, or **📁**) and
   select the folder of your saves. You can also select a parent folder, such as `savegames`: the app
   looks inside it.

Usual location: `C:\Program Files (x86)\Ubisoft\Ubisoft Game Launcher\savegames\<numbers>\2010`
(the last number can differ for the Steam or Epic versions). To go back to the automatic search, click
**Automatic search** (*Recherche automatique*).

## The map does not open in the browser

Open your browser yourself and go to `http://localhost:4173`. The address is also shown in the black
window.

## "The map is already open"

If you start `OrosMap.exe` twice, the second start only opens the browser on the map that is already
running.

## Nothing happens when I double-click OrosMap.exe

Make sure you extracted the **whole** zip (do not start the program from inside the zip). The black
window explains the problem if files are missing.

## My antivirus blocks the program

Some antivirus programs distrust unsigned programs. `OrosMap.exe` only starts `runtime\node.exe`
(Node.js, an open-source program) with the map server. You can add an exception, or check the source code
on GitHub.

## Still stuck?

Open an [issue](https://github.com/programgames/far-cry-primal-map/issues) with the text of the black window.
