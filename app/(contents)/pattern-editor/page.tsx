// app/(contents)/pattern-editor/page.tsx
"use client";

/**
 * Pattern Editor v1.2
 * - 보완 사항
 *   1) 찾을 패턴 ↔ 바꿀 내용 스왑(양방향 화살표 버튼)
 *   2) Undo/Redo: Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z (Mac은 ⌘Z / ⌘Y / ⌘⇧Z)
 *      - 타이핑 변경은 700ms 단위로 히스토리 묶음(coalesce)
 *      - 명령형 변경(파일 로드, 일괄 바꾸기 등)은 즉시 히스토리 저장
 * - 기존 기능 유지: 파일 드래그/선택, 대용량 붙여넣기, 찾기/바꾸기(1개/전체),
 *   정규식/대소문자/멀티라인 옵션, 프리셋, 복사/다운로드, 글자 수 표시
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Preset = {
  id: string;
  title: string;
  find: string;            // 찾을 패턴(문자열 또는 정규식)
  replace: string;         // 바꿀 내용
  regex?: boolean;         // 정규식 기본값
  caseSensitive?: boolean; // 대소문자 구분 기본값
  desc?: string;           // 설명(툴팁)
};

// 자주 쓰는 패턴 프리셋(중복 id 방지)
const PRESETS: Preset[] = [
  { id: "newline-remove",       title: "모든 개행 제거",     find: "\\r?\\n",        replace: "",   regex: true, desc: "줄바꿈 없이 한 줄로 합칩니다." },
  { id: "newline-collapse",     title: "연속 개행 1개로",     find: "\\n{2,}",        replace: "\n", regex: true, desc: "빈 줄이 여러 개면 1개로 축약합니다." },
  { id: "period-to-newline",    title: "'. '를 개행으로",     find: "\\.\\s+",        replace: ".\n",regex: true, desc: "문장 끝 점 뒤를 줄바꿈으로 바꿉니다." },
  { id: "comma-to-newline",     title: "', '를 개행으로",     find: ",\\s+",          replace: ",\n",regex: true, desc: "쉼표 뒤를 줄바꿈으로 바꿉니다." },
  { id: "trim-each-line",       title: "각 줄 좌우 공백 제거", find: "^[ \\t]+|[ \\t]+$", replace: "", regex: true, desc: "멀티라인(m)과 함께 사용하세요." },
  { id: "multi-space-collapse", title: "연속 공백 1개로",     find: " {2,}",          replace: " ",  regex: true, desc: "스페이스 2개 이상 → 1개" },
  { id: "tabs-to-spaces",       title: "탭 → 스페이스(4)",    find: "\\t",            replace: "    ", regex: true, desc: "탭을 공백 4개로" },
  { id: "spaces-to-tabs",       title: "스페이스(4) → 탭",    find: " {4}",           replace: "\t", regex: true, desc: "공백 4개를 탭으로" },
  { id: "nbsp-remove",          title: "NBSP 제거(\\u00A0)",  find: "\\u00A0",        replace: "",   regex: true, desc: "줄바꿈 없는 특수 공백 제거" },
  { id: "zero-width-remove",    title: "제로폭 문자 제거",     find: "[\\u200B\\u200C\\u200D\\uFEFF]", replace: "", regex: true, desc: "ZWS/ZWNJ/ZWJ/BOM 제거" },
  { id: "comma-korean-space",   title: "쉼표 뒤 공백 맞추기",  find: ",(\\S)",         replace: ", $1", regex: true, desc: "쉼표 뒤 공백 보정" },
];

const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2MB 제한
const TYPING_COALESCE_MS = 700;         // 타이핑 히스토리 묶음 기준

/** 클립보드 복사 */
function useClipboard() {
  const copy = useCallback(async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      return true;
    } catch {
      return false;
    }
  }, []);
  return { copy };
}

/** 일반 문자열 → RegExp 안전 이스케이프 */
function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 검색용 RegExp 생성(필요 시 g 플래그 유무 선택) */
function buildRegExp(
  pattern: string,
  regex: boolean,
  caseSensitive: boolean,
  multiline: boolean,
  withGlobal: boolean
) {
  const flags = `${caseSensitive ? "" : "i"}${multiline ? "m" : ""}${withGlobal ? "g" : ""}`;
  if (!regex) return new RegExp(escapeRegExp(pattern), flags);
  return new RegExp(pattern, flags);
}

