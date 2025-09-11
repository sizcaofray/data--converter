// ✅ 로그인한 사용자 정보를 Firestore에 저장/보강 (최초 로그인 시 불변 필드 생성)
//    - uniqueId: "CVYYYYMMDD_XXXXXX" 형식 (예: CV20250911_A1B2C3)
//    - joinedAt: 가입일 (Timestamp) — 최초 로그인 시 1회만 설정 (이후 불변)
//    - 기타 기본 필드: email, lastLoginAt, role 기본값, isSubscribed 기본값 등

import { setDoc, doc, getDoc, serverTimestamp, Timestamp, updateDoc } from 'firebase/firestore';
import { db } from './firebase';

/** ✅ 서울(UTC+9) 기준 YYYYMMDD 문자열 반환 */
function formatKSTDateYYYYMMDD(d = new Date()): string {
  // KST(+9) 보정
  const kstMs = d.getTime() + 9 * 60 * 60 * 1000;
  const kst = new Date(kstMs);
  const yyyy = kst.getUTCFullYear();
  const mm = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(kst.getUTCDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

/** ✅ 6자리 대문자/숫자 랜덤 토큰 생성 */
function randomToken6(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

/** ✅ 고유 ID 생성기: CVYYYYMMDD_XXXXXX */
function createUniqueId(now = new Date()): string {
  return `CV${formatKSTDateYYYYMMDD(now)}_${randomToken6()}`;
}

/** ✅ 최초 로그인 시 불변 필드(uniqueId, joinedAt)를 보장하고, 공통 필드를 병합 저장 */
export async function ensureUserProfile(opts: {
  uid: string;
  email: string | null;
}) {
  const { uid, email } = opts;
  const ref = doc(db, 'users', uid);
  const snap = await getDoc(ref);

  // 최초 생성 시에만 세팅할 불변 필드
  let uniqueId: string | undefined;
  let joinedAt: Timestamp | undefined;

  if (!snap.exists()) {
    // 최초 로그인: 불변 필드 생성
    uniqueId = createUniqueId();
    joinedAt = Timestamp.now(); // 서버 타임스탬프 대체(정확한 밀리초 불필요/일 기준이라 OK)
  } else {
    const data = snap.data() || {};
    uniqueId = (data.uniqueId as string | undefined) ?? undefined;
    joinedAt = (data.joinedAt as Timestamp | undefined) ?? undefined;
  }

  // 공통 병합 필드(매 로그인 시 업데이트 가능)
  const mergePayload: Record<string, any> = {
    email: email ?? null,
    lastLoginAt: serverTimestamp(), // 최근 로그인 시각
  };

  // 최초 로그인 시에만 추가되는 불변 필드
  if (uniqueId === undefined) mergePayload.uniqueId = createUniqueId();
  if (joinedAt === undefined) mergePayload.joinedAt = Timestamp.now();

  // 기본 권한/구독 상태(문서에 없다면 기본값만 채움)
  // - role: 'free' | 'basic' | 'premium' | 'admin' 중 하나를 내부에서 사용 중
  // - isSubscribed: 결제 여부 boolean
  // - subscriptionStartAt / subscriptionEndAt: Timestamp | null
  const data = snap.data() || {};
  if (typeof data.role === 'undefined') mergePayload.role = 'free';
  if (typeof data.isSubscribed === 'undefined') mergePayload.isSubscribed = false;
  if (typeof data.subscriptionStartAt === 'undefined') mergePayload.subscriptionStartAt = null;
  if (typeof data.subscriptionEndAt === 'undefined') mergePayload.subscriptionEndAt = null;

  await setDoc(ref, mergePayload, { merge: true });
}

/** (옵션) 구독 시작/종료일을 업데이트(관리자/웹훅 등에서 사용) */
export async function updateSubscriptionDates(uid: string, startAt: Date | null, endAt: Date | null) {
  const ref = doc(db, 'users', uid);
  await updateDoc(ref, {
    subscriptionStartAt: startAt ? Timestamp.fromDate(startAt) : null,
    subscriptionEndAt: endAt ? Timestamp.fromDate(endAt) : null,
    isSubscribed: !!endAt && (!startAt || endAt > (startAt || new Date())), // 단순 플래그 보정
  });
}
