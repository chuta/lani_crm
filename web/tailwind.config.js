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
          300: '#7dcea0',
          400: '#3cba6f',
          500: '#00843D',
          600: '#006631',
          700: '#004f26',
          800: '#00391c',
          900: '#002412',
        },
        accent: {
          gold: '#F5C842',
          teal: '#00666B',
          success: '#3ED98B',
          danger: '#ef4444',
        },
        lani: {
          green: '#00843D',
          dark: '#006631',
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