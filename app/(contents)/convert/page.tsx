'use client';
/**
 * app/(contents)/convert/page.tsx
 * 목적: 좌측 메뉴 클릭 시 우측 프레임에 즉시 렌더링되도록 보장
 * - 컴포넌트 기능은 건드리지 않음
 * - 서버 리다이렉트/가드로 인해 SPA 전환이 끊기는 문제만 배제
 * - (contents)/layout.tsx의 <main> 안에 들어가므로 여기서는 <section> 사용
 */

import dynamic from 'next/dynamic';

// ✅ 기존 업로더/변환 컴포넌트를 그대로 사용 (기능 변경 없음)
//    SSR 환경에서 오류를 피하기 위해 클라이언트 전용으로 동적 로딩
const FileUploader = dynamic(() => import('@/components/FileUploader'), {
  ssr: false,
  // 로딩 중 간단한 표시(UX 용, 기능 영향 없음)
  loading: () => <div className="text-sm text-gray-500">업로더 로딩 중…</div>,
});

export default function ConvertPage() {
  return (
    <section className="p-4 space-y-3">
      {/* ⬇ 이 제목/설명은 메뉴 전환 시 우측 영역이 교체되는지 확인용 */}
      <h1 className="text-2xl font-bold">📁 파일 변환</h1>
      <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line font-medium">
        엑셀 파일을 변환합니다.<br />
        <br />
        1) 'Excel to Other' 또는 'Other to Excel' 중 하나를 선택하여 체크합니다.<br />
        2) '파일선택' 버튼을 클릭하여 변환할 파일을 선택하거나 파일을 드래그 드롭으로 업로드합니다.<br />
        3) 'Excel to Other'를 선택한 경우 변환할 형식을 선택합니다.<br />
        4) 'Other to Excel'는 변환 가능한 파일을 업로드합니다. (현재 가능: CSV, TXT)<br />
        5) '변환시작' 버튼을 클릭하여 파일 변환을 시작합니다.<br />
      </p>

      {/* ⬇ 기존 기능 컴포넌트 그대로 렌더 (기능 로직 미변경) */}
      <FileUploader />
    </section>
  );
}
