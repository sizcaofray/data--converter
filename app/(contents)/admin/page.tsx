'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@/contexts/UserContext';
import { db } from '@/lib/firebase/firebase';
import { collection, getDocs, updateDoc, doc, Timestamp } from 'firebase/firestore';

type Role = 'free' | 'basic' | 'premium' | 'admin';

interface UserRow {
  uid: string; email: string; role: Role;
  uniqueId?: string | null; joinedAt?: Timestamp | null;
  isSubscribed?: boolean; subscriptionStartAt?: Timestamp | null; subscriptionEndAt?: Timestamp | null;
  remainingDays?: number | null;
}

function todayKST(): Date { const now = new Date(); const kst = new Date(now.getTime() + 9*3600*1000);
  return new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate())); }
function dateToInput(d: Date | null){ if(!d) return ''; const y=d.getUTCFullYear(); const m=String(d.getUTCMonth()+1).padStart(2,'0'); const dd=String(d.getUTCDate()).padStart(2,'0'); return `${y}-${m}-${dd}`; }
function tsToInputDate(ts: Timestamp | null | undefined){ if(!ts) return ''; const d=ts.toDate(); return dateToInput(new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()))); }
function inputDateToDate(s: string){ if(!s) return null; const d=new Date(s+'T00:00:00Z'); return isNaN(d.getTime())?null:d; }
function calcRemainingDaysFromEnd(end: Timestamp | null | undefined){ if(!end) return null; const e=end.toDate();
  const eu=new Date(Date.UTC(e.getFullYear(),e.getMonth(),e.getDate())); const base=todayKST();
  const diff=eu.getTime()-base.getTime(); const n=Math.ceil(diff/86400000); return n<0?0:n; }
function kstTodayPlusDays(n:number){ const base=todayKST(); return new Date(base.getTime()+n*86400000); }
function clampEndAfterStart(start: Date | null, end: Date | null){ if(!start||!end) return end; return end.getTime()<start.getTime()?start:end; }

const DEFAULT_SUBSCRIPTION_DAYS = 30;

