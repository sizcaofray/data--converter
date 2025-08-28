// lib/firebase/admin.ts
// 목적: 서버(Node.js)에서만 Firebase Admin SDK를 "지연 초기화"로 안전하게 사용
// - 빌드 타임에 env 미설정이어도 throw하지 않도록 구성 (실제 라우트 실행 시 검사)
// - Vercel 런타임은 Node.js를 사용 (edge X)

import { getApps, initializeApp, cert, App } from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

type AdminBundle = { app: App; db: Firestore; auth: Auth };

/** Admin 인스턴스 Lazy Init — 최초 1회만 초기화 */
export function getAdmin(): AdminBundle {
  if (!getApps().length) {
    const base64 = process.env.FIREBASE_ADMIN_SA_BASE64;
    if (!base64) {
      // 빌드 통과를 위해 여기서 에러를 던지는 대신,
      // 실제 라우트에서 try-catch로 잡아 사용자에게 친절히 안내하는 것을 권장합니다.
      throw new Error(
        'Missing FIREBASE_ADMIN_SA_BASE64. Set it in Vercel: Project → Settings → Environment Variables.'
      );
    }
    const json = Buffer.from(base64, 'base64').toString('utf8');
    const serviceAccount = JSON.parse(json);

    initializeApp({
      credential: cert(serviceAccount),
      // databaseURL 필요 시 추가
    });
  }
  return { app: getApps()[0]!, db: getFirestore(), auth: getAuth() };
}
