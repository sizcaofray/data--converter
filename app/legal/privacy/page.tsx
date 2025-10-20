// 서버 함수 강제: 동적 + 캐시 끔 + Node 런타임
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { headers } from 'next/headers';
import Link from 'next/link';

/**
 * 개인정보 처리방침 — 개인(미등록/비법인) 운영 기준의 최소 구성
 * - 문의 이메일: zoochildfam@gmail.com
 * - 페이지는 서버에서 렌더링되도록 강제(λ 생성)
 */

export default function PrivacyPage() {
  headers();

  const effectiveDate = '2025-10-14';
  const contactEmail = 'zoochildfam@gmail.com';

  return (
    <main className="relative max-w-3xl mx-auto px-4 py-10">
      <div className="fixed top-3 right-3 md:top-6 md:right-6 z-50">
        <Link
          href="/"
          aria-label="닫기"
          className="inline-flex items-center justify-center rounded-full border border-black/10 bg-white/80 dark:bg-neutral-900/70 backdrop-blur w-9 h-9 md:w-10 md:h-10 text-lg font-bold shadow-lg hover:shadow-xl transition"
        >
          ×
        </Link>
      </div>

      <h1 className="text-2xl font-bold mb-6">개인정보 처리방침</h1>
      <p className="text-sm text-gray-500 mb-8">시행일: {effectiveDate}</p>

      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">1. 수집하는 항목</h2>
        <p className="leading-7">
          로그인 및 파일 변환 기능 제공을 위해 이메일(또는 소셜 로그인 계정)만을 최소한으로 수집합니다.
          주민등록번호, 실제 주소, 전화번호 등은 수집하지 않습니다.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">2. 이용 목적</h2>
        <p className="leading-7">
          수집한 정보는 계정 식별 및 로그인 유지, 서비스 제공, 고객 문의 응대 등 서비스 운영 목적에 한해 이용됩니다.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">3. 보유 및 파기</h2>
        <p className="leading-7">
          이용자가 계정을 삭제하거나 서비스 탈퇴 시 수집된 개인정보는 즉시 삭제합니다.
          시스템 보안 및 기록 관리를 위한 최소한의 로그는 최대 1년 이내 보관 후 파기합니다.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">4. 제3자 제공 및 위탁</h2>
        <p className="leading-7">
          법령상 요청이 있는 경우를 제외하고 개인정보를 제3자에게 제공하지 않습니다. 서비스 운영을 위해
          호스팅·인증·빌드 등의 일부 기능을 외부 서비스에 위탁할 수 있습니다(예: Firebase, Vercel).
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">5. 이용자의 권리</h2>
        <p className="leading-7">
          이용자는 자신의 개인정보에 대해 열람·정정·삭제를 요청할 수 있습니다. 요청은 아래 문의처로 연락하시기 바랍니다.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">6. 문의처</h2>
        <p className="leading-7">
          개인정보 관련 문의:{' '}
          <a href={`mailto:${contactEmail}`} className="underline">{contactEmail}</a>
        </p>
      </section>
    </main>
  );
}
