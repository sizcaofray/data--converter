// 📄 app/admin/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/contexts/UserContext';
import { db } from '@/lib/firebase/firebase'; 
import { collection, getDocs, updateDoc, doc } from 'firebase/firestore';

// 🔹 사용자 데이터 구조 정의
interface UserItem {
  uid: string;
  email: string;
  role: 'free' | 'basic' | 'premium' | 'admin';
}

export default function AdminPage() {
  const { role, loading } = useUser(); // 🔑 현재 로그인한 사용자의 역할 정보
  const router = useRouter();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [fetching, setFetching] = useState(true);
  const [saving, setSaving] = useState(false);

  // 🔁 Firestore에서 사용자 목록 불러오기
  useEffect(() => {
    const fetchUsers = async () => {
      if (role === 'admin') {
        const snapshot = await getDocs(collection(db, 'users'));
        const userList = snapshot.docs.map((doc) => {
          const data = doc.data();
          const isPaid = data.isPaid ?? false;

          return {
            uid: doc.id,
            email: data.email || '',
            // 🔸 role이 없으면 isPaid 값 기준으로 default role 추론
            role: data.role || (isPaid ? 'basic' : 'free'),
          };
        });

        setUsers(userList);
        setFetching(false);
      }
    };

    fetchUsers();
  }, [role]);

  // 🔁 역할 선택 시 로컬 state 갱신
  const handleRoleChange = (uid: string, newRole: UserItem['role']) => {
    setUsers((prev) =>
      prev.map((u) => (u.uid === uid ? { ...u, role: newRole } : u))
    );
  };

  // 🔁 Firestore에 role 업데이트 저장
  const handleSave = async (uid: string, role: string) => {
    setSaving(true);
    try {
      const userRef = doc(db, 'users', uid);
      await updateDoc(userRef, { role }); // 🔹 Firestore 업데이트
      alert('✅ 역할이 저장되었습니다.');
    } catch (error) {
      console.error('❌ 역할 저장 실패:', error);
      alert('저장 실패. 콘솔을 확인하세요.');
    } finally {
      setSaving(false);
    }
  };

  // 🛑 로딩 또는 권한 처리
  if (loading) {
    return <p className="p-8 text-gray-500">로딩 중...</p>;
  }

  if (role !== 'admin') {
    return <p className="p-8 text-red-500">⛔ 관리자 권한이 없습니다.</p>;
  }

  // ✅ 관리자 페이지 UI 렌더링
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
            {users.map((user) => (
              <tr key={user.uid} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                <td className="p-2 border">{user.uid}</td>
                <td className="p-2 border">{user.email}</td>
                <td className="p-2 border">
                  <select
                    value={user.role}
                    onChange={(e) => handleRoleChange(user.uid, e.target.value as UserItem['role'])}
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
                    onClick={() => handleSave(user.uid, user.role)}
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
