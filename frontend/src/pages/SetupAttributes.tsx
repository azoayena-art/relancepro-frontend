import { useState } from 'react';
import { databases, DATABASE_ID } from '../appwrite';
import { CheckCircle2, XCircle, Loader2, AlertTriangle } from 'lucide-react';

interface AttrResult {
  name: string;
  status: 'pending' | 'success' | 'error' | 'exists';
  message?: string;
}

export default function SetupAttributes() {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<AttrResult[]>([]);

  const ATTRIBUTES_TO_CREATE = [
    { name: 'tvaRates', type: 'string', size: 10000, required: false },
    { name: 'currency', type: 'string', size: 10, required: false },
    { name: 'defaultTvaRate', type: 'string', size: 10, required: false },
    { name: 'publicSlug', type: 'string', size: 100, required: false },
    { name: 'logoFileId', type: 'string', size: 100, required: false },
    { name: 'name', type: 'string', size: 200, required: false },
    { name: 'legalForm', type: 'string', size: 100, required: false },
    { name: 'address', type: 'string', size: 500, required: false },
    { name: 'siret', type: 'string', size: 50, required: false },
    { name: 'rcs', type: 'string', size: 100, required: false },
    { name: 'tvaNumber', type: 'string', size: 200, required: false },
    { name: 'phone', type: 'string', size: 50, required: false },
    { name: 'email', type: 'string', size: 200, required: false },
  ];

  const runSetup = async () => {
    setRunning(true);
    setResults(ATTRIBUTES_TO_CREATE.map(a => ({ name: a.name, status: 'pending' })));

    const newResults: AttrResult[] = [];

    for (const attr of ATTRIBUTES_TO_CREATE) {
      try {
        // Vérifier si l'attribut existe déjà
        const existing = await databases.listAttributes(DATABASE_ID, 'company_settings');
        const alreadyExists = existing.attributes.some((a: any) => a.key === attr.name);

        if (alreadyExists) {
          newResults.push({ name: attr.name, status: 'exists', message: 'Existe déjà' });
          setResults([...newResults]);
          continue;
        }

        // Créer l'attribut
        await databases.createStringAttribute(
          DATABASE_ID,
          'company_settings',
          attr.name,
          attr.size,
          attr.required
        );

        // Attendre que l'attribut soit disponible
        await new Promise(resolve => setTimeout(resolve, 1500));

        newResults.push({ name: attr.name, status: 'success', message: 'Créé avec succès' });
      } catch (e: any) {
        const msg = e.message || 'Erreur inconnue';
        if (msg.includes('already exists')) {
          newResults.push({ name: attr.name, status: 'exists', message: 'Existe déjà' });
        } else {
          newResults.push({ name: attr.name, status: 'error', message: msg });
        }
      }
      setResults([...newResults]);
    }

    setRunning(false);
  };

  const successCount = results.filter(r => r.status === 'success').length;
  const existsCount = results.filter(r => r.status === 'exists').length;
  const errorCount = results.filter(r => r.status === 'error').length;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 p-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
          🛠️ Setup — Attributs company_settings
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mb-6">
          Ce script crée automatiquement les attributs manquants dans la collection <code className="bg-slate-200 dark:bg-slate-700 px-2 py-0.5 rounded">company_settings</code>.
        </p>

        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 mb-6">
          <button
            onClick={runSetup}
            disabled={running}
            className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-semibold py-3 px-6 rounded-lg flex items-center justify-center gap-2 transition-colors"
          >
            {running ? (
              <><Loader2 size={18} className="animate-spin" /> Création en cours...</>
            ) : (
              '🚀 Lancer la création des attributs'
            )}
          </button>
        </div>

        {results.length > 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
            <div className="grid grid-cols-3 gap-4 mb-4 pb-4 border-b border-slate-200 dark:border-slate-700">
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">{successCount}</p>
                <p className="text-xs text-slate-500">Créés</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-600">{existsCount}</p>
                <p className="text-xs text-slate-500">Existants</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-red-600">{errorCount}</p>
                <p className="text-xs text-slate-500">Erreurs</p>
              </div>
            </div>

            <div className="space-y-2">
              {results.map((r, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    {r.status === 'success' && <CheckCircle2 size={18} className="text-green-600" />}
                    {r.status === 'exists' && <CheckCircle2 size={18} className="text-blue-500" />}
                    {r.status === 'error' && <XCircle size={18} className="text-red-500" />}
                    {r.status === 'pending' && <Loader2 size={18} className="text-slate-400 animate-spin" />}
                    <span className="font-mono text-sm text-slate-900 dark:text-white">{r.name}</span>
                  </div>
                  <span className={`text-xs ${
                    r.status === 'success' ? 'text-green-600' :
                    r.status === 'exists' ? 'text-blue-500' :
                    r.status === 'error' ? 'text-red-500' :
                    'text-slate-400'
                  }`}>
                    {r.status === 'pending' ? 'En cours...' : r.message}
                  </span>
                </div>
              ))}
            </div>

            {!running && successCount + existsCount === ATTRIBUTES_TO_CREATE.length && (
              <div className="mt-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 size={18} className="text-green-600" />
                  <span className="font-semibold text-green-900 dark:text-green-200">
                    ✅ Setup terminé avec succès !
                  </span>
                </div>
                <p className="text-sm text-green-800 dark:text-green-300">
                  Tu peux maintenant retourner sur <strong>Paramètres entreprise</strong> et enregistrer.
                </p>
              </div>
            )}

            {!running && errorCount > 0 && (
              <div className="mt-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle size={18} className="text-red-600" />
                  <span className="font-semibold text-red-900 dark:text-red-200">
                    ⚠️ Erreurs détectées
                  </span>
                </div>
                <p className="text-sm text-red-800 dark:text-red-300">
                  Vérifie que tu es bien connecté et que tu as les droits sur la base de données.
                </p>
              </div>
            )}
          </div>
        )}

        <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <p className="text-sm text-blue-900 dark:text-blue-200">
            <strong>💡 Note :</strong> Ce script utilise les permissions de ton utilisateur connecté.
            Si tu as les droits admin, il fonctionnera sans problème. Une fois terminé, tu peux supprimer ce fichier.
          </p>
        </div>
      </div>
    </div>
  );
}