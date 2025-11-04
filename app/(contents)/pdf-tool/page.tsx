"use client";

/**
 * 📄 app/(contents)/pdf-tool/page.tsx
 * - 한 페이지에서 PDF "통합"과 "분할" 기능을 제공합니다.
 * - 파일 업로드: 드래그&드롭 + 파일 선택(다중)
 * - 통합: 업로드 다중 파일의 순서 변경(드래그로 재정렬) 후 하나의 PDF로 병합
 * - 분할: 단일 파일 대상. 옵션(전체 페이지 분할 / 페이지 지정 분할) 중 택1
 *   · 페이지 지정 예시: "1,3,5-7" → 1페이지, 3페이지, 5~7페이지 묶음 단위로 각각 저장
 *   · "붙여서 저장" 의미: 5-7 입력 시 5~7 페이지를 하나의 PDF로 저장
 * - 저장: 가능하면 File System Access API로 폴더 저장, 미지원 시 ZIP 또는 개별 다운로드
 */

import React, { useCallback, useMemo, useRef, useState } from "react";
import { PDFDocument } from "pdf-lib";
import JSZip from "jszip";

// ---------- 유틸: File System Access API 지원 여부 ----------
const canUseFS = () =>
  typeof window !== "undefined" &&
  "showDirectoryPicker" in window &&
  typeof (window as any).showDirectoryPicker === "function";

// ---------- 유틸: Uint8Array → Blob (TS의 SharedArrayBuffer 추론 이슈 회피) ----------
function bytesToBlob(bytes: Uint8Array, type: string): Blob {
  // 새 ArrayBuffer를 만들고(반드시 ArrayBuffer) bytes를 복사하여
  // BlobPart에 안전하게 넣습니다. (SharedArrayBuffer 가능성 제거)
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy.buffer], { type });
}

// ---------- 유틸: 페이지 문자열 파싱 "1,3,5-7" ----------
function parsePages(input: string): number[][] {
  if (!input?.trim()) return [];
  const chunks = input.split(",").map((s) => s.trim()).filter(Boolean);

  const result: number[][] = [];
  for (const c of chunks) {
    if (c.includes("-")) {
      const [s, e] = c.split("-").map((x) => parseInt(x.trim(), 10));
      if (!Number.isFinite(s) || !Number.isFinite(e)) continue;
      const start = Math.min(s, e);
      const end = Math.max(s, e);
      const arr: number[] = [];
      for (let i = start; i <= end; i++) arr.push(i);
      result.push(arr);
    } else {
      const n = parseInt(c, 10);
      if (Number.isFinite(n)) result.push([n]);
    }
  }
  return result;
}

