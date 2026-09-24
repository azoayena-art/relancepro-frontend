import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { usePermissions } from '../hooks/usePermissions';
import { LogOut, Users, FileText, Receipt, Settings, UserCheck, Package, Bell, Wallet, FileCheck } from 'lucide-react';

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { hasPermission, loading: permLoading } = usePermissions();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  if (!user || permLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-slate-500 text-lg">Chargement...</div>
      </div>
    );
  }

  const displayName = user.profile?.firstName || user.name || 'Utilisateur';

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-blue-600">Funmi</h1>
          <div className="flex items-center space-x-4">
            <span className="text-sm text-slate-600">Bonjour, {displayName}</span>
            <button 
              onClick={handleLogout} 
              className="flex items-center space-x-2 text-slate-600 hover:text-slate-900 transition-colors"
            >
              <LogOut size={18} />
              <span className="text-sm">Déconnexion</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h2 className="text-xl font-semibold text-slate-900 mb-6">Tableau de bord</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          
          {hasPermission('prospects.view') && (
            <button onClick={() => navigate('/prospects')} className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow text-left group w-full">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                  <Users size={24} className="text-blue-600" />
                </div>
                <span className="text-sm text-blue-600 font-medium">Voir tout →</span>
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-1">Prospects</h3>
              <p className="text-sm text-slate-500">Gérez vos prospects et suivez vos opportunités commerciales.</p>
            </button>
          )}

          {hasPermission('clients.view') && (
            <button onClick={() => navigate('/clients')} className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow text-left group w-full">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-cyan-100 rounded-lg flex items-center justify-center group-hover:bg-cyan-200 transition-colors">
                  <UserCheck size={24} className="text-cyan-600" />
                </div>
                <span className="text-sm text-cyan-600 font-medium">Voir tout →</span>
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-1">Clients</h3>
              <p className="text-sm text-slate-500">Centralisez l'historique commercial de vos clients.</p>
            </button>
          )}

          {hasPermission('products.view') && (
            <button onClick={() => navigate('/catalogue')} className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow text-left group w-full">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center group-hover:bg-indigo-200 transition-colors">
                  <Package size={24} className="text-indigo-600" />
                </div>
                <span className="text-sm text-indigo-600 font-medium">Voir tout →</span>
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-1">Catalogue</h3>
              <p className="text-sm text-slate-500">Gérez vos produits, prestations et catégories.</p>
            </button>
          )}

          {hasPermission('quotes.view') && (
            <button onClick={() => navigate('/quotes')} className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow text-left group w-full">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center group-hover:bg-green-200 transition-colors">
                  <FileText size={24} className="text-green-600" />
                </div>
                <span className="text-sm text-green-600 font-medium">Voir tout →</span>
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-1">Devis</h3>
              <p className="text-sm text-slate-500">Créez et envoyez vos devis professionnels conformes.</p>
            </button>
          )}

          {hasPermission('invoices.view') && (
            <button onClick={() => navigate('/invoices')} className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow text-left group w-full">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center group-hover:bg-purple-200 transition-colors">
                  <Receipt size={24} className="text-purple-600" />
                </div>
                <span className="text-sm text-purple-600 font-medium">Voir tout →</span>
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-1">Factures</h3>
              <p className="text-sm text-slate-500">Gérez vos factures et suivez les paiements.</p>
            </button>
          )}

          {/* ✅ Carte Relances */}
          {hasPermission('invoices.view') && (
            <button onClick={() => navigate('/reminders')} className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow text-left group w-full border-l-4 border-orange-500">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center group-hover:bg-orange-200 transition-colors">
                  <Bell size={24} className="text-orange-600" />
                </div>
                <span className="text-sm text-orange-600 font-medium">Voir tout →</span>
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-1">Relances</h3>
              <p className="text-sm text-slate-500">Suivez vos devis sans réponse et factures en retard.</p>
            </button>
          )}

          {/* ✅ Carte Historique des Paiements */}
          {hasPermission('invoices.view') && (
            <button onClick={() => navigate('/payments')} className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow text-left group w-full border-l-4 border-emerald-500">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-emerald-100 rounded-lg flex items-center justify-center group-hover:bg-emerald-200 transition-colors">
                  <Wallet size={24} className="text-emerald-600" />
                </div>
                <span className="text-sm text-emerald-600 font-medium">Voir tout →</span>
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-1">Paiements</h3>
              <p className="text-sm text-slate-500">Consultez l'historique de tous vos encaissements.</p>
            </button>
          )}

          {/* ✅ NOUVEAU : Carte Reçus de Paiement */}
          {hasPermission('invoices.view') && (
            <button onClick={() => navigate('/receipts')} className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow text-left group w-full border-l-4 border-teal-500">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-teal-100 rounded-lg flex items-center justify-center group-hover:bg-teal-200 transition-colors">
                  <FileCheck size={24} className="text-teal-600" />
                </div>
                <span className="text-sm text-teal-600 font-medium">Voir tout →</span>
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-1">Reçus</h3>
              <p className="text-sm text-slate-500">Retrouvez et téléchargez vos reçus de paiement.</p>
            </button>
          )}

          {hasPermission('team.view') && (
            <button onClick={() => navigate('/team-settings')} className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow text-left group w-full">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center group-hover:bg-indigo-200 transition-colors">
                  <Users size={24} className="text-indigo-600" />
                </div>
                <span className="text-sm text-indigo-600 font-medium">Gérer →</span>
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-1">Équipe & Rôles</h3>
              <p className="text-sm text-slate-500">Invitez des collaborateurs et gérez leurs permissions.</p>
            </button>
          )}

          {hasPermission('settings.view') && (
            <button onClick={() => navigate('/company-settings')} className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow text-left group w-full md:col-span-2 lg:col-span-1">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center group-hover:bg-slate-200 transition-colors">
                  <Settings size={24} className="text-slate-600" />
                </div>
                <span className="text-sm text-slate-600 font-medium">Configurer →</span>
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-1">Mon Entreprise</h3>
              <p className="text-sm text-slate-500">Définissez vos informations par défaut pour vos documents.</p>
            </button>
          )}

        </div>
      </main>
    </div>
  );
}