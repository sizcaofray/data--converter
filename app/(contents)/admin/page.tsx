'use client';

/**
 * 관리자 페이지 (메뉴 비활성화 + 사용자 관리)
 * - UI/디자인 유지, 로직만 보완
 * - Firestore 규칙과 동일하게 "users/{uid}.role === 'admin'" 기준으로 관리자 판단
 * - 디버그 패널에 context role vs users문서 role 동시 노출
 */

import { useEffect, useMemo, useState } from 'react';
import { useUser } from '@/contexts/UserContext'; // 컨텍스트(표시용/보조)
import { db } from '@/lib/firebase/firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

// 날짜 유틸 (KST 기준)
const toKst = (d: Date) => {
  const tzOffset = 9 * 60; // KST +09:00
  return new Date(d.getTime() + (tzOffset - d.getTimezoneOffset()) * 60 * 1000);
};
const kstToday = () => {
  const now = new Date();
  const k = toKst(now);
  return new Date(k.getFullYear(), k.getMonth(), k.getDate());
};
const kstTodayPlusDays = (days: number) => {
  const base = kstToday();
  base.setDate(base.getDate() + days);
  return base;
};
const inputDateToDate = (input: string) => {
  // yyyy-MM-dd → Date (KST 00:00:00)
  const [y, m, d] = input.split('-').map((x) => Number(x));
  return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0);
};
const formatDate = (d: Date | null) => (d ? format(d, 'yyyy-MM-dd', { locale: ko }) : '');
const tsToDate = (ts: Timestamp | null | undefined) => (ts ? ts.toDate() : null);

type Role = 'admin' | 'basic' | 'premium' | 'free' | undefined;

interface UserRow {
  uid: string;
  email?: string | null;
  displayName?: string | null;

  role?: Role;
  tier?: 'free' | 'basic' | 'premium'; // 표시용
  createdAt?: Timestamp | null;

  // 구독 관련
  subscriptionStartAt?: Timestamp | null;
  subscriptionEndAt?: Timestamp | null;
  remainingDays?: number | null;

  // 디버그/관리용
  lastLoginAt?: Timestamp | null;
  lastPaidAt?: Timestamp | null;
}

const roleToTier = (role?: Role): UserRow['tier'] => {
  switch (role) {
    case 'premium':
      return 'premium';
    case 'basic':
      return 'basic';
    default:
      return 'free';
  }
};

