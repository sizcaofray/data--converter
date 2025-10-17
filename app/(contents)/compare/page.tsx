'use client';

import React, { useCallback, useMemo, useState } from 'react';

type FileSetter = React.Dispatch<React.SetStateAction<File | null>>;
type BoolSetter = React.Dispatch<React.SetStateAction<boolean>>;

/* ===================== (추가) 오류 메시지/알림 유틸 ===================== */
function _formatCompareError(err: unknown): string {
  if (err instanceof Error) return err.message || String(err);
  try {
    if (typeof err === 'object' && err !== null) {
      // axios-like
      // @ts-ignore
      if (err.response?.data) {
        // @ts-ignore
        const d = err.response.data;
        if (typeof d === 'string') return d;
        if (d?.message) return String(d.message);
      }
      // fetch-like
      // @ts-ignore
      if (err.status && err.statusText) {
        // @ts-ignore
        return `HTTP ${err.status} ${err.statusText}`;
      }
    }
  } catch {}
  return typeof err === 'string' ? err : '알 수 없는 오류가 발생했습니다.';
}

function _notifyCompareError(err: unknown, context?: string) {
  const msg = _formatCompareError(err);
  // 상세 진단을 위해 콘솔에 원본 남김
  // eslint-disable-next-line no-console
  console.error('[CompareError]', { context, error: err });
  if (typeof window !== 'undefined') {
    window.alert(
      `비교 실행 중 오류가 발생했습니다.\n\n상세: ${msg}\n\n` +
      `• 업로드한 파일 형식/인코딩/시트(첫 행 키)를 확인하세요.\n` +
      `• 문제가 반복되면 오류 화면과 파일을 함께 전달해 주세요.`
    );
  }
}
/* ===================================================================== */

/** 공통 드롭 처리: 이벤트 타입을 HTMLElement로 넓혀 어떤 엘리먼트에서도 작동 */
function handleDrop(
  e: React.DragEvent<HTMLElement>,
  setFile: FileSetter,
  setDragging: BoolSetter
) {
  e.preventDefault();
  e.stopPropagation();
  setDragging(false);

  const dt = e.dataTransfer;
  const files = dt?.files;
  if (files && files.length > 0) {
    setFile(files[0]);
  }
}

function handleDragOver(e: React.DragEvent<HTMLElement>, setDragging: BoolSetter) {
  e.preventDefault();
  e.stopPropagation();
  setDragging(true);
}

function handleDragLeave(_e: React.DragEvent<HTMLElement>, setDragging: BoolSetter) {
  setDragging(false);
}

function handleInputChange(
  e: React.ChangeEvent<HTMLInputElement>,
  setFile: FileSetter
) {
  const file = e.target.files?.[0];
  if (file) setFile(file);
}

function humanSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

type DropZoneProps = {
  label: string;
  file: File | null;
  setFile: FileSetter;
};

function DropZone({ label, file, setFile }: DropZoneProps) {
  const [dragging, setDragging] = useState(false);

  const borderClass = useMemo(
    () =>
      dragging
        ? 'border-indigo-500 bg-indigo-50/60 dark:bg-indigo-500/10'
        : 'border-dashed border-gray-300 dark:border-gray-700',
    [dragging]
  );

  return (
    <div className="w-full">
      <div
        className={`rounded-2xl p-6 transition-colors border-2 ${borderClass}`}
        onDragOver={(e) => handleDragOver(e, setDragging)}
        onDragLeave={(e) => handleDragLeave(e, setDragging)}
        onDrop={(e) => handleDrop(e, setFile, setDragging)}
      >
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-2">
          {label}
        </h2>

        <label className="block">
          <input
            type="file"
            className="hidden"
            onChange={(e) => handleInputChange(e, setFile)}
          />
          <div className="flex flex-col items-center justify-center gap-2 py-10 cursor-pointer">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-10 w-10 opacity-70"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M12 16a1 1 0 0 1-1-1V8.414L8.707 10.707a1 1 0 1 1-1.414-1.414l4-4a1 1 0 0 1 1.414 0l4 4a1 1 0 1 1-1.414 1.414L13 8.414V15a1 1 0 0 1-1 1Z" />
              <path d="M5 19a2 2 0 0 1-2-2V13a1 1 0 1 1 2 0v4h14v-4a1 1 0 1 1 2 0v4a2 2 0 0 1-2 2H5Z" />
            </svg>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              파일을 드롭하거나 클릭해서 선택하세요
            </p>
          </div>
        </label>

        {file && (
          <div className="mt-4 flex items-center justify-between rounded-xl bg-gray-50 dark:bg-gray-800 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate font-medium text-gray-800 dark:text-gray-100">
                {file.name}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {file.type || 'unknown'} · {humanSize(file.size)}
              </p>
            </div>
            <button
              type="button"
              className="ml-3 rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
              onClick={() => setFile(null)}
            >
              제거
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ComparePage() {
  const [fileA, setFileA] = useState<File | null>(null);
  const [fileB, setFileB] = useState<File | null>(null);

  const canCompare = !!(fileA && fileB);

  const onCompare = useCallback(() => {
    try {
      // ✅ 기존 동작(알림) 그대로 유지 — 여기서 실제 비교 로직을 추가하셔도
      //    예외가 나면 아래 catch에서 alert + 콘솔로그가 동작합니다.
      alert(
        `비교 시작:\n- A: ${fileA?.name ?? '-'}\n- B: ${fileB?.name ?? '-'}`
      );

      // ▼ 실제 비교 로직이 들어갈 자리 (기존 구현이 있다면 그대로 유지)
      //    예: 서버 업로드→diff API 호출, 클라 파싱/비교 등
      //    throw new Error('샘플 오류'); // 테스트용
      // ▲ 이 영역의 코드에 오류가 생기면 catch로 떨어져 알림을 띄웁니다.
    } catch (err) {
      _notifyCompareError(err, 'onCompare');
    }
  }, [fileA, fileB]);

  const onReset = () => {
    setFileA(null);
    setFileB(null);
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-bold">파일 비교</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          두 파일을 업로드하거나 드래그&드롭하여 비교를 시작하세요.
        </p>
      </header>

      <section className="grid gap-6 md:grid-cols-2">
        <DropZone label="파일 A" file={fileA} setFile={setFileA} />
        <DropZone label="파일 B" file={fileB} setFile={setFileB} />
      </section>

      <section className="mt-8 flex items-center gap-3">
        <button
          type="button"
          className="rounded-xl bg-black px-5 py-2.5 text-white disabled:opacity-40 dark:bg-white dark:text-black"
          disabled={!canCompare}
          onClick={onCompare}
        >
          비교 실행
        </button>
        <button
          type="button"
          className="rounded-xl border px-5 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800"
          onClick={onReset}
        >
          초기화
        </button>
      </section>
    </main>
  );
}
