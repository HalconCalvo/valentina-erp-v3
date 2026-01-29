/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Colores extraídos de tu captura de pantalla
        primary: {
          DEFAULT: '#4F46E5', // Indigo vibrante (Botones)
          light: '#818CF8',
          dark: '#3730A3',
        },
        slate: {
          50: '#F8FAFC',  // Fondo App
          100: '#F1F5F9', // Fondo Cards
          800: '#1E293B', // Texto principal
          900: '#0F172A', // Sidebar oscuro
        }
      }
    },
  },
  plugins: [],
}