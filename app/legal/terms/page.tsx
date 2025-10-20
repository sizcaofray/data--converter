// 서버 함수 강제: 동적 + 캐시 끔 + Node 런타임
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { headers } from 'next/headers'; // 서버 전용 API (정적 프리렌더 방지)
import Link from 'next/link';

/**
 * 이용약관 — 개인(미등록/비법인) 운영 기준의 최소 구성
 * - 문의 이메일: zoochildfam@gmail.com
 * - 페이지는 서버에서 렌더링되도록 강제(λ 생성)
 */

export default function TermsPage() {
  // 서버 전용 API를 호출해 자동 정적 최적화 방지 → λ 생성 보장
  headers();

  const effectiveDate = '2025-10-14';
  const contactEmail = 'zoochildfam@gmail.com';

  return (
    <main className="relative max-w-3xl mx-auto px-4 py-10">
      {/* 닫기 버튼은 링크로 대체(서버 컴포넌트이므로 window.history 사용 지양) */}
      <div className="fixed top-3 right-3 md:top-6 md:right-6 z-50">
        <Link
          href="/"
          aria-label="닫기"
          className="inline-flex items-center justify-center rounded-full border border-black/10 bg-white/80 dark:bg-neutral-900/70 backdrop-blur w-9 h-9 md:w-10 md:h-10 text-lg font-bold shadow-lg hover:shadow-xl transition"
        >
          ×
        </Link>
      </div>

      <h1 className="text-2xl font-bold mb-6">이용약관</h1>
      <p className="text-sm text-gray-500 mb-8">시행일: {effectiveDate}</p>

      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">1. 목적</h2>
        <p className="leading-7">
          본 약관은 개인이 운영하는 데이터 변환 서비스(이하 “서비스”)의 이용 조건과 절차,
          이용자와 운영자의 권리·의무 및 책임을 규정함을 목적으로 합니다.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">2. 서비스의 내용</h2>
        <p className="leading-7">
          본 서비스는 사용자가 업로드한 파일을 변환하여 다운로드할 수 있도록 지원합니다.
          서비스의 일부 또는 전부는 운영·보안·기술적 사유로 사전 예고 없이 변경·중단될 수 있습니다.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">3. 책임의 한계</h2>
        <p className="leading-7">
          운영자는 고의 또는 중대한 과실이 없는 한 서비스 이용과 관련하여 발생한 손해에 대해 책임을 지지 않습니다.
          변환 결과의 정확성·완전성·호환성 및 파일 보관 여부는 이용자가 최종 확인·관리합니다.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">4. 개인정보 보호</h2>
        <p className="leading-7">
          운영자는 이용자의 개인정보를 보호하며, 수집·이용·보관 등에 관한 사항은 별도 「개인정보 처리방침」을 따릅니다.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">5. 문의</h2>
        <p className="leading-7">
          약관 및 서비스 관련 문의는 이메일 (
          <a href={`mailto:${contactEmail}`} className="underline">{contactEmail}</a>
          )로 연락하시기 바랍니다.
        </p>
      </section>
    </main>
  );
}
