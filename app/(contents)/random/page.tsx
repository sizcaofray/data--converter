"use client";

/**
 * Random 데이터 눈가림 (customList 제거 → fixedPart + 길이 + 채움형태)
 * - 단일 파일(.xlsx/.xls/.csv/.xml) 업로드
 * - 시트별 필드 마스킹 + (옵션) 행 순서 섞기 + (옵션) 복원 키 시트
 * - 미리보기: 전체 / 시트별 (상위 N행만 처리하여 모달로 표시)
 * - 규칙 변경:
 *    · customList(목록 랜덤 선택) 제거
 *    · fixedPart(접두 고정) + strLen(목표 길이) + fillKind(숫자/문자/무작위)로 남은 길이 채움
 * - 색상은 전역 테마 상속(라이트/다크 자동 적응)
 */

import React, { useCallback, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { XMLParser } from "fast-xml-parser";

/* ---------- 타입 ---------- */
type Row = Record<string, any>;
type SheetData = { name: string; rows: Row[]; fields: string[] };

type RuleKind =
  | "none"
  | "blank"
  | "randomString"
  | "randomInt"
  | "randomDate"
  | "fakeName"
  | "fakeEmail"
  | "fakePhone"
  | "hashSHA256";

type FillKind = "digits" | "letters" | "alnum"; // 숫자/문자/무작위

type FieldRule = {
  field: string;
  kind: RuleKind;

  // 공통 옵션
  fixedPart?: string;   // 접두 고정값(문자/숫자/연-월 등)

  // 길이/범위 옵션(규칙별로 의미가 다름)
  strLen?: number;      // 목표 길이: randomString, fakeEmail(local-part), randomInt(자리수 기반 사용)
  fillKind?: FillKind;  // 남는 길이 채움 형태: digits | letters | alnum

  // randomInt 범위(자리수 기반을 사용하지 않을 때만 의미)
  intMin?: number;
  intMax?: number;

  // randomDate 범위(고정 연도/연-월이 없을 때 의미)
  dateStart?: string;   // YYYY-MM-DD
  dateEnd?: string;     // YYYY-MM-DD
};

/* ---------- 유틸 ---------- */
const randInt = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const randString = (len: number) => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars.charAt(randInt(0, chars.length - 1));
  return out;
};

const randLetters = (len: number) => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  let out = "";
  for (let i = 0; i < len; i++) out += chars.charAt(randInt(0, chars.length - 1));
  return out;
};

const randDigits = (len: number) => {
  let out = "";
  for (let i = 0; i < len; i++) out += String(randInt(0, 9));
  return out;
};

const onlyDigits = (s: string) => (s || "").replace(/\D+/g, "");

const fillByKind = (len: number, kind: FillKind, lowercase = false) => {
  let raw =
    kind === "digits" ? randDigits(len) :
    kind === "letters" ? randLetters(len) :
    randString(len);
  return lowercase ? raw.toLowerCase() : raw;
};

const fakeName = () => {
  const first = ["Kim", "Lee", "Park", "Choi", "Jung", "Han", "Yoon", "Kang"];
  const last = ["Minsoo", "Jiwon", "Seojin", "Hyunwoo", "Jisoo", "Yuna", "Haneul", "Taeyang"];
  return `${first[randInt(0, first.length - 1)]} ${last[randInt(0, last.length - 1)]}`;
};

const fakeEmailLocal = (fixed: string, remainLen: number, fill: FillKind) =>
  (fixed || "") + fillByKind(remainLen, fill, true /* 소문자 */);

const fakeEmail = (local: string) => {
  const domains = ["example.com", "mail.com", "test.org", "anon.dev"];
  const dom = domains[randInt(0, domains.length - 1)];
  return `${local}@${dom}`;
};

const fakePhoneWithFixed = (fixedPart?: string) => {
  // 기본: 010-XXXX-XXXX, 총 8자리 테일
  const fixedDigits = onlyDigits(fixedPart || "");
  const remain = Math.max(0, 8 - fixedDigits.length);
  const tail = fixedDigits + randDigits(remain);
  return `010-${tail.slice(0, 4)}-${tail.slice(4, 8)}`;
};

