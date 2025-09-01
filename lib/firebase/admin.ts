// lib/firebase/admin.ts
// ✅ 서버(Node) 전용 Firebase Admin 초기화 유틸
// - 빌드 시가 아닌 "요청 시"에만 환경변수 파싱(지연 초기화)
// - 세 가지 입력 방식 모두 지원: ① FIREBASE_ADMIN_SA_BASE64 ② FB_ADMIN_SA_JSON ③ FB_ADMIN_* 3종
// - snake_case(project_id) / camelCase(projectId) 모두 허용 → 내부적으로 camelCase로 정규화
// - private_key 개행(\n) 복원
// - 누락/오타 시 "정확한" 에러 메시지로 원인 식별

import { getApps, initializeApp, cert, App } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";
import { getAuth, Auth } from "firebase-admin/auth";

type AdminBundle = { app: App; db: Firestore; auth: Auth };

function normalizeServiceAccount(raw: any) {
  // snake_case ↔ camelCase 모두 허용
  const projectId =
    typeof raw?.projectId === "string" ? raw.projectId : raw?.project_id;
  const clientEmail =
    typeof raw?.clientEmail === "string" ? raw.clientEmail : raw?.client_email;
  let privateKey =
    typeof raw?.privateKey === "string" ? raw.privateKey : raw?.private_key;

  if (typeof privateKey === "string") {
    // \n 복원
    privateKey = privateKey.replace(/\\n/g, "\n");
  }

  const errs: string[] = [];
  if (typeof projectId !== "string" || !projectId.trim())
    errs.push("project_id/projectId");
  if (typeof clientEmail !== "string" || !clientEmail.trim())
    errs.push("client_email/clientEmail");
  if (typeof privateKey !== "string" || !privateKey.trim())
    errs.push("private_key/privateKey");

  if (errs.length) {
    throw new Error(
      `[firebase-admin] 서비스계정 필드 누락/형식 오류: ${errs.join(
        ", "
      )} (정품 서비스계정 JSON이어야 하며 'private_key'가 반드시 포함됩니다)`
    );
  }

  // "정품" 확인: type: service_account & private_key 형태
  if (raw?.type && raw.type !== "service_account") {
    throw new Error(
      `[firebase-admin] 잘못된 JSON입니다. Firebase 웹앱 설정(JSON: apiKey, authDomain...)이 아니라 'type: service_account'인 **서비스계정 키**를 사용하세요.`
    );
  }
  if (!privateKey.includes("BEGIN PRIVATE KEY")) {
    throw new Error(
      `[firebase-admin] private_key 형식이 이상합니다. '-----BEGIN PRIVATE KEY-----'가 포함되어야 합니다.`
    );
  }

  return { projectId, clientEmail, privateKey };
}

function loadServiceAccount(): { projectId: string; clientEmail: string; privateKey: string } {
  // ① Base64 한 방에 넣는 방식 (권장)
  const b64 = process.env.FIREBASE_ADMIN_SA_BASE64;
  if (b64) {
    let jsonText = "";
    try {
      jsonText = Buffer.from(b64, "base64").toString("utf8");
    } catch {
      throw new Error(
        "[firebase-admin] FIREBASE_ADMIN_SA_BASE64 디코딩 실패: Base64 문자열이 아닙니다."
      );
    }
    let parsed: any;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      throw new Error(
        "[firebase-admin] FIREBASE_ADMIN_SA_BASE64 → JSON.parse 실패: 올바른 JSON이 아닙니다."
      );
    }
    return normalizeServiceAccount(parsed);
  }

  // ② JSON 문자열 그대로 넣는 방식
  const json = process.env.FB_ADMIN_SA_JSON;
  if (json) {
    let parsed: any;
    try {
      parsed = JSON.parse(json);
    } catch {
      throw new Error(
        "[firebase-admin] FB_ADMIN_SA_JSON → JSON.parse 실패: 올바른 JSON이 아닙니다."
      );
    }
    return normalizeServiceAccount(parsed);
  }

  // ③ 개별 키 3종
  const projectId = process.env.FB_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FB_ADMIN_CLIENT_EMAIL;
  const privateKeyRaw = process.env.FB_ADMIN_PRIVATE_KEY;

  if (projectId && clientEmail && privateKeyRaw) {
    return normalizeServiceAccount({
      projectId,
      clientEmail,
      privateKey: privateKeyRaw,
    });
  }

  // 전부 없음 → 어떤 값이 비어있는지 친절히 표기
  const present = Object.entries({
    FIREBASE_ADMIN_SA_BASE64: !!process.env.FIREBASE_ADMIN_SA_BASE64,
    FB_ADMIN_SA_JSON: !!process.env.FB_ADMIN_SA_JSON,
    FB_ADMIN_PROJECT_ID: !!process.env.FB_ADMIN_PROJECT_ID,
    FB_ADMIN_CLIENT_EMAIL: !!process.env.FB_ADMIN_CLIENT_EMAIL,
    FB_ADMIN_PRIVATE_KEY: !!process.env.FB_ADMIN_PRIVATE_KEY,
  })
    .filter(([, v]) => v)
    .map(([k]) => k);

  throw new Error(
    `[firebase-admin] 서비스계정 환경변수 없음. 다음 중 한 가지 방식으로만 설정하세요.
    ① FIREBASE_ADMIN_SA_BASE64
    ② FB_ADMIN_SA_JSON
    ③ FB_ADMIN_PROJECT_ID / FB_ADMIN_CLIENT_EMAIL / FB_ADMIN_PRIVATE_KEY
    (현재 감지된 키: ${present.join(", ") || "없음"})`
  );
}

export function getAdmin(): AdminBundle {
  // 이미 초기화돼 있으면 재사용
  if (!getApps().length) {
    const sa = loadServiceAccount(); // ← 여기서만 ENV 파싱 (지연)
    initializeApp({
      credential: cert({
        projectId: sa.projectId,
        clientEmail: sa.clientEmail,
        privateKey: sa.privateKey,
      }),
    });
    // 디버그 로그(민감정보 제외)
    console.log(
      `[firebase-admin] initialized (projectId="${sa.projectId}", runtime="${process.env.NEXT_RUNTIME || "node"}")`
    );
  }
  return { app: getApps()[0]!, db: getFirestore(), auth: getAuth() };
}
