import { ReactNode } from 'react';

interface Column {
  key: string;
  label: string;
  render?: (value: any, row: any) => ReactNode;
  className?: string;
}

interface ResponsiveTableProps {
  columns: Column[];
  data: any[];
  onRowClick?: (row: any) => void;
  emptyMessage?: string;
  className?: string;
}

export default function ResponsiveTable({ 
  columns, 
  data, 
  onRowClick, 
  emptyMessage = 'Aucune donnée',
  className = ''
}: ResponsiveTableProps) {
  
  if (data.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center">
        <p className="text-slate-500 dark:text-slate-400">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className={className}>
      {/* ️ VERSION DESKTOP : Tableau classique */}
      <div className="hidden md:block overflow-x-auto bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
              {columns.map(col => (
                <th 
                  key={col.key} 
                  className={`px-6 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider ${col.className || ''}`}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
            {data.map((row, idx) => (
              <tr 
                key={row.$id || idx} 
                onClick={() => onRowClick?.(row)}
                className={`hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors ${onRowClick ? 'cursor-pointer' : ''}`}
              >
                {columns.map(col => (
                  <td key={col.key} className={`px-6 py-4 text-sm text-slate-900 dark:text-slate-200 ${col.className || ''}`}>
                    {col.render ? col.render(row[col.key], row) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/*  VERSION MOBILE : Cartes */}
      <div className="md:hidden space-y-3">
        {data.map((row, idx) => (
          <div 
            key={row.$id || idx}
            onClick={() => onRowClick?.(row)}
            className={`bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 shadow-sm ${onRowClick ? 'cursor-pointer active:scale-[0.98] transition-transform' : ''}`}
          >
            {columns.map(col => (
              <div key={col.key} className="flex justify-between items-start py-2 border-b border-slate-100 dark:border-slate-700/50 last:border-0">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  {col.label}
                </span>
                <div className="text-sm text-slate-900 dark:text-slate-200 text-right ml-4 max-w-[60%]">
                  {col.render ? col.render(row[col.key], row) : row[col.key]}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}