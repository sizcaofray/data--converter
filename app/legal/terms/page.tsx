'use client';
/**
 * 이용약관 (우측 상단 '닫기(X)' 버튼 버전)
 * - 기존 고정 '이전' 버튼을 X(닫기) 아이콘으로 변경
 * - 기존 상단의 '← 이전 화면으로' 버튼 제거
 * - 디자인, 내용, 구조 변경 없음
 */

import { Suspense, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function TermsPage() {
  return (
    <Suspense
      fallback={
        <main className="max-w-3xl mx-auto px-4 py-10">
          <div className="text-sm opacity-70">로딩 중…</div>
        </main>
      }
    >
      <TermsBody />
    </Suspense>
  );
}

function TermsBody() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // 시행일
  const effectiveDate = '2025-10-01';

  // 뒤로가기 또는 닫기 동작
  const handleBack = useCallback(() => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      window.history.back();
      return;
    }
    const from = searchParams?.get('from') || '/';
    router.replace(from);
  }, [router, searchParams]);

  // 운영 연락처
  const contact = useMemo(
    () => ({
      email: 'zoochildfam@gmail.com',
    }),
    []
  );

  return (
    <main className="relative max-w-3xl mx-auto px-4 py-10">
      {/* ============================================
         📌 우측 상단 닫기(X) 버튼 (고정)
      ============================================ */}
      <button
        type="button"
        onClick={handleBack}
        aria-label="닫기"
        title="닫기"
        className="
          fixed top-3 right-3 md:top-6 md:right-6 z-50
          inline-flex items-center justify-center
          rounded-full border border-black/10
          bg-white/80 dark:bg-neutral-900/70 backdrop-blur
          w-9 h-9 md:w-10 md:h-10
          text-lg font-bold
          shadow-lg hover:shadow-xl
          transition
        "
      >
        ×
      </button>
      {/* ============================================ */}

      {/* ===== 본문 시작 ===== */}
      <h1 className="text-2xl font-bold mb-6">이용약관</h1>

      {/* 제1조 목적 */}
      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">제1조 (목적)</h2>
        <p className="leading-7">
          본 약관은 데이터 변환 서비스(이하 “서비스”)의 이용과 관련하여
          서비스 제공자(이하 “회사”)와 이용자 간의 권리, 의무 및 책임, 기타 필요한
          사항을 규정함을 목적으로 합니다.
        </p>
      </section>

      {/* 제2조 정의 */}
      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">제2조 (정의)</h2>
        <ul className="list-disc pl-6 leading-7">
          <li>“회원”이란 본 약관에 동의하고 Google 계정 등으로 로그인하여 서비스를 이용하는 자를 말합니다.</li>
          <li>“유료서비스”란 구독 결제를 통해 제공되는 고급 기능을 의미합니다.</li>
          <li>“파일”이란 회원이 업로드·변환·다운로드하는 모든 데이터를 의미합니다.</li>
        </ul>
      </section>

      {/* 제3조 약관의 효력 및 변경 */}
      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">제3조 (약관의 효력 및 변경)</h2>
        <p className="leading-7">
          본 약관은 서비스 화면에 게시하거나 기타 방법으로 공지함으로써 효력이 발생합니다.
          회사는 관련 법령을 위반하지 않는 범위에서 약관을 변경할 수 있으며,
          변경 시 시행일 및 개정사유를 명시하여 사전에 공지합니다.
        </p>
      </section>

      {/* 제4조 계정 및 서비스 이용 */}
      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">제4조 (계정 및 서비스 이용)</h2>
        <ul className="list-disc pl-6 leading-7">
          <li>회원은 Google 계정 기반의 인증(Firebase Auth)을 통해 로그인합니다.</li>
          <li>회원은 자신의 계정 보안을 유지해야 하며, 계정 오남용으로 발생한 손해에 대해 회사는 책임을 지지 않습니다.</li>
          <li>서비스 제공 범위, 지원 파일 형식·용량·처리속도 등은 공지 또는 화면 내 고지에 따릅니다.</li>
        </ul>
      </section>

      {/* 제5조 유료서비스(구독) 및 결제/환불 */}
      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">제5조 (유료서비스 및 결제/환불)</h2>
        <ul className="list-disc pl-6 leading-7">
          <li>유료서비스는 Bootpay 등 결제대행을 통해 결제되며, 결제·정산 과정에서 제휴사의 정책이 적용될 수 있습니다.</li>
          <li>구독 기간, 갱신, 해지(자동갱신 해제), 환불 규정은 서비스 페이지 및 결제 화면의 안내에 따릅니다.</li>
          <li>유료 기능의 구체적 범위(파일 수/용량/처리량 상한 등)는 운영 정책에 따라 조정될 수 있습니다.</li>
        </ul>
      </section>

      {/* 제6조 콘텐츠 및 파일 처리 */}
      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">제6조 (콘텐츠 및 파일 처리)</h2>
        <ul className="list-disc pl-6 leading-7">
          <li>회원이 업로드한 파일의 저작권과 법적 책임은 회원에게 있습니다.</li>
          <li>회사는 변환 처리를 위해 필요한 범위에서만 파일을 일시적으로 저장/처리하며, 목적 달성 후 지체 없이 삭제합니다.</li>
          <li>시스템·네트워크·알고리즘 특성상 변환 결과의 완전성·정확성·호환성을 100% 보장하지 않습니다.</li>
        </ul>
      </section>

      {/* 제7조 서비스 이용 제한 및 해지 */}
      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">제7조 (서비스 이용 제한 및 계약 해지)</h2>
        <ul className="list-disc pl-6 leading-7">
          <li>약관·법령 위반 또는 시스템 악용이 확인되면 사전 통지 없이 이용을 제한하거나 계약을 해지할 수 있습니다.</li>
          <li>회원 탈퇴 및 구독 해지는 서비스 내 제공되는 절차에 따릅니다.</li>
        </ul>
      </section>

      {/* 제8조 면책 및 책임 제한 */}
      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">제8조 (면책 및 책임 제한)</h2>
        <ul className="list-disc pl-6 leading-7">
          <li>천재지변, 전산 장애, 제휴사 시스템 장애 등 불가항력에 대해 회사는 책임을 지지 않습니다.</li>
          <li>데이터 손실·변조·전송 오류 등으로 인한 간접·특별·우발적 손해에 대한 책임을 제한합니다.</li>
          <li>회사의 총 배상책임은 회원이 최근 3개월간 해당 서비스에 대해 실제로 지급한 금액을 한도로 합니다.</li>
        </ul>
      </section>

      {/* 제9조 준거법 및 관할 */}
      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">제9조 (준거법 및 관할)</h2>
        <p className="leading-7">
          본 약관은 대한민국 법률에 따르며, 서비스와 관련하여 분쟁이 발생한 경우
          민사소송법상의 관할법원을 전속관할로 합니다(예: 서울중앙지방법원).
        </p>
      </section>

      {/* 제10조 연락처 및 시행일 */}
      <section className="mb-2">
        <h2 className="text-lg font-semibold mb-2">제10조 (연락처 및 시행일)</h2>
        <ul className="list-disc pl-6 leading-7">
          <li>연락처: {contact.email}</li>
          <li>시행일: {effectiveDate}</li>
        </ul>
      </section>
      {/* ===== 본문 끝 ===== */}
    </main>
  );
}
