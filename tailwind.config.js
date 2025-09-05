// tailwind.config.js
// 목적: 다크 모드 자동 적용을 위해 darkMode 전략을 'media'로 명시
module.exports = {
  darkMode: 'media', // ✅ OS 테마 자동 감지(강제 'dark' 클래스 불필요)
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
