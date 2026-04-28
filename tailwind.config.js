/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./public/index.html"
  ],
  theme: {
    extend: {
      colors: {
        'cf-blue': '#1e40af',
        'cf-green': '#16a34a',
        'cf-orange': '#ea580c',
        'cf-red': '#dc2626',
        'cf-purple': '#7c3aed',
        'cf-navy': '#0f172a',
        'cf-ink': '#1e293b',
        'cf-teal': '#0f766e',
        'cf-cyan': '#0891b2',
        'cf-sand': '#f8fafc',
      },
      fontFamily: {
        display: ['Space Grotesk', 'Segoe UI', 'sans-serif'],
        body: ['Manrope', 'Segoe UI', 'sans-serif']
      },
      boxShadow: {
        card: '0 14px 40px -26px rgba(15, 23, 42, 0.55)',
        hover: '0 22px 44px -22px rgba(2, 132, 199, 0.35)'
      },
      borderRadius: {
        card: '1rem'
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-in-out',
        'slow-float': 'slowFloat 9s ease-in-out infinite'
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slowFloat: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-14px)' }
        }
      }
    },
  },
  plugins: [],
}
