import { Filter } from 'lucide-react';

interface SelectFilterProps {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
}

export default function SelectFilter({ value, onChange, options, placeholder = 'Tous' }: SelectFilterProps) {
  return (
    <div className="relative sm:w-48 flex-1">
      <Filter size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full pl-10 pr-4 py-3 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-sm bg-white dark:bg-slate-800 appearance-none cursor-pointer"
      >
        <option value="all">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}