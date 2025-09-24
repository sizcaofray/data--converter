'use client';
/**
 * 개인정보처리방침 페이지
 * - Next 경고 해결: useSearchParams()를 Suspense 경계 안에서만 사용
 * - 뒤로가기/나가기 버튼 유지
 */

import { Suspense, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function PrivacyPage() {
  // ✅ Suspense로 감싸서 CSR bailout 경고/빌드 에러를 방지
  return (
    <Suspense
      fallback={
        <main className="max-w-3xl mx-auto px-4 py-10">
          <div className="text-sm opacity-70">로딩 중…</div>
        </main>
      }
    >
      <PrivacyContent />
    </Suspense>
  );
}

/** 실제 콘텐츠 컴포넌트(여기서만 useSearchParams 사용) */
function PrivacyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // 내부 경로만 허용(/로 시작), 그 외는 안전 기본값 '/'
  const fromParam = searchParams.get('from') || '';
  const fallback = useMemo(
    () => (fromParam.startsWith('/') ? fromParam : '/'),
    [fromParam]
  );

  const handleBack = useCallback(() => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push(fallback);
    }
  }, [router, fallback]);

  const handleExit = useCallback(() => {
    router.push(fallback);
  }, [router, fallback]);

  return (
    <main className="max-w-3xl mx-auto px-4 py-10">
      {/* 상단 액션바 */}
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
        {fromParam && (
          <span className="text-xs opacity-60">원래 페이지: {fallback}</span>
        )}
      </div>

      {/* 본문 */}
      <h1 className="text-2xl font-bold mb-6">개인정보처리방침</h1>

      {/* 1. 수집항목 및 수집방법 */}
      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">1. 수집하는 개인정보 항목 및 수집방법</h2>
        <ul className="list-disc pl-6 leading-7">
          <li>수집항목: Google 계정 기본정보(이메일, 표시명), 결제 관련 식별자(결제사 제공), 서비스 이용내역(변환 로그, 사용량 등)</li>
          <li>수집방법: 회원가입/로그인(Firebase Auth), 결제 진행 시 결제사 연동, 서비스 이용 과정에서 자동 수집</li>
        </ul>
      </section>

      {/* 2. 이용목적 */}
      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">2. 개인정보의 이용 목적</h2>
        <ul className="list-disc pl-6 leading-7">
          <li>회원 식별 및 로그인 유지, 구독 상태 확인</li>
          <li>유료 결제 처리 및 청구 내역 관리</li>
          <li>서비스 제공(파일 변환/비교/다운로드) 및 품질 개선, 이용 통계</li>
          <li>법령 준수 및 분쟁 대응</li>
        </ul>
      </section>

      {/* 3. 보유 및 이용기간 */}
      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">3. 보유 및 이용기간</h2>
        <p className="leading-7">
          개인정보는 수집·이용 목적 달성 시까지 보유하며, 관련 법령에 따라 일정 기간 보관이 필요한 경우 해당 기간 동안 보관 후 지체 없이 파기합니다.
        </p>
      </section>

      {/* 4. 제3자 제공 및 처리위탁 */}
      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">4. 제3자 제공 및 처리위탁</h2>
        <p className="leading-7">
          결제 처리, 클라우드 인프라 운영 등 서비스 제공을 위해 필요한 범위에서 제3자에게 위탁하거나 제공할 수 있으며, 해당 사실과 내용을 사전에 고지합니다.
        </p>
      </section>

      {/* 5. 파기절차 및 방법 */}
      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">5. 개인정보의 파기절차 및 방법</h2>
        <p className="leading-7">
          보유기간 만료 또는 처리 목적 달성 시 지체 없이 파기하며, 전자적 파일 형태 정보는 복구·재생이 불가능한 기술적 방법으로 파기합니다.
        </p>
      </section>

      {/* 6. 안전성 확보조치 */}
      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">6. 개인정보의 안전성 확보 조치</h2>
        <ul className="list-disc pl-6 leading-7">
          <li>접속권한 관리(역할 기반 접근), 암호화 전송(HTTPS), 접근 로그 보관</li>
          <li>외부 위탁 시 해당 업체의 보안성 검토 및 관리·감독</li>
        </ul>
      </section>

      {/* 7. 권리 행사 */}
      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">7. 이용자 및 법정대리인의 권리와 행사방법</h2>
        <p className="leading-7">
          회원은 언제든지 본인 정보 열람·정정·삭제·처리정지를 요청할 수 있으며, 문의는 고객센터 또는 이메일로 접수하실 수 있습니다.
        </p>
      </section>

      {/* 8. 고지의 의무 */}
      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">8. 고지의 의무</h2>
        <p className="leading-7">
          본 방침은 관련 법령, 서비스 정책 변경에 따라 개정될 수 있으며, 중요한 변경사항이 있는 경우 서비스 내 공지 또는 이메일로 안내합니다.
        </p>
      </section>

      <p className="text-sm opacity-70">시행일: 2025-09-23</p>
    </main>
  );
}
