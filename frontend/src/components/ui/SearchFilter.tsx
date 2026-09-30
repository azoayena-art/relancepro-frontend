import { Search } from 'lucide-react';

interface SearchFilterProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  shortcut?: string;
}

export default function SearchFilter({ value, onChange, placeholder = 'Rechercher...', shortcut = '⌘K' }: SearchFilterProps) {
  return (
    <div className="relative flex-1">
      <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full pl-10 pr-16 py-3 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-sm transition-shadow"
      />
      {shortcut && (
        <div className="hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 items-center gap-1 pointer-events-none">
          <kbd className="h-5 select-none items-center gap-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-1.5 font-mono text-[10px] font-medium text-slate-500 dark:text-slate-400 flex">
            {shortcut}
          </kbd>
        </div>
      )}
    </div>
  );
}