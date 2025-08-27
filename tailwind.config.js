// tailwind.config.js
// Tailwind가 어느 파일을 스캔할지 지정하는 설정 파일입니다.
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',     // app 디렉토리 내부 파일들
    './components/**/*.{js,ts,jsx,tsx}', // 컴포넌트 디렉토리 내부 파일들
  ],
  theme: {
    extend: {}, // 커스텀 테마 확장 지점
  },
  plugins: [],  // 플러그인 추가 지점
}