export default function AdminPage() {
  const { role: myRole, loading } = useUser();
  const [rows, setRows] = useState<UserRow[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    if (loading || myRole !== 'admin') return;
    (async () => {
      setFetching(true);
      try {
        const snap = await getDocs(collection(db, 'users'));
        const list: UserRow[] = [];
        snap.forEach((d) => {
          const data = d.data() as any;
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
            remainingDays: calcRemainingDaysFromEnd(endTs),
          });
        });
        list.sort((a, b) => (a.email || '').localeCompare(b.email || ''));
        setRows(list);
      } finally { setFetching(false); }
    })();
  }, [loading, myRole]);

  const patchRow = (uid: string, patch: Partial<UserRow>) =>
    setRows((prev) => prev.map((r) => (r.uid === uid ? { ...r, ...patch } : r)));

  const toggleSubscribed = (r: UserRow, checked: boolean) => {
    if (!checked) {
      patchRow(r.uid, { isSubscribed: false, subscriptionStartAt: null, subscriptionEndAt: null, remainingDays: null });
      return;
    }
    const startDate = r.subscriptionStartAt?.toDate() ?? todayKST();
    const endDate = r.subscriptionEndAt?.toDate() ?? kstTodayPlusDays(DEFAULT_SUBSCRIPTION_DAYS);
    const endTs = clampEndAfterStart(startDate, endDate);
    patchRow(r.uid, {
      isSubscribed: true,
      subscriptionStartAt: Timestamp.fromDate(startDate),
      subscriptionEndAt: endTs ? Timestamp.fromDate(endTs) : null,
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
    patchRow(r.uid, { subscriptionStartAt: newStart ? Timestamp.fromDate(newStart) : null, subscriptionEndAt: endTs, remainingDays: calcRemainingDaysFromEnd(endTs) });
  };

  const changeEndDate = (r: UserRow, input: string) => {
    const newEnd = inputDateToDate(input);
    const start = r.subscriptionStartAt?.toDate() ?? null;
    const clampedEnd = clampEndAfterStart(start, newEnd);
    const endTs = clampedEnd ? Timestamp.fromDate(clampedEnd) : null;
    patchRow(r.uid, { subscriptionEndAt: endTs, remainingDays: calcRemainingDaysFromEnd(endTs) });
  };

  const handleSave = async (row: UserRow) => {
    setSaving(row.uid);
    try {
      const ref = doc(db, 'users', row.uid);
      let startTs: Timestamp | null = row.subscriptionStartAt ?? null;
      let endTs: Timestamp | null = row.subscriptionEndAt ?? null;
      let isSubscribed = !!row.isSubscribed;

      if (!isSubscribed) { startTs = null; endTs = null; }
      else {
        const startD = startTs?.toDate() ?? null;
        const endD = endTs?.toDate() ?? null;
        const clampedEnd = clampEndAfterStart(startD, endD);
        endTs = clampedEnd ? Timestamp.fromDate(clampedEnd) : null;
      }

      await updateDoc(ref, {
        role: row.role,
        isSubscribed,
        subscriptionStartAt: startTs ?? null,
        subscriptionEndAt: endTs ?? null,
      });
      alert('저장되었습니다.');
    } catch (e: any) {
      console.error('[ADMIN SAVE][ERR]', e?.code, e?.message, e);
      alert(`저장 중 오류: ${e?.code || e?.message || '알 수 없는 오류'}`);
    } finally { setSaving(null); }
  };

  if (loading) return <main className="p-6 text-sm text-gray-500">로딩 중...</main>;
  if (myRole !== 'admin') return (
    <main className="p-6">
      <h1 className="text-xl font-semibold mb-4">관리자 페이지</h1>
      <p className="text-red-600 dark:text-red-400">⛔ 관리자 권한이 없습니다.</p>
    </main>
  );

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
                <td className="py-2 pr-4 align-top">{r.email}</td>
                <td className="py-2 pr-4 align-top">
                  <select
                    className="border rounded px-2 py-1 bg-white text-gray-900 dark:bg-transparent dark:text-gray-100"
                    value={r.role}
                    onChange={(e) => patchRow(r.uid, { role: e.target.value as Role })}
                  >
                    <option value="free">free</option>
                    <option value="basic">basic</option>
                    <option value="premium">premium</option>
                    <option value="admin">admin</option>
                  </select>
                </td>
                <td className="py-2 pr-4 align-top">
                  <input type="checkbox" className="w-4 h-4" checked={!!r.isSubscribed} onChange={(e) => toggleSubscribed(r, e.target.checked)} />
                </td>
                <td className="py-2 pr-4 align-top">
                  <input type="date" className="border rounded px-2 py-1 bg-transparent" value={tsToInputDate(r.subscriptionStartAt)} onChange={(e) => changeStartDate(r, e.target.value)} disabled={!r.isSubscribed} />
                </td>
                <td className="py-2 pr-4 align-top">
                  <input type="date" className="border rounded px-2 py-1 bg-transparent" value={tsToInputDate(r.subscriptionEndAt)} onChange={(e) => changeEndDate(r, e.target.value)} disabled={!r.isSubscribed} />
                </td>
                <td className="py-2 pr-4 align-top">
                  <input type="number" min={0} className="w-24 border rounded px-2 py-1 bg-transparent" value={r.remainingDays ?? ''} onChange={(e) => changeRemainingDays(r, e.target.value)} disabled={!r.isSubscribed} />
                </td>
                <td className="py-2 pr-4 align-top">{r.uniqueId ?? '-'}</td>
                <td className="py-2 pr-4 align-top">{r.joinedAt ? tsToInputDate(r.joinedAt) : '-'}</td>
                <td className="py-2 pr-4 align-top">
                  <button onClick={() => handleSave(r)} className="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 disabled:opacity-50" disabled={saving === r.uid}>
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
