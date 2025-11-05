"use client";

/**
 * 📄 app/(contents)/pdf-tool/page.tsx
 * - PDF 통합/분할 + 디버그 패널
 * - 저장 방식 토글 추가:
 *   · 자동: File System Access API 지원/허용 시 폴더 저장, 차단/취소 시 자동 다운로드 폴백
 *   · 바로 다운로드: 폴더 선택 없이 즉시(분할은 ZIP, 통합은 단일 PDF) 다운로드
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PDFDocument } from "pdf-lib";
import JSZip from "jszip";

// ---------- FS Access 지원 여부 ----------
const canUseFS = () =>
  typeof window !== "undefined" &&
  "showDirectoryPicker" in window &&
  typeof (window as any).showDirectoryPicker === "function";

// ---------- Uint8Array → Blob (SharedArrayBuffer 추론 이슈 회피) ----------
function bytesToBlob(bytes: Uint8Array, type: string): Blob {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy.buffer], { type });
}

// ---------- 파일이 PDF인지(타입/확장자) ----------
function looksLikePdfByNameOrType(file: File) {
  if (file.type === "application/pdf") return true;
  return /\.pdf$/i.test(file.name);
}

// ---------- 파일 헤더 검사: 앞 5바이트 "%PDF-" 확인 ----------
async function hasPdfHeader(file: File): Promise<boolean> {
  try {
    if (file.size < 5) return false;
    const head = await file.slice(0, 5).arrayBuffer();
    const view = new Uint8Array(head);
    // "%PDF-" : 0x25 0x50 0x44 0x46 0x2D
    return (
      view[0] === 0x25 &&
      view[1] === 0x50 &&
      view[2] === 0x44 &&
      view[3] === 0x46 &&
      view[4] === 0x2d
    );
  } catch {
    return false;
  }
}

// ---------- 페이지 문자열 파싱 "1,3,5-7" ----------
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

type SaveMode = "auto" | "download";

export default function PdfToolPage() {
  // 업로드/상태
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [message, setMessage] = useState<string>("");

  // 저장 방식: auto(가능하면 폴더 저장) / download(바로 다운로드)
  const [saveMode, setSaveMode] = useState<SaveMode>("auto");

  // 분할 옵션
  const [splitFile, setSplitFile] = useState<File | null>(null);
  const [splitMode, setSplitMode] = useState<"all" | "custom">("all");
  const [customPages, setCustomPages] = useState<string>("");

  // 디버그 로그
  const [logs, setLogs] = useState<string[]>([]);
  const [showDebug, setShowDebug] = useState<boolean>(true);

  const dropRef = useRef<HTMLDivElement | null>(null);

  // ---------- 로그 유틸 ----------
  const log = useCallback((...args: any[]) => {
    const line =
      "[" +
      new Date().toLocaleTimeString() +
      "] " +
      args
        .map((a) => {
          if (a instanceof Error) return `${a.name}: ${a.message}\n${a.stack ?? ""}`;
          if (typeof a === "object") {
            try {
              return JSON.stringify(a);
            } catch {
              return String(a);
            }
          }
          return String(a);
        })
        .join(" ");
    console.log(line);
    setLogs((prev) => [line, ...prev].slice(0, 400));
  }, []);

  // ---------- 전역 에러 캡처 ----------
  useEffect(() => {
    function onError(ev: ErrorEvent) {
      setMessage("오류가 발생했습니다. 디버그 로그를 확인하세요.");
      log("window.onerror:", ev.message, ev.error ?? "");
    }
    function onRejection(ev: PromiseRejectionEvent) {
      setMessage("비동기 오류가 발생했습니다. 디버그 로그를 확인하세요.");
      log("unhandledrejection:", ev.reason ?? "");
    }
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, [log]);

  // ---------- 업로드(유효성 검사 포함) ----------
  async function addFilesWithValidation(newFiles: FileList | File[]) {
    try {
      const selected = Array.from(newFiles).filter(looksLikePdfByNameOrType);
      if (!selected.length) {
        setMessage("PDF 파일만 업로드할 수 있습니다.");
        log("add: no pdf-like files");
        return;
      }

      const accepted: File[] = [];
      for (const f of selected) {
        if (f.size === 0) {
          log(`add: reject ${f.name} (size 0B)`);
          continue;
        }
        const headerOk = await hasPdfHeader(f);
        log(`add: check ${f.name} size=${f.size} headerOk=${headerOk}`);
        if (!headerOk) {
          log(`add: reject ${f.name} (no %PDF- header)`);
          continue;
        }
        accepted.push(f);
      }

      if (!accepted.length) {
        setMessage("유효한 PDF가 없습니다. (0B 또는 손상/비정상 헤더)");
        return;
      }

      setFiles((prev) => {
        const merged = [...prev, ...accepted];
        log(`add: accepted ${accepted.length}, total ${merged.length}`);
        return merged;
      });
      setMessage(`${accepted.length}개 파일 추가됨 (총 ${files.length + accepted.length}개)`);
    } catch (e) {
      setMessage("파일 추가 중 오류가 발생했습니다.");
      log("add error:", e);
    }
  }

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFilesWithValidation(e.target.files);
  };

  // ---------- 드래그 앤 드롭 ----------
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const onDragLeave = () => setIsDragging(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFilesWithValidation(e.dataTransfer.files);
      e.dataTransfer.clearData();
    }
  };

  // ---------- 순서 변경 ----------
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
      log(`reorder: ${from} -> ${to}`);
      return copy;
    });
  };

  // ---------- 파일 삭제 ----------
  const removeAt = (idx: number) => {
    setFiles((prev) => {
      const copy = prev.filter((_, i) => i !== idx);
      log(`remove: index ${idx}, total ${copy.length}`);
      return copy;
    });
  };

  // ---------- 저장 ----------
  async function saveBlobWithFSOrDownload(
    blob: Blob,
    suggestedName: string,
    dirHandle?: FileSystemDirectoryHandle
  ) {
    try {
      if (dirHandle) {
        log("save: FS API →", suggestedName);
        const fileHandle = await dirHandle.getFileHandle(suggestedName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
      } else {
        log("save: download →", suggestedName);
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
      log("save error (fallback download):", err);
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

  // ---------- 디렉토리 선택 (saveMode 적용) ----------
  async function pickDirectoryIfNeeded(phase: "merge" | "split") {
    if (saveMode === "download") {
      log(`${phase}: saveMode=download → skip directory picker`);
      return undefined;
    }
    if (!canUseFS()) {
      log(`${phase}: FS API not available → download fallback`);
      return undefined;
    }
    try {
      log(`${phase}: showDirectoryPicker`);
      const handle = await (window as any).showDirectoryPicker();
      return handle as FileSystemDirectoryHandle;
    } catch (e: any) {
      // Chrome이 "시스템 파일이 포함된 폴더" 등으로 차단/취소했을 때
      log(`${phase}: directoryPicker blocked/canceled → download fallback`, e?.name ?? "", e?.message ?? "");
      setMessage("선택한 폴더를 열 수 없어 다운로드로 저장합니다. (다른 일반 폴더를 선택하면 폴더 저장 가능)");
      return undefined;
    }
  }

  // ---------- 업로드 목록 검증(실행 직전) ----------
  async function validateFilesOrShow(filesToCheck: File[], purpose: "merge" | "split") {
    const valid: File[] = [];
    for (const f of filesToCheck) {
      if (f.size === 0) {
        log(`${purpose}: reject ${f.name} (size 0B)`);
        continue;
      }
      const headerOk = await hasPdfHeader(f);
      log(`${purpose}: header ${f.name} headerOk=${headerOk}`);
      if (!headerOk) continue;
      valid.push(f);
    }
    if (!valid.length) {
      setMessage(
        purpose === "merge"
          ? "통합할 유효한 PDF가 없습니다. (0B/손상/비정상 헤더)"
          : "분할할 유효한 PDF가 없습니다. (0B/손상/비정상 헤더)"
      );
    }
    return valid;
  }

  // ---------- 통합 ----------
  const handleMerge = async () => {
    try {
      log("merge: start");
      if (files.length < 2) {
        setMessage("두 개 이상의 PDF를 업로드해야 통합할 수 있습니다.");
        log("merge: not enough files");
        return;
      }

      const validFiles = await validateFilesOrShow(files, "merge");
      if (validFiles.length < 2) {
        log("merge: less than 2 valid files");
        return;
      }

      setMessage("통합 중...");
      const mergedPdf = await PDFDocument.create();

      for (const f of validFiles) {
        log("merge: load", f.name, f.size + "B");
        const buf = await f.arrayBuffer();
        const pdf = await PDFDocument.load(buf);
        const pages = pdf.getPageIndices();
        log("merge: copy pages", pages.length);
        const copied = await mergedPdf.copyPages(pdf, pages);
        copied.forEach((p) => mergedPdf.addPage(p));
      }

      log("merge: saving...");
      const mergedBytes = await mergedPdf.save();
      const blob = bytesToBlob(mergedBytes, "application/pdf");

      const dirHandle = await pickDirectoryIfNeeded("merge");
      const name = `merged_${new Date().toISOString().replace(/[:.]/g, "-")}.pdf`;
      await saveBlobWithFSOrDownload(blob, name, dirHandle);

      setMessage("통합 완료!");
      log("merge: done");
    } catch (err) {
      setMessage("통합 중 오류가 발생했습니다. 디버그 로그를 확인하세요.");
      log("merge error:", err);
    }
  };

  // ---------- 분할 ----------
  const handleSplit = async () => {
    try {
      log("split: start");

      let target = splitFile ?? files[0] ?? null;
      if (!target) {
        setMessage("분할할 PDF를 하나 이상 업로드하거나 분할 파일을 선택해 주세요.");
        log("split: no target file");
        return;
      }

      const [validated] = await validateFilesOrShow([target], "split");
      if (!validated) {
        log("split: target invalid");
        return;
      }
      target = validated;
      setMessage("분할 중...");

      log("split: load", target.name, target.size + "B");
      const buf = await target.arrayBuffer();
      const base = await PDFDocument.load(buf);
      const totalPages = base.getPageCount();
      log("split: totalPages", totalPages);

      const dirHandle = await pickDirectoryIfNeeded("split");
      const shouldZip = !dirHandle; // 폴더 저장 불가/미선택이면 ZIP로 1회 다운로드
      const zip = shouldZip ? new JSZip() : null;

      const jobs: number[][] =
        splitMode === "all"
          ? Array.from({ length: totalPages }, (_, i) => [i + 1])
          : parsePages(customPages);

      if (jobs.length === 0) {
        setMessage("분할 페이지가 비어 있거나 형식이 올바르지 않습니다.");
        log("split: invalid jobs (empty)");
        return;
      }

      for (let idx = 0; idx < jobs.length; idx++) {
        const group = jobs[idx]
          .map((n) => n - 1)
          .filter((p) => p >= 0 && p < totalPages);

        if (group.length === 0) {
          log(`split: skip empty group at idx ${idx}`);
          continue;
        }

        log(`split: group ${idx + 1}/${jobs.length} pages=`, group.map((g) => g + 1));
        const out = await PDFDocument.create();
        const copied = await out.copyPages(base, group);
        copied.forEach((p) => out.addPage(p));
        const bytes = await out.save();
        const blob = bytesToBlob(bytes, "application/pdf");

        const baseName = target.name.replace(/\.pdf$/i, "");
        const pad = String(idx + 1).padStart(3, "0");
        const fname = `${baseName}_split_${pad}.pdf`;

        if (zip) {
          log("split: add to zip", fname);
          zip.file(fname, blob);
        } else {
          log("split: save file", fname);
          await saveBlobWithFSOrDownload(blob, fname, dirHandle);
        }
      }

      if (zip) {
        log("split: generating zip...");
        const zipBlob = await zip.generateAsync({ type: "blob" });
        const zipName = target.name.replace(/\.pdf$/i, "") + "_split.zip";
        await saveBlobWithFSOrDownload(zipBlob, zipName);
      }

      setMessage("분할 완료!");
      log("split: done");
    } catch (err) {
      setMessage("분할 중 오류가 발생했습니다. 디버그 로그를 확인하세요.");
      log("split error:", err);
    }
  };

  // ---------- 별도 분할 파일 선택 ----------
  const onSplitFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const f = e.target.files[0];
      if (!looksLikePdfByNameOrType(f)) {
        setMessage("분할 대상은 PDF만 선택할 수 있습니다.");
        log("split input: not pdf-like", f.name);
        return;
      }
      if (f.size === 0) {
        setMessage("선택한 파일이 0바이트입니다. 올바른 PDF를 선택하세요.");
        log("split input: 0B file", f.name);
        return;
      }
      setSplitFile(f);
      setMessage(`분할 대상: ${f.name}`);
      log("split input: setSplitFile", f.name, f.size + "B");
    }
  };

  // ---------- 업로드 요약 ----------
  const filesSummary = useMemo(
    () => (files.length ? `${files.length}개 파일 업로드됨` : "업로드된 파일 없음"),
    [files.length]
  );

  return (
    <section className="p-4 space-y-6">
      <h1 className="text-2xl font-bold">📄 PDF Tool</h1>
      <p className="text-sm text-gray-600 dark:text-gray-400">
        * 저장 방식에서 <b>바로 다운로드</b>를 선택하면 폴더 권한 팝업 없이 저장합니다.
        (분할은 ZIP, 통합은 단일 PDF)
      </p>

      {/* 저장 방식 토글 */}
      <div className="rounded-xl border p-4">
        <p className="mb-2 font-medium">저장 방식</p>
        <label className="mr-4 inline-flex items-center gap-2">
          <input
            type="radio"
            name="saveMode"
            value="auto"
            checked={saveMode === "auto"}
            onChange={() => setSaveMode("auto")}
          />
          <span>자동 (가능하면 폴더 저장, 차단 시 자동 다운로드)</span>
        </label>
        <label className="inline-flex items-center gap-2">
          <input
            type="radio"
            name="saveMode"
            value="download"
            checked={saveMode === "download"}
            onChange={() => setSaveMode("download")}
          />
          <span>바로 다운로드 (폴더 선택 안 함)</span>
        </label>
      </div>

      {/* 업로더 */}
      <div
        ref={dropRef}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        className={[
          "border-2 border-dashed rounded-xl p-6 transition",
          isDragging ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20" : "border-gray-300",
        ].join(" ")}
      >
        <p className="mb-2 font-medium">파일 업로드 (드래그&드롭 또는 버튼 선택)</p>
        <input type="file" multiple accept="application/pdf" onChange={onFileInput} className="block" />
        <p className="text-sm mt-2 text-gray-500">{filesSummary}</p>
      </div>

      {/* 통합 */}
      <div className="rounded-xl border p-4 space-y-3">
        <h2 className="font-semibold text-lg">① PDF 통합</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          업로드된 PDF를 <b>드래그로 순서 변경</b> 후 <b>[통합 실행]</b>.
        </p>

        <ul className="space-y-2">
          {files.map((f, idx) => (
            <li
              key={`${f.name}-${idx}-${f.size}`}
              draggable
              onDragStart={(e) => { (dragItemIndex.current = idx); e.dataTransfer.setData("text/plain", `${idx}`); }}
              onDragEnter={() => { dragOverIndex.current = idx; }}
              onDragEnd={() => {
                const from = dragItemIndex.current; const to = dragOverIndex.current;
                dragItemIndex.current = null; dragOverIndex.current = null;
                if (from === null || to === null || from === to) return;
                setFiles((prev) => { const copy = [...prev]; const [moved] = copy.splice(from, 1); copy.splice(to, 0, moved); log(`reorder: ${from} -> ${to}`); return copy; });
              }}
              className="flex items-center justify-between rounded-lg border p-2 cursor-move hover:bg-gray-50 dark:hover:bg-gray-800"
              title="드래그하여 순서를 변경하세요"
            >
              <span className="truncate max-w-[70%]">
                {idx + 1}. {f.name} <span className="text-xs text-gray-400">({f.size}B)</span>
              </span>
              <button className="text-xs px-2 py-1 rounded bg-red-600 text-white" onClick={() => removeAt(idx)} title="목록에서 제거">
                삭제
              </button>
            </li>
          ))}
          {!files.length && <li className="text-sm text-gray-500">통합할 PDF를 업로드하세요.</li>}
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

      {/* 분할 */}
      <div className="rounded-xl border p-4 space-y-3">
        <h2 className="font-semibold text-lg">② PDF 분할</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          기본 분할 대상은 업로드 목록의 <b>첫 번째 파일</b>입니다. 필요하면 아래에서 변경하세요.
        </p>

        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <input type="file" accept="application/pdf" onChange={onSplitFileInput} />
          <span className="text-sm text-gray-500">
            현재 분할 대상: <b>{splitFile ? splitFile.name : (files[0]?.name ?? "미선택")}</b>
          </span>
        </div>

        <div className="space-y-2">
          <label className="flex items-center gap-2">
            <input type="radio" name="splitMode" value="all" checked={splitMode === "all"} onChange={() => setSplitMode("all")} />
            <span>모든 페이지를 각각 분할 (각 1개 PDF)</span>
          </label>

          <label className="flex items-center gap-2">
            <input type="radio" name="splitMode" value="custom" checked={splitMode === "custom"} onChange={() => setSplitMode("custom")} />
            <span>페이지 지정 분할 (예: 1,3,5-7)</span>
          </label>

        <input
            type="text"
            placeholder={`예: 1,3,5-7  (쉼표 구분, '5-7'은 5~7페이지를 한 파일로 저장)`}
            className="w-full rounded border px-3 py-2 disabled:bg-gray-100 dark:disabled:bg-gray-800"
            disabled={splitMode !== "custom"}
            value={customPages}
            onChange={(e) => setCustomPages(e.target.value)}
          />
        </div>

        <div className="flex gap-2">
          <button onClick={handleSplit} className="px-4 py-2 rounded bg-emerald-600 text-white">
            분할 실행
          </button>
        </div>
      </div>

      {/* 상태 */}
      {!!message && (
        <div className="rounded-lg border p-3 text-sm">
          <b>상태:</b> {message}
        </div>
      )}

      {/* 디버그 패널 */}
      <div className="rounded-lg border">
        <button
          className="w-full text-left px-3 py-2 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800"
          onClick={() => setShowDebug((s) => !s)}
          title="실행 로그/오류를 확인합니다."
        >
          🪵 디버그 로그 {showDebug ? "접기" : "보기"}
        </button>
        {showDebug && (
          <div className="max-h-64 overflow-auto px-3 py-2 text-xs font-mono whitespace-pre-wrap">
            {logs.length === 0 ? (
              <div className="text-gray-500">아직 로그가 없습니다. 버튼을 눌러 실행해 보세요.</div>
            ) : (
              logs.map((l, i) => (
                <div key={i} className="py-0.5 border-b border-dashed border-gray-200 dark:border-gray-700">
                  {l}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </section>
  );
}
