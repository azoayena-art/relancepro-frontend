import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';

// ===== PAGES AUTHENTIFIÉES =====
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Prospects from './pages/Prospects';
import Clients from './pages/Clients';
import ClientDetail from './pages/ClientDetail';
import Catalogue from './pages/Catalogue';
import Quotes from './pages/Quotes';
import Invoices from './pages/Invoices';
import Receipts from './pages/Receipts';
import TeamSettings from './pages/TeamSettings';
import CompanySettings from './pages/CompanySettings';
import SecurityMigration from './pages/SecurityMigration';
import Reminders from './pages/Reminders';
import Payments from './pages/Payments';
import JoinTeam from './pages/JoinTeam';

// ===== PAGES PUBLIQUES (sans authentification) =====
import PublicQuoteView from './pages/PublicQuoteView';
import PublicInvoiceView from './pages/PublicInvoiceView';
import PublicRequest from './pages/PublicRequest';

// ===== GARDE : Route protégée (utilisateur connecté uniquement) =====
function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-slate-500 text-lg">Chargement...</div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

// ===== GARDE : Route publique (déconnecté uniquement) =====
function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-slate-500 text-lg">Chargement...</div>
      </div>
    );
  }

  if (user) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

// ===== TOUTES LES ROUTES DE L'APPLICATION =====
function AppRoutes() {
  return (
    <Routes>
      {/* --- Routes publiques (accès sans compte) --- */}
      <Route path="/v/:token" element={<PublicQuoteView />} />
      <Route path="/f/:token" element={<PublicInvoiceView />} />
      <Route path="/demande/:slug" element={<PublicRequest />} />
      <Route path="/join-team" element={<JoinTeam />} />

      {/* --- Authentification --- */}
      <Route path="/login" element={<PublicOnlyRoute><Login /></PublicOnlyRoute>} />
      <Route path="/register" element={<PublicOnlyRoute><Register /></PublicOnlyRoute>} />

      {/* --- Application principale (protégée) --- */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />

      <Route path="/prospects" element={<ProtectedRoute><Prospects /></ProtectedRoute>} />

      <Route path="/clients" element={<ProtectedRoute><Clients /></ProtectedRoute>} />
      <Route path="/clients/:id" element={<ProtectedRoute><ClientDetail /></ProtectedRoute>} />

      <Route path="/catalogue" element={<ProtectedRoute><Catalogue /></ProtectedRoute>} />

      <Route path="/quotes" element={<ProtectedRoute><Quotes /></ProtectedRoute>} />

      <Route path="/invoices" element={<ProtectedRoute><Invoices /></ProtectedRoute>} />
      <Route path="/receipts" element={<ProtectedRoute><Receipts /></ProtectedRoute>} />

      <Route path="/reminders" element={<ProtectedRoute><Reminders /></ProtectedRoute>} />
      <Route path="/payments" element={<ProtectedRoute><Payments /></ProtectedRoute>} />

      {/* --- Paramètres --- */}
      <Route path="/team-settings" element={<ProtectedRoute><TeamSettings /></ProtectedRoute>} />
      <Route path="/company-settings" element={<ProtectedRoute><CompanySettings /></ProtectedRoute>} />

      {/* --- 🛡️ OUTIL DE MIGRATION DE SÉCURITÉ (admin) --- */}
      <Route path="/admin/security-migration" element={<ProtectedRoute><SecurityMigration /></ProtectedRoute>} />

      {/* --- Route inconnue : retour au dashboard --- */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

// ===== COMPOSANT PRINCIPAL =====
export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}