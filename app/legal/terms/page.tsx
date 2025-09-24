'use client';
/**
 * 이용약관 페이지
 * - 상단에 "뒤로가기"와 "나가기" 버튼 제공
 * - 뒤로가기: 히스토리가 있으면 router.back(), 없으면 fallback으로 이동
 * - 나가기: ?from=/원래경로 를 우선, 없으면 '/'
 * - 신규 파일 생성 없이 페이지 내부에서만 처리 (디자인 최소 변경)
 */

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';

export default function TermsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // from 파라미터 읽기 (외부 URL 방지: '/'로 시작하는 내부 경로만 허용)
  const fromParam = searchParams.get('from') || '';
  const fallback = useMemo(() => {
    return fromParam.startsWith('/') ? fromParam : '/';
  }, [fromParam]);

  // 뒤로가기 핸들러: 히스토리가 있으면 back, 없으면 fallback
  const handleBack = useCallback(() => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push(fallback);
    }
  }, [router, fallback]);

  // 나가기 핸들러: 무조건 fallback으로
  const handleExit = useCallback(() => {
    router.push(fallback);
  }, [router, fallback]);

  return (
    <main className="max-w-3xl mx-auto px-4 py-10">
      {/* 상단 액션바: 뒤로/나가기 */}
      <div className="mb-6 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleBack}
            className="inline-flex items-center rounded-md border border-gray-300 dark:border-gray-700 px-3 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
            aria-label="이전 페이지로 돌아가기"
            title="이전 페이지로 돌아가기"
          >
            ← 뒤로가기
          </button>
          <button
            type="button"
            onClick={handleExit}
            className="inline-flex items-center rounded-md border border-gray-300 dark:border-gray-700 px-3 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
            aria-label="원래 페이지로 나가기"
            title={`원래 페이지로 나가기${fromParam ? ` (${fallback})` : ''}`}
          >
            나가기
          </button>
        </div>
        {/* 선택: 현재 fallback 힌트(운영 시 숨겨도 됨) */}
        {fromParam && (
          <span className="text-xs opacity-60">원래 페이지: {fallback}</span>
        )}
      </div>

      {/* 본문 시작 */}
      <h1 className="text-2xl font-bold mb-6">이용약관</h1>

      {/* 제1조 목적 */}
      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">제1조 (목적)</h2>
        <p className="leading-7">
          본 약관은 회사(이하 &quot;회사&quot;)가 제공하는 데이터 변환
          서비스(이하 &quot;서비스&quot;)의 이용과 관련하여 회사와
          이용자(이하 &quot;회원&quot;) 간의 권리, 의무 및 책임사항, 기타
          필요한 사항을 규정함을 목적으로 합니다.
        </p>
      </section>

      {/* 제2조 용어정의 */}
      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">제2조 (용어의 정의)</h2>
        <ul className="list-disc pl-6 leading-7">
          <li>
            &quot;서비스&quot;란 회사가 제공하는 파일/데이터 변환, 비교, 다운로드 등 일체의 기능을 의미합니다.
          </li>
          <li>
            &quot;회원&quot;이란 본 약관에 동의하고 서비스에 로그인하여 이용하는 자를 의미합니다.
          </li>
          <li>
            &quot;유료서비스&quot;란 구독 결제를 통해 제공되는 프리미엄 기능을 의미합니다.
          </li>
        </ul>
      </section>

      {/* 제3조 약관의 게시와 개정 */}
      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">제3조 (약관의 게시와 개정)</h2>
        <p className="leading-7">
          ① 회사는 본 약관의 내용을 회원이 쉽게 알 수 있도록 서비스 화면 하단에 게시합니다.
          ② 회사는 관련 법령을 위배하지 않는 범위에서 본 약관을 개정할 수 있으며, 개정 시 적용일자 및 개정사유를 명시하여 사전에 공지합니다.
        </p>
      </section>

      {/* 제4조 이용계약의 성립 */}
      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">제4조 (이용계약의 성립)</h2>
        <p className="leading-7">
          회원이 본 약관에 동의하고 로그인 절차를 완료함으로써 이용계약이 성립합니다. 일부 기능은 유료 구독 결제가 필요할 수 있습니다.
        </p>
      </section>

      {/* 제5조 유료서비스 및 결제 */}
      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">제5조 (유료서비스 및 결제)</h2>
        <ul className="list-disc pl-6 leading-7">
          <li>유료서비스의 내용, 요금, 결제주기, 환불 기준은 서비스 화면 및 결제 페이지에 고지합니다.</li>
          <li>결제 대행은 제3자 결제대행사를 통해 이뤄지며, 결제 성공 시 구독 효력이 발생합니다.</li>
          <li>연체·결제실패·환불 시 구독 상태는 회사 정책에 따라 변경 또는 해지될 수 있습니다.</li>
        </ul>
      </section>

      {/* 제6·7·8조 등 */}
      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">제6조 (회원의 의무)</h2>
        <p className="leading-7">
          회원은 관련 법령, 본 약관, 서비스 이용 안내 및 주의사항을 준수하여야 합니다.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">제7조 (회사의 의무)</h2>
        <p className="leading-7">
          회사는 관련 법령과 약관이 금지하거나 공서양속에 반하는 행위를 하지 않으며 안정적인 서비스를 제공하기 위해 최선을 다합니다.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">제8조 (분쟁의 해결)</h2>
        <p className="leading-7">
          본 약관과 서비스 이용과 관련하여 분쟁이 발생한 경우, 회사와 회원은 성실히 협의하여 해결하며, 협의가 이루어지지 않는 경우 관련 법령에 따른 관할법원에 소를 제기할 수 있습니다.
        </p>
      </section>

      <p className="text-sm opacity-70">시행일: 2025-09-23</p>
    </main>
  );
}
