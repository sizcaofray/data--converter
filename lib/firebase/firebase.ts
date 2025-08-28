// ✅ Firebase 클라이언트 SDK 초기화 (auth, db export)

import { initializeApp } from 'firebase/app';
import {
  getAuth,
  setPersistence,
  browserSessionPersistence,
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore'; // ✅ Firestore 추가

const firebaseConfig = {
  apiKey: 'AIzaSyAhvLqYL2YoFi-EACMupdLSDRyE6Ca32ss',
  authDomain: 'data-converter-79c1e.firebaseapp.com',
  projectId: 'data-converter-79c1e',
  storageBucket: 'data-converter-79c1e.firebasestorage.app',
  messagingSenderId: '731867390654',
  appId: '1:731867390654:web:163c9705b0d10d29def4ef',
};


// ✅ Firebase 초기화
const app = initializeApp(firebaseConfig);

// ✅ 인증과 Firestore 객체 생성
const auth = getAuth(app);
const db = getFirestore(app); // ✅ 추가된 부분

// ✅ 세션 설정: 브라우저 종료 시 자동 로그아웃
setPersistence(auth, browserSessionPersistence);

// ✅ 필요한 객체들 export
export { auth, db };