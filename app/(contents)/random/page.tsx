'use client';
/**
 * app/(contents)/random/page.tsx
 * 목적: 좌측 메뉴에서 Random 클릭 시 우측 프레임에 즉시 렌더
 * - 기능 컴포넌트는 건드리지 않음
 * - 서버 리다이렉트/가드 없음(메뉴 전환 방해 제거)
 */

import dynamic from 'next/dynamic';

// 기존에 쓰던 컴포넌트를 그대로 사용한다면 경로 유지
// (프로젝트가 상대경로를 사용 중이므로 변경하지 않음)
const FileUploader = dynamic(() => import('../../../components/FileUploader'), {
  ssr: false,
  loading: () => <div className="text-sm text-gray-500">로딩 중…</div>,
});

export default function RandomPage() {
  return (
    <section className="p-4 space-y-3">
      <h1 className="text-2xl font-bold">🎲 랜덤 도구</h1>
      <p className="text-sm text-gray-500">
        좌측에서 <strong>Random</strong>을 클릭하면 이 영역이 우측 프레임에 표시됩니다.
      </p>

      {/* 기존 기능 컴포넌트 그대로 렌더 (기능 로직 변경 없음) */}
      <FileUploader />
    </section>
  );
}
