// tailwind.config.js
// darkMode를 'class'로: HTML의 .dark 클래스로 테마 전환(우리는 아래 스크립트로 OS에 맞춰 자동 토글)
module.exports = {
  darkMode: 'class', // ✅ OS 따라 자동 토글(아래 app/layout.tsx의 Script가 담당)
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
