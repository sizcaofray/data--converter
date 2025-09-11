// 📄 app/(contents)/admin/page.tsx
// ⛳ 관리자: 사용자 목록 조회/수정 (디자인 유지, 열만 추가/로직 보강)
//    - 읽기 전용: uniqueId, joinedAt
//    - 수정 가능: role, isSubscribed, subscriptionStartAt, subscriptionEndAt, remainingDays(파생값을 UI에서 수정 가능)
//    - 동기화 규칙:
//       1) 구독 체크 시 시작/종료일 자동 세팅(시작일 비었으면 오늘, End=시작+기본30일)
//       2) '남은 일수'를 변경하면 End 날짜 = 오늘 + (입력 일수) 로 즉시 재계산
//       3) End 날짜를 변경하면 남은 일수도 즉시 재계산
//       4) 구독 해제 시 시작/종료일/남은 일수 모두 초기화
//
//  ※ Firestore 저장 시에는 불변 필드(uniqueId, joinedAt)는 제외하고
//     role, isSubscribed, subscriptionStartAt, subscriptionEndAt 만 업데이트합니다.

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useUser } from '@/contexts/UserContext';
import { db } from '@/lib/firebase/firebase';
import {
  collection,
  getDocs,
  updateDoc,
  doc,
  Timestamp,
} from 'firebase/firestore';

type Role = 'free' | 'basic' | 'premium' | 'admin';

interface UserRow {
  uid: string;
  email: string;
  role: Role;
  uniqueId?: string | null;               // 읽기 전용
  joinedAt?: Timestamp | null;            // 읽기 전용
  isSubscribed?: boolean;
  subscriptionStartAt?: Timestamp | null;
  subscriptionEndAt?: Timestamp | null;
  // ▼ UI 파생 상태(저장은 하지 않지만 편집값으로 End 동기화에 사용)
  remainingDays?: number | null;
}

/** ✅ KST(UTC+9) 자정 Date 만들기 */
function todayKST(): Date {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  // KST 기준 자정으로 내림
  return new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()));
}

