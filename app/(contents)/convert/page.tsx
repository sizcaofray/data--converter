// 📄 convert/convert/page.tsx
'use client';

import dynamic from 'next/dynamic';

const FileUploader = dynamic(() => import('../../../components/FileUploader'), {
  ssr: false,
});

export default function ConvertPage() {
  return (
    <>
      <h1 className="text-2xl font-bold mb-4">📁 파일 변환</h1>
      <p className="mb-4">여기에서 파일을 업로드하고 변환할 수 있습니다.</p>
      <FileUploader />
    </>
  );
}
