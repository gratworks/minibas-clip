/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        court: {
          bg: '#15171C',
          panel: '#1E2128',
          border: '#2C303A',
          accent: '#FF7A1A'
        }
      }
    }
  },
  plugins: []
}
