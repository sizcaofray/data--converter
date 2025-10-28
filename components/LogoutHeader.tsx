'use client';

/**
 * components/LogoutHeader.tsx
 * ──────────────────────────────────────────────────────────────────────────
 * - 만료(남은 일수 ≤ 0) → "구독"
 * - 구독 중 role==='basic' → "업그레이드"
 * - 구독 중 role in {premium, admin} → "구독관리"
 * - 팝업 컨텍스트 없으면 /subscribe?open=1 로 라우팅
 * - ?debug=1 로 접속 시 콘솔 로그 + 우하단 작은 디버그 오버레이 표시
 *   (레이아웃 영향 없음)
 * - ✅ 추가: settings/uploadPolicy.subscribeButtonEnabled 전역 게이트
 */

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { auth, db } from '@/lib/firebase/firebase';
import {
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  signOut,
  GoogleAuthProvider,
  signInWithPopup,
  User as FirebaseUser,
} from 'firebase/auth';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { useUser } from '@/contexts/UserContext';
import { useSubscribePopup } from '@/contexts/SubscribePopupContext';

type Role = 'free' | 'basic' | 'premium' | 'admin';

interface UserRow {
  uid?: string;
  email?: string;
  role?: Role;
  endAt?: any; endsAt?: any; endDate?: any;
  expireAt?: any; expiredAt?: any; paidUntil?: any;
  subscriptionEnd?: any; planEnd?: any; basicEnd?: any; premiumEnd?: any;
  plan?: 'free' | 'basic' | 'premium';
  createdAt?: any; updatedAt?: any;
}

const END_KEYS = [
  'endAt','endsAt','endDate','expireAt','expiredAt','paidUntil',
  'subscriptionEnd','planEnd','basicEnd','premiumEnd',
];

const toDateSafe = (v: any): Date | null => {
  try {
    if (!v) return null;
    if (typeof v?.toDate === 'function') return v.toDate();
    const d = new Date(v);
    return isNaN(+d) ? null : d;
  } catch { return null; }
};

const getRemainDays = (u: UserRow): number | null => {
  for (const k of END_KEYS) {
    const d = toDateSafe((u as any)[k]);
    if (d) return Math.floor((d.getTime() - Date.now()) / 86400000);
  }
  return null;
};

const useQueryDebug = () => {
  const sp = useSearchParams();
  const on = sp?.get('debug') === '1';
  const [flag, setFlag] = useState<boolean>(on);
  useEffect(() => { if (on) setFlag(true); }, [on]);
  return flag;
};

export default function LogoutHeader() {
  const router = useRouter();
  const debug = useQueryDebug();

  const { user: authUser } = useUser();
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [userDoc, setUserDoc] = useState<UserRow | null>(null);
  const [showDebugOverlay, setShowDebugOverlay] = useState(false);
  const [popupOpen, setPopupOpen] = useState(false);

  // ✅ 전역 구독 버튼 ON/OFF
  const [subscribeEnabled, setSubscribeEnabled] = useState(true);

  // settings/uploadPolicy.subscribeButtonEnabled 실시간 구독
  useEffect(() => {
    const ref = doc(db, 'settings', 'uploadPolicy');
    const unsub = onSnapshot(ref, (snap) => {
      const data = (snap.data() as any) || {};
      const v = data?.subscribeButtonEnabled;
      setSubscribeEnabled(v === undefined ? true : !!v);
    });
    return () => unsub();
  }, []);

  // Firebase Auth 구독(기존 유지)
  useEffect(() => {
    setPersistence(auth, browserLocalPersistence);
    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user ?? null);
    });
    return () => unsub();
  }, []);

  // users/{uid} 문서 로드(기존 유지)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (!firebaseUser) {
          if (mounted) setUserDoc(null);
          return;
        }
        const ref = doc(db, 'users', firebaseUser.uid);
        const snap = await getDoc(ref);
        const data = (snap.data() as any) || null;
        if (mounted) setUserDoc(data);
      } catch (e) {
        console.warn('[LogoutHeader] user load failed:', e);
      }
    })();
    return () => { mounted = false; };
  }, [firebaseUser]);

  // 정책 계산(기존 유지)
  const remain = useMemo(() => (userDoc ? getRemainDays(userDoc) : null), [userDoc]);
  const expired = useMemo(() => (remain !== null ? remain <= 0 : false), [remain]);

  // 기본 노출 정책 (기존 유지)
  // - 무료/만료 → 구독
  // - basic → 업그레이드
  // - premium/admin → 구독관리
  const showSubscribe = useMemo(() => {
    if (!userDoc) return true;
    const role = userDoc.role ?? 'free';
    if (role === 'free') return true;
    return false;
  }, [userDoc]);

  const showUpgrade = useMemo(() => {
    if (!userDoc) return false;
    const role = userDoc.role ?? 'free';
    return role === 'basic';
  }, [userDoc]);

  const showManage = useMemo(() => {
    if (!userDoc) return false;
    const role = userDoc.role ?? 'free';
    return role === 'premium' || role === 'admin';
  }, [userDoc]);

  // ✅ 전역 게이트 적용
  const _showSubscribe = showSubscribe && subscribeEnabled;
  const _showUpgrade   = showUpgrade   && subscribeEnabled;
  const _showManage    = showManage    && subscribeEnabled;

  // 클릭 핸들러(기존 유지; Bootpay는 후속 작업)
  const openSubscribeFlow = useCallback(() => {
    router.push('/subscribe?open=1');
  }, [router]);

  return (
    <div className="flex items-center gap-3">
      {/* (기존: 우측 기타 요소 유지) */}

      {_showSubscribe && (
        <button
          type="button"
          onClick={openSubscribeFlow}
          className="text-sm rounded px-3 py-1 bg-blue-600 text-white hover:bg-blue-700"
        >
          구독
        </button>
      )}

      {_showUpgrade && (
        <button
          type="button"
          onClick={openSubscribeFlow}
          className="text-sm rounded px-3 py-1 bg-amber-500 text-white hover:bg-amber-600"
        >
          업그레이드
        </button>
      )}

      {_showManage && (
        <button
          type="button"
          onClick={() => router.push('/subscribe')}
          className="text-sm rounded px-3 py-1 border border-white/20 hover:bg-white/10"
        >
          구독관리
        </button>
      )}

      {authUser?.email && <span className="text-sm opacity-80">{authUser.email}</span>}

      {!authUser ? (
        <button
          type="button"
          onClick={() => router.push('/login')}
          className="text-sm rounded px-3 py-1 border hover:bg-white/10"
        >
          로그인
        </button>
      ) : (
        <button
          type="button"
          onClick={() => router.push('/logout')}
          className="text-sm rounded px-3 py-1 border hover:bg-white/10"
        >
          로그아웃
        </button>
      )}

      {/* 디버그 배지(옵션) */}
      {debug && (
        <div className="ml-2 text-[11px] text-slate-400">
          {subscribeEnabled ? 'SUB:ON' : 'SUB:OFF'} · {userDoc?.role ?? 'anon'}
        </div>
      )}
    </div>
  );
}
