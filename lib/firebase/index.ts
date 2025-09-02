// lib/firebase/index.ts
// ✅ 클라이언트 전용 Firebase 초기화 단일 진입점 (App Router용)
// - NEXT_PUBLIC_* 환경변수 사용 (클라이언트)
// - 새로고침해도 유지: browserLocalPersistence
// - 팝업 차단 시 자동 리다이렉트 폴백
// - 기존 코드 호환: auth / onAuthStateChanged / signInWithGoogle / signOutUser 내보냄

'use client';

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  onAuthStateChanged as _onAuthStateChanged,
  type Auth,
} from 'firebase/auth';

// ── 내부 보관 인스턴스(중복 초기화 방지)
let app: FirebaseApp | null = null;
let auth: Auth | null = null;

// ── 환경변수 누락 시 콘솔 경고만 (런타임 죽이지 않음)
function env(name: string): string {
  const v = (process.env as any)[name];
  if (!v) console.warn(`[firebase] Missing ${name} (Vercel > Project > Environment Variables)`);
  return v || '';
}

// ── 지연 초기화: 최초 접근 시에만 실행
function ensureInit() {
  if (app && auth) return;
  app = getApps().length
    ? getApps()[0]!
    : initializeApp({
        apiKey: env('NEXT_PUBLIC_FIREBASE_API_KEY'),
        authDomain: env('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN'),
        projectId: env('NEXT_PUBLIC_FIREBASE_PROJECT_ID'),
        appId: env('NEXT_PUBLIC_FIREBASE_APP_ID'),
        // 선택: 아래 값들은 없어도 동작함
        storageBucket: (process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET as string) || undefined,
        messagingSenderId: (process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID as string) || undefined,
      });

  auth = getAuth(app);
  // 영구 세션: 새로고침/재방문 시 로그인 유지
  setPersistence(auth, browserLocalPersistence).catch((e) => {
    console.error('[firebase] setPersistence error:', e);
  });
}

// ── 외부 공개 API (기존 코드 호환)
export function getAuthClient(): Auth {
  ensureInit();
  return auth!;
}

export const onAuthStateChanged = (...args: Parameters<typeof _onAuthStateChanged>) => {
  ensureInit();
  return _onAuthStateChanged(auth!, ...args as any);
};

export async function signInWithGoogle() {
  ensureInit();
  const provider = new GoogleAuthProvider();
  try {
    return await signInWithPopup(auth!, provider);
  } catch (e: any) {
    if (e?.code === 'auth/popup-blocked' || e?.code === 'auth/popup-closed-by-user') {
      console.warn('[firebase] popup blocked; fallback to redirect');
      return await signInWithRedirect(auth!, provider);
    }
    throw e;
  }
}

export async function signOutUser() {
  ensureInit();
  await signOut(auth!);
}

// ── 기존 import { auth } from '@/lib/firebase' 호환을 위한 alias
//    (가능하면 앞으로는 getAuthClient()를 쓰세요)
export const auth = (() => {
  ensureInit();
  return auth!;
})();

