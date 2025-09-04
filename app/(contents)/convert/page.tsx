'use client';
/**
 * app/(contents)/convert/page.tsx
 * 목적: 좌측 메뉴 클릭 시 우측 영역에 '파일 변환' 화면이 즉시 렌더되도록 하는 단순 클라이언트 페이지
 * - 인증/구독/리다이렉트 로직 없음(메뉴 동작 확인용)
 * - 동적 import 시 SSR을 비활성화하여 클라이언트 전용 컴포넌트 문제를 방지
 * - 로딩 상태를 명확히 표시하여 UX 개선
 */

import dynamic from 'next/dynamic';

// ⚠️ 경로는 '현재 프로젝트 구조' 기준으로 유지합니다.
//    (프로젝트에서 '@' 경로 별칭을 쓰는 경우에만 '@/components/FileUploader' 로 바꿔도 됩니다.)
const FileUploader = dynamic(
  () => import('../../../components/FileUploader'),
  {
    ssr: false, // 클라이언트 전용으로 렌더
    // 동적 로딩 중 간단한 플레이스홀더
    loading: () => (
      <div className="text-sm text-gray-500">업로더 로딩 중…</div>
    ),
  }
);

export default function ConvertPage() {
  return (
    <section className="space-y-4">
      {/* 상단 타이틀/설명: 메뉴 전환 시 이 영역이 페이지별로 바뀌어 보여야 합니다. */}
      <header>
        <h1 className="text-2xl font-bold">📁 파일 변환</h1>
        <p className="text-sm text-gray-500">
          좌측 메뉴 클릭 시 이 영역이 교체되어야 합니다.
        </p>
      </header>

      {/* 실제 업로더 UI (클라이언트 전용 컴포넌트) */}
      <FileUploader />
    </section>
  );
}
