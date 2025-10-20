'use client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * 개인정보처리방침
 * - 동작 방식: SSR 강제(빌드 산출물에서 함수로 생성되도록), Node 런타임
 * - UI는 기존 구성(이전 화면 버튼 + 본문) 유지, 문구는 예전 파일 내용 기반 보완
 */

import { Suspense, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function PrivacyPage() {
  return (
    <Suspense
      fallback={
        <main className="max-w-3xl mx-auto px-4 py-10">
          <div className="text-sm opacity-70">로딩 중…</div>
        </main>
      }
    >
      <PrivacyBody />
    </Suspense>
  );
}

function PrivacyBody() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // 시행일(표기만) — 필요 시 여기만 수정
  const effectiveDate = '2025-09-26';

  const handleBack = useCallback(() => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      window.history.back();
      return;
    }
    const from = searchParams?.get('from') || '/';
    router.replace(from);
  }, [router, searchParams]);

  // 예전 파일에 있던 연락처(메일) 정보 유지
  const contact = useMemo(
    () => ({
      email: 'zoochildfam@gmail.com',
    }),
    []
  );

  return (
    <main className="max-w-3xl mx-auto px-4 py-10">
      {/* 상단 바: 뒤로가기 */}
      <div className="mb-6 flex items-center justify-between">
        <button
          onClick={handleBack}
          className="rounded border px-3 py-1 text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
          aria-label="이전 화면으로"
          title="이전 화면으로"
        >
          ← 이전 화면으로
        </button>
      </div>

      {/* 본문 */}
      <h1 className="text-2xl font-bold mb-6">개인정보처리방침</h1>

      {/* 1. 수집항목 및 수집방법 */}
      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">1. 수집하는 개인정보 항목 및 수집방법</h2>
        <ul className="list-disc pl-6 leading-7">
          <li>회원 식별: Google 계정 기본정보(이메일, 표시명) — Firebase Auth를 통해 수집</li>
          <li>결제 처리: 결제 식별자, 거래 번호 등 — Bootpay 연동 과정에서 수집</li>
          <li>서비스 이용: 업로드 파일 메타데이터(파일명, 크기, 형식) 및 처리 로그</li>
          <li>수집방법: 회원 가입/로그인, 결제 시점, 서비스 기능 이용 시 자동 수집</li>
        </ul>
      </section>

      {/* 2. 이용목적 */}
      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">2. 개인정보의 이용 목적</h2>
        <ul className="list-disc pl-6 leading-7">
          <li>회원 식별 및 인증, 부정 이용 방지</li>
          <li>구독 결제 처리, 결제 이력 관리, 고객 요청 응대</li>
          <li>파일 변환 제공 및 품질 개선(오류 분석, 처리 성능 개선 등)</li>
          <li>법적 의무 준수(전자상거래 등에서의 소비자보호 관련 법령 등)</li>
        </ul>
      </section>

      {/* 3. 보관 및 파기 */}
      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">3. 보관 기간 및 파기 절차</h2>
        <ul className="list-disc pl-6 leading-7">
          <li>계정정보: 회원 탈퇴 시 즉시 삭제. 다만, 관계 법령에 따라 일정 기간 보관될 수 있음.</li>
          <li>결제정보: 전자상거래 등 소비자보호 관련 법령에 따른 보관 기간 준수 후 파기.</li>
          <li>업로드 파일: 변환 목적 달성 후 지체 없이 삭제(일시 보관), 예외는 서비스 화면에 별도 고지.</li>
        </ul>
      </section>

      {/* 4. 제3자 제공/처리위탁/국외이전 */}
      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">4. 제3자 제공, 처리위탁 및 국외이전</h2>
        <ul className="list-disc pl-6 leading-7">
          <li>원칙적으로 회원의 개인정보를 제3자에게 판매하거나 임의 제공하지 않습니다.</li>
          <li>서비스 운영을 위해 다음 처리업무를 위탁/연동할 수 있습니다:
            <ul className="list-disc pl-6 mt-2">
              <li>인증/데이터 저장: Google Firebase(Auth/Firestore)</li>
              <li>결제: Bootpay(결제대행)</li>
              <li>호스팅/배포: Vercel</li>
            </ul>
          </li>
          <li>국외이전이 수반될 수 있으며(예: 글로벌 클라우드), 이전 국가, 이전 일시, 보관 장소, 보호조치 등은 해당 서비스 제공자의 정책과 국내법 기준에 따라 관리됩니다.</li>
        </ul>
      </section>

      {/* 5. 쿠키/로그 */}
      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">5. 쿠키 및 로그 정보</h2>
        <ul className="list-disc pl-6 leading-7">
          <li>서비스 품질 개선과 보안, 세션 유지를 위해 쿠키와 접속 로그가 사용될 수 있습니다.</li>
          <li>브라우저 설정으로 쿠키 저장을 거부할 수 있으나, 이 경우 일부 기능 이용이 제한될 수 있습니다.</li>
        </ul>
      </section>

      {/* 6. 이용자 권리 */}
      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">6. 이용자의 권리와 행사 방법</h2>
        <ul className="list-disc pl-6 leading-7">
          <li>개인정보 열람·정정·삭제·처리정지 요청이 가능합니다.</li>
          <li>요청은 서비스 내 ‘문의’ 또는 아래 연락처로 가능합니다. 법령상 예외 또는 기술적 제한이 있을 수 있습니다.</li>
        </ul>
      </section>

      {/* 7. 안전성 확보조치 */}
      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">7. 안전성 확보 조치</h2>
        <ul className="list-disc pl-6 leading-7">
          <li>접근통제, 암호화(전송 구간 TLS), 최소권한 원칙, 정기 점검 등 합리적 보호조치를 적용합니다.</li>
          <li>다만, 인터넷 특성상 보안사고의 위험을 완전히 배제할 수 없음을 알려드립니다.</li>
        </ul>
      </section>

      {/* 8. 아동의 개인정보 */}
      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">8. 아동의 개인정보 보호</h2>
        <p className="leading-7">
          본 서비스는 원칙적으로 만 14세 미만 아동을 대상으로 하지 않습니다. 해당 연령대의 이용이 필요한 경우,
          관련 법령에 따른 추가 동의 절차를 이행합니다.
        </p>
      </section>

      {/* 9. 방침의 변경 */}
      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">9. 개인정보처리방침의 변경</h2>
        <p className="leading-7">
          본 방침을 변경하는 경우 시행일 및 변경사유를 명시하여 서비스 화면에 사전 공지합니다.
        </p>
      </section>

      {/* 10. 문의 및 시행일 */}
      <section className="mb-2">
        <h2 className="text-lg font-semibold mb-2">10. 문의처 및 시행일</h2>
        <ul className="list-disc pl-6 leading-7">
          <li>문의: {contact.email}</li>
          <li>시행일: {effectiveDate}</li>
        </ul>
      </section>
    </main>
  );
}