export default function PdfToolPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [message, setMessage] = useState<string>("");

  const [splitFile, setSplitFile] = useState<File | null>(null);
  const [splitMode, setSplitMode] = useState<"all" | "custom">("all");
  const [customPages, setCustomPages] = useState<string>("");

  const dropRef = useRef<HTMLDivElement | null>(null);

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const arr = Array.from(newFiles).filter((f) => f.type === "application/pdf");
    if (arr.length === 0) {
      setMessage("PDF 파일만 업로드할 수 있습니다.");
      return;
    }
    setFiles((prev) => [...prev, ...arr]);
    setMessage(`${arr.length}개 파일 추가됨 (총 ${files.length + arr.length}개)`);
  }, [files.length]);

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const onDragLeave = () => setIsDragging(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
      e.dataTransfer.clearData();
    }
  };

  const dragItemIndex = useRef<number | null>(null);
  const dragOverIndex = useRef<number | null>(null);

  const handleDragStart = (idx: number) => (e: React.DragEvent) => {
    dragItemIndex.current = idx;
    e.dataTransfer.setData("text/plain", `${idx}`);
  };
  const handleDragEnter = (idx: number) => () => {
    dragOverIndex.current = idx;
  };
  const handleDragEnd = () => {
    const from = dragItemIndex.current;
    const to = dragOverIndex.current;
    dragItemIndex.current = null;
    dragOverIndex.current = null;
    if (from === null || to === null || from === to) return;
    setFiles((prev) => {
      const copy = [...prev];
      const [moved] = copy.splice(from, 1);
      copy.splice(to, 0, moved);
      return copy;
    });
  };

  const removeAt = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  async function saveBlobWithFSOrDownload(
    blob: Blob,
    suggestedName: string,
    dirHandle?: FileSystemDirectoryHandle
  ) {
    try {
      if (dirHandle) {
        const fileHandle = await dirHandle.getFileHandle(suggestedName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = suggestedName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error(err);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = suggestedName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }
  }

  const handleMerge = async () => {
    if (files.length < 2) {
      setMessage("두 개 이상의 PDF를 업로드해야 통합할 수 있습니다.");
      return;
    }
    setMessage("통합 중... 잠시만 기다려주세요.");

    try {
      const mergedPdf = await PDFDocument.create();
      for (const f of files) {
        const buf = await f.arrayBuffer();
        const pdf = await PDFDocument.load(buf);
        const copied = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
        copied.forEach((p) => mergedPdf.addPage(p));
      }
      const mergedBytes = await mergedPdf.save(); // Uint8Array
      const blob = bytesToBlob(mergedBytes, "application/pdf");

      let dirHandle: FileSystemDirectoryHandle | undefined;
      if (canUseFS()) {
        dirHandle = await (window as any).showDirectoryPicker();
      }
      const name = `merged_${new Date().toISOString().replace(/[:.]/g, "-")}.pdf`;
      await saveBlobWithFSOrDownload(blob, name, dirHandle);
      setMessage("통합 완료!");
    } catch (err: any) {
      console.error(err);
      setMessage("통합 중 오류가 발생했습니다. 콘솔을 확인해 주세요.");
    }
  };

  const handleSplit = async () => {
    if (!splitFile && files.length > 0) {
      setSplitFile(files[0]);
    }
    const target = splitFile ?? files[0];
    if (!target) {
      setMessage("분할할 PDF를 하나 이상 업로드하거나 분할 파일을 선택해 주세요.");
      return;
    }

    setMessage("분할 중... 잠시만 기다려주세요.");
    try {
      const buf = await target.arrayBuffer();
      const base = await PDFDocument.load(buf);
      const totalPages = base.getPageCount();

      let dirHandle: FileSystemDirectoryHandle | undefined;
      if (canUseFS()) {
        dirHandle = await (window as any).showDirectoryPicker();
      }

      const shouldZip = !dirHandle;
      const zip = shouldZip ? new JSZip() : null;

      const jobs: number[][] =
        splitMode === "all"
          ? Array.from({ length: totalPages }, (_, i) => [i + 1])
          : parsePages(customPages);

      if (jobs.length === 0) {
        setMessage("분할 페이지가 비어 있거나 형식이 올바르지 않습니다.");
        return;
      }

      for (let idx = 0; idx < jobs.length; idx++) {
        const group = jobs[idx]
          .map((n) => n - 1)
          .filter((p) => p >= 0 && p < totalPages);

        if (group.length === 0) continue;

        const out = await PDFDocument.create();
        const copied = await out.copyPages(base, group);
        copied.forEach((p) => out.addPage(p));
        const bytes = await out.save(); // Uint8Array
        const blob = bytesToBlob(bytes, "application/pdf");

        const baseName = target.name.replace(/\.pdf$/i, "");
        const pad = String(idx + 1).padStart(3, "0");
        const fname = `${baseName}_split_${pad}.pdf`;

        if (zip) {
          zip.file(fname, blob);
        } else {
          await saveBlobWithFSOrDownload(blob, fname, dirHandle);
        }
      }

      if (zip) {
        const zipBlob = await zip.generateAsync({ type: "blob" });
        const zipName = target.name.replace(/\.pdf$/i, "") + "_split.zip";
        await saveBlobWithFSOrDownload(zipBlob, zipName);
      }

      setMessage("분할 완료!");
    } catch (err: any) {
      console.error(err);
      setMessage("분할 중 오류가 발생했습니다. 콘솔을 확인해 주세요.");
    }
  };

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(e.target.files);
  };

  const onSplitFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const f = e.target.files[0];
      if (f.type !== "application/pdf") {
        setMessage("분할 대상은 PDF만 선택할 수 있습니다.");
        return;
      }
      setSplitFile(f);
      setMessage(`분할 대상: ${f.name}`);
    }
  };

  const filesSummary = useMemo(
    () => (files.length ? `${files.length}개 파일 업로드됨` : "업로드된 파일 없음"),
    [files.length]
  );

  return (
    <section className="p-4 space-y-6">
      <h1 className="text-2xl font-bold">📄 PDF Tool</h1>
      <p className="text-sm text-gray-600 dark:text-gray-400">
        * 한 페이지에서 PDF <b>통합</b>과 <b>분할</b>을 처리합니다. (폴더 저장 지원 / 미지원시 자동 다운로드)
      </p>

      {/* 업로더 (통합/분할 공용) */}
      <div
        ref={dropRef}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={[
          "border-2 border-dashed rounded-xl p-6 transition",
          isDragging ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20" : "border-gray-300",
        ].join(" ")}
      >
        <p className="mb-2 font-medium">파일 업로드 (드래그&드롭 또는 버튼 선택)</p>
        <input
          type="file"
          multiple
          accept="application/pdf"
          onChange={onFileInput}
          className="block"
        />
        <p className="text-sm mt-2 text-gray-500">{filesSummary}</p>
      </div>

      {/* 통합 영역 */}
      <div className="rounded-xl border p-4 space-y-3">
        <h2 className="font-semibold text-lg">① PDF 통합</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          업로드된 PDF들을 아래 목록에서 <b>드래그하여 순서 변경</b>한 뒤,&nbsp;
          <b>[통합 실행]</b>을 누르세요.
        </p>

        <ul className="space-y-2">
          {files.map((f, idx) => (
            <li
              key={`${f.name}-${idx}-${f.size}`}
              draggable
              onDragStart={handleDragStart(idx)}
              onDragEnter={handleDragEnter(idx)}
              onDragEnd={handleDragEnd}
              className="flex items-center justify-between rounded-lg border p-2 cursor-move hover:bg-gray-50 dark:hover:bg-gray-800"
              title="드래그하여 순서를 변경하세요"
            >
              <span className="truncate max-w-[70%]">{idx + 1}. {f.name}</span>
              <button
                className="text-xs px-2 py-1 rounded bg-red-600 text-white"
                onClick={() => removeAt(idx)}
                title="목록에서 제거"
              >
                삭제
              </button>
            </li>
          ))}
          {!files.length && (
            <li className="text-sm text-gray-500">통합할 PDF를 업로드하세요.</li>
          )}
        </ul>

        <div className="flex gap-2">
          <button
            onClick={handleMerge}
            className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
            disabled={files.length < 2}
            title="두 개 이상 업로드 필요"
          >
            통합 실행
          </button>
        </div>
      </div>

      {/* 분할 영역 */}
      <div className="rounded-xl border p-4 space-y-3">
        <h2 className="font-semibold text-lg">② PDF 분할</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          분할 대상은 기본적으로 업로드 목록의 <b>첫 번째 파일</b>을 사용합니다.
          특정 파일로 분할하려면 아래에서 별도로 선택하세요.
        </p>

        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <input type="file" accept="application/pdf" onChange={onSplitFileInput} />
          <span className="text-sm text-gray-500">
            현재 분할 대상: <b>{splitFile ? splitFile.name : (files[0]?.name ?? "미선택")}</b>
          </span>
        </div>

        <div className="space-y-2">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="splitMode"
              value="all"
              checked={splitMode === "all"}
              onChange={() => setSplitMode("all")}
            />
            <span>모든 페이지를 각각 분할 (각 페이지가 1개의 PDF)</span>
          </label>

          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="splitMode"
              value="custom"
              checked={splitMode === "custom"}
              onChange={() => setSplitMode("custom")}
            />
            <span>페이지 지정 분할 (예: 1,3,5-7)</span>
          </label>

          <input
            type="text"
            placeholder={`예: 1,3,5-7  (쉼표로 구분, '5-7'은 5~7페이지를 하나의 PDF로 저장)`}
            className="w-full rounded border px-3 py-2 disabled:bg-gray-100 dark:disabled:bg-gray-800"
            disabled={splitMode !== "custom"}
            value={customPages}
            onChange={(e) => setCustomPages(e.target.value)}
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleSplit}
            className="px-4 py-2 rounded bg-emerald-600 text-white"
          >
            분할 실행
          </button>
        </div>
      </div>

      {!!message && (
        <div className="rounded-lg border p-3 text-sm">
          <b>상태:</b> {message}
        </div>
      )}

      <div className="text-xs text-gray-500">
        <ul className="list-disc ml-5 space-y-1">
          <li>
            <b>폴더 저장</b>: Chrome/Edge 최신 버전에서 폴더 선택 창이 뜹니다. 미지원 브라우저에서는 자동 다운로드(여러 파일은 ZIP)로 저장됩니다.
          </li>
          <li>
            <b>페이지 지정</b>: 예) <code>2,4,10-12</code> → 2, 4 페이지는 각각 한 파일로, 10~12 페이지는 한 파일로 저장됩니다.
          </li>
        </ul>
      </div>
    </section>
  );
}