const randDate = (start: Date, end: Date) => {
  const t = randInt(start.getTime(), end.getTime());
  const d = new Date(t);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const sha256Hex = async (input: string) => {
  const enc = new TextEncoder().encode(input ?? "");
  const buf = await crypto.subtle.digest("SHA-256", enc);
  const arr = Array.from(new Uint8Array(buf));
  return arr.map((b) => b.toString(16).padStart(2, "0")).join("");
};

const uuidv4 = () =>
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = crypto.getRandomValues(new Uint8Array(1))[0] & 0xf;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });

const shuffleInPlace = <T,>(arr: T[]) => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
};

/* ---------- XML → 표 ---------- */
const xmlToRows = (xmlText: string): { rows: Row[]; fields: string[] } => {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@", allowBooleanAttributes: true });
  const json = parser.parse(xmlText);

  const findArrayNode = (obj: any): any[] | null => {
    if (Array.isArray(obj)) return obj;
    if (obj && typeof obj === "object") {
      for (const k of Object.keys(obj)) {
        const found = findArrayNode(obj[k]);
        if (found) return found;
      }
    }
    return null;
  };

  const arr = findArrayNode(json) || [];
  const flat = (obj: any, prefix = "", out: Row = {}): Row => {
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      for (const [k, v] of Object.entries(obj)) flat(v, prefix ? `${prefix}.${k}` : k, out);
    } else {
      out[prefix] = obj;
    }
    return out;
  };

  const rows = arr.map((it) => flat(it));
  const fieldSet = new Set<string>();
  rows.forEach((r) => Object.keys(r).forEach((k) => fieldSet.add(k)));
  return { rows, fields: Array.from(fieldSet) };
};

const safeSheetName = (name: string) => {
  const invalid = /[\\/?*\[\]:]/g;
  let n = name.replace(invalid, "_");
  if (n.length > 31) n = n.slice(0, 31);
  if (!n.trim()) n = "Sheet";
  return n;
};

/* ---------- 규칙 적용기 (customList 제거판) ---------- */
async function applyRule(value: any, rule: FieldRule): Promise<any> {
  const src = String(value ?? "");
  const fixed = rule.fixedPart?.toString() ?? "";
  const fill = rule.fillKind ?? "alnum";

  switch (rule.kind) {
    case "blank":
      return "";

    case "randomString": {
      // 목표 길이: strLen > 원본 길이 > 8
      const targetLen = Math.max(1, rule.strLen ?? (src.length || 8));
      const remain = Math.max(0, targetLen - fixed.length);
      return (fixed || "") + fillByKind(remain, fill);
    }

    case "randomInt": {
      const fixedDigits = onlyDigits(fixed);
      // 자리수 기반(고정 접두 숫자 있거나 strLen 지정 시)
      if (fixedDigits || rule.strLen) {
        const targetLen = Math.max(
          (fixedDigits ? fixedDigits.length + 1 : 1),
          rule.strLen ?? (onlyDigits(src).length || 4)
        );
        const remain = Math.max(0, targetLen - fixedDigits.length);
        return fixedDigits + randDigits(remain);
      }
      // 범위 기반
      const min = Number.isFinite(rule.intMin) ? (rule.intMin as number) : 0;
      const max = Number.isFinite(rule.intMax) ? (rule.intMax as number) : 9999;
      return String(randInt(min, max));
    }

    case "randomDate": {
      // fixedPart: 'YYYY' 또는 'YYYY-MM'이면 그 구간에서 랜덤
      const yMatch = fixed.match(/^(\d{4})(?:-(\d{2}))?$/);
      if (yMatch) {
        const y = Number(yMatch[1]);
        if (yMatch[2]) {
          const m = Number(yMatch[2]);
          const start = new Date(y, m - 1, 1);
          const end = new Date(y, m, 0);
          return randDate(start, end);
        } else {
          const start = new Date(y, 0, 1);
          const end = new Date(y, 11, 31);
          return randDate(start, end);
        }
      }
      // 범위 기반
      const s = rule.dateStart ? new Date(rule.dateStart) : new Date("2000-01-01");
      const e = rule.dateEnd ? new Date(rule.dateEnd) : new Date("2030-12-31");
      return randDate(s, e);
    }

    case "fakeName": {
      // fixedPart가 있으면 "fixedPart + (랜덤 성/이름 일부)" 형태로 간단 보정
      return fixed ? `${fixed} ${fakeName().split(" ").pop()}` : fakeName();
    }

    case "fakeEmail": {
      // 목표 로컬 길이: strLen > 원본 로컬 길이 > 10
      const srcLocal = src.split("@")[0] || "";
      const targetLocalLen = Math.max(6, rule.strLen ?? (srcLocal.length || 10));
      const remain = Math.max(0, targetLocalLen - fixed.length);
      const local = fakeEmailLocal(fixed, remain, fill);
      return fakeEmail(local);
    }

    case "fakePhone": {
      return fakePhoneWithFixed(fixed);
    }

    case "hashSHA256": {
      return await sha256Hex(src);
    }

    default:
      return src;
  }
}

