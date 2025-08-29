// lib/firebase/admin.ts
// 서버(Node)에서만 Firebase Admin SDK를 "지연 초기화"로 안전하게 사용
import { getApps, initializeApp, cert, App } from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

type AdminBundle = { app: App; db: Firestore; auth: Auth };

export function getAdmin(): AdminBundle {
  // 최초 1회만 초기화
  if (!getApps().length) {
    const base64 = process.env.FIREBASE_ADMIN_SA_BASE64;
    if (!base64) {
      // 빌드는 통과시키되, 런타임에서만 에러로 안내
      throw new Error(
        'Missing FIREBASE_ADMIN_SA_BASE64 (Vercel → Project → Settings → Environment Variables)'
      );
    }
    const json = Buffer.from(base64, 'base64').toString('utf8');
    const serviceAccount = JSON.parse(json);

    initializeApp({
      credential: cert(serviceAccount),
      // 필요 시 databaseURL 등 추가
    });
  }
  return { app: getApps()[0]!, db: getFirestore(), auth: getAuth() };
}
