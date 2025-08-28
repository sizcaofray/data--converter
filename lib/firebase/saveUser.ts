// ✅ 로그인한 사용자 정보를 Firestore에 저장
import { setDoc, doc } from 'firebase/firestore';
import { db } from './firebase';

/**
 * 사용자 정보를 Firestore users 컬렉션에 저장
 * @param uid 사용자 UID
 * @param email 이메일 주소
 */
export async function saveUserToFirestore(uid: string, email: string) {
  await setDoc(doc(db, 'users', uid), { email }, { merge: true });
}
