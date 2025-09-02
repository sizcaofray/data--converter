'use client';

/**
 * lib/firebase/index.ts
 * - 클라이언트 전용 Firebase 초기화(지연 초기화)
 * - 영구 세션(browserLocalPersistence)
 * - 팝업 차단 시 redirect 폴백
 * - 내부 인스턴스 변수명: authInstance (충돌 방지)
 * - onAuthStateChanged 오버로드: (auth, listener) / (listener) 모두 지원
 * - 기존 import { auth } from '@/lib/firebase' 호환을 위해 alias export 제공
 */

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
    // 이 지점에 오면 환경변수나 초기화 문제가 있는 것 → 명확한 메시지
    throw new Error('[firebase] auth not initialized. Check NEXT_PUBLIC_FIREBASE_* envs and client-side usage.');
  }
  return authInstance; // non-null 보장
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
    // 호출 형태: (auth, listener, error?, completed?)
    return _onAuthStateChanged(authInstance, b, c, d);
  }
  // 호출 형태: (listener, error?, completed?)
  return _onAuthStateChanged(authInstance, a, b, c);
}

// ── Google 로그인 (팝업 → 차단 시 redirect 폴백)
export async function signInWithGoogle() {
  const auth = getAuthClient();
  const provider = new GoogleAuthProvider();
  try {
    return await signInWithPopup(auth, provider);
  } catch (e: any) {
    if (e?.code === 'auth/popup-blocked' || e?.code === 'auth/popup-closed-by-user') {
      console.warn('[firebase] popup blocked; fallback to redirect');
      return await signInWithRedirect(auth, provider);
    }
    throw e;
  }
}

// ── 로그아웃
export async function signOutUser() {
  const auth = getAuthClient();
  await signOut(auth);
}

// ── 기존 import { auth } from '@/lib/firebase' 호환용 alias
export const authClient: Auth = (() => {
  const a = getAuthClient(); // 내부적으로 ensureInit + null 가드
  return a;
})();

export { authClient as auth };
