'use client';
/**
 * app/(contents)/admin/page.tsx
 * - 백업본의 "사용자 관리" 기능을 그대로 복원
 * - 좌측 메뉴 클릭 시 우측 프레임에 즉시 렌더되는 클라이언트 페이지
 * - 권한(관리자) 확인은 useUser() 컨텍스트를 사용 (백업 구현 유지)
 * - Firestore의 users 컬렉션을 읽어 사용자 목록/역할을 관리
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation'; // 백업본에 존재하던 import를 유지 (미사용이어도 기능 영향 없음)
import { useUser } from '@/contexts/UserContext';            // ✅ 백업본 동일
import { db } from '@/lib/firebase/firebase';                // ✅ 백업본 동일
import { collection, getDocs, updateDoc, doc } from 'firebase/firestore';

// 🔹 사용자 데이터 구조 (백업본 유지)
interface UserItem {
  uid: string;
  email: string;
  role: 'free' | 'basic' | 'premium' | 'admin';
}

export default function AdminPage() {
  const { role, loading } = useUser();   // 🔑 현재 로그인한 사용자의 역할 정보 (백업 흐름 유지)
  const router = useRouter();            // (백업본 유지: 미사용이어도 삭제하지 않음)
  const [users, setUsers] = useState<UserItem[]>([]);
  const [fetching, setFetching] = useState(true);
  const [saving, setSaving] = useState(false);

  // 🔁 Firestore에서 사용자 목록 불러오기 (백업본 로직 유지)
  useEffect(() => {
    const fetchUsers = async () => {
      // 관리자일 때만 목록 조회
      if (role === 'admin') {
        const snapshot = await getDocs(collection(db, 'users'));
        const userList = snapshot.docs.map((d) => {
          const data = d.data() as any;
          const isPaid = data.isPaid ?? false;

          return {
            uid: d.id,
            email: data.email || '',
            // 🔸 role이 없으면 isPaid 값으로 기본 role 추론 (백업본 규칙 유지)
            role: (data.role as UserItem['role']) || (isPaid ? 'basic' : 'free'),
          };
        });

        setUsers(userList);
        setFetching(false);
      }
    };

    fetchUsers();
  }, [role]);

  // 🔁 역할 선택 시 로컬 state 갱신 (백업본 유지)
  const handleRoleChange = (uid: string, newRole: UserItem['role']) => {
    setUsers((prev) =>
      prev.map((u) => (u.uid === uid ? { ...u, role: newRole } : u))
    );
  };

  // 🔁 Firestore에 role 업데이트 저장 (백업본 유지)
  const handleSave = async (uid: string, newRole: UserItem['role']) => {
    setSaving(true);
    try {
      const userRef = doc(db, 'users', uid);
      await updateDoc(userRef, { role: newRole }); // 🔹 Firestore 업데이트
      alert('✅ 역할이 저장되었습니다.');
    } catch (error) {
      console.error('❌ 역할 저장 실패:', error);
      alert('저장 실패. 콘솔을 확인하세요.');
    } finally {
      setSaving(false);
    }
  };

  // 🛑 로딩/권한 처리 (리다이렉트 대신 UI로 차단 → 메뉴 전환 방해 없음)
  if (loading) {
    return <main className="p-8 text-gray-500">로딩 중...</main>;
  }

  if (role !== 'admin') {
    return <main className="p-8 text-red-500">⛔ 관리자 권한이 없습니다.</main>;
  }

  // ✅ 관리자 페이지 UI (사용자 목록 + 역할 변경/저장) — 백업본 표 구조 유지
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
                    title="선택한 권한을 저장"
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
