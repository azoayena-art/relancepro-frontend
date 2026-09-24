import { useState } from 'react';
import { databases, DATABASE_ID } from '../appwrite';
import { Query, Permission, Role } from 'appwrite';
import { Shield, CheckCircle2, AlertCircle, Loader2, Database, RefreshCw } from 'lucide-react';

interface MigrationResult {
  collection: string;
  total: number;
  updated: number;
  skipped: number;
  errors: string[];
}

export default function SecurityMigration() {
  // ✅ CORRIGÉ : Suppression de _user qui n'existait pas dans le contexte et n'était pas utilisé
  const [migrating, setMigrating] = useState(false);
  const [results, setResults] = useState<MigrationResult[]>([]);
  const [currentStep, setCurrentStep] = useState('');

  const collections = [
    'prospects', 'clients', 'quotes', 'invoices', 'receipts',
    'products', 'categories', 'company_settings', 'roles', 'team_members'
  ];

  const migrateCollection = async (collectionName: string): Promise<MigrationResult> => {
    const result: MigrationResult = {
      collection: collectionName,
      total: 0,
      updated: 0,
      skipped: 0,
      errors: []
    };

    try {
      const response = await databases.listDocuments(DATABASE_ID, collectionName, [Query.limit(1000)]);
      result.total = response.documents.length;
      console.log(`📦 ${collectionName}: ${result.total} documents trouvés`);

      for (const doc of response.documents) {
        try {
          const teamId = (doc as any).teamId;
          if (!teamId) {
            console.warn(`⚠️ ${collectionName}/${doc.$id}: Pas de teamId, ignoré`);
            result.skipped++;
            continue;
          }

          const currentPerms = doc.$permissions || [];
          const expectedPerms = [
            `read("team:${teamId}")`,
            `update("team:${teamId}")`,
            `delete("team:${teamId}")`
          ];

          const hasAllPerms = expectedPerms.every(perm => currentPerms.includes(perm));

          if (hasAllPerms) {
            console.log(`✅ ${collectionName}/${doc.$id}: Déjà sécurisé`);
            result.skipped++;
            continue;
          }

          console.log(`🔒 ${collectionName}/${doc.$id}: Mise à jour des permissions...`);
          await databases.updateDocument(
            DATABASE_ID,
            collectionName,
            doc.$id,
            {},
            [
              Permission.read(Role.team(teamId)),
              Permission.update(Role.team(teamId)),
              Permission.delete(Role.team(teamId))
            ]
          );

          result.updated++;
          console.log(`✅ ${collectionName}/${doc.$id}: Sécurisé`);
        } catch (error: any) {
          const errorMsg = `${collectionName}/${doc.$id}: ${error.message}`;
          console.error(`❌ ${errorMsg}`);
          result.errors.push(errorMsg);
        }
      }
    } catch (error: any) {
      const errorMsg = `Erreur collection ${collectionName}: ${error.message}`;
      console.error(`❌ ${errorMsg}`);
      result.errors.push(errorMsg);
    }

    return result;
  };

  const runMigration = async () => {
    setMigrating(true);
    setResults([]);

    for (const collection of collections) {
      setCurrentStep(`Migration de ${collection}...`);
      const result = await migrateCollection(collection);
      setResults(prev => [...prev, result]);
    }

    setCurrentStep('');
    setMigrating(false);
  };

  const totalUpdated = results.reduce((sum, r) => sum + r.updated, 0);
  const totalSkipped = results.reduce((sum, r) => sum + r.skipped, 0);
  const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
              <Shield size={24} className="text-red-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Migration de sécurité</h1>
              <p className="text-sm text-slate-500">Sécuriser tous les documents existants</p>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
            <div className="flex gap-2">
              <AlertCircle size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-amber-900 mb-1">Attention</h3>
                <p className="text-sm text-amber-800">
                  Cet outil va mettre à jour les permissions de <strong>tous vos documents</strong> pour appliquer la sécurité multi-tenant. 
                  Cette opération est <strong>irréversible</strong> mais peut être relancée sans danger (idempotent).
                </p>
              </div>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <h3 className="font-semibold text-blue-900 mb-2">Ce qui va être fait :</h3>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Scanner {collections.length} collections de votre base de données</li>
              <li>• Vérifier les permissions actuelles de chaque document</li>
              <li>• Appliquer les permissions <code className="bg-blue-100 px-1 rounded">Role.team(teamId)</code> si nécessaire</li>
              <li>• Ignorer les documents déjà sécurisés ou sans teamId</li>
            </ul>
          </div>

          <button
            onClick={runMigration}
            disabled={migrating}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-semibold mb-6"
          >
            {migrating ? (
              <><Loader2 size={20} className="animate-spin" />{currentStep}</>
            ) : (
              <><Database size={20} />Lancer la migration de sécurité</>
            )}
          </button>

          {results.length > 0 && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                  <CheckCircle2 size={24} className="text-green-600 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-green-700">{totalUpdated}</p>
                  <p className="text-sm text-green-600">Documents sécurisés</p>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
                  <RefreshCw size={24} className="text-blue-600 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-blue-700">{totalSkipped}</p>
                  <p className="text-sm text-blue-600">Déjà sécurisés</p>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
                  <AlertCircle size={24} className="text-red-600 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-red-700">{totalErrors}</p>
                  <p className="text-sm text-red-600">Erreurs</p>
                </div>
              </div>

              <div className="space-y-3">
                {results.map((result, idx) => (
                  <div key={idx} className="border border-slate-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-semibold text-slate-900">{result.collection}</h3>
                      <div className="flex gap-3 text-sm">
                        <span className="text-green-600">✅ {result.updated}</span>
                        <span className="text-blue-600">⏭️ {result.skipped}</span>
                        {result.errors.length > 0 && <span className="text-red-600">❌ {result.errors.length}</span>}
                      </div>
                    </div>
                    <p className="text-sm text-slate-600">{result.total} documents traités</p>
                    {result.errors.length > 0 && (
                      <div className="mt-2 bg-red-50 border border-red-200 rounded p-2">
                        {result.errors.slice(0, 3).map((err, i) => (
                          <p key={i} className="text-xs text-red-700">{err}</p>
                        ))}
                        {result.errors.length > 3 && (
                          <p className="text-xs text-red-600 mt-1">... et {result.errors.length - 3} autres erreurs</p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {!migrating && results.length > 0 && totalErrors === 0 && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mt-6">
              <div className="flex gap-2">
                <CheckCircle2 size={20} className="text-green-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-green-900 mb-1">Migration terminée avec succès !</h3>
                  <p className="text-sm text-green-800">Tous vos documents sont maintenant sécurisés avec les permissions multi-tenant.</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}