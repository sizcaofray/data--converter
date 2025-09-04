// 📄 app/(contents)/admin/page.tsx
'use client'; // ✅ 클라이언트 컴포넌트로 렌더링 (Firebase/브라우저 API 사용을 위해 필수)

import { useEffect, useState } from 'react';
import { useUser } from '@/contexts/UserContext';          // ✅ 로그인 사용자/role 컨텍스트
import { db } from '@/lib/firebase/firebase';              // ✅ Firebase Firestore 인스턴스
import { collection, getDocs, updateDoc, doc } from 'firebase/firestore';

// 🔹 Firestore users 문서 형태를 표현하는 타입
interface UserItem {
  uid: string;
  email: string;
  role: 'free' | 'basic' | 'premium' | 'admin';
}

export default function AdminPage() {
  // ✅ 현재 로그인한 사용자의 role 상태 (관리자 가드)
  const { role, loading } = useUser();

  // ✅ 화면에 출력할 사용자 목록 상태
  const [users, setUsers] = useState<UserItem[]>([]);
  const [fetching, setFetching] = useState(true);  // 목록 로딩 상태
  const [saving, setSaving] = useState(false);     // 저장 버튼 로딩 상태

  // 🔁 관리자일 때만 Firestore에서 users 목록을 로드
  useEffect(() => {
    const fetchUsers = async () => {
      if (role !== 'admin') return; // 관리자만 조회 수행
      const snapshot = await getDocs(collection(db, 'users'));
      const list = snapshot.docs.map((d) => {
        const data = d.data() as any;
        const isPaid = data?.isPaid ?? false; // 과거 플래그 호환
        return {
          uid: d.id,
          email: data?.email || '',
          role: data?.role || (isPaid ? 'basic' : 'free'), // role 미지정시 기본 추정
        } as UserItem;
      });
      setUsers(list);
      setFetching(false);
    };
    fetchUsers();
  }, [role]);

  // 🔧 셀렉트 박스 변경 시 로컬 상태만 갱신
  const handleRoleChange = (uid: string, newRole: UserItem['role']) => {
    setUsers((prev) => prev.map((u) => (u.uid === uid ? { ...u, role: newRole } : u)));
  };

  // 💾 Firestore 업데이트
  const handleSave = async (uid: string, newRole: UserItem['role']) => {
    setSaving(true);
    try {
      await updateDoc(doc(db, 'users', uid), { role: newRole });
      alert('✅ 역할이 저장되었습니다.');
    } catch (e) {
      console.error('[admin/save-role] failed:', e);
      alert('❌ 저장 실패. 콘솔을 확인하세요.');
    } finally {
      setSaving(false);
    }
  };

  // ⏳ 컨텍스트 로딩 중
  if (loading) return <main className="p-10 text-gray-500">로딩 중...</main>;

  // ⛔ 관리자가 아닌 경우 접근 차단
  if (role !== 'admin') {
    return <main className="p-10 text-red-500">⛔ 관리자 권한이 없습니다.</main>;
  }

  // ✅ 관리자 페이지 UI
  return (
    <main className="p-10">
      {/* 배포 확인용 버전 태그(문구 아무거나 OK): 화면에서 이 텍스트가 보이면 새 코드가 반영된 것입니다. */}
      <p className="text-xs opacity-60 mb-2">ver: admin-restore-0904</p>

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
