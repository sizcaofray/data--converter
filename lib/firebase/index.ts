'use client';

/**
 * lib/firebase/index.ts
 * - 클라이언트 전용 Firebase 초기화(지연 초기화)
 * - 영구 세션(browserLocalPersistence)
 * - 팝업 차단 시 redirect 폴백
 * - ✅ 내부 인스턴스 변수명 충돌 방지(authInstance)
 * - ✅ onAuthStateChanged 오버로드로 호환성 유지
 *    (기존처럼 onAuthStateChanged(auth, listener)로 호출해도 되고,
 *     onAuthStateChanged(listener)로 호출해도 동작)
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

// ── 환경변수 누락 시 콘솔 경고만 (런타임 중단 X)
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
        // 선택(없어도 됨)
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
  return authInstance!;
}

// ── onAuthStateChanged 오버로드(양쪽 호출 방식 모두 지원)
//    1) onAuthStateChanged(listener, error?, completed?)
//    2) onAuthStateChanged(auth, listener, error?, completed?)
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
  // 첫 인자가 Auth처럼 보이면(호환 모드): 전달된 Auth는 무시하고 우리 인스턴스를 사용
  const looksLikeAuth = a && typeof a === 'object' && 'app' in a && 'name' in a;
  if (looksLikeAuth) {
    return _onAuthStateChanged(authInstance!, b, c, d);
  }
  // 첫 인자가 listener인 모드
  return _onAuthStateChanged(authInstance!, a, b, c);
}

// ── Google 로그인 (팝업 → 차단 시 redirect 폴백)
export async function signInWithGoogle() {
  ensureInit();
  const provider = new GoogleAuthProvider();
  try {
    return await signInWithPopup(authInstance!, provider);
  } catch (e: any) {
    if (e?.code === 'auth/popup-blocked' || e?.code === 'auth/popup-closed-by-user') {
      console.warn('[firebase] popup blocked; fallback to redirect');
      return await signInWithRedirect(authInstance!, provider);
    }
    throw e;
  }
}

// ── 로그아웃
export async function signOutUser() {
  ensureInit();
  await signOut(authInstance!);
}

// ── 기존 import { auth } from '@/lib/firebase' 호환용 alias
export const authClient: Auth = (() => {
  ensureInit();
  return authInstance as Auth;
})();

export { authClient as auth };