/* ========== 메인 컴포넌트 ========== */
export default function RandomMaskPage() {
  const [fileName, setFileName] = useState("");
  const [sheets, setSheets] = useState<SheetData[]>([]);
  const [fieldRules, setFieldRules] = useState<Record<string, FieldRule>>({});
  const [recovery, setRecovery] = useState(true);
  const [shuffleRowsOpt, setShuffleRowsOpt] = useState(false);
  const [busy, setBusy] = useState(false);

  // 미리보기 상태
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewCount, setPreviewCount] = useState<number>(30);
  const [previewSheets, setPreviewSheets] = useState<SheetData[]>([]);
  const [activePreviewTab, setActivePreviewTab] = useState(0);
  const [previewScope, setPreviewScope] = useState<"all" | { sheet: string }>({ sheet: "" } as any);

  const inputRef = useRef<HTMLInputElement | null>(null);

  /* 파일 로드 */
  const onFile = useCallback(async (f: File) => {
    setBusy(true);
    try {
      setFileName(f.name);
      const ext = f.name.toLowerCase();
      const buf = await f.arrayBuffer();

      if (ext.endsWith(".xlsx") || ext.endsWith(".xls") || ext.endsWith(".csv")) {
        const wb = XLSX.read(buf, { type: "array" });
        const newSheets: SheetData[] = wb.SheetNames.map((name) => {
          const ws = wb.Sheets[name];
          const rows: Row[] = XLSX.utils.sheet_to_json(ws, { defval: "" }) as Row[];
          const fields = rows.length ? Object.keys(rows[0]) : [];
          return { name, rows, fields };
        });
        setSheets(newSheets);

        const fr: Record<string, FieldRule> = {};
        newSheets.forEach((s) =>
          s.fields.forEach((field) => {
            fr[`${s.name}::${field}`] = { field, kind: "none", fillKind: "alnum" };
          })
        );
        setFieldRules(fr);
      } else if (ext.endsWith(".xml")) {
        const text = new TextDecoder().decode(new Uint8Array(buf));
        const { rows, fields } = xmlToRows(text);
        const newSheets: SheetData[] = [{ name: "XML", rows, fields }];
        setSheets(newSheets);

        const fr: Record<string, FieldRule> = {};
        fields.forEach((field) => (fr[`XML::${field}`] = { field, kind: "none", fillKind: "alnum" }));
        setFieldRules(fr);
      } else {
        alert("지원 확장자: .xlsx, .xls, .csv, .xml");
        setSheets([]);
        setFieldRules({});
      }
    } catch (e) {
      console.error(e);
      setSheets([]);
      setFieldRules({});
      alert("파일 읽기 중 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  }, []);

  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); e.stopPropagation();
    const f = e.dataTransfer.files?.[0];
    if (f) onFile(f);
  }, [onFile]);

  const onBrowse = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) onFile(f);
  }, [onFile]);

  /* 규칙 저장 */
  const setRule = (sheet: string, field: string, patch: Partial<FieldRule>) => {
    const key = `${sheet}::${field}`;
    setFieldRules((prev) => ({ ...prev, [key]: { ...(prev[key] || { field, kind: "none" }), ...patch } }));
  };

  /* 공통 처리기: 시트 마스킹(+옵션) - limitPerSheet 지정 시 미리보기용 */
  const buildMaskedSheets = useCallback(
    async (limitPerSheet?: number, onlySheet?: string): Promise<{ masked: SheetData[]; keys: SheetData[] }> => {
      const masked: SheetData[] = [];
      const keys: SheetData[] = [];

      const workSheets = onlySheet ? sheets.filter((s) => s.name === onlySheet) : sheets;

      for (const sheet of workSheets) {
        let rows = sheet.rows.map((r) => ({ ...r }));
        const fields = [...sheet.fields];

        if (shuffleRowsOpt) shuffleInPlace(rows);
        if (limitPerSheet && limitPerSheet > 0) rows = rows.slice(0, limitPerSheet);

        const keyRows: Row[] = [];

        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const rowKey: Row = {};
          let anonId = "";

          for (const field of fields) {
            const rule = fieldRules[`${sheet.name}::${field}`];
            if (!rule || rule.kind === "none") continue;

            if (recovery && !anonId) {
              anonId = uuidv4();
              row["ANON_ROW_ID"] = anonId;
              rowKey["ANON_ROW_ID"] = anonId;
            }

            const newVal = await applyRule(row[field], rule);
            if (recovery) rowKey[field] = String(row[field] ?? "");
            row[field] = newVal;
          }

          if (recovery && Object.keys(rowKey).length) keyRows.push(rowKey);
        }

        const maskedFields = [...fields];
        if (recovery && !maskedFields.includes("ANON_ROW_ID")) maskedFields.push("ANON_ROW_ID");
        masked.push({ name: sheet.name, rows, fields: maskedFields });

        if (recovery && keyRows.length) {
          const keyFields = Array.from(new Set(keyRows.flatMap((r) => Object.keys(r))));
          keys.push({ name: `ANON__KEY_${sheet.name}`, rows: keyRows, fields: keyFields });
        }
      }
      return { masked, keys };
    },
    [sheets, fieldRules, recovery, shuffleRowsOpt]
  );

  /* 다운로드 (전체) */
  const runDownload = useCallback(async () => {
    if (!sheets.length) return alert("먼저 파일을 업로드하세요.");
    setBusy(true);
    try {
      const { masked, keys } = await buildMaskedSheets(); // 전체
      const wb = XLSX.utils.book_new();
      for (const s of masked) {
        const ws = XLSX.utils.json_to_sheet(s.rows, { header: s.fields });
        XLSX.utils.book_append_sheet(wb, ws, safeSheetName(s.name));
      }
      if (recovery) {
        for (const s of keys) {
          const ws = XLSX.utils.json_to_sheet(s.rows, { header: s.fields });
          XLSX.utils.book_append_sheet(wb, ws, safeSheetName(s.name));
        }
      }
      const outName = fileName ? fileName.replace(/\.[^.]+$/, "") : "masked";
      XLSX.writeFile(wb, `${outName}__masked.xlsx`);
    } catch (e) {
      console.error(e);
      alert("처리 중 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  }, [sheets, recovery, fileName, buildMaskedSheets]);

  /* 미리보기: 전체 */
  const runPreviewAll = useCallback(async () => {
    if (!sheets.length) return alert("먼저 파일을 업로드하세요.");
    setBusy(true);
    try {
      const { masked } = await buildMaskedSheets(previewCount); // 제한
      setPreviewSheets(masked);
      setActivePreviewTab(0);
      setPreviewScope("all");
      setPreviewOpen(true);
    } catch (e) {
      console.error(e);
      alert("미리보기 생성 중 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  }, [sheets, previewCount, buildMaskedSheets]);

  /* 미리보기: 특정 시트 */
  const runPreviewSheet = useCallback(
    async (sheetName: string) => {
      if (!sheets.length) return alert("먼저 파일을 업로드하세요.");
      setBusy(true);
      try {
        const { masked } = await buildMaskedSheets(previewCount, sheetName);
        setPreviewSheets(masked);
        setActivePreviewTab(0);
        setPreviewScope({ sheet: sheetName });
        setPreviewOpen(true);
      } catch (e) {
        console.error(e);
        alert("미리보기 생성 중 오류가 발생했습니다.");
      } finally {
        setBusy(false);
      }
    },
    [sheets, previewCount, buildMaskedSheets]
  );

  /* 필드 규칙 UI */
  const ui = useMemo(() => {
    if (!sheets.length)
      return <p className="text-sm opacity-80">파일을 업로드하면 필드 구성이 표시됩니다.</p>;

    return sheets.map((s) => (
      <div key={s.name} className="border rounded-2xl p-4 mb-6 shadow-sm border-gray-300 dark:border-gray-700">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-lg">{s.name}</h3>
          <div className="flex items-center gap-2 text-sm">
            <span className="opacity-70">이 시트 미리보기:</span>
            <select
              className="border rounded px-2 py-1 bg-transparent text-inherit border-gray-400 dark:border-gray-600"
              value={previewCount}
              onChange={(e) => setPreviewCount(Number(e.target.value))}
            >
              <option value={10}>10</option>
              <option value={30}>30</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <button onClick={() => runPreviewSheet(s.name)} className="px-3 py-1.5 rounded border border-gray-500">
              미리보기
            </button>
          </div>
        </div>

        {s.fields.length === 0 ? (
          <p className="text-sm opacity-80">데이터가 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="text-left py-2 pr-2 font-medium opacity-80">필드명</th>
                  <th className="text-left py-2 pr-2 font-medium opacity-80">규칙</th>
                  <th className="text-left py-2 pr-2 font-medium opacity-80">매개변수</th>
                </tr>
              </thead>
              <tbody>
                {s.fields.map((field) => {
                  const key = `${s.name}::${field}`;
                  const rule = fieldRules[key] || { field, kind: "none", fillKind: "alnum" };
                  return (
                    <tr key={key} className="border-b last:border-b-0 border-gray-100 dark:border-gray-800">
                      <td className="py-2 pr-2 align-top">
                        <span className="px-2 py-0.5 rounded text-xs border border-current/30">{field}</span>
                      </td>
                      <td className="py-2 pr-2 align-top">
                        <select
                          className="border rounded px-2 py-1 bg-transparent text-inherit border-gray-400 dark:border-gray-600"
                          value={rule.kind}
                          onChange={(e) => setRule(s.name, field, { kind: e.target.value as RuleKind })}
                        >
                          <option value="none">변경 없음</option>
                          <option value="blank">공백 처리</option>
                          <option value="randomString">무작위 문자열</option>
                          <option value="randomInt">무작위 정수</option>
                          <option value="randomDate">무작위 날짜</option>
                          <option value="fakeName">가짜 이름</option>
                          <option value="fakeEmail">가짜 이메일</option>
                          <option value="fakePhone">가짜 전화번호</option>
                          <option value="hashSHA256">SHA-256 해시</option>
                        </select>
                      </td>
                      <td className="py-2 pr-2">
                        <div className="flex flex-wrap gap-2">
                          {/* 고정 접두값 */}
                          <input
                            className="border rounded px-2 py-1 bg-transparent text-inherit placeholder:opacity-60 border-gray-400 dark:border-gray-600"
                            placeholder="(선택) 고정 문자열/숫자/연도(YYYY 또는 YYYY-MM)"
                            value={rule.fixedPart || ""}
                            onChange={(e) => setRule(s.name, field, { fixedPart: e.target.value })}
                          />

                          {/* 길이 + 채움 형태: randomString / fakeEmail / (자리수 기반 randomInt)에서 사용 */}
                          {(rule.kind === "randomString" || rule.kind === "fakeEmail" || rule.kind === "randomInt") && (
                            <>
                              <input
                                type="number"
                                min={1}
                                className="border rounded px-2 py-1 w-28 bg-transparent text-inherit border-gray-400 dark:border-gray-600"
                                placeholder={rule.kind === "randomInt" ? "자리수(숫자)" : "문자 길이"}
                                value={rule.strLen ?? ""}
                                onChange={(e) => setRule(s.name, field, { strLen: Number(e.target.value || 0) })}
                                title={
                                  rule.kind === "randomInt"
                                    ? "자리수 기반(고정 접두 숫자 또는 자리수 지정 시)으로 숫자를 채웁니다."
                                    : "fixedPart 뒤를 채울 총 길이"
                                }
                              />
                              {/* 채움 형태 셀렉트: randomInt 에서는 자리수 기반일 때만 사실상 의미가 있으나, UI는 통일 */}
                              <select
                                className="border rounded px-2 py-1 bg-transparent text-inherit border-gray-400 dark:border-gray-600"
                                value={rule.fillKind ?? "alnum"}
                                onChange={(e) => setRule(s.name, field, { fillKind: e.target.value as FillKind })}
                                title="남은 길이를 채울 문자 종류"
                              >
                                <option value="digits">숫자</option>
                                <option value="letters">문자</option>
                                <option value="alnum">무작위(문자+숫자)</option>
                              </select>
                            </>
                          )}

                          {/* randomInt 범위(자리수 기반을 쓰지 않을 때만 사용됨) */}
                          {rule.kind === "randomInt" && (
                            <>
                              <input
                                type="number"
                                className="border rounded px-2 py-1 w-28 bg-transparent text-inherit border-gray-400 dark:border-gray-600"
                                placeholder="최소"
                                value={rule.intMin ?? ""}
                                onChange={(e) => setRule(s.name, field, { intMin: Number(e.target.value || 0) })}
                                title="자리수 기반을 사용하지 않으면 범위(min~max)로 생성"
                              />
                              <input
                                type="number"
                                className="border rounded px-2 py-1 w-28 bg-transparent text-inherit border-gray-400 dark:border-gray-600"
                                placeholder="최대"
                                value={rule.intMax ?? ""}
                                onChange={(e) => setRule(s.name, field, { intMax: Number(e.target.value || 0) })}
                                title="자리수 기반을 사용하지 않으면 범위(min~max)로 생성"
                              />
                            </>
                          )}

                          {/* randomDate 범위(고정 연/연-월 없을 때 사용) */}
                          {rule.kind === "randomDate" && (
                            <>
                              <input
                                type="date"
                                className="border rounded px-2 py-1 bg-transparent text-inherit border-gray-400 dark:border-gray-600"
                                value={rule.dateStart || ""}
                                onChange={(e) => setRule(s.name, field, { dateStart: e.target.value })}
                              />
                              <span className="self-center opacity-70">~</span>
                              <input
                                type="date"
                                className="border rounded px-2 py-1 bg-transparent text-inherit border-gray-400 dark:border-gray-600"
                                value={rule.dateEnd || ""}
                                onChange={(e) => setRule(s.name, field, { dateEnd: e.target.value })}
                              />
                            </>
                          )}
                        </div>
                        <p className="text-xs opacity-60 mt-1">
                          · 예시) 코드: fixedPart="AB", 길이=8, 채움=문자 → <code>AB******</code> 형식<br />
                          · randomInt: fixedPart가 숫자이거나 자리수를 지정하면 **숫자 자리수 기반**으로 채움(범위 설정은 무시)
                        </p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="text-xs opacity-70 mt-2">* 모든 무작위 기능은 **시트 단위 내부**에서만 동작합니다.</p>
          </div>
        )}
      </div>
    ));
  }, [sheets, fieldRules, runPreviewSheet, previewCount]);

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Random 데이터 눈가림</h1>
      <p className="text-sm opacity-80">필드별 무작위 눈가림 및(옵션) 행 순서 섞기. 시트별/전체 미리보기 제공.</p>

      {/* 업로드 박스 */}
      <div
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onDrop={onDrop}
        className="border-2 border-dashed rounded-2xl p-8 text-center border-gray-400 dark:border-gray-600"
      >
        <p className="mb-2"><span className="font-medium">여기에 파일을 드래그</span>하거나 아래 버튼으로 선택하세요.</p>
        <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv,.xml" className="hidden" onChange={onBrowse} />
        <button onClick={() => inputRef.current?.click()} className="px-4 py-2 rounded-xl border shadow-sm transition border-gray-500">
          파일 선택
        </button>
        {fileName && <p className="text-sm opacity-70 mt-2">선택됨: {fileName}</p>}
      </div>

      {/* 옵션 & 전체 미리보기 */}
      <div className="flex flex-wrap gap-4 items-center">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="w-4 h-4" checked={recovery} onChange={(e) => setRecovery(e.target.checked)} />
          복원 옵션(ANON_ROW_ID &amp; ANON__KEY 시트 생성)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="w-4 h-4" checked={shuffleRowsOpt} onChange={(e) => setShuffleRowsOpt(e.target.checked)} />
          행 순서 섞기(시트별 독립)
        </label>

        <div className="flex items-center gap-2 text-sm ml-auto">
          <span>전체 미리보기</span>
          <select
            className="border rounded px-2 py-1 bg-transparent text-inherit border-gray-400 dark:border-gray-600"
            value={previewCount}
            onChange={(e) => setPreviewCount(Number(e.target.value))}
          >
            <option value={10}>10행</option>
            <option value={30}>30행</option>
            <option value={50}>50행</option>
            <option value={100}>100행</option>
          </select>
          <button onClick={runPreviewAll} disabled={!sheets.length || busy} className="px-3 py-1.5 rounded border border-gray-500 disabled:opacity-50">
            미리보기(전체)
          </button>
        </div>
      </div>

      {/* 규칙 UI (시트별 미리보기 버튼 포함) */}
      {ui}

      {/* 실행 */}
      <div className="flex items-center gap-3">
        <button
          disabled={!sheets.length || busy}
          onClick={runDownload}
          className="px-4 py-2 rounded-xl disabled:opacity-50 bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
        >
          {busy ? "처리 중..." : "눈가림 실행 & 다운로드"}
        </button>
        {!sheets.length && <span className="text-sm opacity-70">먼저 파일을 업로드하세요.</span>}
      </div>

      {/* ======= 미리보기 모달 ======= */}
      {previewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" aria-modal role="dialog">
          <div className="absolute inset-0 bg-black/50" onClick={() => setPreviewOpen(false)} />
          <div className="relative max-w-[90vw] max-h-[85vh] w-[1100px] rounded-2xl border border-gray-400 dark:border-gray-600 bg-white dark:bg-gray-900 p-4 shadow-xl overflow-hidden">
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold">
                미리보기 · {previewScope === "all" ? "전체 시트" : `시트: ${(previewScope as any).sheet}`} · 상위 {previewCount}행
              </div>
              <button onClick={() => setPreviewOpen(false)} className="px-3 py-1 rounded border border-gray-500">닫기</button>
            </div>

            {/* 탭: 전체 미리보기면 탭 표시, 시트 단독이면 탭 1개 */}
            <div className="flex flex-wrap gap-2 mb-3">
              {previewSheets.map((s, idx) => (
                <button
                  key={s.name}
                  onClick={() => setActivePreviewTab(idx)}
                  className={`px-3 py-1 rounded border ${
                    activePreviewTab === idx ? "border-gray-900 dark:border-gray-100" : "border-gray-400 dark:border-gray-600 opacity-80"
                  }`}
                >
                  {s.name}
                </button>
              ))}
            </div>

            <div className="overflow-auto border rounded-xl border-gray-300 dark:border-gray-700">
              {previewSheets[activePreviewTab] ? (
                <PreviewTable sheet={previewSheets[activePreviewTab]} />
              ) : (
                <div className="p-6 text-sm opacity-70">표시할 데이터가 없습니다.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* 미리보기 테이블 */
function PreviewTable({ sheet }: { sheet: SheetData }) {
  const { fields, rows } = sheet;
  return (
    <table className="min-w-full text-sm">
      <thead className="border-b border-gray-200 dark:border-gray-700">
        <tr>
          {fields.map((f) => (
            <th key={f} className="text-left py-2 px-2 font-medium opacity-80">{f}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-b last:border-b-0 border-gray-100 dark:border-gray-800">
            {fields.map((f) => (
              <td key={f} className="py-1.5 px-2 align-top">{String(r[f] ?? "")}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
