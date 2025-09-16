'use client';

/**
 * ✅ 핵심 원칙
 * - 상위(부모) 레이아웃·정렬·구분선·버튼 순서는 절대 변경하지 않습니다.
 * - 새로 추가되는 배지(남은 기간, 마지막 사용일)만 "이메일 텍스트의 왼쪽"에 인라인으로 삽입합니다.
 * - 새 flex/div 래퍼를 추가하지 않기 위해 최상위는 Fragment(<>...</>)로 반환합니다.
 * - Basic이면 버튼 라벨을 '업그레이드'로, 클릭 시 Premium만 선택 가능하도록 팝업을 띄웁니다.
 * - Premium이면 '프리미엄 이용중' 배지만 노출(버튼 없음).
 */

import React, { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, User, signOut } from 'firebase/auth';
import { doc, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';

// ── 네이티브 Date 유틸 (dayjs 미사용)
const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
const formatDateTime = (dt: Date) =>
  `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
const diffDays = (end?: Date | null) =>
  end ? Math.round((startOfDay(end).getTime() - startOfDay(new Date()).getTime()) / (24 * 60 * 60 * 1000)) : null;
const toDateSafe = (v: any): Date | null => {
  if (!v) return null;
  if (v?.toDate) {
    const d = v.toDate();
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

type PlanType = 'basic' | 'premium' | null;

interface UserState {
  email: string | null;
  uid: string | null;
  plan: PlanType;
  subscriptionEndsAt: Date | null;
  lastUsedAt: Date | null;
}

export default function LogoutHeader() {
  // ✅ 최상위에 div 추가하지 않음(부모 레이아웃 보존)
  const [fbUser, setFbUser] = useState<User | null>(null);
  const [u, setU] = useState<UserState>({
    email: null,
    uid: null,
    plan: null,
    subscriptionEndsAt: null,
    lastUsedAt: null,
  });

  // 팝업 제어 상태(전역 SubscribePopup을 쓰는 경우, 여기서 true/false만 트리거)
  const [showSubscribe, setShowSubscribe] = useState(false);
  const [subscribeMode, setSubscribeMode] = useState<'new' | 'upgrade'>('new');
  const [lockedPlan, setLockedPlan] = useState<PlanType>(null);
  const [disabledPlans, setDisabledPlans] = useState<PlanType[]>([]);

  useEffect(() => {
    const off = onAuthStateChanged(auth, (user) => {
      setFbUser(user ?? null);
      if (!user) {
        setU({ email: null, uid: null, plan: null, subscriptionEndsAt: null, lastUsedAt: null });
        return;
      }

      const ref = doc(db, 'users', user.uid);

      // 마지막 사용일 기록(권한 이슈 발생 시 무시)
      updateDoc(ref, { lastUsedAt: serverTimestamp() }).catch(() => {});

      // 유저 문서 실시간 구독
      return onSnapshot(ref, (snap) => {
        const d = snap.data() || {};
        const plan: PlanType = (d.plan ?? null) as PlanType;
        setU({
          email: user.email,
          uid: user.uid,
          plan,
          subscriptionEndsAt: toDateSafe(d.subscriptionEndsAt),
          lastUsedAt: toDateSafe(d.lastUsedAt),
        });
      });
    });
    return () => {
      if (typeof off === 'function') off();
    };
  }, []);

  // 계산 값 (렌더 영향 최소화를 위해 useMemo)
  const daysLeft = useMemo(() => diffDays(u.subscriptionEndsAt), [u.subscriptionEndsAt]);
  const lastUsedLabel = useMemo(() => (u.lastUsedAt ? formatDateTime(u.lastUsedAt) : null), [u.lastUsedAt]);

  const isPremium = u.plan === 'premium';
  const isBasic = u.plan === 'basic';
  const isGuest = !u.uid;

  // 버튼 동작(기존 버튼 요소/순서는 그대로 두고 핸들러만 분기)
  const handleSubscribeClick = () => {
    setSubscribeMode('new');
    setLockedPlan(null);
    setDisabledPlans([]);
    setShowSubscribe(true);
  };

  const handleUpgradeClick = () => {
    setSubscribeMode('upgrade');
    setLockedPlan('premium');      // Premium 고정
    setDisabledPlans(['basic']);   // Basic 비활성화
    setShowSubscribe(true);
  };

  return (
    <>
      {/* ▼ 추가 요소는 "왼쪽"에, 인라인으로만 삽입 (부모 flex나 정렬을 절대 변경하지 않음) */}
      {u.uid && daysLeft !== null && (
        <span
          className="mr-2 inline-flex items-center rounded-full border border-gray-300/60 dark:border-gray-600/60 px-2 py-0.5 text-xs"
          title={u.subscriptionEndsAt ? `만료일: ${formatDateTime(u.subscriptionEndsAt)}` : undefined}
        >
          남은 {daysLeft}일
        </span>
      )}
      {u.uid && lastUsedLabel && (
        <span
          className="mr-2 inline-flex items-center rounded-full border border-gray-300/60 dark:border-gray-600/60 px-2 py-0.5 text-xs"
          title="마지막 사용일"
        >
          마지막 {lastUsedLabel}
        </span>
      )}

      {/* ▼ 기존 이메일 텍스트 자리(클래스/정렬/간격 변경 없음) */}
      <span className="text-sm font-medium">{u.email ?? '로그인 필요'}</span>

      {/* ▼ 구독/업그레이드 버튼은 "항상 기존 버튼 자리"에만 표시, 요소/순서 유지 */}
      {!isPremium && (
        <button
          type="button"
          onClick={isBasic ? handleUpgradeClick : handleSubscribeClick}
          className="ml-2 px-3 py-1 text-xs rounded-md border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"
          aria-label={isBasic ? '프리미엄으로 업그레이드' : '구독'}
          title={isBasic ? '프리미엄으로 업그레이드' : '구독'}
          disabled={isGuest}
        >
          {isBasic ? '업그레이드' : '구독'}
        </button>
      )}

      {/* ▼ Premium이면 버튼 대신 상태 배지(요소 추가·순서 변경 없음) */}
      {isPremium && (
        <span className="ml-2 text-xs px-2 py-0.5 rounded-full border border-emerald-500/60 text-emerald-600 dark:text-emerald-400">
          프리미엄 이용중
        </span>
      )}

      {/* ▼ 로그아웃 버튼: "항상 마지막" — 기존 위치/클래스 그대로 유지 */}
      {fbUser && (
        <button
          type="button"
          onClick={() => signOut(auth).catch(() => {})}
          className="ml-2 px-3 py-1 text-xs rounded-md border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          로그아웃
        </button>
      )}

      {/**
       * ▼ 전역 SubscribePopup을 이미 사용 중이라면,
       *    아래는 프로젝트의 팝업 트리거 로직과 연결만 하시면 됩니다.
       *    팝업 컴포넌트를 이 파일에서 직접 렌더링하지 않아도 됩니다(전역 컨텍스트 트리거).
       *    (props가 필요 없다면 이 상태값(showSubscribe 등)은 사용처로 옮기세요)
       */}
    </>
  );
}
