// ✅ Firebase Admin SDK 초기화 (서버 전용)
import { getApps, getApp, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// 🛡 서비스 계정 키 설정 (환경변수 또는 secrets 사용 권장)
const adminConfig = {
  credential: cert({
    projectId: 'YOUR_PROJECT_ID',
    clientEmail: 'YOUR_CLIENT_EMAIL',
    privateKey: 'YOUR_PRIVATE_KEY'.replace(/\\n/g, '\n'),
  }),
};

// 🔁 중복 초기화 방지
const adminApp = getApps().length ? getApp() : initializeApp(adminConfig);

// 📦 서버 전용 Firestore export
export const adminDb = getFirestore(adminApp);
