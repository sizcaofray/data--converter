'use client'

/**
 * 홈(/) 페이지
 * - 배경이 중간에서 끊기지 않도록 "부모의 남은 높이"를 꽉 채움
 * - 방법 1) flex-1: 부모(app/layout.tsx)의 flex-col 컨테이너에서 남은 높이를 전부 점유
 * - 방법 2) min-h-[calc(100vh-3rem)]: 푸터(약 3rem)의 높이를 뺀 뷰포트 높이만큼 최소 높이 확보
 *   -> 두 가지를 함께 적용해 어떤 레이아웃에서도 끊김 없이 푸터까지 배경 유지
 * - 기존 텍스트/버튼/정렬은 건드리지 않음
 */

export default function HomePage() {
  return (
    <main
      className="
        flex-1
        min-h-[calc(100vh-3rem)]
        /* ↑ 푸터 높이가 달라지면 숫자만 미세조정 (예: 2.75rem / 3.25rem) */
        flex flex-col items-center justify-start
        px-4
      "
    >
      {/* ====== 기존 섹션 시작 (문구/디자인 그대로 유지) ====== */}
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
      {/* ====== 기존 섹션 끝 ====== */}
    </main>
  )
}
