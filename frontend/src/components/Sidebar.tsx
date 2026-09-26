import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import {
  LayoutDashboard, Users, UserCheck, Package, FileText, Receipt,
  Bell, Wallet, FileCheck, LogOut, ChevronLeft,
  ChevronRight, Moon, Sun, Menu, X, Building2, Shield
} from 'lucide-react';

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

export default function Sidebar({ children }: SidebarProps) {
  const { user, logout } = useAuth();
  const { hasPermission } = usePermissions();
  const navigate = useNavigate();
  const location = useLocation();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('darkMode') === 'true';
  });

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('darkMode', String(darkMode));
  }, [darkMode]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const navItems: NavItem[] = [
    { path: '/dashboard', label: 'Tableau de bord', icon: LayoutDashboard, permission: 'dashboard', color: 'text-purple-500' },
    { path: '/prospects', label: 'Prospects', icon: Users, permission: 'prospects.view', color: 'text-blue-600' },
    { path: '/clients', label: 'Clients', icon: UserCheck, permission: 'clients.view', color: 'text-cyan-600' },
    { path: '/catalogue', label: 'Catalogue', icon: Package, permission: 'products.view', color: 'text-indigo-600' },
    { path: '/quotes', label: 'Devis', icon: FileText, permission: 'quotes.view', color: 'text-green-600' },
    { path: '/invoices', label: 'Factures', icon: Receipt, permission: 'invoices.view', color: 'text-purple-600' },
    { path: '/reminders', label: 'Relances', icon: Bell, permission: 'invoices.view', color: 'text-orange-600' },
    { path: '/payments', label: 'Paiements', icon: Wallet, permission: 'invoices.view', color: 'text-emerald-600' },
    { path: '/receipts', label: 'Reçus', icon: FileCheck, permission: 'invoices.view', color: 'text-teal-600' },
  ];

  const settingsItems: NavItem[] = [
    { path: '/team-settings', label: 'Équipe & Rôles', icon: Shield, permission: 'team.view', color: 'text-indigo-500' },
    { path: '/company-settings', label: 'Mon Entreprise', icon: Building2, permission: 'settings.view', color: 'text-slate-500' },
  ];

  const isActive = (path: string) => location.pathname === path;

  const displayName = (user as any)?.profile?.firstName || (user as any)?.name || 'Utilisateur';
  const initials = String(displayName).split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* LOGO */}
      <div className={`flex items-center ${collapsed ? 'justify-center' : 'justify-between'} px-4 py-5 border-b border-slate-200 dark:border-slate-700`}>
        {!collapsed && (
          <h1 className="text-xl font-bold bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">
            Funmi
          </h1>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden lg:flex p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 transition-colors"
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      {/* NAVIGATION */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        {navItems.filter(item => item.permission === 'dashboard' || hasPermission(item.permission)).map(item => (
          <button
            key={item.path}
            onClick={() => { navigate(item.path); setMobileOpen(false); }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group ${
              isActive(item.path)
                ? 'bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 font-semibold shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/50 hover:text-slate-900 dark:hover:text-slate-200'
            } ${collapsed ? 'justify-center' : ''}`}
            title={collapsed ? item.label : undefined}
          >
            <item.icon size={20} className={`${isActive(item.path) ? item.color : ''} group-hover:scale-110 transition-transform`} />
            {!collapsed && (
              <>
                <span className="text-sm flex-1 text-left">{item.label}</span>
                {item.badge && item.badge > 0 && (
                  <span className="px-2 py-0.5 text-xs font-bold bg-red-500 text-white rounded-full">
                    {item.badge}
                  </span>
                )}
              </>
            )}
          </button>
        ))}

        {/* SÉPARATEUR */}
        <div className="my-4 border-t border-slate-200 dark:border-slate-700"></div>
        {!collapsed && (
          <p className="px-3 text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">
            Paramètres
          </p>
        )}

        {settingsItems.filter(item => hasPermission(item.permission)).map(item => (
          <button
            key={item.path}
            onClick={() => { navigate(item.path); setMobileOpen(false); }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group ${
              isActive(item.path)
                ? 'bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 font-semibold shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/50 hover:text-slate-900 dark:hover:text-slate-200'
            } ${collapsed ? 'justify-center' : ''}`}
            title={collapsed ? item.label : undefined}
          >
            <item.icon size={20} className={`${isActive(item.path) ? item.color : ''} group-hover:scale-110 transition-transform`} />
            {!collapsed && <span className="text-sm flex-1 text-left">{item.label}</span>}
          </button>
        ))}
      </nav>

      {/* BAS DE SIDEBAR */}
      <div className="border-t border-slate-200 dark:border-slate-700 p-3 space-y-2">
        {/* Mode sombre */}
        <button
          onClick={() => setDarkMode(!darkMode)}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors ${collapsed ? 'justify-center' : ''}`}
          title={collapsed ? (darkMode ? 'Mode clair' : 'Mode sombre') : undefined}
        >
          {darkMode ? <Sun size={20} className="text-amber-500" /> : <Moon size={20} />}
          {!collapsed && <span className="text-sm">{darkMode ? 'Mode clair' : 'Mode sombre'}</span>}
        </button>

        {/* Profil */}
        <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-700/50 ${collapsed ? 'justify-center' : ''}`}>
          <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            {initials}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-200 truncate">{displayName}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{(user as any)?.email}</p>
            </div>
          )}
          {!collapsed && (
            <button
              onClick={handleLogout}
              className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-600 transition-colors"
              title="Déconnexion"
            >
              <LogOut size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 overflow-hidden">
      {/* SIDEBAR DESKTOP */}
      <aside className={`hidden lg:flex flex-col bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 transition-all duration-300 ${
        collapsed ? 'w-20' : 'w-64'
      }`}>
        <SidebarContent />
      </aside>

      {/* OVERLAY MOBILE (UNIQUE) */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* SIDEBAR MOBILE */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-72 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 transform transition-transform duration-300 ease-out lg:hidden flex flex-col ${
        mobileOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <div className="flex items-center justify-between px-4 py-4 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
          <h1 className="text-xl font-bold bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">
            Funmi
          </h1>
          <button
            onClick={() => setMobileOpen(false)}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 transition-colors"
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
        <header className="lg:hidden bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 py-3 flex items-center justify-between flex-shrink-0">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400"
          >
            <Menu size={24} />
          </button>
          <h1 className="text-lg font-bold bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">
            Funmi
          </h1>
          <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
            {initials}
          </div>
        </header>

        {/* PAGE CONTENT */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}