/** @type {import('tailwindcss').Config} */
module.exports = {
  // ✅ OS의 prefers-color-scheme를 그대로 따릅니다(스크립트 불필요).
  darkMode: 'media',
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
    './pages/**/*.{js,ts,jsx,tsx}',
    './src/**/*.{js,ts,jsx,tsx}', // 혹시 src 구조가 섞여 있어도 안전
  ],
  theme: { extend: {} },
  plugins: [],
};