/** 매치 개수 카운트: 항상 g 플래그로 세서 정확한 개수 반환 */
function countMatches(
  text: string,
  pattern: string,
  regex: boolean,
  caseSensitive: boolean,
  multiline: boolean
) {
  try {
    const reGlobal = buildRegExp(pattern, regex, caseSensitive, multiline, true);
    const m = text.match(reGlobal);
    return m ? m.length : 0;
  } catch {
    return 0; // 정규식 문법 오류 시 0으로 처리
  }
}

export default function PatternEditorPage() {
  // 노트 텍스트
  const [text, setText] = useState<string>("");

  // 찾기/바꾸기 값
  const [findValue, setFindValue] = useState<string>("");
  const [replaceValue, setReplaceValue] = useState<string>("");

  // 옵션
  const [useRegex, setUseRegex] = useState<boolean>(false);
  const [caseSensitive, setCaseSensitive] = useState<boolean>(false);
  const [multiline, setMultiline] = useState<boolean>(true);

  // 메시지/업로드
  const [message, setMessage] = useState<string>("");
  const dropRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { copy } = useClipboard();

  // --- Undo/Redo 상태 ---
  const [past, setPast] = useState<string[]>([]);   // 이전 상태 스택(뒤가 최신)
  const [future, setFuture] = useState<string[]>([]); // 앞으로 상태 큐(앞이 최신)
  const lastTypingTsRef = useRef<number>(0);        // 타이핑 히스토리 묶음 기준

  /** 타이핑 중 변경: 700ms 단위로 히스토리 묶기 */
  const applyTextTyping = useCallback((nextText: string) => {
    const now = Date.now();
    setText((prev) => {
      if (prev === nextText) return prev;
      if (now - lastTypingTsRef.current > TYPING_COALESCE_MS) {
        setPast((p) => [...p, prev]); // 새 묶음 시작 시에만 과거에 push
        setFuture([]);                 // 타이핑 시 redo 단절
      }
      lastTypingTsRef.current = now;
      return nextText;
    });
  }, []);

  /** 명령형 변경: 항상 즉시 히스토리에 push */
  const applyTextCommand = useCallback((nextText: string) => {
    setText((prev) => {
      if (prev === nextText) return prev;
      setPast((p) => [...p, prev]); // 언제나 현재를 과거에 저장
      setFuture([]);                // redo 단절
      return nextText;
    });
    lastTypingTsRef.current = Date.now();
  }, []);

  /** Undo */
  const undo = useCallback(() => {
    setPast((prevPast) => {
      if (!prevPast.length) return prevPast;      // 과거 없음
      const prevText = prevPast[prevPast.length - 1];
      setFuture((f) => [text, ...f]);             // 현재를 미래로 이동
      setText(prevText);                           // 과거로 복귀
      return prevPast.slice(0, -1);
    });
  }, [text]);

  /** Redo */
  const redo = useCallback(() => {
    setFuture((prevFuture) => {
      if (!prevFuture.length) return prevFuture;  // 미래 없음
      const nextText = prevFuture[0];
      setPast((p) => [...p, text]);               // 현재를 과거로 이동
      setText(nextText);                           // 미래로 전진
      return prevFuture.slice(1);
    });
  }, [text]);

  /** 단축키: Ctrl/⌘ + Z/Y(또는 Shift+Z) */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMac = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform);
      const ctrl = isMac ? e.metaKey : e.ctrlKey;
      if (!ctrl) return;

      const key = e.key.toLowerCase();
      if (key === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (key === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo]);

  // 현재 매치 수(실시간)
  const currentMatchCount = useMemo(
    () => (findValue ? countMatches(text, findValue, useRegex, caseSensitive, multiline) : 0),
    [text, findValue, useRegex, caseSensitive, multiline]
  );

  /** 드래그 비주얼 */
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    dropRef.current?.classList.add("ring-2", "ring-blue-500");
  };
  const handleDragLeave = () => {
    dropRef.current?.classList.remove("ring-2", "ring-blue-500");
  };

  /** 파일 로딩 */
  const loadFile = async (file: File) => {
    if (file.size > MAX_FILE_BYTES) {
      setMessage(`⚠️ 파일이 큽니다. 최대 ${(MAX_FILE_BYTES / (1024 * 1024)).toFixed(0)}MB 허용.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = (reader.result ?? "") as string;
      applyTextCommand(result); // 파일 로드는 명령형 변경
      setMessage(`✅ "${file.name}" 로딩 완료 (${(file.size / 1024).toFixed(0)}KB)`);
    };
    reader.onerror = () => setMessage("⚠️ 파일 읽기 오류가 발생했습니다.");
    reader.readAsText(file, "utf-8");
  };

  /** 드롭 */
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    handleDragLeave();
    const file = e.dataTransfer?.files?.[0];
    if (file) void loadFile(file);
  };

  /** 파일 선택 */
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void loadFile(file);
    // 동일 파일 재선택 가능하도록 초기화
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  /** 찾기(개수 알림) */
  const onFind = () => {
    if (!findValue) {
      setMessage("검색어를 입력하세요.");
      return;
    }
    setMessage(`🔎 "${findValue}" 일치: ${currentMatchCount}개`);
  };

  /** 바꾸기(첫 1개) */
  const onReplaceOne = () => {
    if (!findValue) {
      setMessage("⚠️ '찾을 패턴'을 입력하세요.");
      return;
    }
    try {
      // g 없는 RegExp로 1개만 치환
      const reOne = buildRegExp(findValue, useRegex, caseSensitive, multiline, false);
      const next = text.replace(reOne, replaceValue);
      if (next === text) setMessage("치환된 항목이 없습니다.");
      else {
        applyTextCommand(next); // 명령형 변경
        setMessage("1개 치환 완료.");
      }
    } catch {
      setMessage("⚠️ 정규식이 올바르지 않습니다.");
    }
  };

  /** 일괄 바꾸기(전체) */
  const onReplaceAll = () => {
    if (!findValue) {
      setMessage("⚠️ '찾을 패턴'을 입력하세요.");
      return;
    }
    try {
      const reAll = buildRegExp(findValue, useRegex, caseSensitive, multiline, true);
      const next = text.replace(reAll, replaceValue);
      if (next === text) setMessage("치환된 항목이 없습니다.");
      else {
        applyTextCommand(next); // 명령형 변경
        setMessage("✅ 전체 치환 완료.");
      }
    } catch {
      setMessage("⚠️ 정규식이 올바르지 않습니다.");
    }
  };

  /** 프리셋 클릭 → 상단 입력 채우기 */
  const applyPreset = (preset: Preset) => {
    setFindValue(preset.find);
    setReplaceValue(preset.replace);
    setUseRegex(preset.regex ?? true);
    setCaseSensitive(preset.caseSensitive ?? false);
    setMultiline(true);
    setMessage(`패턴 적용: ${preset.title}`);
  };

  /** 패턴 ↔ 대체어 스왑 */
  const onSwapPatterns = () => {
    const f = findValue;
    const r = replaceValue;
    setFindValue(r);
    setReplaceValue(f);
    setMessage("↔ 찾을 패턴과 바꿀 내용을 교체했습니다.");
  };

  /** 복사 */
  const onCopy = async () => {
    const ok = await copy(text);
    setMessage(ok ? "📋 복사 완료." : "⚠️ 복사 실패: 브라우저 권한 확인");
  };

  /** 다운로드 */
  const onDownload = () => {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const now = new Date();
    const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
      now.getDate()
    ).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(
      now.getMinutes()
    ).padStart(2, "0")}`;
    a.href = url;
    a.download = `pattern-editor_${stamp}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setMessage("⬇️ 파일 다운로드 완료.");
  };

  const charCount = useMemo(() => text.length, [text]);

  return (
    <section className="p-4 md:p-6 grid grid-cols-1 md:grid-cols-12 gap-4">
      {/* 좌측: 프리셋 패턴 */}
      <aside className="md:col-span-3">
        <div className="sticky top-4">
          <h2 className="text-lg font-semibold mb-2">🧩 자주 쓰는 패턴</h2>
          <ul className="space-y-2">
            {PRESETS.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => applyPreset(p)}
                  className="w-full text-left px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                  title={p.desc ?? ""}
                >
                  <div className="font-medium">{p.title}</div>
                  {p.desc && (
                    <div className="text-xs text-gray-500 dark:text-gray-400">{p.desc}</div>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      {/* 우측: 에디터 */}
      <div className="md:col-span-9 space-y-4">
        <header className="space-y-2">
          <h1 className="text-2xl font-bold">📝 Pattern Editor</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            파일을 드래그/선택해 불러오거나, 자유롭게 붙여넣은 뒤 상단 패턴으로 찾기/바꾸기를 수행하세요.
          </p>
        </header>

        {/* 드래그&드롭 / 파일선택 */}
        <div
          ref={dropRef}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl p-4 text-center hover:bg-gray-50 dark:hover:bg-gray-800 transition"
        >
          <p className="mb-2">여기로 파일을 드래그하세요</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            TXT/CSV/JSON 권장 · 최대 {(MAX_FILE_BYTES / (1024 * 1024)).toFixed(0)}MB
          </p>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.csv,.json,.log,.md,.tsv,.xml,.html,.js,.ts,.yml,.yaml,.ini,.conf,.css,.scss,.less"
              className="hidden"
              onChange={handleFileSelect}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
            >
              파일 선택
            </button>
          </div>
        </div>

        {/* 찾기/바꾸기 바 : 1행(찾기 | 스왑 | 바꾸기), 2행(옵션), 3행(실행 버튼) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">
          {/* 1행: 찾을 패턴 */}
          <div className="lg:col-span-5">
            <label className="block text-sm mb-1">찾을 패턴</label>
            <input
              value={findValue}
              onChange={(e) => setFindValue(e.target.value)}
              placeholder="예: \\u200B (정규식 가능)"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-transparent"
            />
          </div>

          {/* 1행: 스왑 버튼(가운데) */}
          <div className="lg:col-span-2 flex items-center justify-center">
            <button
              onClick={onSwapPatterns}
              title="내용 교체(양방향)"
              className="w-full lg:w-auto px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              ↔ 내용 교체
            </button>
          </div>

          {/* 1행: 바꿀 내용 */}
          <div className="lg:col-span-5">
            <label className="block text-sm mb-1">바꿀 내용</label>
            <input
              value={replaceValue}
              onChange={(e) => setReplaceValue(e.target.value)}
              placeholder="예: (빈 칸이면 삭제)"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-transparent"
            />
          </div>

          {/* 2행: 옵션 */}
          <div className="lg:col-span-12 flex gap-4 flex-wrap pt-1">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={useRegex}
                onChange={(e) => setUseRegex(e.target.checked)}
              />
              정규식
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={caseSensitive}
                onChange={(e) => setCaseSensitive(e.target.checked)}
              />
              대소문자
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={multiline}
                onChange={(e) => setMultiline(e.target.checked)}
              />
              멀티라인(m)
            </label>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              단축키: <b>Ctrl/⌘+Z</b> 되돌리기 · <b>Ctrl/⌘+Y</b> / <b>Ctrl/⌘+Shift+Z</b> 다시실행
            </span>
          </div>

          {/* 3행: 실행 버튼 */}
          <div className="lg:col-span-12 flex gap-2">
            <button
              onClick={onFind}
              className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
              title="매칭 개수 확인"
            >
              찾기 ({currentMatchCount})
            </button>
            <button
              onClick={onReplaceOne}
              className="px-3 py-2 rounded-lg bg-amber-600 text-white hover:bg-amber-700"
              title="첫 1개만 치환"
            >
              바꾸기(1개)
            </button>
            <button
              onClick={onReplaceAll}
              className="px-3 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
              title="전체 치환"
            >
              일괄 바꾸기(전체)
            </button>
            <div className="ml-auto flex gap-2">
              <button
                onClick={onCopy}
                className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                복사
              </button>
              <button
                onClick={onDownload}
                className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                다운로드
              </button>
            </div>
          </div>
        </div>

        {/* 메시지 */}
        {message && <div className="text-sm text-gray-600 dark:text-gray-400">{message}</div>}

        {/* 노트 영역 */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              글자 수: {charCount.toLocaleString()}자
            </span>
            <div className="flex items-center gap-2">
              <button
                className="text-xs underline text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                onClick={() => applyTextCommand("")}
                title="모든 내용을 지웁니다."
              >
                초기화
              </button>
            </div>
          </div>
          <textarea
            value={text}
            onChange={(e) => applyTextTyping(e.target.value)}
            placeholder="여기에 붙여넣기 또는 파일을 불러오세요."
            className="w-full h-[50vh] md:h-[60vh] resize-y px-3 py-3 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent font-mono text-sm leading-6"
          />
        </div>

        {/* 도움말 */}
        <details className="mt-2">
          <summary className="cursor-pointer text-sm text-gray-600 dark:text-gray-400">사용 팁 열기</summary>
          <ul className="mt-2 text-sm list-disc pl-5 space-y-1 text-gray-600 dark:text-gray-400">
            <li>정규식을 켜면 <code>\\u200B</code>, <code>\\n</code> 같은 패턴을 사용할 수 있습니다.</li>
            <li>멀티라인(m)을 켜면 줄 기준 패턴(각 줄 공백 정리 등)이 정확히 동작합니다.</li>
            <li>“바꾸기(1개)”는 첫 매치만, “일괄 바꾸기(전체)”는 모든 매치를 치환합니다.</li>
            <li>단축키: <b>Ctrl/⌘+Z</b> 되돌리기 · <b>Ctrl/⌘+Y</b> 또는 <b>Ctrl/⌘+Shift+Z</b> 다시실행</li>
          </ul>
        </details>
      </div>
    </section>
  );
}
