// tailwind.config.js
// 목적: 프로젝트 전반이 dark: 유틸을 자연스럽게 쓰도록 'class' 전략으로 통일
module.exports = {
  darkMode: 'class', // ✅ OS 감지를 통해 html.dark 클래스로 전환(아래 layout 스크립트가 담당)
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
