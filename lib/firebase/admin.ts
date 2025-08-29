// lib/firebase/admin.ts
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

export function getAdmin() {
  if (!getApps().length) {
    const base64 = process.env.FIREBASE_ADMIN_SA_BASE64;
    if (!base64) {
      throw new Error('Missing FIREBASE_ADMIN_SA_BASE64');
    }
    const json = Buffer.from(base64, 'base64').toString('utf8');
    const serviceAccount = JSON.parse(json);
    initializeApp({ credential: cert(serviceAccount) });
  }
  return { db: getFirestore(), auth: getAuth() };
}
