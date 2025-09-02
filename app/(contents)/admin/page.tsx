'use client';

import { useEffect, useMemo, useState } from 'react';
import { useUser } from '@/contexts/UserContext';
import { db } from '@/lib/firebase'; // ✅ 내보내기 경로 일치
import { collection, getDocs, updateDoc, doc } from 'firebase/firestore';

type Role = 'free' | 'basic' | 'premium' | 'admin';
type UserItem = { uid: string; email: string; role: Role };

export default function AdminPage() {
  const { role, ready } = useUser();

  // ✅ 역할 정규화 (페이지 가드/데이터 로딩 모두 동일 기준)
  const isAdmin = useMemo(
    () => ((role ?? '') as string).trim().toLowerCase() === 'admin',
    [role]
  );

  const [users, setUsers] = useState<UserItem[]>([]);
  const [fetching, setFetching] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    const fetchUsers = async () => {
      if (!isAdmin) return; // 관리자 아니면 조회 안 함
      try {
        const snap = await getDocs(collection(db, 'users'));
        const list = snap.docs.map((d) => {
          const data = d.data() as any;
          const normalized: Role = ((data.role ?? (data.isPaid ? 'basic' : 'free')) as string)
            .toString()
            .trim()
            .toLowerCase() as Role;

          return {
            uid: d.id,
            email: (data.email ?? '').toString(),
            role: normalized,
          };
        });
        setUsers(list);
      } catch (e) {
        console.error('[Admin] users fetch error:', e);
      } finally {
        setFetching(false);
      }
    };
    // ready 되면 한번만 실행(관리자일 때)
    if (ready) fetchUsers();
  }, [ready, isAdmin]);

  const handleRoleChange = (uid: string, next: Role) =>
    setUsers((prev) => prev.map((u) => (u.uid === uid ? { ...u, role: next } : u)));

  const handleSave = async (uid: string, role: Role) => {
    try {
      setSaving(uid);
      await updateDoc(doc(db, 'users', uid), { role });
      alert('✅ 역할이 저장되었습니다.');
    } catch (e) {
      console.error('[Admin] update role error:', e);
      alert('❌ 저장 실패. 콘솔을 확인하세요.');
    } finally {
      setSaving(null);
    }
  };

  // 🛡️ 페이지 가드
  if (!ready) return <p className="p-8 text-gray-500">로딩 중...</p>;
  if (!isAdmin) return <p className="p-8 text-red-500">⛔ 관리자 권한이 없습니다.</p>;

  // ✅ 관리자 UI
  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold mb-6">🔐 Administrator</h1>

      {fetching ? (
        <p>불러오는 중…</p>
      ) : (
        <table className="w-full border text-sm">
          <thead className="bg-gray-100 dark:bg-gray-700 text-left">
            <tr>
              <th className="p-2 border">UID</th>
              <th className="p-2 border">이메일</th>
              <th className="p-2 border">권한</th>
              <th className="p-2 border">저장</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.uid} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                <td className="p-2 border">{u.uid}</td>
                <td className="p-2 border">{u.email}</td>
                <td className="p-2 border">
                  <select
                    value={u.role}
                    onChange={(e) => handleRoleChange(u.uid, e.target.value as Role)}
                    className="border px-2 py-1 rounded bg-white text-black dark:bg-gray-800 dark:text-white"
                  >
                    <option value="free">free</option>
                    <option value="basic">basic</option>
                    <option value="premium">premium</option>
                    <option value="admin">admin</option>
                  </select>
                </td>
                <td className="p-2 border">
                  <button
                    onClick={() => handleSave(u.uid, u.role)}
                    className="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 disabled:opacity-50"
                    disabled={saving === u.uid}
                  >
                    저장
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
