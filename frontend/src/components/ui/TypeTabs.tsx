interface TypeTab {
  key: string;
  label: string;
  count: number;
}

interface TypeTabsProps {
  tabs: TypeTab[];
  activeTab: string;
  onTabChange: (key: string) => void;
  color?: 'purple' | 'cyan' | 'indigo' | 'emerald' | 'rose' | 'amber';
}

export default function TypeTabs({ tabs, activeTab, onTabChange, color = 'purple' }: TypeTabsProps) {
  const colorMap: Record<string, string> = {
    purple: 'bg-purple-600 text-white shadow-lg shadow-purple-500/20',
    cyan: 'bg-cyan-600 text-white shadow-lg shadow-cyan-500/20',
    indigo: 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20',
    emerald: 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/20',
    rose: 'bg-rose-600 text-white shadow-lg shadow-rose-500/20',
    amber: 'bg-amber-600 text-white shadow-lg shadow-amber-500/20',
  };

  const activeClass = colorMap[color] || colorMap.purple;

  return (
    <div className="flex flex-wrap gap-2 mb-6">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onTabChange(tab.key)}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all active:scale-95 ${
            activeTab === tab.key
              ? activeClass
              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
          }`}
        >
          {tab.label}
          <span
            className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold tabular-nums ${
              activeTab === tab.key
                ? 'bg-white/20 text-white'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
            }`}
          >
            {tab.count}
          </span>
        </button>
      ))}
    </div>
  );
}