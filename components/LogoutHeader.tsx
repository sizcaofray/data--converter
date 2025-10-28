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
 *
 * ✅ 추가: settings/uploadPolicy.subscribeButtonEnabled 를 전역 게이트로 사용해
 *          버튼 “표시/숨김”만 제어(내부 동작/라우팅에는 관여하지 않음)
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
import { doc, getDoc, onSnapshot } from 'firebase/firestore'; // [추가] onSnapshot
import { useUser } from '@/contexts/UserContext';
import { useSubscribePopup } from '@/contexts/SubscribePopupContext';

/* ───────── 디버그 유틸 ───────── */
const useDebugFlag = () => {
  const sp = useSearchParams();
  const q = sp?.get('debug');
  const [on, setOn] = useState<boolean>(q === '1');
  useEffect(() => { if (q === '1') setOn(true); }, [q]);
  return on;
};
const dbg = (...args: any[]) => console.debug('[LogoutHeader]', ...args);

/* ───────── 만료일 유틸 ───────── */
const END_KEYS = [
  'endAt', 'endsAt', 'endDate', 'expireAt', 'expiredAt', 'paidUntil',
  'subscriptionEnd', 'planEnd', 'basicEnd', 'premiumEnd',
];

const toDateSafe = (v: any): Date | null => {
  try {
    if (!v) return null;
    if (typeof v === 'number') return new Date(v);
    if (typeof v === 'string') {
      const d = new Date(v.replace(/\./g, '-').replace(/\//g, '-'));
      return Number.isFinite(d.getTime()) ? d : null;
    }
    if (v?.toDate) return v.toDate();
    return null;
  } catch { return null; }
};

const pickEndRaw = (obj: any): any => {
  if (!obj || typeof obj !== 'object') return null;
  for (const k of END_KEYS) if (obj[k] != null) return obj[k];
  for (const nest of ['subscription', 'billing', 'plan', 'account']) {
    const box = obj[nest];
    if (box && typeof box === 'object') {
      for (const k of END_KEYS) if (box[k] != null) return box[k];
    }
  }
  return null;
};

const remainingDaysInclusive = (end: Date | null | undefined): number => {
  if (!end) return 0;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const endNext = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1, 0, 0, 0, 0);
  const diff = endNext.getTime() - start.getTime();
  if (!Number.isFinite(diff)) return 0;
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.max(Math.ceil(diff / dayMs), 0);
};

const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export default function LogoutHeader() {
  const router = useRouter();
  const debugOn = useDebugFlag();

  /* 컨텍스트들(예외 안전) */
  let popupCtx: any = null;
  try { popupCtx = useSubscribePopup(); } catch { popupCtx = null; }
  let userCtx: any = {};
  try { userCtx = useUser() ?? {}; } catch { userCtx = {}; }

  /* Auth */
  const [authUser, setAuthUser] = useState<FirebaseUser | null>(null);
  useEffect(() => {
    setPersistence(auth, browserLocalPersistence).catch(() => {});
    const unsub = onAuthStateChanged(auth, (u) => setAuthUser(u || null));
    return () => unsub();
  }, []);

  /* 역할 */
  const role: 'free' | 'basic' | 'premium' | 'admin' = useMemo(() => {
    const r = String(userCtx?.role ?? userCtx?.user?.role ?? 'free').toLowerCase();
    return (['free', 'basic', 'premium', 'admin'] as const).includes(r as any) ? (r as any) : 'free';
  }, [userCtx?.role, userCtx?.user?.role]);

  /* 만료일: 컨텍스트 → Firestore(폴백) */
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [endSource, setEndSource] = useState<'ctx' | 'fs' | 'none'>('none');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // 1) 컨텍스트
      const raw1 = pickEndRaw(userCtx?.user ?? userCtx);
      const d1 = toDateSafe(raw1);
      if (!cancelled && d1) { setEndDate(d1); setEndSource('ctx'); return; }

      // 2) Firestore
      const uid = authUser?.uid;
      if (!uid) { if (!cancelled) { setEndDate(null); setEndSource('none'); } return; }
      try {
        const snap = await getDoc(doc(db, 'users', uid));
        const data = snap.exists() ? snap.data() : {};
        const raw2 = pickEndRaw(data);
        const d2 = toDateSafe(raw2);
        if (!cancelled) { setEndDate(d2); setEndSource(d2 ? 'fs' : 'none'); }
        if (debugOn) dbg('FS user doc', data);
      } catch (e) {
        if (!cancelled) { setEndDate(null); setEndSource('none'); }
        if (debugOn) dbg('FS error', e);
      }
    })();
    return () => { cancelled = true; };
  }, [authUser?.uid, userCtx, debugOn]);

  const remain = useMemo(() => remainingDaysInclusive(endDate), [endDate]);
  const isExpired = remain <= 0;
  const badgeText = endDate ? `만료일 ${fmt(endDate)} (${remain}일)` : '만료일 0일';

  /* 버튼 노출 분기(만료 최우선) — 기존 로직 유지 */
  const showSubscribe = !!authUser && isExpired;
  const showUpgrade   = !!authUser && !isExpired && role === 'basic';
  const showManage    = !!authUser && !isExpired && (role === 'premium' || role === 'admin');

  /* ✅ 전역 게이트: settings/uploadPolicy.subscribeButtonEnabled (표시만 제어) */
  const [subscribeEnabled, setSubscribeEnabled] = useState<boolean>(true); // [추가]
  useEffect(() => { // [추가]
    const ref = doc(db, 'settings', 'uploadPolicy');
    const unsub = onSnapshot(ref, (snap) => {
      const data = (snap.data() as any) || {};
      const v = data?.subscribeButtonEnabled;
      setSubscribeEnabled(v === undefined ? true : !!v);
      if (debugOn) dbg('subscribeButtonEnabled =', v);
    });
    return () => unsub();
  }, [debugOn]);

  // 게이트 적용: 렌더 직전에만 AND 결합(내부 동작/라우팅 변경 없음)
  const _showSubscribe = showSubscribe && subscribeEnabled; // [추가]
  const _showUpgrade   = showUpgrade   && subscribeEnabled; // [추가]
  const _showManage    = showManage    && subscribeEnabled; // [추가]

  /* 버튼 액션: 팝업 우선, 없으면 /subscribe?open=1 */
  const goSubscribe = useCallback(() => {
    if (popupCtx?.open) { popupCtx.open(); if (debugOn) dbg('open subscribe via popup'); }
    else { router.push('/subscribe?open=1'); if (debugOn) dbg('open subscribe via route'); }
  }, [popupCtx, router, debugOn]);

  const goUpgrade = useCallback(() => {
    if (popupCtx?.open) { popupCtx.open(); if (debugOn) dbg('open upgrade via popup'); }
    else { router.push('/subscribe?upgrade=premium&open=1'); if (debugOn) dbg('open upgrade via route'); }
  }, [popupCtx, router, debugOn]);

  /* 로그인/로그아웃 (기존 유지) */
  const onLogin = async () => {
    try { await signInWithPopup(auth, new GoogleAuthProvider()); router.refresh(); }
    catch (e) { console.error('[Auth] 로그인 실패', e); }
  };
  const onLogout = async () => {
    try { await signOut(auth); router.push('/'); }
    catch (e) { console.error('[Auth] 로그아웃 실패', e); }
  };

  /* 마운트 로그 */
  useEffect(() => {
    if (!debugOn) return;
    dbg('MOUNT', {
      popupHasOpen: !!popupCtx?.open,
      authUid: authUser?.uid ?? null,
      role,
      endSource,
      endDate: endDate ? fmt(endDate) : null,
      remain,
      isExpired,
      showSubscribe, showUpgrade, showManage,
      subscribeEnabled, // [추가] 게이트 상태
    });
  }, [debugOn, popupCtx, authUser?.uid, role, endSource, endDate, remain, isExpired,
      showSubscribe, showUpgrade, showManage, subscribeEnabled]);

  /* ────── 아래는 현재 구조/클래스 유지 (우/좌 정렬 바뀌지 않음) ────── */
  return (
    <header className="w-full flex items-center justify-between px-4 py-3 bg-zinc-900 text-white">
      <div className="flex items-center gap-3">
        <a href="/" className="text-lg font-semibold">Data Convert</a>
      </div>

      <div className="flex items-center gap-2">
        {authUser && (
          <span className="text-xs px-2 py-0.5 rounded border border-white/20">
            {badgeText}
          </span>
        )}

        {/* [변경] 표시 조건만 _show* 로 치환 — 버튼 내부 동작/스타일은 그대로 */}
        {_showSubscribe && (
          <button
            type="button"
            onClick={goSubscribe}
            className="text-sm rounded px-3 py-1 border border-white/20 hover:bg-white/10"
          >
            구독
          </button>
        )}
        {_showUpgrade && (
          <button
            type="button"
            onClick={goUpgrade}
            className="text-sm rounded px-3 py-1 border border-white/20 hover:bg-white/10"
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
            onClick={onLogin}
            className="text-sm rounded px-3 py-1 bg-white/10 hover:bg-white/20"
          >
            로그인
          </button>
        ) : (
          <button
            type="button"
            onClick={onLogout}
            className="text-sm rounded px-3 py-1 bg-white/10 hover:bg-white/20"
          >
            로그아웃
          </button>
        )}
      </div>

      {/* 디버그 오버레이: ?debug=1일 때만 보임(레이아웃 영향 없음) */}
      {debugOn && (
        <div className="fixed bottom-2 right-2 z-[9999] text-[11px] bg-black/70 text-white px-2 py-1 rounded pointer-events-none">
          role:{role} · remain:{remain} · expired:{String(isExpired)} · end:{endDate ? fmt(endDate) : '—'} · src:{endSource} · popup:{String(!!popupCtx?.open)} · SUB:{String(subscribeEnabled)}
        </div>
      )}
    </header>
  );
}
