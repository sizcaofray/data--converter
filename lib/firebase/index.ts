'use client';

/**
 * lib/firebase/index.ts
 *
 * - 클라이언트 전용 Firebase 초기화(지연 초기화)
 * - 세션 퍼시스턴스: browserLocalPersistence (로그인 유지)
 * - Google 로그인: 팝업 대신 "리다이렉트 전용" (브라우저 정책에 가장 안전)
 * - 리다이렉트 결과 처리: completeRedirectSignIn()
 * - onAuthStateChanged 오버로드: (listener) / (auth, listener) 모두 지원
 * - Firestore 클라이언트 내보내기(db/getDbClient)
 * - 디버그 핸들: window.__FIREBASE__ 에 app/auth/db & debugGetUserDoc() 노출
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
  getRedirectResult,
  type Auth,
  type NextOrObserver,
  type Unsubscribe,
  type User,
} from 'firebase/auth';
import {
  getFirestore,
  type Firestore,
  doc,
  onSnapshot,
  getDoc,
} from 'firebase/firestore';

// ──────────────────────────────────────────────────────────────
// 내부 인스턴스(중복 초기화 방지)
let appInstance: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;

// ──────────────────────────────────────────────────────────────
// ENV 헬퍼(없을 때 빌드/런타임 죽이지 않고 경고만)
function env(name: string): string {
  const v = (process.env as any)[name];
  if (!v) console.warn(`[firebase] Missing ${name} (check Vercel Environment Variables)`);
  return v || '';
}

// ──────────────────────────────────────────────────────────────
// 디버그 핸들(window.__FIREBASE__) 노출
declare global {
  interface Window {
    __FIREBASE__?: {
      app: FirebaseApp | null;
      auth: Auth | null;
      db: Firestore | null;
      debugGetUserDoc?: () => Promise<any>;
    };
  }
}
function publishDebugHandles() {
  if (typeof window === 'undefined') return;
  window.__FIREBASE__ = {
    app: appInstance,
    auth: authInstance,
    db: dbInstance,
    async debugGetUserDoc() {
      try {
        if (!authInstance || !dbInstance) return null;
        const u = authInstance.currentUser;
        if (!u) return null;
        const snap = await getDoc(doc(dbInstance, 'users', u.uid));
        return snap.exists() ? snap.data() : null;
      } catch (e) {
        console.warn('[__FIREBASE__.debugGetUserDoc] error:', e);
        return null;
      }
    },
  };
}

// ──────────────────────────────────────────────────────────────
// 지연 초기화
function ensureInit() {
  if (appInstance && authInstance && dbInstance) return;

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
  dbInstance = getFirestore(appInstance);

  // 로그인 유지
  setPersistence(authInstance, browserLocalPersistence).catch((e) => {
    console.error('[firebase] setPersistence error:', e);
  });

  publishDebugHandles();
}

// ──────────────────────────────────────────────────────────────
// 공개 진입점들
export function getAuthClient(): Auth {
  ensureInit();
  if (!authInstance) {
    throw new Error('[firebase] auth not initialized. Check NEXT_PUBLIC_FIREBASE_* envs and client-side usage.');
  }
  return authInstance;
}

export function getDbClient(): Firestore {
  ensureInit();
  if (!dbInstance) {
    throw new Error('[firebase] db not initialized.');
  }
  return dbInstance;
}

export const db = (() => getDbClient())();

// onAuthStateChanged 오버로드: (listener) / (auth, listener)
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
// 구현: 런타임에서 첫 인자가 Auth처럼 보이면 (auth, listener), 아니면 (listener)
export function onAuthStateChanged(a: any, b?: any, c?: any, d?: any): Unsubscribe {
  ensureInit();
  if (!authInstance) throw new Error('[firebase] onAuthStateChanged called before init');
  const looksLikeAuth = a && typeof a === 'object' && 'app' in a && 'name' in a;
  if (looksLikeAuth) {
    return _onAuthStateChanged(authInstance, b, c, d);
  }
  return _onAuthStateChanged(authInstance, a, b, c);
}

// Google 로그인: 팝업 스킵하고 "리다이렉트 전용"
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

// 리다이렉트 결과 처리(초기 진입 시 한 번 호출 권장)
export async function completeRedirectSignIn(): Promise<boolean> {
  const auth = getAuthClient();
  try {
    const result = await getRedirectResult(auth);
    if (result?.user) {
      console.log('[firebase] redirect sign-in completed for:', result.user.email);
      return true;
    }
    return false;
  } catch (e) {
    console.error('[firebase] getRedirectResult error:', e);
    return false;
  }
}

// 로그아웃
export async function signOutUser() {
  const auth = getAuthClient();
  await signOut(auth);
}

// 기존 호환 alias (import { auth } from '@/lib/firebase')
export const authClient: Auth = (() => {
  const a = getAuthClient();
  return a;
})();
export { authClient as auth };
