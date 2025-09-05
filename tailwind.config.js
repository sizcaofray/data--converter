// tailwind.config.js
// 목적: OS 다크모드 자동 반영을 위해 darkMode='media' 명시
module.exports = {
  darkMode: 'media', // ✅ OS의 prefers-color-scheme을 그대로 따름
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
