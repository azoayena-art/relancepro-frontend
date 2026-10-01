// ============================================================
// 📦 IMPORTS (ordre : React → Libraries → Composants → Types)
// ============================================================
import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

// Context & Hooks
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { databases, DATABASE_ID } from '../appwrite';
import { Query } from 'appwrite';

// Icons
import {
  LayoutDashboard, Users, UserCheck, Package, FileText, Receipt,
  Bell, Wallet, FileCheck, LogOut, ChevronLeft,
  ChevronRight, Moon, Sun, Menu, X, Building2, Shield,
  AlertCircle,
} from 'lucide-react';

// ============================================================
// 📋 TYPES & INTERFACES
// ============================================================
interface SidebarProps {
  children: React.ReactNode;
}

interface NavItem {
  path: string;
  label: string;
  icon: any;
  permission: string;
  badge?: number;
  color: string;
}

// ============================================================
// 🎯 COMPOSANT PRINCIPAL
// ============================================================
export default function Sidebar({ children }: SidebarProps) {
  // ---- Hooks ----
  const { user, logout } = useAuth();
  const { hasPermission } = usePermissions();
  const navigate = useNavigate();
  const location = useLocation();

  // ---- State ----
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('darkMode') === 'true';
  });
  const [pendingRemindersCount, setPendingRemindersCount] = useState(0);

  // ---- Effects ----
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('darkMode', String(darkMode));
  }, [darkMode]);

  // Charger le nombre de relances en attente
  useEffect(() => {
    const loadRemindersCount = async () => {
      if (!user || !hasPermission('invoices.view')) return;
      try {
        let teamId = null;
        const teamsRes = await databases.listDocuments(DATABASE_ID, 'teams', [Query.equal('ownerId', user.$id)]);
        if (teamsRes.documents.length > 0) {
          teamId = teamsRes.documents[0].$id;
        } else {
          const membersRes = await databases.listDocuments(DATABASE_ID, 'team_members', [Query.equal('userId', user.$id)]);
          if (membersRes.documents.length > 0) {
            teamId = membersRes.documents[0].teamId;
          }
        }
        if (!teamId) return;

        // Compter les devis envoyés depuis plus de 7 jours + factures impayées
        const [quotesRes, invoicesRes] = await Promise.all([
          databases.listDocuments(DATABASE_ID, 'quotes', [
            Query.equal('teamId', teamId),
            Query.equal('status', 'Envoyé'),
            Query.limit(500)
          ]),
          databases.listDocuments(DATABASE_ID, 'invoices', [
            Query.equal('teamId', teamId),
            Query.limit(500)
          ])
        ]);

        const now = new Date();
        const oldQuotes = quotesRes.documents.filter(q => 
          q.issueDate && (now.getTime() - new Date(q.issueDate).getTime()) / 86400000 > 7
        );

        const unpaidInvoices = invoicesRes.documents.filter(inv => 
          inv.type !== 'credit' && 
          inv.status !== 'paid' && 
          inv.status !== 'cancelled' &&
          inv.dueDate && 
          new Date(inv.dueDate) < now
        );

        setPendingRemindersCount(oldQuotes.length + unpaidInvoices.length);
      } catch (e) {
        console.warn('Erreur chargement compteur relances:', e);
      }
    };

    loadRemindersCount();
    const interval = setInterval(loadRemindersCount, 30000); // Refresh toutes les 30s
    return () => clearInterval(interval);
  }, [user, hasPermission]);

  // ---- Handlers ----
  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleNavigation = (path: string) => {
    navigate(path);
    setMobileOpen(false);
  };

  // ---- Computed ----
  const displayName = (user as any)?.profile?.firstName || (user as any)?.name || 'Utilisateur';
  const initials = String(displayName).split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);

  const isActive = (path: string) => location.pathname === path;

  // ---- Navigation Items ----
  const navItems: NavItem[] = [
    { path: '/dashboard', label: 'Tableau de bord', icon: LayoutDashboard, permission: 'dashboard', color: 'text-purple-600' },
    { path: '/prospects', label: 'Prospects', icon: Users, permission: 'prospects.view', color: 'text-blue-600' },
    { path: '/clients', label: 'Clients', icon: UserCheck, permission: 'clients.view', color: 'text-cyan-600' },
    { path: '/catalogue', label: 'Catalogue', icon: Package, permission: 'products.view', color: 'text-indigo-600' },
    { path: '/quotes', label: 'Devis', icon: FileText, permission: 'quotes.view', color: 'text-emerald-600' },
    { path: '/invoices', label: 'Factures', icon: Receipt, permission: 'invoices.view', color: 'text-purple-600' },
    { path: '/reminders', label: 'Relances', icon: Bell, permission: 'invoices.view', badge: pendingRemindersCount, color: 'text-orange-600' },
    { path: '/payments', label: 'Trésorerie', icon: Wallet, permission: 'invoices.view', color: 'text-green-600' },
    { path: '/receipts', label: 'Reçus', icon: FileCheck, permission: 'invoices.view', color: 'text-teal-600' },
  ];

  const settingsItems: NavItem[] = [
    { path: '/team-settings', label: 'Équipe & Rôles', icon: Shield, permission: 'team.view', color: 'text-indigo-600' },
    { path: '/company-settings', label: 'Mon Entreprise', icon: Building2, permission: 'settings.view', color: 'text-slate-600' },
  ];

  // ---- Render Helpers ----
  const renderNavItem = (item: NavItem) => {
    const active = isActive(item.path);
    const showBadge = item.badge && item.badge > 0;

    return (
      <button
        key={item.path}
        onClick={() => handleNavigation(item.path)}
        className={`relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group ${
          active
            ? 'bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/40 dark:to-indigo-900/40 text-purple-700 dark:text-purple-300 font-semibold shadow-sm ring-1 ring-purple-200/50 dark:ring-purple-700/50'
            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/50 hover:text-slate-900 dark:hover:text-slate-200'
        } ${collapsed ? 'justify-center' : ''}`}
        title={collapsed ? item.label : undefined}
        aria-label={item.label}
        aria-current={active ? 'page' : undefined}
      >
        <div className={`flex-shrink-0 p-1.5 rounded-lg ${active ? 'bg-white dark:bg-slate-800 shadow-sm' : ''}`}>
          <item.icon 
            size={20} 
            className={`transition-transform group-hover:scale-110 ${active ? item.color : ''}`} 
          />
        </div>
        
        {!collapsed && (
          <>
            <span className="text-sm flex-1 text-left truncate">{item.label}</span>
            {showBadge && (
              <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[10px] font-bold bg-red-500 text-white rounded-full shadow-sm">
                {item.badge! > 99 ? '99+' : item.badge}
              </span>
            )}
            {item.badgeLabel && (
              <span className="text-[9px] font-bold bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded-full">
                {item.badgeLabel}
              </span>
            )}
          </>
        )}

        {collapsed && showBadge && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-white dark:border-slate-800 shadow-sm" />
        )}
        {collapsed && item.badgeLabel && (
          <span className="absolute -top-1 -right-1 text-[8px] font-bold bg-blue-600 text-white rounded-full border-2 border-white dark:border-slate-800 shadow-sm px-1">
            {item.badgeLabel.slice(2)}
          </span>
        )}
      </button>
    );
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* LOGO */}
      <div className={`flex items-center ${collapsed ? 'justify-center' : 'justify-between'} px-4 py-5 border-b border-slate-200 dark:border-slate-700 flex-shrink-0`}>
        {!collapsed && (
          <h1 className="text-xl font-bold bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent tracking-tight">
            Funmi
          </h1>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden lg:flex items-center justify-center w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 transition-all hover:scale-110"
          aria-label={collapsed ? 'Étendre la sidebar' : 'Réduire la sidebar'}
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      {/* NAVIGATION PRINCIPALE */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1" role="navigation" aria-label="Menu principal">
        {navItems
          .filter(item => item.permission === 'dashboard' || hasPermission(item.permission))
          .map(renderNavItem)}

        {/* SÉPARATEUR */}
        <div className="my-4 border-t border-slate-200 dark:border-slate-700"></div>
        
        {!collapsed && (
          <p className="px-3 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">
            Paramètres
          </p>
        )}

        {settingsItems
          .filter(item => hasPermission(item.permission))
          .map(renderNavItem)}
      </nav>

      {/* BAS DE SIDEBAR */}
      <div className="border-t border-slate-200 dark:border-slate-700 p-3 space-y-1 flex-shrink-0">
        {/* Mode sombre */}
        <button
          onClick={() => setDarkMode(!darkMode)}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-all ${collapsed ? 'justify-center' : ''}`}
          title={collapsed ? (darkMode ? 'Mode clair' : 'Mode sombre') : undefined}
          aria-label={darkMode ? 'Activer le mode clair' : 'Activer le mode sombre'}
        >
          <div className="flex-shrink-0 p-1.5 rounded-lg">
            {darkMode ? <Sun size={18} className="text-amber-500" /> : <Moon size={18} />}
          </div>
          {!collapsed && <span className="text-sm font-medium">{darkMode ? 'Mode clair' : 'Mode sombre'}</span>}
        </button>

        {/* Profil utilisateur */}
        <div className={`flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-700/50 dark:to-slate-800/50 ring-1 ring-slate-200/50 dark:ring-slate-700/50 ${collapsed ? 'justify-center' : ''}`}>
          <div className="w-9 h-9 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 shadow-md ring-2 ring-white dark:ring-slate-800">
            {initials}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{displayName}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{(user as any)?.email}</p>
            </div>
          )}
          {!collapsed && (
            <button
              onClick={handleLogout}
              className="flex-shrink-0 p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-600 transition-all hover:scale-110"
              title="Déconnexion"
              aria-label="Se déconnecter"
            >
              <LogOut size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );

  // ---- Render Principal ----
  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 overflow-hidden">
      {/* SIDEBAR DESKTOP */}
      <aside 
        className={`hidden lg:flex flex-col bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 transition-all duration-300 ease-in-out shadow-sm ${
          collapsed ? 'w-20' : 'w-64'
        }`}
      >
        <SidebarContent />
      </aside>

      {/* OVERLAY MOBILE */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden animate-fadeIn"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* SIDEBAR MOBILE */}
      <aside 
        className={`fixed inset-y-0 left-0 z-50 w-72 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 transform transition-transform duration-300 ease-out lg:hidden flex flex-col shadow-2xl ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Menu mobile"
      >
        {/* Header mobile */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-slate-200 dark:border-slate-700 flex-shrink-0 bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20">
          <h1 className="text-xl font-bold bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">
            Funmi
          </h1>
          <button
            onClick={() => setMobileOpen(false)}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 transition-all hover:scale-110"
            aria-label="Fermer le menu"
          >
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-hidden">
          <SidebarContent />
        </div>
      </aside>

      {/* CONTENU PRINCIPAL */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* TOPBAR MOBILE */}
        <header className="lg:hidden bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 py-3 flex items-center justify-between flex-shrink-0 shadow-sm">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 transition-all hover:scale-110"
            aria-label="Ouvrir le menu"
          >
            <Menu size={24} />
          </button>
          <h1 className="text-lg font-bold bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">
            Funmi
          </h1>
          <div className="w-9 h-9 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-md ring-2 ring-white dark:ring-slate-800">
            {initials}
          </div>
        </header>

        {/* PAGE CONTENT */}
        <main className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-900">
          {children}
        </main>
      </div>
    </div>
  );
}