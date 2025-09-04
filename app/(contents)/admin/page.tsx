// 📄 app/(contents)/admin/page.tsx
// ⛳ 콘솔 로그 제거본: 관리자만 사용자 목록을 조회/수정할 수 있는 페이지
'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@/contexts/UserContext';              // 🔑 현재 로그인 사용자/역할 컨텍스트
import { db } from '@/lib/firebase/firebase';                  // 🔥 Firestore 인스턴스
import { collection, getDocs, updateDoc, doc } from 'firebase/firestore';

// 🔹 Firestore users 문서 타입 정의
interface UserItem {
  uid: string;
  email: string;
  role: 'free' | 'basic' | 'premium' | 'admin';
}

export default function AdminPage() {
  // ✅ UserContext에서 role/로딩 상태만 사용 (관리자 가드)
  const { role, loading } = useUser() as {
    role?: 'free' | 'basic' | 'premium' | 'admin';
    loading: boolean;
  };

  // ✅ 화면 상태
  const [users, setUsers] = useState<UserItem[]>([]);
  const [fetching, setFetching] = useState(true);   // 목록 로딩
  const [saving, setSaving] = useState(false);      // 저장 버튼 로딩

  // 🔁 관리자일 때만 Firestore에서 사용자 목록 로드
  useEffect(() => {
    const fetchUsers = async () => {
      if (loading) return;                // 컨텍스트 준비 전이면 대기
      if (role !== 'admin') return;       // 관리자가 아니면 조회 안 함

      try {
        setFetching(true);
        const snap = await getDocs(collection(db, 'users'));
        const list: UserItem[] = snap.docs.map((d) => {
          const data = d.data() as any;
          // role이 없던 과거 데이터 호환: isPaid=true → basic, 아니면 free
          const normalizedRole =
            (data?.role as UserItem['role']) ??
            ((data?.isPaid ?? false) ? 'basic' : 'free');

          return {
            uid: d.id,
            email: data?.email || '',
            role: normalizedRole,
          };
        });
        setUsers(list);
      } finally {
        setFetching(false);
      }
    };

    fetchUsers();
  }, [loading, role]);

  // 🔧 셀렉트 변경 시 로컬 상태만 갱신
  const handleRoleChange = (uid: string, newRole: UserItem['role']) => {
    setUsers((prev) => prev.map((u) => (u.uid === uid ? { ...u, role: newRole } : u)));
  };

  // 💾 Firestore 업데이트
  const handleSave = async (uid: string, newRole: UserItem['role']) => {
    setSaving(true);
    try {
      await updateDoc(doc(db, 'users', uid), { role: newRole });
      alert('✅ 역할이 저장되었습니다.');
    } catch {
      alert('❌ 저장 실패. 잠시 후 다시 시도해 주세요.');
    } finally {
      setSaving(false);
    }
  };

  // ⏳ 컨텍스트 로딩 중
  if (loading) {
    return <main className="p-10 text-gray-500">로딩 중...</main>;
  }

  // ⛔ 관리자 가드
  if (role !== 'admin') {
    return <main className="p-10 text-red-500">⛔ 관리자 권한이 없습니다.</main>;
  }

  // ✅ 관리자 UI
  return (
    <main className="p-10">
      <h1 className="text-3xl font-bold mb-6">🔐 관리자 페이지</h1>
      <h2 className="text-xl font-semibold mb-4">👥 사용자 목록</h2>

      {fetching ? (
        <p>불러오는 중...</p>
      ) : (
        <table className="w-full border text-sm">
          <thead className="bg-gray-100 dark:bg-gray-700 text-left">
            <tr>
              <th className="p-2 border">UID</th>
              <th className="p-2 border">이메일</th>
              <th className="p-2 border">권한 (role)</th>
              <th className="p-2 border">수정</th>
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
                    onChange={(e) => handleRoleChange(u.uid, e.target.value as UserItem['role'])}
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
                    disabled={saving}
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
