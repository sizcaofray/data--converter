// tailwind.config.js
// 목적: dark 모드를 .dark 클래스로 전환(OS 설정은 layout의 head 스크립트가 자동 반영)
module.exports = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: { extend: {} },
  plugins: [],
}
