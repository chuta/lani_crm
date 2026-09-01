/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        deep: {
          900: '#03040a',
          800: '#0a0b14',
          700: '#111221',
          600: '#1a1b2e',
        },
        primary: {
          400: '#a78bfa',
          500: '#895CFE',
          600: '#7c3aed',
        },
        accent: {
          gold: '#F5C842',
          teal: '#00666B',
          success: '#3ED98B',
          danger: '#ef4444',
        },
      },
      fontFamily: {
        display: ['Outfit', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}