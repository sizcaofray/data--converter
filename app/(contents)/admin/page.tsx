// 📄 app/(contents)/admin/page.tsx
// ⚠️ 임시 디버그 로그 대량 포함본 (배포 확인 후 제거 권장)
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useUser } from '@/contexts/UserContext';            // 🔑 로그인 사용자/role 컨텍스트
import { db } from '@/lib/firebase/firebase';                // 🔥 Firestore 인스턴스
import { collection, getDocs, updateDoc, doc } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';                     // 🔎 현재 로그인된 Firebase Auth 사용자 확인 용도

// 🔹 Firestore users 문서 타입
interface UserItem {
  uid: string;
  email: string;
  role: 'free' | 'basic' | 'premium' | 'admin';
}

export default function AdminPage() {
  // ✅ UserContext에서 제공하는 상태
  const { uid, email, role, loading } = useUser() as {
    uid?: string;
    email?: string;
    role?: 'free' | 'basic' | 'premium' | 'admin';
    loading: boolean;
  };

  // ✅ 화면 상태
  const [users, setUsers] = useState<UserItem[]>([]);
  const [fetching, setFetching] = useState(true);
  const [saving, setSaving] = useState(false);

  // ✅ 디버그용: 렌더 때마다 현재 컨텍스트 값을 그룹 로그로 출력
  useEffect(() => {
    console.group('[AdminPage] context state');
    console.log('loading:', loading, 'type:', typeof loading);
    console.log('uid    :', uid);
    console.log('email  :', email);
    console.log('role   :', role, 'type:', typeof role);
    console.groupEnd();
  }, [uid, email, role, loading]);

  // ✅ 디버그용: Firebase Auth의 currentUser도 함께 확인 (컨텍스트-Auth 불일치 탐지)
  useEffect(() => {
    const auth = getAuth();
    const cu = auth.currentUser;
    console.group('[AdminPage] firebase auth.currentUser');
    if (cu) {
      console.log('uid:', cu.uid);
      console.log('email:', cu.email);
      console.log('displayName:', cu.displayName);
      console.log('emailVerified:', cu.emailVerified);
      cu.getIdToken(/* forceRefresh */ false).then((t) => {
        console.log('idToken(length):', t?.length);
      }).catch((e) => console.warn('getIdToken error:', e));
    } else {
      console.log('currentUser: null (로그인 세션 미탑재 또는 초기화 지연)');
    }
    console.groupEnd();
  }, []);

  // 🔁 관리자일 때만 Firestore에서 사용자 목록 로드
  useEffect(() => {
    const fetchUsers = async () => {
      // 디버그: 진입 로그
      console.group('[AdminPage] fetchUsers');
      console.log('loading:', loading, 'role:', role);

      if (loading) {
        console.log('⏳ 컨텍스트 로딩 중이므로 대기');
        console.groupEnd();
        return;
      }
      if (role !== 'admin') {
        console.warn('⛔ role !== admin → 목록 로드를 수행하지 않음');
        console.groupEnd();
        return;
      }

      try {
        setFetching(true);
        const col = collection(db, 'users');
        const snap = await getDocs(col);
        console.log('✅ users snapshot size:', snap.size);

        const list: UserItem[] = snap.docs.map((d) => {
          const data = d.data() as any;
          const item: UserItem = {
            uid: d.id,
            email: data?.email || '',
            role: (data?.role ??
              ((data?.isPaid ?? false) ? 'basic' : 'free')) as UserItem['role'],
          };
          return item;
        });

        console.table(list);
        setUsers(list);
      } catch (err) {
        console.error('🔥 getDocs(users) 실패:', err);
      } finally {
        setFetching(false);
        console.groupEnd();
      }
    };

    fetchUsers();
  }, [loading, role]);

  // 🔧 셀렉트 박스 변경 시 로컬 상태만 갱신
  const handleRoleChange = (uid: string, newRole: UserItem['role']) => {
    console.log('[AdminPage] handleRoleChange →', { uid, newRole });
    setUsers((prev) => prev.map((u) => (u.uid === uid ? { ...u, role: newRole } : u)));
  };

  // 💾 Firestore 업데이트
  const handleSave = async (uid: string, newRole: UserItem['role']) => {
    console.group('[AdminPage] handleSave');
    console.log('target uid:', uid, 'newRole:', newRole);
    setSaving(true);
    try {
      await updateDoc(doc(db, 'users', uid), { role: newRole });
      console.log('✅ updateDoc 성공');
      alert('✅ 역할이 저장되었습니다.');
    } catch (e) {
      console.error('❌ updateDoc 실패:', e);
      alert('❌ 저장 실패. 콘솔을 확인하세요.');
    } finally {
      setSaving(false);
      console.groupEnd();
    }
  };

  // 🧪 디버그 배지 (화면에서 바로 상태 확인)
  const debugBadge = useMemo(() => {
    return (
      <div className="mb-3 text-xs opacity-70">
        <span className="inline-block mr-2">ver: <code>admin-restore-logs</code></span>
        <span className="inline-block mr-2">uid: <code>{uid ?? '—'}</code></span>
        <span className="inline-block mr-2">email: <code>{email ?? '—'}</code></span>
        <span className="inline-block mr-2">role: <code>{role ?? '—'}</code></span>
        <span className="inline-block">loading: <code>{String(loading)}</code></span>
      </div>
    );
  }, [uid, email, role, loading]);

  // ⏳ 컨텍스트 로딩 중
  if (loading) {
    return (
      <main className="p-10">
        {debugBadge}
        <p className="text-gray-500">로딩 중...</p>
      </main>
    );
  }

  // ⛔ 관리자가 아닌 경우 접근 차단 + 디버그 정보 표기
  if (role !== 'admin') {
    console.warn('[AdminPage] role !== admin → 접근 차단 화면 렌더');
    return (
      <main className="p-10">
        {debugBadge}
        <p className="text-red-500">⛔ 관리자 권한이 없습니다.</p>
        <div className="mt-4 text-sm space-y-1 opacity-80">
          <p>• 현재 컨텍스트 role 값이 <code>{String(role)}</code> 로 인식되고 있습니다.</p>
          <p>• Firebase Auth 로그인 계정과 UserContext 소스(역할 매핑)가 일치하는지 확인해 주세요.</p>
          <p>• 브라우저 강력 새로고침(CTRL+F5) 또는 쿼리 파라미터 변경(예: <code>?r=1</code>) 후 재확인.</p>
        </div>
      </main>
    );
  }

  // ✅ 관리자 페이지 UI
  return (
    <main className="p-10">
      {debugBadge}

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
