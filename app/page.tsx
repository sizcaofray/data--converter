'use client'

/**
 * 홈(/) 커버 페이지 - 공지 Firestore 연동(컬렉션: notice) + 마크다운 모달
 * -----------------------------------------------------------------------------
 * ✅ 유지
 *  - 로그인 상태면 /convert 로 리다이렉트
 *  - 우상단 Google 로그인/로그아웃 박스
 *
 * ✅ 추가
 *  - Firestore notice 컬렉션 실시간 구독(onSnapshot)
 *  - pinned desc → createdAt desc 정렬
 *  - 항목 클릭 시 마크다운 본문 모달(react-markdown)
 *
 * ⚠️ 전제
 *  - '@/lib/firebase/firebase' 모듈에서 `db`, `auth` 를 export 한다고 가정합니다.
 *  - Firestore Rules는 notice 컬렉션 read(공개)/write(관리자)로 설정되어 있어야 함.
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

// Firebase Auth
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth'

// Firebase: db, auth 만 사용 (app 불필요)
import { db, auth } from '@/lib/firebase/firebase'
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
} from 'firebase/firestore'

// 마크다운 렌더러
import ReactMarkdown from 'react-markdown'

// 로그인 성공 시 이동 경로(프로젝트 정책 유지)
const DEFAULT_AFTER_LOGIN = '/convert'

// 우측 기능 카드 목록(실제 라우트에 맞춰 href 수정 가능)
const FEATURE_LINKS = [
  { href: '/convert', title: 'Data Convert', desc: '엑셀 · CSV · TXT · JSON 변환', emoji: '🔁' },
  { href: '/compare', title: 'Compare', desc: '두 파일 비교 · 결과 내보내기', emoji: '🧮' },
  { href: '/pdf', title: 'PDF Tool', desc: 'PDF 분할 · 병합 · 암호화', emoji: '📄' },
  { href: '/(contents)/pattern-editor', title: 'Pattern Editor', desc: '텍스트 치환 · 정규식 편집', emoji: '✍️' },
  { href: '/random', title: 'Random', desc: '랜덤 데이터 · 샘플 생성', emoji: '🎲' },
  { href: '/admin', title: 'Admin', desc: '메뉴/제한 설정 (관리자)', emoji: '🛠️' },
]

// 공지 타입
type Notice = {
  id: string
  title: string
  content_md?: string
  pinned?: boolean
  published?: boolean
  createdAt?: Timestamp
  updatedAt?: Timestamp
}

export default function HomePage() {
  const router = useRouter()

  // 🔐 로그인 상태
  const [user, setUser] = useState<User | null>(null)
  const [busy, setBusy] = useState(false)

  // 📢 공지 목록/상태
  const [notices, setNotices] = useState<Notice[]>([])
  const [loadingNotices, setLoadingNotices] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // 🔍 모달에 표시할 선택 공지
  const [activeNotice, setActiveNotice] = useState<Notice | null>(null)

  /**
   * 1) 인증 상태 구독: 로그인 중이면 /convert 로 즉시 이동(기존 동작 유지)
   */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u)
      if (u) router.replace(DEFAULT_AFTER_LOGIN)
    })
    return () => unsub()
  }, [router])

  /**
   * 2) 공지 실시간 구독: notice 컬렉션
   *    - pinned desc → createdAt desc, 상위 50개
   *    - 규칙에서 published=false는 차단되나, 클라이언트에서도 한 번 더 필터링
   *    - 최초 실행 시 복합 인덱스 생성 안내가 뜰 수 있음(한 번 생성)
   */
  useEffect(() => {
    const q = query(
      collection(db, 'notice'),  // ← 컬렉션명을 notice 로 고정
      orderBy('pinned', 'desc'),
      orderBy('createdAt', 'desc'),
      limit(50)
    )

    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: Notice[] = []
        snap.forEach((doc) => {
          const data = doc.data() as Omit<Notice, 'id'>
          if (data.published === false) return // 안전상 클라에서도 필터
          rows.push({ id: doc.id, ...data })
        })
        setNotices(rows)
        setErrorMsg(null)
        setLoadingNotices(false)
      },
      (err) => {
        setErrorMsg(err?.message || '공지 불러오기에 실패했습니다.')
        setLoadingNotices(false)
      }
    )

    return () => unsub()
  }, [])

  /**
   * 3) 로그인/로그아웃 핸들러
   */
  const handleLogin = async () => {
    try {
      setBusy(true)
      const provider = new GoogleAuthProvider()
      await signInWithPopup(auth, provider)
      router.replace(DEFAULT_AFTER_LOGIN)
    } finally {
      setBusy(false)
    }
  }

  const handleLogout = async () => {
    try {
      setBusy(true)
      await signOut(auth)
    } finally {
      setBusy(false)
    }
  }

  /**
   * 4) 날짜 포맷(YYYY-MM-DD, Asia/Seoul 기준 간단 표기)
   */
  const formatDate = (ts?: Timestamp) => {
    if (!ts) return ''
    const d = ts.toDate()
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }

  const showEmpty = !loadingNotices && !errorMsg && notices.length === 0

  return (
    <main className="relative flex-1 flex flex-col items-center justify-start px-4">
      {/* 우상단 로그인 박스(기존 유지) */}
      <div className="absolute right-6 top-14 z-40">
        <div className="rounded-xl border border-white/15 bg-black/30 dark:bg-white/10 backdrop-blur px-4 py-3 shadow-md">
          {user ? (
            <div className="flex items-center gap-3">
              <span className="text-sm opacity-90">{user.email}</span>
              <button
                onClick={handleLogout}
                disabled={busy}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:opacity-90 disabled:opacity-60"
              >
                로그아웃
              </button>
            </div>
          ) : (
            <button
              onClick={handleLogin}
              disabled={busy}
              className="rounded-md border border-white/20 bg-black/30 px-4 py-2 text-sm text-white hover:bg-black/40 disabled:opacity-60"
            >
              Google 계정으로 로그인
            </button>
          )}
        </div>
      </div>

      {/* 히어로 섹션 */}
      <section className="w-full max-w-6xl mx-auto pt-16 text-center">
        <h1 className="text-4xl md:text-5xl font-extrabold mb-3">Data Converter</h1>
        <p className="text-gray-300 dark:text-gray-300 max-w-xl mx-auto leading-relaxed">
          다양한 포맷을 빠르게 변환하고 비교·편집·PDF 도구까지 한 곳에서 이용하세요.
        </p>
      </section>

      {/* 본문 2컬럼: 좌 공지 / 우 기능 */}
      <section className="w-full max-w-6xl mx-auto mt-10 mb-16">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* 좌측: 공지사항 패널 */}
          <div className="rounded-2xl border border-white/10 bg-white/5 dark:bg-white/5 backdrop-blur p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">공지사항</h2>
            </div>

            <div className="max-h-72 overflow-auto pr-1">
              {loadingNotices && <p className="text-sm opacity-70">불러오는 중…</p>}
              {errorMsg && <p className="text-sm text-red-400">{errorMsg}</p>}
              {showEmpty && <p className="text-sm opacity-70">등록된 공지가 없습니다.</p>}

              <ul className="divide-y divide-white/10">
                {notices.map((n) => (
                  <li key={n.id} className="py-3">
                    <button
                      onClick={() => setActiveNotice(n)}
                      className="group flex items-start justify-between gap-3 w-full text-left"
                    >
                      <div className="min-w-0">
                        <p className="truncate group-hover:underline">
                          {n.pinned ? '📌 ' : ''}
                          {n.title}
                        </p>
                        <p className="text-xs opacity-60 mt-1">{formatDate(n.createdAt)}</p>
                      </div>
                      <span className="text-sm opacity-60 shrink-0">열기 ›</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <p className="text-xs opacity-60 mt-4">
              ※ 공지 작성/수정은 관리자 전용 화면에서 진행하세요(마크다운 지원).
            </p>
          </div>

          {/* 우측: 기능 소개 카드 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {FEATURE_LINKS.map((f) => (
              <Link
                key={f.href}
                href={f.href}
                className="group rounded-2xl border border-white/10 bg-gradient-to-br from-white/5 to-white/[0.03] hover:from-white/10 hover:to-white/[0.06] transition-colors p-5 shadow-sm flex flex-col"
              >
                <div className="text-3xl mb-3">{f.emoji}</div>
                <h3 className="text-lg font-semibold">{f.title}</h3>
                <p className="text-sm opacity-80 mt-1 flex-1">{f.desc}</p>
                <div className="mt-3 text-sm opacity-70 group-hover:opacity-100">바로가기 →</div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* 공지 모달: 마크다운 본문 표시 */}
      {activeNotice && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setActiveNotice(null)} // 배경 클릭 시 닫기
        >
          <div
            className="w-[92vw] max-w-2xl max-h-[80vh] overflow-auto rounded-2xl border border-white/15 bg-neutral-900 p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()} // 모달 내부 클릭은 이벤트 버블링 중단
          >
            {/* 모달 헤더 */}
            <div className="flex items-start justify-between gap-4">
              <h3 className="text-xl font-semibold">
                {activeNotice.pinned ? '📌 ' : ''}
                {activeNotice.title}
              </h3>
              <button
                onClick={() => setActiveNotice(null)}
                className="text-sm opacity-70 hover:opacity-100"
              >
                닫기 ✕
              </button>
            </div>

            {/* 생성일 표기 */}
            <div className="text-xs opacity-60 mt-1">
              {formatDate(activeNotice.createdAt)}
            </div>

            {/* 마크다운 본문 */}
            <div className="prose prose-invert mt-4">
              <ReactMarkdown
                components={{
                  // 링크를 새 창으로 열도록 강제
                  a: ({ node, ...props }) => (
                    <a {...props} target="_blank" rel="noopener noreferrer" />
                  ),
                }}
              >
                {activeNotice.content_md || '_내용이 없습니다._'}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
