// 📄 app/page.tsx
'use client';

import AuthForm from "@/components/AuthForm";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase/firebase"; // ✅ Firebase 인증 객체 import

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    // ✅ 로그인된 사용자인 경우 /convert 로 리디렉션
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        router.replace('/convert'); // ✅ '/convert/convert' → '/convert' 로 수정
      }
    });

    return () => unsubscribe();
  }, [router]);

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-100 to-gray-200 relative">
      {/* 로그인 폼 - 우측 상단 고정 */}
      <div className="absolute top-6 right-6 z-10">
        <AuthForm />
      </div>

      {/* 메인 콘텐츠 - 중앙 정렬 */}
      <div className="flex flex-col items-center justify-center text-center pt-32 px-4">
        <h1 className="text-5xl font-extrabold text-gray-800 mb-6 leading-tight">
          파일 변환 서비스
        </h1>
        <p className="text-lg text-gray-600 max-w-2xl">
          CSV, TXT, 엑셀 등 다양한 파일 형식을 <br />
          간편하고 빠르게 변환하세요.
        </p>

        <ul className="mt-10 space-y-3 text-gray-700 text-base">
          <li className="flex items-center justify-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
            클라우드 기반으로 설치 없이 사용
          </li>
          <li className="flex items-center justify-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
            즉각적인 파일 변환
          </li>
          <li className="flex items-center justify-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
            드래그 앤 드롭으로 다양한 포맷 변환
          </li>
        </ul>
      </div>
    </main>
  );
}