const calcRemainingDaysFromEnd = (end: Timestamp | null): number => {
  if (!end) return 0;
  const endDate = toKst(end.toDate());
  const today = kstToday();
  const diff = Math.ceil((endDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  return Math.max(0, diff);
};

export default function AdminPage() {
  const ctx = useUser(); // { user, role } 등
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 컨텍스트 표기용
  const ctxRole: Role = ctx?.role as Role;
  const tier = roleToTier(ctxRole);

  // 권한 가드: 관리자만 접근(표시)
  const isAdmin = ctxRole === 'admin';

  // Firestore에서 users 목록 로드
  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      // 관리자 우선 50명
      const qAdmin = query(
        collection(db, 'users'),
        where('role', '==', 'admin'),
        orderBy('createdAt', 'desc'),
        limit(50)
      );
      const adminSnap = await getDocs(qAdmin);

      // 일반 사용자
      const qUsers = query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(200));
      const userSnap = await getDocs(qUsers);

      const mapDoc = (d: any): UserRow => {
        const data = d.data() || {};
        const role = (data.role as Role) ?? undefined;
        const row: UserRow = {
          uid: d.id,
          email: data.email ?? null,
          displayName: data.displayName ?? null,
          role,
          tier: roleToTier(role),
          createdAt: data.createdAt ?? null,
          subscriptionStartAt: data.subscriptionStartAt ?? null,
          subscriptionEndAt: data.subscriptionEndAt ?? null,
          remainingDays: data.remainingDays ?? null,
          lastLoginAt: data.lastLoginAt ?? null,
          lastPaidAt: data.lastPaidAt ?? null,
        };
        // 정합성: remainingDays가 없으면 subscriptionEndAt로 계산
        if (row.remainingDays == null) {
          row.remainingDays = calcRemainingDaysFromEnd(row.subscriptionEndAt ?? null);
        }
        return row;
      };

      const list = [...adminSnap.docs, ...userSnap.docs].map(mapDoc);

      // 중복 uid 제거
      const uniq = new Map<string, UserRow>();
      list.forEach((r) => uniq.set(r.uid, r));
      const merged = Array.from(uniq.values());

      setRows(merged);
    } catch (e: any) {
      console.error(e);
      setError(e?.message || '불러오기 실패');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  // 행 수정
  const patchRow = async (uid: string, patch: Partial<UserRow>) => {
    try {
      const ref = doc(db, 'users', uid);
      const payload: any = { ...patch, updatedAt: serverTimestamp() };
      await updateDoc(ref, payload);
      setRows((prev) =>
        prev.map((r) => (r.uid === uid ? { ...r, ...patch } : r))
      );
    } catch (e: any) {
      console.error(e);
      alert('수정 중 오류가 발생했습니다: ' + (e?.message || 'unknown'));
    }
  };

  // 역할 변경
  const changeRole = (r: UserRow, v: Role) => {
    patchRow(r.uid, { role: v, tier: roleToTier(v) });
  };

  // 구독 시작/종료 날짜 편집
  const changeStart = (r: UserRow, input: string) => {
    const newStart = inputDateToDate(input);
    const end = r.subscriptionEndAt?.toDate() ?? null;
    // end보다 start가 뒤가 되면 end를 start+1일로 보정
    const clampedEnd =
      end && newStart && end.getTime() < newStart.getTime()
        ? new Date(newStart.getFullYear(), newStart.getMonth(), newStart.getDate() + 1)
        : end;
    const endTs = clampedEnd ? Timestamp.fromDate(clampedEnd) : null;

    patchRow(r.uid, {
      subscriptionStartAt: Timestamp.fromDate(newStart),
      subscriptionEndAt: endTs,
      remainingDays: calcRemainingDaysFromEnd(endTs ? Timestamp.fromDate(endTs) : null),
    });
  };

  const changeEnd = (r: UserRow, input: string) => {
    const newEnd = inputDateToDate(input);
    const start = r.subscriptionStartAt?.toDate() ?? null;
    // start보다 end가 앞이면 end=start+1일로 보정
    const clampedEnd =
      start && newEnd && newEnd.getTime() < start.getTime()
        ? new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1)
        : newEnd;
    const endTs = clampedEnd ? Timestamp.fromDate(clampedEnd) : null;

    patchRow(r.uid, {
      subscriptionEndAt: endTs,
      remainingDays: calcRemainingDaysFromEnd(endTs ? Timestamp.fromDate(endTs) : null),
    });
  };

  const changeRemainingDays = (r: UserRow, val: string) => {
    const n = Math.max(0, Number(val || 0));
    const endDate = kstTodayPlusDays(n);
    patchRow(r.uid, { remainingDays: n, subscriptionEndAt: Timestamp.fromDate(endDate) });
  };

  const changeStartDate = (r: UserRow, input: string) => {
    const newStart = inputDateToDate(input);
    const currEnd = r.subscriptionEndAt?.toDate() ?? null;
    const clampedEnd = clampEndAfterStart(newStart, currEnd);
    const endTs = clampedEnd ? Timestamp.fromDate(clampedEnd) : null;

    patchRow(r.uid, {
      subscriptionStartAt: Timestamp.fromDate(newStart),
      subscriptionEndAt: endTs,
      remainingDays: calcRemainingDaysFromEnd(endTs ? Timestamp.fromDate(endTs) : null),
    });
  };

  const changeEndDate = (r: UserRow, input: string) => {
    const newEnd = inputDateToDate(input);
    const currStart = r.subscriptionStartAt?.toDate() ?? null;
    const clampedEnd = clampEndAfterStart(currStart, newEnd);
    const endTs = clampedEnd ? Timestamp.fromDate(clampedEnd) : null;

    patchRow(r.uid, {
      subscriptionEndAt: endTs,
      remainingDays: calcRemainingDaysFromEnd(endTs ? Timestamp.fromDate(endTs) : null),
    });
  };

  const clampEndAfterStart = (start: Date | null, end: Date | null) => {
    if (!start || !end) return end;
    if (end.getTime() < start.getTime()) {
      return new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
    }
    return end;
  };

  // 행 추가(테스트용)
  const addUserRow = async () => {
    const uid = prompt('추가할 uid를 입력하세요?');
    if (!uid) return;
    const ref = doc(db, 'users', uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        role: 'free',
        createdAt: serverTimestamp(),
      });
    }
    alert('추가/갱신 완료');
    fetchUsers();
  };

  // 렌더
  if (!isAdmin) {
    return (
      <main className="p-6">
        <h1 className="text-xl font-semibold mb-2">관리자 전용 페이지</h1>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          접근 권한이 없습니다. 관리자 계정으로 로그인해 주세요.
        </p>
        <div className="mt-4 text-xs text-gray-500">
          (현재 컨텍스트 role: <b>{String(ctxRole ?? 'unknown')}</b>)
        </div>
      </main>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Admin</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchUsers}
            className="rounded px-3 py-1 border border-gray-300 dark:border-gray-700 hover:bg-black/5 dark:hover:bg-white/10 text-sm"
          >
            새로고침
          </button>
          <button
            onClick={addUserRow}
            className="rounded px-3 py-1 border border-gray-300 dark:border-gray-700 hover:bg-black/5 dark:hover:bg.white/10 text-sm"
          >
            사용자 추가
          </button>
        </div>
      </div>

      {/* 디버그 패널 */}
      <div className="mb-4 rounded-lg border border-gray-200 dark:border-gray-700 p-3 text-xs text-gray-600 dark:text-gray-300">
        <div>context role: <b>{String(ctxRole ?? 'unknown')}</b> → tier: <b>{String(tier)}</b></div>
      </div>

      {/* 목록 */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="grid grid-cols-12 gap-2 px-4 py-2 text-xs bg-gray-50 dark:bg-zinc-800/60 border-b border-gray-200 dark:border-gray-700">
          <div className="col-span-2">UID</div>
          <div className="col-span-2">이메일</div>
          <div className="col-span-2">닉네임</div>
          <div className="col-span-1">역할</div>
          <div className="col-span-2">구독(시작~종료)</div>
          <div className="col-span-1">남은일수</div>
          <div className="col-span-2">기타</div>
        </div>

        {loading && (
          <div className="px-5 py-4 text-sm text-gray-500">로딩 중…</div>
        )}
        {error && (
          <div className="px-5 py-4 text-sm text-red-600 dark:text-red-400">{error}</div>
        )}

        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {rows.map((r) => {
            const start = tsToDate(r.subscriptionStartAt ?? null);
            const end = tsToDate(r.subscriptionEndAt ?? null);
            const startStr = formatDate(start);
            const endStr = formatDate(end);

            return (
              <div key={r.uid} className="grid grid-cols-12 gap-2 px-4 py-3 text-sm">
                <div className="col-span-2">
                  <div className="font-mono text-xs">{r.uid}</div>
                </div>
                <div className="col-span-2">
                  <div className="truncate">{r.email ?? '-'}</div>
                </div>
                <div className="col-span-2">
                  <div className="truncate">{r.displayName ?? '-'}</div>
                </div>
                <div className="col-span-1">
                  <select
                    value={r.role ?? 'free'}
                    onChange={(e) => changeRole(r, e.target.value as Role)}
                    className="w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-zinc-900 px-2 py-1 text-sm"
                  >
                    <option value="admin">admin</option>
                    <option value="premium">premium</option>
                    <option value="basic">basic</option>
                    <option value="free">free</option>
                  </select>
                </div>
                <div className="col-span-2 flex items-center gap-2">
                  <input
                    type="date"
                    value={startStr}
                    onChange={(e) => changeStartDate(r, e.target.value)}
                    className="w-[140px] rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-zinc-900 px-2 py-1 text-sm"
                  />
                  <span>~</span>
                  <input
                    type="date"
                    value={endStr}
                    onChange={(e) => changeEndDate(r, e.target.value)}
                    className="w-[140px] rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-zinc-900 px-2 py-1 text-sm"
                  />
                </div>
                <div className="col-span-1">
                  <input
                    type="number"
                    min={0}
                    value={r.remainingDays ?? 0}
                    onChange={(e) => changeRemainingDays(r, e.target.value)}
                    className="w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-zinc-900 px-2 py-1 text-sm"
                  />
                </div>
                <div className="col-span-2 text-xs text-gray-600 dark:text-gray-300 space-y-1">
                  <div>생성: {r.createdAt ? format(tsToDate(r.createdAt)!, 'yyyy-MM-dd HH:mm', { locale: ko }) : '-'}</div>
                  <div>최근로그인: {r.lastLoginAt ? format(tsToDate(r.lastLoginAt)!, 'yyyy-MM-dd HH:mm', { locale: ko }) : '-'}</div>
                  <div>최근결제: {r.lastPaidAt ? format(tsToDate(r.lastPaidAt)!, 'yyyy-MM-dd HH:mm', { locale: ko }) : '-'}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* (선택) 현재 티어 표기: 디버깅에 유용, 필요 없으면 제거 가능 */}
        <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-300">
          현재 상태: <span className="font-mono">{tier}</span>
        </div>
      </div>
    </div>
  );
}
