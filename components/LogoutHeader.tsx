'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase'; // ✅ 프로젝트에서 사용중인 경로를 유지하세요.
import dayjs from 'dayjs';

// ⚠️ dayjs locale/timezone을 쓰고 있다면 이곳에서 설정하세요.
// import 'dayjs/locale/ko'; dayjs.locale('ko');

type PlanType = 'basic' | 'premium' | null;

interface UserState {
  email: string | null;
  uid: string | null;
  plan: PlanType;
  subscriptionEndsAt: Date | null;
  lastUsedAt: Date | null;
}

export default function LogoutHeader() {
  // ✅ UI/디자인 보존: 기존 Header의 바깥 div, 정렬/간격 className은 그대로 유지하고
  //    필요한 정보만 얹는 방식(텍스트 배지 + 버튼)으로 최소 변경합니다.
  const [user, setUser] = useState<User | null>(null);
  const [u, setU] = useState<UserState>({
    email: null,
    uid: null,
    plan: null,
    subscriptionEndsAt: null,
    lastUsedAt: null,
  });

  // 구독/업그레이드 팝업 제어 (기존 SubscribePopup과 연동)
  const [showSubscribe, setShowSubscribe] = useState(false);

  // 업그레이드 모드일 경우 프리미엄만 선택 가능하도록 상태 전달
  const [subscribeMode, setSubscribeMode] = useState<'new' | 'upgrade'>('new');
  const [lockedPlan, setLockedPlan] = useState<PlanType>(null); // 'premium' 고정 등
  const [disabledPlans, setDisabledPlans] = useState<PlanType[]>([]); // ['basic'] 등

  // 🔹 인증 상태 구독 + 유저 문서 실시간 구독
  useEffect(() => {
    const unSub = onAuthStateChanged(auth, async (fbUser) => {
      setUser(fbUser ?? null);
      if (!fbUser) {
        setU({ email: null, uid: null, plan: null, subscriptionEndsAt: null, lastUsedAt: null });
        return;
      }

      const ref = doc(db, 'users', fbUser.uid);

      // 마지막 사용일을 현재 시각으로 갱신(로그인/새로고침 시점)
      try {
        await updateDoc(ref, { lastUsedAt: serverTimestamp() });
      } catch {
        // 읽기 전용 권한 등으로 실패할 수 있음. 실패해도 UI는 계속 진행.
      }

      // 실시간 구독으로 plan/만료일/마지막 사용일 표시
      return onSnapshot(ref, (snap) => {
        const d = snap.data() || {};
        // ⚠️ 필드 매핑: 현재 프로젝트에서 쓰는 필드명에 맞게 필요 시 수정하세요.
        const plan: PlanType = (d.plan ?? null) as PlanType;

        // Firestore Timestamp 또는 문자열을 Date로 안전 변환
        const toDate = (v: any): Date | null => {
          if (!v) return null;
          // Firestore Timestamp
          if (v?.toDate) return v.toDate();
          // ISO/number
          const dt = new Date(v);
          return isNaN(dt.getTime()) ? null : dt;
        };

        setU({
          email: fbUser.email,
          uid: fbUser.uid,
          plan,
          subscriptionEndsAt: toDate(d.subscriptionEndsAt),
          lastUsedAt: toDate(d.lastUsedAt),
        });
      });
    });

    return () => {
      if (typeof unSub === 'function') unSub();
    };
  }, []);

  // 남은 일수 계산 (만료일 없으면 null)
  const daysLeft = useMemo(() => {
    if (!u.subscriptionEndsAt) return null;
    const today = dayjs();
    const end = dayjs(u.subscriptionEndsAt);
    const diff = end.startOf('day').diff(today.startOf('day'), 'day');
    return diff;
  }, [u.subscriptionEndsAt]);

  // 마지막 사용일 포맷
  const lastUsedLabel = useMemo(() => {
    if (!u.lastUsedAt) return null;
    return dayjs(u.lastUsedAt).format('YYYY-MM-DD HH:mm');
  }, [u.lastUsedAt]);

  // 버튼/배지 상태
  const isPremium = u.plan === 'premium';
  const isBasic = u.plan === 'basic';
  const isGuest = !u.uid;

  // 클릭: 새 구독(게스트/미구독) 또는 업그레이드(Basic)
  const handleSubscribeClick = () => {
    // 새 구독 모드: 모든 플랜 선택 가능(프로젝트의 기존 SubscribePopup 기본 동작)
    setSubscribeMode('new');
    setLockedPlan(null);
    setDisabledPlans([]); // 모두 허용
    setShowSubscribe(true);
  };

  const handleUpgradeClick = () => {
    // 업그레이드 모드: premium만 클릭 가능하도록 제약
    setSubscribeMode('upgrade');
    setLockedPlan('premium');     // 기본 선택 고정
    setDisabledPlans(['basic']);  // basic 비활성화
    setShowSubscribe(true);
  };

  // ✅ 기존 Header의 레이아웃/디자인은 유지: 배지/버튼만 ‘기존 자리’에 얹어주세요.
  // 아래는 예시 구조입니다. 프로젝트의 현재 className들을 그대로 두고,
  // 배지 <span>들과 버튼만 적절한 위치에 배치하세요.
  return (
    <div className="flex items-center gap-3">
      {/* 🔹 남은기간/마지막사용일 배지: 사용자 이메일 앞쪽에 작게 노출 */}
      {u.uid && (
        <div className="flex items-center gap-2">
          {/* 남은 기간 배지: premium/basic 공통 표기(만료일 있는 경우) */}
          {daysLeft !== null && (
            <span
              className="px-2 py-0.5 rounded-full text-xs border border-gray-300/60 dark:border-gray-600/60"
              title={u.subscriptionEndsAt ? `만료일: ${dayjs(u.subscriptionEndsAt).format('YYYY-MM-DD')}` : undefined}
            >
              남은 {daysLeft}일
            </span>
          )}
          {/* 마지막 사용일 배지 */}
          {lastUsedLabel && (
            <span
              className="px-2 py-0.5 rounded-full text-xs border border-gray-300/60 dark:border-gray-600/60"
              title="마지막 사용일"
            >
              마지막 {lastUsedLabel}
            </span>
          )}
        </div>
      )}

      {/* 🔹 기존에 표시하던 사용자 이메일/프로필 영역 (디자인 유지) */}
      <div className="flex items-center">
        {u.email ? (
          <span className="text-sm font-medium">{u.email}</span>
        ) : (
          <span className="text-sm opacity-70">로그인 필요</span>
        )}
      </div>

      {/* 🔹 구독/업그레이드/프리미엄 배지(기존 버튼 자리에 그대로 배치) */}
      <div className="ml-2">
        {/* Premium이면 버튼 대신 상태 배지(디자인 유지 차원에서 소형 텍스트로) */}
        {isPremium && (
          <span className="text-xs px-2 py-0.5 rounded-full border border-emerald-500/60 text-emerald-600 dark:text-emerald-400">
            프리미엄 이용중
          </span>
        )}

        {/* Basic이면 ‘업그레이드’ 버튼만 노출 */}
        {isBasic && (
          <button
            type="button"
            onClick={handleUpgradeClick}
            className="px-3 py-1 text-xs rounded-md border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label="프리미엄으로 업그레이드"
            title="프리미엄으로 업그레이드"
          >
            업그레이드
          </button>
        )}

        {/* 미구독(또는 비로그인)이면 ‘구독’ 버튼 노출 */}
        {!isPremium && !isBasic && (
          <button
            type="button"
            onClick={handleSubscribeClick}
            className="px-3 py-1 text-xs rounded-md border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label="구독"
            title="구독"
            disabled={isGuest} // 비로그인 시 비활성화(혹은 로그인 유도)
          >
            구독
          </button>
        )}
      </div>

      {/* 🔹 기존 SubscribePopup 연동: 디자인/컴포넌트는 그대로, 상태만 전달 */}
      {/* 
        ⬇️ 프로젝트에 이미 있는 SubscribePopup을 그대로 사용하세요.
        - props 예시는 아래와 동일 이름으로 추가만 해주면 됩니다.
        - 만약 SubscribePopup이 전역(레이아웃)에서 렌더링된다면,
          전역 컨텍스트/상태로 치환해 동일한 값을 전달하면 됩니다.
      */}
      {/* <SubscribePopup
        open={showSubscribe}
        onClose={() => setShowSubscribe(false)}
        mode={subscribeMode}               // 'new' | 'upgrade'
        lockedPlan={lockedPlan}            // 'premium' | null
        disabledPlans={disabledPlans}      // ['basic'] 등
        // 필요 시 현재 사용자 정보도 넘겨 결제 후 Firestore 업데이트에 활용
        userEmail={u.email ?? undefined}
        userId={u.uid ?? undefined}
      /> */}
    </div>
  );
}
