/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class', // 启用基于 class 的暗黑模式
  theme: {
    extend: {
      colors: {
        'editor-bg': '#1e1e1e',
        'editor-surface': '#2d2d2d',
        'editor-border': '#404040',
        'ghost-text': '#8a8a8a',
      },
      fontFamily: {
        'editor': ['"SF Pro Text"', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'Oxygen', 'Ubuntu', 'sans-serif'],
      },
    },
  },
  plugins: [],
}