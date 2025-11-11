"use client";

/**
 * Random 데이터 눈가림 페이지
 * - 단일 파일 업로드(Excel, CSV, XML)
 * - 모든 시트/테이블 로드(CSV는 단일 시트 가정, XML은 최상위 반복 노드 추정)
 * - 필드별 눈가림 규칙 적용(여러 필드 가능)
 * - 복원 옵션: 시트에 ANON_ROW_ID 추가 + 키 시트(ANON__KEY_<시트명>) 생성
 * - 결과는 단일 XLSX로 다운로드
 *
 * 주의:
 * - 디자인/마크업은 단순 유지 (Tailwind 사용)
 * - 클라이언트 전용 컴포넌트
 */

import React, { useCallback, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx"; // SheetJS - 브라우저 사용 가능
import { XMLParser } from "fast-xml-parser"; // 경량 XML 파서

// --------- 타입 정의 ---------
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

type FieldRule = {
  field: string;
  kind: RuleKind;
  // 규칙별 매개변수
  strLen?: number; // randomString
  intMin?: number; // randomInt
  intMax?: number; // randomInt
  dateStart?: string; // randomDate (YYYY-MM-DD)
  dateEnd?: string; // randomDate (YYYY-MM-DD)
  customList?: string; // (선택) 콤마구분 목록에서 랜덤 픽
};

// --------- 유틸: 난수/난문자/가짜데이터/날짜/해시 ---------
const randInt = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const randString = (len: number) => {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars.charAt(randInt(0, chars.length - 1));
  return out;
};

const pickFromList = (csv?: string) => {
  if (!csv) return undefined;
  const list = csv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!list.length) return undefined;
  return list[randInt(0, list.length - 1)];
};

const fakeName = () => {
  const first = ["Kim", "Lee", "Park", "Choi", "Jung", "Han", "Yoon", "Kang"];
  const last = [
    "Minsoo",
    "Jiwon",
    "Seojin",
    "Hyunwoo",
    "Jisoo",
    "Yuna",
    "Haneul",
    "Taeyang",
  ];
  return `${first[randInt(0, first.length - 1)]} ${last[randInt(0, last.length - 1)]}`;
};

const fakeEmail = () => {
  const user = randString(8).toLowerCase();
  const domains = ["example.com", "mail.com", "test.org", "anon.dev"];
  return `${user}@${domains[randInt(0, domains.length - 1)]}`;
};

const fakePhone = () => {
  // 한국형 형식 대략: 010-XXXX-XXXX
  return `010-${randInt(1000, 9999)}-${randInt(1000, 9999)}`;
};

const randDate = (start: Date, end: Date) => {
  const s = start.getTime();
  const e = end.getTime();
  const t = randInt(s, e);
  const d = new Date(t);
  // YYYY-MM-DD로 출력(시간 불필요)
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

// Web Crypto API로 SHA-256 해시(hex)
const sha256Hex = async (input: string) => {
  const enc = new TextEncoder().encode(input ?? "");
  const buf = await crypto.subtle.digest("SHA-256", enc);
  const arr = Array.from(new Uint8Array(buf));
  return arr.map((b) => b.toString(16).padStart(2, "0")).join("");
};

// 간단 UUIDv4
const uuidv4 = () =>
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (crypto.getRandomValues(new Uint8Array(1))[0] & 0xf) >> 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });

// --------- XML → 표 구조 추정(flat) ---------
/**
 * 매우 일반적인 형태의 XML을 표로 변환:
 * - 최상위에서 "배열로 반복되는 첫 번째 노드"를 레코드로 간주
 * - 각 레코드는 객체. 중첩 객체는 'a.b.c'로 평탄화
 * - 복잡 XML의 경우 사용자가 변환 후 필드명만 골라서 규칙 적용 가능
 */
const xmlToRows = (xmlText: string): { rows: Row[]; fields: string[] } => {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@",
    allowBooleanAttributes: true,
  });
  const json = parser.parse(xmlText);

  // 첫 번째 "배열" 노드 찾아서 사용
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
      for (const [k, v] of Object.entries(obj)) {
        flat(v, prefix ? `${prefix}.${k}` : k, out);
      }
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

