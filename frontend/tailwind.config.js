/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      // ✅ KPIs avec tendances : alignement des chiffres
      fontVariantNumeric: { 
        tabular: 'tabular-nums' 
      },
      // ✅ Animations pour les modals et KPIs
      animation: {
        'in': 'in 0.1s ease-out',
        'fadeIn': 'fadeIn 0.2s ease-out',
        'slideUp': 'slideUp 0.3s ease-out',
        'slideInRight': 'slideInRight 0.3s ease-out',
        'pulse-slow': 'pulse 3s infinite',
      },
      keyframes: {
        in: {
          '0%': { opacity: 0, transform: 'scale(0.95)' },
          '100%': { opacity: 1, transform: 'scale(1)' },
        },
        fadeIn: {
          '0%': { opacity: 0 },
          '100%': { opacity: 1 },
        },
        slideUp: {
          '0%': { opacity: 0, transform: 'translateY(100%)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
        slideInRight: {
          '0%': { opacity: 0, transform: 'translateX(100%)' },
          '100%': { opacity: 1, transform: 'translateX(0)' },
        },
      },
      // ✅ Ombres personnalisées pour les KPIs
      boxShadow: {
        'kpi': '0 4px 20px -4px rgba(0,0,0,0.08)',
        'kpi-hover': '0 8px 32px -4px rgba(0,0,0,0.15)',
        'kpi-dark': '0 4px 20px -4px rgba(0,0,0,0.3)',
        'kpi-hover-dark': '0 8px 32px -4px rgba(0,0,0,0.4)',
      },
      // ✅ Couleurs personnalisées pour les statuts
      colors: {
        kpi: {
          blue: {
            50: '#eff6ff',
            100: '#dbeafe',
            500: '#3b82f6',
            600: '#2563eb',
          },
          emerald: {
            50: '#ecfdf5',
            100: '#d1fae5',
            500: '#10b981',
            600: '#059669',
          },
          orange: {
            50: '#fff7ed',
            100: '#ffedd5',
            500: '#f97316',
            600: '#ea580c',
          },
          green: {
            50: '#f0fdf4',
            100: '#dcfce7',
            500: '#22c55e',
            600: '#16a34a',
          },
          cyan: {
            50: '#ecfeff',
            100: '#cffafe',
            500: '#06b6d4',
            600: '#0891b2',
          },
          violet: {
            50: '#f5f3ff',
            100: '#ede9fe',
            500: '#8b5cf6',
            600: '#7c3aed',
          },
          amber: {
            50: '#fffbeb',
            100: '#fef3c7',
            500: '#f59e0b',
            600: '#d97706',
          },
          red: {
            50: '#fef2f2',
            100: '#fee2e2',
            500: '#ef4444',
            600: '#dc2626',
          },
          purple: {
            50: '#faf5ff',
            100: '#f3e8ff',
            500: '#a855f7',
            600: '#9333ea',
          },
          indigo: {
            50: '#eef2ff',
            100: '#e0e7ff',
            500: '#6366f1',
            600: '#4f46e5',
          },
        },
      },
    },
  },
  plugins: [],
}