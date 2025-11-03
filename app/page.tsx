'use client'

/**
 * 홈(/) 배경이 푸터까지 끊기지 않도록,
 * 뷰포트 계산(min-h calc) 대신 플렉스(flex-1)만 사용합니다.
 * → 미세 오차로 인한 전역 스크롤 발생 방지.
 */
export default function HomePage() {
  return (
    <main
      className="
        flex-1                 /* 부모(app/layout.tsx)의 flex-col에서 남은 세로공간 전부 점유 */
        flex flex-col items-center justify-start
        px-4
      "
    >
      {/* 기존 콘텐츠 */}
      <section className="w-full max-w-5xl mx-auto pt-16 text-center">
        <h1 className="text-4xl md:text-5xl font-extrabold mb-6">
          파일 변환 서비스
        </h1>

        <p className="text-gray-300 dark:text-gray-300 max-w-xl mx-auto leading-relaxed">
          CSV, TXT, 엑셀 등 다양한 파일 형식을
          <br />
          간편하고 빠르게 변환하세요.
        </p>

        <ul className="mt-6 text-gray-400 dark:text-gray-400 space-y-1 text-sm">
          <li>• 클라우드 기반으로 설치 없이 사용</li>
          <li>• 즉각적인 파일 변환</li>
          <li>• 드래그 앤 드롭으로 다양한 포맷 변환</li>
        </ul>
      </section>
    </main>
  )
}
