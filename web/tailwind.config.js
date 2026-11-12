/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Space Grotesk"', 'ui-sans-serif', 'sans-serif'],
        display: ['"Inter Tight"', 'ui-sans-serif', 'sans-serif'],
      },
      colors: {
        ink: '#05060a',
      },
    },
  },
  plugins: [],
}
