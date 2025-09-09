/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'media', // OS 설정 자동 추종 (스크립트 불필요)
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
    './pages/**/*.{js,ts,jsx,tsx}',
    './src/**/*.{js,ts,jsx,tsx}', // 혹시 src 구조를 쓸 때 대비
  ],
  theme: { extend: {} },
  plugins: [],
};
