// ✅ 업로드 제한 정책을 Firestore에서 불러오는 함수
import { getDoc, doc } from 'firebase/firestore';
import { db } from './firebase';

/**
 * settings/uploadPolicy 문서에서 업로드 제한 정책을 가져옴
 * 정책 없을 경우 기본값 반환
 */
export async function getUploadPolicy(): Promise<Record<string, number>> {
  const snap = await getDoc(doc(db, 'settings', 'uploadPolicy'));

  if (!snap.exists()) {
    return { free: 1, paid: 10, admin: 100 }; // 기본값
  }

  const data = snap.data();
  return {
    free: data.free ?? 1,
    paid: data.paid ?? 10,
    admin: data.admin ?? 100,
  };
}
