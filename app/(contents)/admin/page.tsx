// 📄 app/(contents)/admin/page.tsx
// ⛳ 관리자: 사용자 목록 조회/수정 (디자인 유지, 열만 추가)
//    - 읽기 전용: uniqueId, joinedAt
//    - 수정 가능: role, isSubscribed, subscriptionStartAt, subscriptionEndAt
//    - 남은 일수: subscriptionEndAt을 기준으로 계산 표시(저장은 하지 않음)

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
  uniqueId?: string | null;
  joinedAt?: Timestamp | null;
  isSubscribed?: boolean;
  subscriptionStartAt?: Timestamp | null;
  subscriptionEndAt?: Timestamp | null;
}

function tsToInputDate(ts: Timestamp | null | undefined): string {
  if (!ts) return '';
  const d = ts.toDate();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
function inputDateToDate(s: string): Date | null {
  if (!s) return null;
  const d = new Date(s + 'T00:00:00'); // 로컬 자정
  return isNaN(d.getTime()) ? null : d;
}
function diffDaysToToday(end: Timestamp | null | undefined): number | null {
  if (!end) return null;
  const diffMs = end.toDate().getTime() - Date.now();
  const d = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return d < 0 ? 0 : d;
}

export default function AdminPage() {
  const { role: myRole, loading } = useUser();
  const [rows, setRows] = useState<UserRow[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (myRole !== 'admin') return; // 권한 가드(표시는 기존 스타일 그대로)

    const run = async () => {
      setFetching(true);
      try {
        const snap = await getDocs(collection(db, 'users'));
        const list: UserRow[] = [];
        snap.forEach((d) => {
          const data = d.data() || {};
          list.push({
            uid: d.id,
            email: data.email ?? '',
            role: (data.role ?? 'free') as Role,
            uniqueId: data.uniqueId ?? null,
            joinedAt: data.joinedAt ?? null,
            isSubscribed: data.isSubscribed ?? false,
            subscriptionStartAt: data.subscriptionStartAt ?? null,
            subscriptionEndAt: data.subscriptionEndAt ?? null,
          });
        });
        // 이메일 알파벳 정렬(기존 UX 유지에 도움이 됨)
        list.sort((a, b) => (a.email || '').localeCompare(b.email || ''));
        setRows(list);
      } finally {
        setFetching(false);
      }
    };
    run();
  }, [loading, myRole]);

  const handleChange = (uid: string, patch: Partial<UserRow>) => {
    setRows((prev) => prev.map((r) => (r.uid === uid ? { ...r, ...patch } : r)));
  };

  const handleSave = async (row: UserRow) => {
    setSaving(row.uid);
    try {
      const ref = doc(db, 'users', row.uid);

      // 저장 가능한 필드만 업데이트(불변: uniqueId, joinedAt 제외)
      const payload: any = {
        role: row.role,
        isSubscribed: !!row.isSubscribed,
        subscriptionStartAt: row.subscriptionStartAt ?? null,
        subscriptionEndAt: row.subscriptionEndAt ?? null,
      };

      await updateDoc(ref, payload);
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
    // 권한 없음 표기(기존 스타일 유지)
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
            {rows.map((r) => {
              const remaining = diffDaysToToday(r.subscriptionEndAt);
              return (
                <tr key={r.uid} className="border-b">
                  <td className="py-2 pr-4 align-top">{r.email}</td>

                  {/* Role 수정 */}
                  <td className="py-2 pr-4 align-top">
                    <select
                      className="border rounded px-2 py-1 bg-transparent"
                      value={r.role}
                      onChange={(e) => handleChange(r.uid, { role: e.target.value as Role })}
                    >
                      <option value="free">free</option>
                      <option value="basic">basic</option>
                      <option value="premium">premium</option>
                      <option value="admin">admin</option>
                    </select>
                  </td>

                  {/* 구독 여부 토글 */}
                  <td className="py-2 pr-4 align-top">
                    <input
                      type="checkbox"
                      className="w-4 h-4"
                      checked={!!r.isSubscribed}
                      onChange={(e) => handleChange(r.uid, { isSubscribed: e.target.checked })}
                    />
                  </td>

                  {/* 구독 시작/종료일 (date input) */}
                  <td className="py-2 pr-4 align-top">
                    <input
                      type="date"
                      className="border rounded px-2 py-1 bg-transparent"
                      value={tsToInputDate(r.subscriptionStartAt)}
                      onChange={(e) =>
                        handleChange(r.uid, {
                          subscriptionStartAt: inputDateToDate(e.target.value)
                            ? Timestamp.fromDate(inputDateToDate(e.target.value)!)
                            : null,
                        })
                      }
                    />
                  </td>
                  <td className="py-2 pr-4 align-top">
                    <input
                      type="date"
                      className="border rounded px-2 py-1 bg-transparent"
                      value={tsToInputDate(r.subscriptionEndAt)}
                      onChange={(e) =>
                        handleChange(r.uid, {
                          subscriptionEndAt: inputDateToDate(e.target.value)
                            ? Timestamp.fromDate(inputDateToDate(e.target.value)!)
                            : null,
                        })
                      }
                    />
                  </td>

                  {/* 남은 일수(읽기 전용) */}
                  <td className="py-2 pr-4 align-top">
                    {remaining === null ? '-' : `${remaining}일`}
                  </td>

                  {/* Unique ID / Joined(읽기 전용) */}
                  <td className="py-2 pr-4 align-top">{r.uniqueId ?? '-'}</td>
                  <td className="py-2 pr-4 align-top">
                    {r.joinedAt ? tsToInputDate(r.joinedAt) : '-'}
                  </td>

                  {/* 저장 */}
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
              );
            })}
          </tbody>
        </table>
      )}
    </main>
  );
}
