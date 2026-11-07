// Lanceur Windows de la carte d'Oros : démarre runtime\node.exe app\server.js --open.
// Compilé par tools/package.js avec le compilateur C# fourni avec Windows (.NET Framework 4).
using System;
using System.Diagnostics;
using System.IO;
using System.Text;

class Launcher
{
    static int Main()
    {
        bool fr = System.Globalization.CultureInfo.CurrentUICulture.TwoLetterISOLanguageName == "fr"; // sinon anglais
        Console.Title = fr ? "Carte d'Oros - Far Cry Primal" : "Oros Map - Far Cry Primal";
        Console.OutputEncoding = Encoding.UTF8; // Node écrit en UTF-8 (accents)
        string root = AppDomain.CurrentDomain.BaseDirectory;
        string node = Path.Combine(root, "runtime", "node.exe");
        string app = Path.Combine(root, "app");
        string server = Path.Combine(app, "server.js");
        if (!File.Exists(node) || !File.Exists(server))
        {
            Console.WriteLine(fr ? "Des fichiers de l'application sont introuvables." : "Some files of the app are missing.");
            Console.WriteLine(fr ? "Décompressez d'abord TOUT le fichier .zip dans un dossier, puis lancez OrosMap.exe depuis ce dossier."
                                 : "First extract the WHOLE .zip file into a folder, then start OrosMap.exe from that folder.");
            Console.WriteLine();
            Console.WriteLine(fr ? "Appuyez sur une touche pour fermer." : "Press any key to close.");
            Console.ReadKey();
            return 1;
        }
        var start = new ProcessStartInfo(node, "\"" + server + "\" --open")
        {
            UseShellExecute = false,
            WorkingDirectory = app,
        };
        using (var process = Process.Start(start))
        {
            process.WaitForExit();
            if (process.ExitCode != 0)
            {
                Console.WriteLine();
                Console.WriteLine(fr ? "La carte s'est arrêtée avec une erreur. Appuyez sur une touche pour fermer."
                                     : "The map stopped with an error. Press any key to close.");
                Console.ReadKey();
            }
            return process.ExitCode;
        }
    }
}