/** ✅ Date → input[type=date] 문자열(YYYY-MM-DD) */
function dateToInput(d: Date | null): string {
  if (!d) return '';
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** ✅ Timestamp → input[type=date] 문자열 */
function tsToInputDate(ts: Timestamp | null | undefined): string {
  if (!ts) return '';
  const d = ts.toDate();
  // 자정 정규화(표시 안정화)
  const nd = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  return dateToInput(nd);
}

/** ✅ input[type=date] → Date(KST 자정) */
function inputDateToDate(s: string): Date | null {
  if (!s) return null;
  // YYYY-MM-DD 를 UTC 자정으로 파싱 후 KST 자정과 동일 취급
  const d = new Date(s + 'T00:00:00Z');
  return isNaN(d.getTime()) ? null : d;
}

/** ✅ End 기준 남은 일수(오늘 포함, 음수는 0으로) */
function calcRemainingDaysFromEnd(end: Timestamp | null | undefined): number | null {
  if (!end) return null;
  const endUTC0 = new Date(Date.UTC(end.toDate().getFullYear(), end.toDate().getMonth(), end.toDate().getDate()));
  const base = todayKST(); // 오늘(KST) 00:00
  const diffMs = endUTC0.getTime() - base.getTime();
  const d = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return d < 0 ? 0 : d;
}

/** ✅ 오늘(KST) + n일 → Date(UTC자정) */
function kstTodayPlusDays(n: number): Date {
  const base = todayKST();
  const nd = new Date(base.getTime() + n * 24 * 60 * 60 * 1000);
  return nd;
}

/** ✅ Date 보정: start > end 인 경우 end=start 로 보정 */
function clampEndAfterStart(start: Date | null, end: Date | null): Date | null {
  if (!start || !end) return end;
  if (end.getTime() < start.getTime()) return start;
  return end;
}

const DEFAULT_SUBSCRIPTION_DAYS = 30; // ✅ 기본 30일

export default function AdminPage() {
  const { role: myRole, loading } = useUser();
  const [rows, setRows] = useState<UserRow[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);

  // 🔄 목록 로드
  useEffect(() => {
    if (loading) return;
    if (myRole !== 'admin') return; // 권한 가드

    const run = async () => {
      setFetching(true);
      try {
        const snap = await getDocs(collection(db, 'users'));
        const list: UserRow[] = [];
        snap.forEach((d) => {
          const data = d.data() || {};
          const endTs: Timestamp | null = data.subscriptionEndAt ?? null;
          list.push({
            uid: d.id,
            email: data.email ?? '',
            role: (data.role ?? 'free') as Role,
            uniqueId: data.uniqueId ?? null,
            joinedAt: data.joinedAt ?? null,
            isSubscribed: data.isSubscribed ?? false,
            subscriptionStartAt: data.subscriptionStartAt ?? null,
            subscriptionEndAt: endTs,
            remainingDays: calcRemainingDaysFromEnd(endTs), // 파생 초기화
          });
        });
        // 이메일 정렬
        list.sort((a, b) => (a.email || '').localeCompare(b.email || ''));
        setRows(list);
      } finally {
        setFetching(false);
      }
    };
    run();
  }, [loading, myRole]);

  // ✅ 행 상태 변경 헬퍼
  const patchRow = (uid: string, patch: Partial<UserRow>) => {
    setRows((prev) => prev.map((r) => (r.uid === uid ? { ...r, ...patch } : r)));
  };

  // ✅ 구독 체크 토글: 시작/종료/남은일수 동기화
  const toggleSubscribed = (r: UserRow, checked: boolean) => {
    if (!checked) {
      // 구독 해제 → 날짜 & 남은일수 초기화
      patchRow(r.uid, {
        isSubscribed: false,
        subscriptionStartAt: null,
        subscriptionEndAt: null,
        remainingDays: null,
      });
      return;
    }

    // 구독 활성화 → 시작/종료 기본 세팅
    const startDate =
      r.subscriptionStartAt?.toDate() ??
      todayKST(); // 시작일 비어있으면 오늘(KST)
    const endDate =
      r.subscriptionEndAt?.toDate() ??
      kstTodayPlusDays(DEFAULT_SUBSCRIPTION_DAYS); // 기본 30일

    const clampedEnd = clampEndAfterStart(startDate, endDate);
    const endTs = clampedEnd ? Timestamp.fromDate(clampedEnd) : null;
    patchRow(r.uid, {
      isSubscribed: true,
      subscriptionStartAt: Timestamp.fromDate(startDate),
      subscriptionEndAt: endTs,
      remainingDays: calcRemainingDaysFromEnd(endTs),
    });
  };

  // ✅ 남은 일수 변경 → End 날짜 재계산(오늘 + n일)
  const changeRemainingDays = (r: UserRow, val: string) => {
    const n = Math.max(0, Number(val || 0)); // 음수 방지
    const endDate = kstTodayPlusDays(n);
    patchRow(r.uid, {
      remainingDays: n,
      subscriptionEndAt: Timestamp.fromDate(endDate),
    });
  };

  // ✅ 시작일 변경 → End가 시작보다 빠르면 End=시작으로 보정, 남은일수 재계산
  const changeStartDate = (r: UserRow, input: string) => {
    const newStart = inputDateToDate(input); // KST 자정
    const currEnd = r.subscriptionEndAt?.toDate() ?? null;
    const clampedEnd = clampEndAfterStart(newStart, currEnd);
    const endTs = clampedEnd ? Timestamp.fromDate(clampedEnd) : null;

    patchRow(r.uid, {
      subscriptionStartAt: newStart ? Timestamp.fromDate(newStart) : null,
      subscriptionEndAt: endTs,
      remainingDays: calcRemainingDaysFromEnd(endTs),
    });
  };

  // ✅ End 변경 → 남은일수 재계산
  const changeEndDate = (r: UserRow, input: string) => {
    const newEnd = inputDateToDate(input);
    const start = r.subscriptionStartAt?.toDate() ?? null;
    const clampedEnd = clampEndAfterStart(start, newEnd);
    const endTs = clampedEnd ? Timestamp.fromDate(clampedEnd) : null;
    patchRow(r.uid, {
      subscriptionEndAt: endTs,
      remainingDays: calcRemainingDaysFromEnd(endTs),
    });
  };

  // ✅ 저장
  const handleSave = async (row: UserRow) => {
    setSaving(row.uid);
    try {
      const ref = doc(db, 'users', row.uid);

      // 구독 해제면 날짜 null 처리
      let startTs: Timestamp | null = row.subscriptionStartAt ?? null;
      let endTs: Timestamp | null = row.subscriptionEndAt ?? null;
      let isSubscribed = !!row.isSubscribed;

      if (!isSubscribed) {
        startTs = null;
        endTs = null;
      } else {
        // 보정: 시작>종료 방지
        const startD = startTs?.toDate() ?? null;
        const endD = endTs?.toDate() ?? null;
        const clampedEnd = clampEndAfterStart(startD, endD);
        endTs = clampedEnd ? Timestamp.fromDate(clampedEnd) : null;
      }

      await updateDoc(ref, {
        role: row.role,
        isSubscribed,
        subscriptionStartAt: startTs,
        subscriptionEndAt: endTs,
      });

      alert('저장되었습니다.');
    } catch (e) {
      console.error(e);
      alert('저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return <main className="p-6 text-sm text-gray-500">로딩 중...</main>;
  }
  if (myRole !== 'admin') {
    return (
      <main className="p-6">
        <h1 className="text-xl font-semibold mb-4">관리자 페이지</h1>
        <p className="text-red-600 dark:text-red-400">⛔ 관리자 권한이 없습니다.</p>
      </main>
    );
  }

  return (
    <main className="p-6">
      <h1 className="text-xl font-semibold mb-4">사용자 관리</h1>

      {fetching ? (
        <div className="text-sm text-gray-500">사용자 목록을 불러오는 중...</div>
      ) : (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2 pr-4">Email</th>
              <th className="py-2 pr-4">Role</th>
              <th className="py-2 pr-4">Subscribed</th>
              <th className="py-2 pr-4">Start</th>
              <th className="py-2 pr-4">End</th>
              <th className="py-2 pr-4">남은일수</th>
              <th className="py-2 pr-4">Unique ID</th>
              <th className="py-2 pr-4">Joined</th>
              <th className="py-2 pr-4">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.uid} className="border-b">
                {/* Email */}
                <td className="py-2 pr-4 align-top">{r.email}</td>

                {/* Role */}
                <td className="py-2 pr-4 align-top">
                  <select
                    className="border rounded px-2 py-1 bg-white text-gray-900 dark:bg-transparent dark:text-gray-100 
                    focus:outline-none focus:ring-2 focus:ring-blue-500 
                    disabled:text-gray-400"
                    value={r.role}
                    onChange={(e) => patchRow(r.uid, { role: e.target.value as Role })}
                  >
                    <option value="free">free</option>
                    <option value="basic">basic</option>
                    <option value="premium">premium</option>
                    <option value="admin">admin</option>
                  </select>
                </td>

                {/* Subscribed */}
                <td className="py-2 pr-4 align-top">
                  <input
                    type="checkbox"
                    className="w-4 h-4"
                    checked={!!r.isSubscribed}
                    onChange={(e) => toggleSubscribed(r, e.target.checked)}
                  />
                </td>

                {/* Start (date) */}
                <td className="py-2 pr-4 align-top">
                  <input
                    type="date"
                    className="border rounded px-2 py-1 bg-transparent"
                    value={tsToInputDate(r.subscriptionStartAt)}
                    onChange={(e) => changeStartDate(r, e.target.value)}
                    disabled={!r.isSubscribed}
                  />
                </td>

                {/* End (date) */}
                <td className="py-2 pr-4 align-top">
                  <input
                    type="date"
                    className="border rounded px-2 py-1 bg-transparent"
                    value={tsToInputDate(r.subscriptionEndAt)}
                    onChange={(e) => changeEndDate(r, e.target.value)}
                    disabled={!r.isSubscribed}
                  />
                </td>

                {/* 남은 일수 (number) */}
                <td className="py-2 pr-4 align-top">
                  <input
                    type="number"
                    min={0}
                    className="w-24 border rounded px-2 py-1 bg-transparent"
                    value={r.remainingDays ?? ''}
                    onChange={(e) => changeRemainingDays(r, e.target.value)}
                    disabled={!r.isSubscribed}
                  />
                </td>

                {/* Unique ID (readonly) */}
                <td className="py-2 pr-4 align-top">{r.uniqueId ?? '-'}</td>

                {/* Joined (readonly) */}
                <td className="py-2 pr-4 align-top">
                  {r.joinedAt ? tsToInputDate(r.joinedAt) : '-'}
                </td>

                {/* Save */}
                <td className="py-2 pr-4 align-top">
                  <button
                    onClick={() => handleSave(r)}
                    className="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 disabled:opacity-50"
                    disabled={saving === r.uid}
                  >
                    {saving === r.uid ? '저장 중…' : '저장'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
