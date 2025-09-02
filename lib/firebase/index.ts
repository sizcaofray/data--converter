'use client';

/**
 * lib/firebase/index.ts
 * - 클라이언트 전용 Firebase 초기화(지연 초기화)
 * - 영구 세션(browserLocalPersistence)
 * - 팝업 대신 "리다이렉트 전용" 로그인 (브라우저 정책에 안전)
 * - 리다이렉트 결과 처리 completeRedirectSignIn() export
 * - onAuthStateChanged 오버로드: (auth, listener) / (listener) 모두 지원
 * - 기존 import { auth } from '@/lib/firebase' 호환 alias export 포함
 */

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  GoogleAuthProvider,
  signInWithRedirect,
  signOut,
  onAuthStateChanged as _onAuthStateChanged,
  getRedirectResult,            // ✅ 리다이렉트 결과 확인
  type Auth,
  type NextOrObserver,
  type Unsubscribe,
  type User,
} from 'firebase/auth';

// ── 내부 보관 인스턴스(중복 초기화 방지)
let appInstance: FirebaseApp | null = null;
let authInstance: Auth | null = null;

// ── 환경변수 누락 시 콘솔 경고(런타임 중단 X)
function env(name: string): string {
  const v = (process.env as any)[name];
  if (!v) console.warn(`[firebase] Missing ${name} (Vercel > Project > Environment Variables)`);
  return v || '';
}

// ── 지연 초기화: 최초 접근 시에만 실행
function ensureInit() {
  if (appInstance && authInstance) return;

  appInstance = getApps().length
    ? getApps()[0]!
    : initializeApp({
        apiKey: env('NEXT_PUBLIC_FIREBASE_API_KEY'),
        authDomain: env('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN'),
        projectId: env('NEXT_PUBLIC_FIREBASE_PROJECT_ID'),
        appId: env('NEXT_PUBLIC_FIREBASE_APP_ID'),
        // 선택 필드
        storageBucket: (process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET as string) || undefined,
        messagingSenderId: (process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID as string) || undefined,
      });

  authInstance = getAuth(appInstance);

  // 영구 세션: 새로고침/재방문 시 로그인 유지
  setPersistence(authInstance, browserLocalPersistence).catch((e) => {
    console.error('[firebase] setPersistence error:', e);
  });
}

// ── 외부 공개 API (기존 코드 호환)
export function getAuthClient(): Auth {
  ensureInit();
  if (!authInstance) {
    throw new Error('[firebase] auth not initialized. Check NEXT_PUBLIC_FIREBASE_* envs and client-side usage.');
  }
  return authInstance;
}

// ── onAuthStateChanged 오버로드
// 1) onAuthStateChanged(listener, error?, completed?)
// 2) onAuthStateChanged(auth, listener, error?, completed?)
export function onAuthStateChanged(
  listener: NextOrObserver<User>,
  error?: (error: Error) => void,
  completed?: () => void
): Unsubscribe;
export function onAuthStateChanged(
  _auth: Auth,
  listener: NextOrObserver<User>,
  error?: (error: Error) => void,
  completed?: () => void
): Unsubscribe;
export function onAuthStateChanged(
  a: any,
  b?: any,
  c?: any,
  d?: any
): Unsubscribe {
  ensureInit();
  if (!authInstance) {
    throw new Error('[firebase] auth not initialized. onAuthStateChanged called too early.');
  }
  const looksLikeAuth = a && typeof a === 'object' && 'app' in a && 'name' in a;
  if (looksLikeAuth) {
    return _onAuthStateChanged(authInstance, b, c, d);
  }
  return _onAuthStateChanged(authInstance, a, b, c);
}

/** ✅ Google 로그인: 팝업 없이 "리다이렉트 전용" */
export async function signInWithGoogle() {
  const auth = getAuthClient();
  const provider = new GoogleAuthProvider();
  try {
    await signInWithRedirect(auth, provider);
  } catch (e: any) {
    console.error('[firebase] signInWithRedirect error:', e);
    if (e?.code === 'auth/unauthorized-domain') {
      alert('로그인이 차단되었습니다. Firebase Authentication > Authorized domains에 현재 도메인을 추가하세요.');
    } else {
      alert('로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    }
    throw e;
  }
}

/** ✅ 리다이렉트 로그인 완료 처리 (초기 진입 시 한 번 호출)
 *  반환: true = 이번 진입에서 방금 로그인 완료됨, false = 결과 없음
 */
export async function completeRedirectSignIn(): Promise<boolean> {
  const auth = getAuthClient();
  try {
    const result = await getRedirectResult(auth);
    if (result?.user) {
      console.log('[firebase] redirect sign-in completed for:', result.user.email);
      return true;
    }
    return false;
  } catch (e: any) {
    console.error('[firebase] getRedirectResult error:', e);
    return false;
  }
}

/** 로그아웃 */
export async function signOutUser() {
  const auth = getAuthClient();
  await signOut(auth);
}

/** ✅ 기존 import { auth } from '@/lib/firebase' 호환용 alias */
export const authClient: Auth = (() => {
  const a = getAuthClient();
  return a;
})();

export { authClient as auth };