// --------- 메인 컴포넌트 ---------
export default function RandomMaskPage() {
  const [fileName, setFileName] = useState<string>("");
  const [sheets, setSheets] = useState<SheetData[]>([]);
  const [fieldRules, setFieldRules] = useState<Record<string, FieldRule>>({});
  const [recovery, setRecovery] = useState<boolean>(true); // 기본 ON
  const [busy, setBusy] = useState<boolean>(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // 파일 드롭/선택 처리
  const onFile = useCallback(async (f: File) => {
    setBusy(true);
    try {
      setFileName(f.name);

      const ext = f.name.toLowerCase();
      const arrayBuffer = await f.arrayBuffer();

      if (ext.endsWith(".xlsx") || ext.endsWith(".xls") || ext.endsWith(".csv")) {
        // Excel/CSV: SheetJS로 통합 처리 (CSV도 read 가능)
        const wb = XLSX.read(arrayBuffer, { type: "array" });
        const newSheets: SheetData[] = wb.SheetNames.map((name) => {
          const ws = wb.Sheets[name];
          const rows: Row[] = XLSX.utils.sheet_to_json(ws, { defval: "" }) as Row[];
          const fields = rows.length ? Object.keys(rows[0]) : [];
          return { name, rows, fields };
        });
        setSheets(newSheets);

        // 규칙 초기화(모든 시트의 모든 필드 none)
        const fr: Record<string, FieldRule> = {};
        newSheets.forEach((s) =>
          s.fields.forEach((field) => {
            const key = `${s.name}::${field}`;
            fr[key] = { field, kind: "none" };
          })
        );
        setFieldRules(fr);
      } else if (ext.endsWith(".xml")) {
        // XML: 한 개 시트로 구성
        const text = new TextDecoder().decode(new Uint8Array(arrayBuffer));
        const { rows, fields } = xmlToRows(text);
        const newSheets: SheetData[] = [{ name: "XML", rows, fields }];
        setSheets(newSheets);
        const fr: Record<string, FieldRule> = {};
        fields.forEach((field) => {
          fr[`XML::${field}`] = { field, kind: "none" };
        });
        setFieldRules(fr);
      } else {
        alert("지원 확장자: .xlsx, .xls, .csv, .xml");
        setSheets([]);
        setFieldRules({});
      }
    } catch (e: any) {
      console.error(e);
      alert("파일을 읽는 중 오류가 발생했습니다. 콘솔을 확인하세요.");
      setSheets([]);
      setFieldRules({});
    } finally {
      setBusy(false);
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const f = e.dataTransfer.files?.[0];
      if (f) onFile(f);
    },
    [onFile]
  );

  const onBrowse = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) onFile(f);
  }, [onFile]);

  // 규칙 변경 핸들러
  const setRule = (sheet: string, field: string, patch: Partial<FieldRule>) => {
    const key = `${sheet}::${field}`;
    setFieldRules((prev) => ({
      ...prev,
      [key]: { ...(prev[key] || { field, kind: "none" }), ...patch },
    }));
  };

  // 눈가림 실행
  const runMasking = useCallback(async () => {
    if (!sheets.length) {
      alert("먼저 파일을 업로드하세요.");
      return;
    }
    setBusy(true);
    try {
      // 원본 보관(복원용 시트 생성 시 필요)
      const originalSheets = sheets.map((s) => ({
        name: s.name,
        rows: s.rows.map((r) => ({ ...r })),
        fields: [...s.fields],
      }));

      // 마스킹 처리
      const maskedSheets: SheetData[] = [];
      const keySheets: SheetData[] = []; // 복원 키(선택)
      for (const sheet of sheets) {
        const rows = sheet.rows.map((row) => ({ ...row }));
        const fields = [...sheet.fields];

        // 복원용 키시트 구성 데이터(선택)
        const keyRows: Row[] = [];

        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const rowKey: Row = {};
          let anonId = "";

          // 각 필드에 대해 규칙 적용
          for (const field of fields) {
            const rule = fieldRules[`${sheet.name}::${field}`];
            if (!rule || rule.kind === "none") continue;

            // 복원용이면 첫 적용 시 ID 생성
            if (recovery && !anonId) {
              anonId = uuidv4();
              row["ANON_ROW_ID"] = anonId;
              rowKey["ANON_ROW_ID"] = anonId;
            }

            const sourceVal = String(row[field] ?? "");

            // (선택) 커스텀 목록에서 먼저 랜덤 픽
            const picked = pickFromList(rule.customList);

            switch (rule.kind) {
              case "blank":
                row[field] = "";
                if (recovery) rowKey[field] = sourceVal;
                break;
              case "randomString":
                row[field] = picked ?? randString(Math.max(1, rule.strLen ?? 8));
                if (recovery) rowKey[field] = sourceVal;
                break;
              case "randomInt": {
                const min = Number.isFinite(rule.intMin) ? (rule.intMin as number) : 0;
                const max = Number.isFinite(rule.intMax) ? (rule.intMax as number) : 9999;
                row[field] = picked ?? String(randInt(min, max));
                if (recovery) rowKey[field] = sourceVal;
                break;
              }
              case "randomDate": {
                const s = rule.dateStart ? new Date(rule.dateStart) : new Date("2000-01-01");
                const e = rule.dateEnd ? new Date(rule.dateEnd) : new Date("2030-12-31");
                row[field] = picked ?? randDate(s, e);
                if (recovery) rowKey[field] = sourceVal;
                break;
              }
              case "fakeName":
                row[field] = picked ?? fakeName();
                if (recovery) rowKey[field] = sourceVal;
                break;
              case "fakeEmail":
                row[field] = picked ?? fakeEmail();
                if (recovery) rowKey[field] = sourceVal;
                break;
              case "fakePhone":
                row[field] = picked ?? fakePhone();
                if (recovery) rowKey[field] = sourceVal;
                break;
              case "hashSHA256":
                row[field] = await sha256Hex(sourceVal);
                // 해시는 원복 불가하므로 복원 키에 원본값 보관(선택)
                if (recovery) rowKey[field] = sourceVal;
                break;
            }
          }

          if (recovery && Object.keys(rowKey).length) {
            keyRows.push(rowKey);
          }
        }

        // 결과 시트 구성
        const maskedFields = [...fields];
        if (recovery && !maskedFields.includes("ANON_ROW_ID")) {
          maskedFields.push("ANON_ROW_ID");
        }

        maskedSheets.push({ name: sheet.name, rows, fields: maskedFields });

        // 복원용 키 시트(선택)
        if (recovery && keyRows.length) {
          const keyFields = Array.from(
            new Set(keyRows.flatMap((r) => Object.keys(r)))
          );
          keySheets.push({
            name: `ANON__KEY_${sheet.name}`,
            rows: keyRows,
            fields: keyFields,
          });
        }
      }

      // 워크북 생성(마스킹 시트 + (선택) 키 시트)
      const wb = XLSX.utils.book_new();
      for (const s of maskedSheets) {
        const ws = XLSX.utils.json_to_sheet(s.rows, { header: s.fields });
        XLSX.utils.book_append_sheet(wb, ws, safeSheetName(s.name));
      }
      if (recovery) {
        for (const s of keySheets) {
          const ws = XLSX.utils.json_to_sheet(s.rows, { header: s.fields });
          XLSX.utils.book_append_sheet(wb, ws, safeSheetName(s.name));
        }
      }

      const outName = fileName ? fileName.replace(/\.[^.]+$/, "") : "masked";
      XLSX.writeFile(wb, `${outName}__masked.xlsx`);
    } catch (e: any) {
      console.error(e);
      alert("눈가림 중 오류가 발생했습니다. 콘솔을 확인하세요.");
    } finally {
      setBusy(false);
    }
  }, [sheets, fieldRules, recovery, fileName]);

  // 필드 목록(시트별)를 화면에 출력
  const ui = useMemo(() => {
    if (!sheets.length)
      return <p className="text-sm text-gray-500">파일을 업로드하면 필드 구성이 표시됩니다.</p>;

    return sheets.map((s) => (
      <div key={s.name} className="border rounded-2xl p-4 mb-6 shadow-sm">
        <h3 className="font-semibold text-lg mb-2">{s.name}</h3>
        {s.fields.length === 0 ? (
          <p className="text-sm text-gray-500">데이터가 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b">
                <tr>
                  <th className="text-left py-2 pr-2">필드명</th>
                  <th className="text-left py-2 pr-2">규칙</th>
                  <th className="text-left py-2 pr-2">매개변수</th>
                </tr>
              </thead>
              <tbody>
                {s.fields.map((field) => {
                  const key = `${s.name}::${field}`;
                  const rule = fieldRules[key] || { field, kind: "none" };
                  return (
                    <tr key={key} className="border-b last:border-b-0">
                      <td className="py-2 pr-2 align-top">
                        <code className="px-2 py-1 bg-gray-100 rounded">{field}</code>
                      </td>
                      <td className="py-2 pr-2 align-top">
                        <select
                          className="border rounded px-2 py-1"
                          value={rule.kind}
                          onChange={(e) =>
                            setRule(s.name, field, { kind: e.target.value as RuleKind })
                          }
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
                        {/* 규칙별 매개변수 UI */}
                        <div className="flex flex-wrap gap-2">
                          {/* 공통: 커스텀 랜덤 목록 */}
                          <input
                            className="border rounded px-2 py-1"
                            placeholder="(선택) 목록에서 랜덤: a,b,c"
                            value={rule.customList || ""}
                            onChange={(e) =>
                              setRule(s.name, field, { customList: e.target.value })
                            }
                          />
                          {rule.kind === "randomString" && (
                            <input
                              type="number"
                              min={1}
                              className="border rounded px-2 py-1 w-28"
                              placeholder="길이"
                              value={rule.strLen ?? 8}
                              onChange={(e) =>
                                setRule(s.name, field, {
                                  strLen: Math.max(1, Number(e.target.value || 8)),
                                })
                              }
                            />
                          )}
                          {rule.kind === "randomInt" && (
                            <>
                              <input
                                type="number"
                                className="border rounded px-2 py-1 w-28"
                                placeholder="최소"
                                value={rule.intMin ?? 0}
                                onChange={(e) =>
                                  setRule(s.name, field, { intMin: Number(e.target.value) })
                                }
                              />
                              <input
                                type="number"
                                className="border rounded px-2 py-1 w-28"
                                placeholder="최대"
                                value={rule.intMax ?? 9999}
                                onChange={(e) =>
                                  setRule(s.name, field, { intMax: Number(e.target.value) })
                                }
                              />
                            </>
                          )}
                          {rule.kind === "randomDate" && (
                            <>
                              <input
                                type="date"
                                className="border rounded px-2 py-1"
                                value={rule.dateStart || ""}
                                onChange={(e) =>
                                  setRule(s.name, field, { dateStart: e.target.value })
                                }
                              />
                              <span className="self-center">~</span>
                              <input
                                type="date"
                                className="border rounded px-2 py-1"
                                value={rule.dateEnd || ""}
                                onChange={(e) =>
                                  setRule(s.name, field, { dateEnd: e.target.value })
                                }
                              />
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="text-xs text-gray-500 mt-2">
              * 규칙은 **시트 내부 범위**에서만 적용되며, 다른 시트 데이터와 교차하지 않습니다.
            </p>
          </div>
        )}
      </div>
    ));
  }, [sheets, fieldRules]);

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Random 데이터 눈가림</h1>
      <p className="text-sm text-gray-600">
        엑셀/CSV/XML 파일 1개를 업로드하여 필드별 무작위 눈가림을 수행합니다. 결과는 한 개의 XLSX로 내려받습니다.
      </p>

      {/* 업로드 박스 */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onDrop={onDrop}
        className="border-2 border-dashed rounded-2xl p-8 text-center hover:bg-gray-50"
      >
        <p className="mb-2">
          <span className="font-medium">여기에 파일을 드래그</span>하거나 아래 버튼으로 선택하세요.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv,.xml"
          className="hidden"
          onChange={onBrowse}
        />
        <button
          onClick={() => inputRef.current?.click()}
          className="px-4 py-2 rounded-xl border shadow-sm hover:shadow transition"
        >
          파일 선택
        </button>
        {fileName && <p className="text-sm text-gray-500 mt-2">선택됨: {fileName}</p>}
      </div>

      {/* 복원 옵션 */}
      <div className="flex items-center gap-2">
        <input
          id="recovery"
          type="checkbox"
          className="w-4 h-4"
          checked={recovery}
          onChange={(e) => setRecovery(e.target.checked)}
        />
        <label htmlFor="recovery" className="text-sm">
          복원 옵션(ANON_ROW_ID &amp; ANON__KEY 시트 생성)
        </label>
      </div>

      {/* 필드 규칙 UI */}
      {ui}

      {/* 실행/상태 */}
      <div className="flex items-center gap-3">
        <button
          disabled={!sheets.length || busy}
          onClick={runMasking}
          className="px-4 py-2 rounded-xl bg-black text-white disabled:opacity-50"
        >
          {busy ? "처리 중..." : "눈가림 실행 & 다운로드"}
        </button>
        {!sheets.length && (
          <span className="text-sm text-gray-500">먼저 파일을 업로드하세요.</span>
        )}
      </div>

      <div className="text-xs text-gray-400">
        - 해시(SHA-256)는 원복이 불가합니다. 복원이 필요하면 해시 대신 무작위/가짜 데이터를 사용하고
        복원 옵션을 켜서 키 시트를 보관하세요.
      </div>
    </div>
  );
}

// 시트명 유효화(엑셀 제약)
function safeSheetName(name: string) {
  const invalid = /[\\/?*\[\]:]/g;
  let n = name.replace(invalid, "_");
  if (n.length > 31) n = n.slice(0, 31);
  if (!n.trim()) n = "Sheet";
  return n;
}
