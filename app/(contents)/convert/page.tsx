'use client';
/**
 * app/(contents)/convert/page.tsx
 * - 경로 교정: 기존의 app/(contents)/convert/convert/page.tsx → 상위로 이동
 * - SSR 금지: 업로더는 클라이언트 전용
 * - UI 텍스트는 기존 그대로 유지
 */

import dynamic from 'next/dynamic';

// 절대 경로 별칭 사용(프로젝트에서 Sidebar도 '@/components/Sidebar' 쓰고 있으므로 동일 규칙)
const FileUploader = dynamic(() => import('@/components/FileUploader'), {
  ssr: false,
});

export default function ConvertPage() {
  return (
    <>
      <h1 className="text-2xl font-bold mb-4">📁 파일 무작위 변환</h1>
      <p className="mb-4">여기에서 파일을 블라인드화(눈가림) 할 수 있습니다.</p>
      <FileUploader />
    </>
  );
}
