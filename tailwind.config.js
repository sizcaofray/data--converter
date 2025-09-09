/** @type {import('tailwindcss').Config} */
module.exports = {
  // ✅ OS 설정 자동으로 따름. .dark 클래스/스크립트 불필요.
  darkMode: 'media',
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: { extend: {} },
  plugins: [],
};
