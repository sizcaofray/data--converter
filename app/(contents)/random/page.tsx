// 📄 convert/convert/page.tsx
'use client';

import dynamic from 'next/dynamic';

const FileUploader = dynamic(() => import('../../../components/FileUploader'), {
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
