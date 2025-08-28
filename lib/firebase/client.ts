// lib/firebase/client.ts
// 목적: 브라우저(클라이언트)에서 사용할 Firebase App/Auth 초기화
// - 'use client'는 이 파일 자체엔 필요 없음 (이 모듈을 import하는 컴포넌트에서 선언)
// - 공개 가능한 키만 사용 (NEXT_PUBLIC_ 접두사)

import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';

// .env.example 에 키 이름만 남기고, 실제 값은 .env.local & Vercel ENV에 보관
const config = {
  apiKey: process.env.NEXT_PUBLIC_FB_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FB_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FB_PROJECT_ID!,
  appId: process.env.NEXT_PUBLIC_FB_APP_ID!,
  // 필요시: storageBucket, messagingSenderId 등 추가
};

// 이미 초기화된 앱이 있으면 재사용
const app: FirebaseApp = getApps().length ? getApp() : initializeApp(config);

// 브라우저에서만 쓰는 Auth 핸들러
export const auth: Auth = getAuth(app);
