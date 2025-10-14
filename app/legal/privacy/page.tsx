'use client';
/**
 * 개인정보 처리방침 (우측 상단 '닫기(X)' 버튼 버전)
 * - 기존 상단의 '← 이전 화면으로' 버튼 제거
 * - 우측 상단 고정형 닫기(X) 버튼만 유지 (fixed)
 * - 문구/스타일/구조는 기존과 동일하게 유지
 */

import { Suspense, useCallback } from 'react';
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

  // ✅ 시행일(표기만) — 필요한 경우 날짜만 갱신
  const effectiveDate = '2025-10-01';

  // ✅ 뒤로가기/닫기: 히스토리가 있으면 뒤로, 없으면 ?from 또는 홈(/)로 이동
  const handleClose = useCallback(() => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      window.history.back();
      return;
    }
    const from = searchParams?.get('from') || '/';
    router.replace(from);
  }, [router, searchParams]);

  return (
    <main className="relative max-w-3xl mx-auto px-4 py-10">
      {/* ============================================
         📌 우측 상단 닫기(X) 버튼 (고정)
         - 스크롤과 무관하게 항상 보이도록 fixed 사용
         - 다크모드/반투명/그림자 포함
      ============================================ */}
      <button
        type="button"
        onClick={handleClose}
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
      <h1 className="text-2xl font-bold mb-6">개인정보 처리방침</h1>
      <p className="text-sm text-gray-500 mb-8">시행일: {effectiveDate}</p>

      {/* 1. 수집하는 개인정보 항목 */}
      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">1. 수집하는 개인정보 항목</h2>
        <ul className="list-disc pl-6 leading-7">
          <li>계정 식별정보: 이메일(구글 계정), 인증 토큰</li>
          <li>결제 정보: Bootpay 기반 결제 식별자(유료 이용 시)</li>
          <li>기술 정보: 접속 로그, IP, 브라우저/기기 정보, 쿠키 등</li>
          <li>고객 문의: 문의 제목/내용, 첨부 파일, 회신 이메일</li>
        </ul>
      </section>

      {/* 2. 개인정보의 수집 및 이용 목적 */}
      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">2. 개인정보의 수집 및 이용 목적</h2>
        <ul className="list-disc pl-6 leading-7">
          <li>회원 식별 및 로그인 유지, 부정 이용 방지</li>
          <li>파일 업로드/변환/다운로드 등 서비스 제공</li>
          <li>유료 결제 처리(승인·과금·환불·영수증 발급)</li>
          <li>고객 지원 및 공지/알림 전달</li>
          <li>서비스 품질/보안 향상 및 통계 분석</li>
        </ul>
      </section>

      {/* 3. 보유 및 이용 기간 */}
      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">3. 개인정보의 보유 및 이용 기간</h2>
        <ul className="list-disc pl-6 leading-7">
          <li>계정 정보: 회원 탈퇴 시 지체 없이 파기</li>
          <li>결제/거래 기록: 관련 법령(전자상거래법 등)에 따른 기간 보관</li>
          <li>업로드 파일/변환 결과: 고지된 정책 또는 사용자 설정 기간 내 자동 삭제</li>
          <li>접속 로그/쿠키: 보안 및 분석 목적 범위 내 단기 보관 후 파기/익명화</li>
        </ul>
      </section>

      {/* 4. 제3자 제공에 관한 사항 */}
      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">4. 개인정보의 제3자 제공</h2>
        <p className="leading-7">
          회사는 법령에 의한 경우 또는 이용자의 별도 동의가 있는 경우를 제외하고 개인정보를 제3자에게 제공하지 않습니다.
        </p>
      </section>

      {/* 5. 처리 위탁에 관한 사항 */}
      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">5. 개인정보의 처리 위탁</h2>
        <ul className="list-disc pl-6 leading-7">
          <li>호스팅/배포: Vercel</li>
          <li>인증/DB: Firebase(Auth/Firestore/Storage)</li>
          <li>결제대행: Bootpay</li>
          <li>분석/로그(사용 시): Google Analytics 등</li>
        </ul>
      </section>

      {/* 6. 국외 이전에 관한 사항 */}
      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">6. 국외 이전에 관한 사항</h2>
        <p className="leading-7">
          해외에 소재한 클라우드/수탁사에 개인정보가 저장·처리될 수 있습니다. 이전되는 항목·국가·보유 기간·보호조치 등은 본 방침 또는 별도 공지에 명시합니다.
        </p>
      </section>

      {/* 7. 정보주체의 권리와 행사 방법 */}
      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">7. 정보주체의 권리와 행사 방법</h2>
        <ul className="list-disc pl-6 leading-7">
          <li>개인정보 열람·정정·삭제·처리정지 요구 및 동의철회</li>
          <li>법정대리인의 권리 행사(미성년자 등)</li>
          <li>행사 방법: 고객센터 이메일로 요청(privacy@data-converter.com)</li>
        </ul>
      </section>

      {/* 8. 쿠키의 사용 */}
      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">8. 쿠키의 사용</h2>
        <p className="leading-7">
          로그인 유지 및 서비스 개선을 위해 쿠키를 사용할 수 있습니다. 사용자는 브라우저 설정을 통해 쿠키 저장을 거부할 수 있으나 일부 기능 이용에 제약이 발생할 수 있습니다.
        </p>
      </section>

      {/* 9. 안전성 확보 조치 */}
      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">9. 안전성 확보 조치</h2>
        <ul className="list-disc pl-6 leading-7">
          <li>전송구간 암호화(TLS), 비밀번호/토큰 안전 보관</li>
          <li>접근통제/권한관리, 접근기록 보관</li>
          <li>물리적·관리적 보호조치, 임직원 교육, 정기 점검</li>
        </ul>
      </section>

      {/* 10. 어린이의 개인정보 */}
      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">10. 어린이의 개인정보</h2>
        <p className="leading-7">
          원칙적으로 만 14세 미만 아동의 가입을 제한하거나, 필요한 경우 법정대리인의 동의를 받아 처리합니다.
        </p>
      </section>

      {/* 11. 개인정보 보호책임자(DPO) */}
      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">11. 개인정보 보호책임자</h2>
        <ul className="list-disc pl-6 leading-7">
          <li>연락처: zoochildfam@gmail.com</li>
        </ul>
      </section>

      {/* 12. 고지의 의무 */}
      <section className="mb-2">
        <h2 className="text-lg font-semibold mb-2">12. 고지의 의무</h2>
        <p className="leading-7">
          본 방침의 변경이 있는 경우 최소 7일 전(중대한 변경은 30일 전) 공지합니다.
        </p>
      </section>
      {/* ===== 본문 끝 ===== */}
    </main>
  );
}
