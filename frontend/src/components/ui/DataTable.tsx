import type { ReactNode } from 'react';
import SkeletonRow from './SkeletonRow';

interface DataTableProps {
  children: ReactNode;
  loading?: boolean;
  headers?: string[];
}

export default function DataTable({ children, loading = false, headers }: DataTableProps) {
  const defaultHeaders = ['Facture', 'Client', 'Dates', 'Montants', 'Statut', ''];
  const cols = headers || defaultHeaders;

  return (
    <div className="hidden md:block bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
      <table className="w-full">
        <thead className="bg-slate-50/80 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
          <tr>
            {cols.map((h, i) => (
              <th
                key={i}
                className={`px-6 py-4 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider ${
                  i === cols.length - 1 ? 'text-right' : 'text-left'
                }`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
          {loading ? (
            <>
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </>
          ) : (
            children
          )}
        </tbody>
      </table>
    </div>
  );
}