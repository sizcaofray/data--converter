// app/(contents)/pattern-editor/page.tsx
"use client";

/**
 * Pattern Editor v1.1 (에러/경고 정리판)
 * - 수정 요약
 *   1) 미사용 변수 제거: onReplaceOne 내부 're', 'replaced' 제거
 *   2) 매치 카운트 정확화: 항상 g 플래그로 세도록 별도 countMatches 유틸 추가
 *   3) 1개 치환 안정화: g 없는 RegExp를 확실히 만들어 1개만 치환
 *   4) try/catch 범위 강화: 정규식 에러시 UI 메시지 일관 처리
 *   5) 타입 경고 제거: 이벤트 타입, ref, state 모두 확인
 * - 기능
 *   · 파일 드롭/선택 업로드(2MB 제한), 붙여넣기 대용량 허용
 *   · 찾기/바꾸기(1개/전체), 정규식/대소문자/멀티라인 옵션
 *   · 좌측 프리셋 패턴(클릭 시 상단 입력 자동 채움)
 *   · 복사/다운로드, 글자 수 카운트
 */

import { useCallback, useMemo, useRef, useState } from "react";

type Preset = {
  id: string;
  title: string;
  find: string;           // 찾을 패턴(문자열 또는 정규식)
  replace: string;        // 바꿀 내용
  regex?: boolean;        // 정규식 기본값
  caseSensitive?: boolean;// 대소문자 구분 기본값
  desc?: string;          // 설명(툴팁)
};

// 특수 공백/개행/탭 등 자주 묻는 패턴 프리셋
const PRESETS: Preset[] = [
  { id: "newline-remove", title: "모든 개행 제거", find: "\\r?\\n", replace: "", regex: true, desc: "줄바꿈 없이 한 줄로 합칩니다." },
  { id: "newline-collapse", title: "연속 개행 1개로", find: "\\n{2,}", replace: "\n", regex: true, desc: "빈 줄이 여러 개면 1개로 축약합니다." },
  { id: "period-to-newline", title: "'. '를 개행으로", find: "\\.\\s+", replace: ".\n", regex: true, desc: "문장 끝 점 뒤를 줄바꿈으로 바꿉니다." },
  { id: "period-to-newline", title: "', '를 개행으로", find: "\\,\\s+", replace: ".\n", regex: true, desc: "문장 끝 쉼표 뒤를 줄바꿈으로 바꿉니다." },
  { id: "trim-each-line", title: "각 줄 좌우 공백 제거", find: "^[ \\t]+|[ \\t]+$", replace: "", regex: true, desc: "멀티라인(m)과 함께 사용하세요." },
  { id: "multi-space-collapse", title: "연속 공백 1개로", find: " {2,}", replace: " ", regex: true, desc: "스페이스 2개 이상 → 1개" },
  { id: "tabs-to-spaces", title: "탭 → 스페이스(4)", find: "\\t", replace: "    ", regex: true, desc: "탭을 공백 4개로" },
  { id: "spaces-to-tabs", title: "스페이스(4) → 탭", find: " {4}", replace: "\t", regex: true, desc: "공백 4개를 탭으로" },
  { id: "nbsp-remove", title: "NBSP 제거(\\u00A0)", find: "\\u00A0", replace: "", regex: true, desc: "줄바꿈 없는 특수 공백 제거" },
  { id: "zero-width-remove", title: "제로폭 문자 제거", find: "[\\u200B\\u200C\\u200D\\uFEFF]", replace: "", regex: true, desc: "ZWS/ZWNJ/ZWJ/BOM 제거" },
  { id: "comma-korean-space", title: "쉼표 뒤 공백 맞추기", find: ",(\\S)", replace: ", $1", regex: true, desc: "쉼표 뒤 공백 보정" },
];

const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2MB 제한

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

  // 상태
  const [message, setMessage] = useState<string>("");
  const dropRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { copy } = useClipboard();

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
      setText(result);
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
        setText(next);
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
        setText(next);
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

        {/* 찾기/바꾸기 바 */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">
          <div className="lg:col-span-5">
            <label className="block text-sm mb-1">찾을 패턴</label>
            <input
              value={findValue}
              onChange={(e) => setFindValue(e.target.value)}
              placeholder="예: \\u200B (정규식 가능)"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-transparent"
            />
          </div>
          <div className="lg:col-span-5">
            <label className="block text-sm mb-1">바꿀 내용</label>
            <input
              value={replaceValue}
              onChange={(e) => setReplaceValue(e.target.value)}
              placeholder="예: (빈 칸이면 삭제)"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-transparent"
            />
          </div>
          <div className="lg:col-span-2 flex gap-2 flex-wrap">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={useRegex} onChange={(e) => setUseRegex(e.target.checked)} />
              정규식
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)} />
              대소문자
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={multiline} onChange={(e) => setMultiline(e.target.checked)} />
              멀티라인(m)
            </label>
          </div>
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
            <span className="text-sm text-gray-600 dark:text-gray-400">글자 수: {charCount.toLocaleString()}자</span>
            <button
              className="text-xs underline text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              onClick={() => setText("")}
              title="모든 내용을 지웁니다."
            >
              초기화
            </button>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
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
            <li>대용량 텍스트(수 MB)는 브라우저 성능에 영향을 줄 수 있습니다.</li>
          </ul>
        </details>
      </div>
    </section>
  );
}
