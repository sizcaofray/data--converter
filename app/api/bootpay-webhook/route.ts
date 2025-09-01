// app/api/bootpay-webhook/route.ts
// ✅ 빌드 중에는 절대 ENV를 건드리지 않도록 "핸들러 내부"에서만 Admin 접근
// ✅ Node 런타임 + 캐시 방지로 오해 소지 감소

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebase/admin";

export async function POST(req: Request) {
  try {
    // 1) 요청 바디 파싱
    const payload = await req.json().catch(() => ({}));

    // 2) 여기에서만 Admin 초기화 (지연)
    const { db } = getAdmin();

    // 3) 저장 (원하시면 서명검증/비즈니스 로직 추가)
    await db.collection("bootpay_webhooks").add({
      payload,
      receivedAt: Date.now(),
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[bootpay-webhook] error:", err?.message || err);
    return NextResponse.json(
      { ok: false, error: String(err?.message || err) },
      { status: 500 }
    );
  }
}

// GET 막기(헬스체크 필요하면 별도 라우트에서)
export async function GET() {
  return NextResponse.json({ error: "Method Not Allowed" }, { status: 405 });
}
