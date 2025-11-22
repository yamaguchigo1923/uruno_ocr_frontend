"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildApiUrl } from "@/lib/api";

type TableData = string[][];

// [依頼先, メーカー, 商品CD, 成分表, 見本]
type FlagsEntry = [string, string, string, string, string];

// [依頼先, メーカー, 商品CD, 番号, 成分表, 見本]
type FlagsWithNumberEntry = [string, string, string, string, string, string];

type MakerData = Record<string, TableData>;

type MakerCodes = Record<string, string[]>;

type OrderSelection = {
  maker: string;
  code: string;
  seibun_flag: string;
  mihon_flag: string;
};

type OrderResponse = {
  ocr_table: TableData;
  reference_table: TableData;
  selections: OrderSelection[];
  maker_data: MakerData;
  maker_cds: MakerCodes;
  flags: FlagsEntry[];
  flags_with_number?: FlagsWithNumberEntry[];
  ocr_snapshot_url?: string | null;
  output_spreadsheet_url?: string | null;
  output_folder_id?: string | null;
  extraction_sheet_id?: string | null;
  extraction_sheet_url?: string | null;
  center_name: string;
  center_month: string;
  debug_logs: string[];
};

type ExportResponse = {
  output_spreadsheet_url: string;
  debug_logs: string[];
};

type FinalLink = {
  name: string;
  url: string;
};

interface CenterClientProps {
  centerId: string;
}

function DataTable({ rows }: { rows: TableData | null }) {
  if (!rows || rows.length === 0) {
    return <p className="text-xs text-slate-500">データがありません。</p>;
  }
  return (
    <div className="max-h-96 overflow-auto rounded border border-slate-800">
      <table className="min-w-full text-xs">
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr
              key={`row-${rowIndex}`}
              className={
                rowIndex === 0
                  ? "sticky top-0 bg-slate-900 text-slate-200"
                  : "odd:bg-slate-950/50"
              }
            >
              {row.map((cell, cellIndex) => (
                <td
                  key={`cell-${rowIndex}-${cellIndex}`}
                  className="whitespace-pre px-2 py-1"
                >
                  {cell ?? ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CalcResultTable({ response }: { response: OrderResponse | null }) {
  if (!response) return null;
  const header = [
    "依頼先",
    "メーカー",
    "商品CD",
    "番号",
    "メーカー(結果)",
    "商品名",
    "規格",
    "成分表",
    "見本",
    "備考",
  ];
  const rows: TableData = [header];
  const flagsMap = new Map<
    string,
    { dest: string; seibun: string; mihon: string; num?: string }
  >();
  if (
    Array.isArray(response.flags_with_number) &&
    response.flags_with_number.length > 0
  ) {
    response.flags_with_number.forEach(
      ([dest, maker, code, num, seibunFlag, mihonFlag]) => {
        flagsMap.set(`${maker}__${code}`, {
          dest,
          seibun: seibunFlag,
          mihon: mihonFlag,
          num,
        });
      }
    );
  } else {
    response.flags.forEach(([dest, maker, code, seibunFlag, mihonFlag]) => {
      flagsMap.set(`${maker}__${code}`, {
        dest,
        seibun: seibunFlag,
        mihon: mihonFlag,
      });
    });
  }
  Object.entries(response.maker_cds).forEach(([maker, codes]) => {
    const dataRows = response.maker_data[maker] ?? [];
    codes.forEach((code, index) => {
      const row = dataRows[index] ?? [maker, "", "", ""];
      const flags = flagsMap.get(`${maker}__${code}`) ?? {
        dest: "",
        seibun: "",
        mihon: "",
        num: "",
      };
      rows.push([
        flags.dest ?? "",
        maker,
        code,
        flags.num ?? "",
        row[0] ?? maker,
        row[1] ?? "",
        row[2] ?? "",
        flags.seibun ?? "",
        flags.mihon ?? "",
        row[3] ?? "",
      ]);
    });
  });
  return <DataTable rows={rows} />;
}

export default function CenterClient({ centerId }: CenterClientProps) {
  const decodedCenterId = useMemo(() => centerId, [centerId]);
  const [refFile, setRefFile] = useState<File | null>(null);
  const [ocrFiles, setOcrFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState<number | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const logRef = useRef<HTMLDivElement | null>(null);
  const streamingReceivedRef = useRef<boolean>(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [response, setResponse] = useState<OrderResponse | null>(null);
  const [finalLinks, setFinalLinks] = useState<FinalLink[]>([]);
  const [error, setError] = useState<string | null>(null);

  const pushLog = useCallback((message: string) => {
    const line = `[${new Date().toLocaleTimeString()}] ${message}`;
    setLogs((prev) => [...prev, line]);
  }, []);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  const handleAddOcr = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length) {
      setOcrFiles((prev) => [...prev, ...files]);
    }
    event.target.value = "";
  };

  const handleRemoveOcr = (index: number) => {
    setOcrFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const onDragStart = (
    event: React.DragEvent<HTMLDivElement>,
    index: number
  ) => {
    event.dataTransfer.setData("text/plain", String(index));
    setDragging(index);
  };

  const onDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  const onDrop = (event: React.DragEvent<HTMLDivElement>, index: number) => {
    event.preventDefault();
    const from = Number(event.dataTransfer.getData("text/plain"));
    if (Number.isNaN(from)) return;
    setOcrFiles((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(index, 0, moved);
      return next;
    });
    setDragging(null);
  };

  const runAnalyze = async () => {
    if (!decodedCenterId) {
      setError("センターIDが指定されていません。");
      return;
    }
    if (ocrFiles.length === 0) {
      setError("OCR対象ファイルを選択してください。");
      return;
    }
    setError(null);
    setAnalyzing(true);
    setResponse(null);
    setFinalLinks([]);
    setLogs([]);
    pushLog("解析を開始しました");

    const form = new FormData();
    form.append("center_id", decodedCenterId);
    form.append("sheet_name", "入札書");
    form.append("auto_export", "false");
    if (refFile) {
      form.append("reference_file", refFile);
    }
    ocrFiles.forEach((file) => {
      form.append("ocr_files", file);
    });

    try {
      // Use streaming endpoint to receive realtime logs (fetch + ReadableStream)
      const res = await fetch(buildApiUrl("/orders/process/stream"), {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`${res.status} ${res.statusText} - ${text}`);
      }

      const reader = res.body?.getReader();
      if (!reader) {
        throw new Error("レスポンスのストリームが取得できませんでした");
      }
      const decoder = new TextDecoder("utf-8");
      let buf = "";
      let finished = false;
      while (!finished) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        // SSE 単純パーサ: 空行でイベント区切り
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
          const lines = part.split(/\n/).map((l) => l.trim());
          for (const line of lines) {
            if (line.startsWith(":")) {
              // heartbeat comment
              continue;
            }
            if (!line.startsWith("data:")) continue;
            const payloadRaw = line.slice("data:".length).trim();
            try {
              const payload = JSON.parse(payloadRaw);
              const ev = payload.event;
              const data = payload.data;
              if (ev === "dbg") {
                streamingReceivedRef.current = true;
                pushLog(`[BE] ${String(data)}`);
              } else if (ev === "result") {
                // final structured result (full OrderPipelineResult expected)
                if (typeof data === "object" && data !== null) {
                  try {
                    // populate full response if available
                    setResponse(data as OrderResponse);
                  } catch {
                    // ignore if shape mismatch
                  }
                  // add known links if present
                  if (data.ocr_snapshot_url) {
                    setFinalLinks((prev) => [
                      ...prev,
                      {
                        name: "OCR結果のスプレッドシート",
                        url: data.ocr_snapshot_url,
                      },
                    ]);
                  }
                  if (data.output_spreadsheet_url) {
                    setFinalLinks((prev) => [
                      ...prev,
                      {
                        name: "メーカーごとの各種依頼書スプレッドシート",
                        url: data.output_spreadsheet_url,
                      },
                    ]);
                  }
                  // Append final debug_logs only if we didn't receive dbg
                  // streaming events (to avoid duplicates).
                  if (!streamingReceivedRef.current) {
                    const maybeLogs = (data as { debug_logs?: unknown })
                      .debug_logs;
                    if (Array.isArray(maybeLogs)) {
                      const stringLogs = maybeLogs.filter(
                        (x): x is string => typeof x === "string"
                      );
                      if (stringLogs.length) {
                        setLogs((prev) => [
                          ...prev,
                          ...stringLogs.map((ln) => `[BE] ${ln}`),
                        ]);
                      }
                    }
                  }
                }
              } else if (ev === "done") {
                pushLog("バックエンド処理が完了しました");
                finished = true;
                break;
              } else {
                // generic
                pushLog(`[BE:${String(ev)}] ${JSON.stringify(data)}`);
              }
            } catch {
              // not JSON - push raw
              pushLog(`[BE] ${payloadRaw}`);
            }
          }
        }
      }
      // NOTE: we no longer issue a synchronous fallback POST; the streaming
      // endpoint now provides a final 'result' event with the full response.
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      pushLog("エラーが発生しました");
    } finally {
      setAnalyzing(false);
    }
  };

  const canExport = useMemo(() => {
    if (!response) return false;
    return Object.values(response.maker_cds ?? {}).some(
      (codes) => codes.length
    );
  }, [response]);

  const runExport = async () => {
    if (!response || !canExport) {
      setError("解析結果がありません。");
      return;
    }
    setError(null);
    setExporting(true);
    pushLog("依頼書スプレッドシートの生成を開始します");
    try {
      // Stream the export process so per-maker logs appear as they occur.
      const body = JSON.stringify({
        center_id: decodedCenterId,
        center_name: response.center_name,
        center_month: response.center_month,
        maker_data: response.maker_data,
        maker_cds: response.maker_cds,
        flags: response.flags,
        extraction_sheet_id: response.extraction_sheet_id,
        output_folder_id: response.output_folder_id,
      });
      const res = await fetch(buildApiUrl("/orders/export/stream"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`${res.status} ${res.statusText} - ${text}`);
      }
      const reader = res.body?.getReader();
      if (!reader)
        throw new Error("レスポンスのストリームが取得できませんでした");
      const decoder = new TextDecoder("utf-8");
      let buf = "";
      let finished = false;
      while (!finished) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
          const lines = part.split(/\n/).map((l) => l.trim());
          for (const line of lines) {
            if (line.startsWith(":")) continue; // heartbeat
            if (!line.startsWith("data:")) continue;
            const payloadRaw = line.slice("data:".length).trim();
            try {
              const payload = JSON.parse(payloadRaw);
              const ev = payload.event;
              const data = payload.data;
              if (ev === "dbg") {
                streamingReceivedRef.current = true;
                pushLog(`[BE] ${String(data)}`);
              } else if (ev === "result") {
                if (typeof data === "object" && data !== null) {
                  if (data.output_spreadsheet_url) {
                    setResponse((prev) =>
                      prev
                        ? {
                            ...prev,
                            output_spreadsheet_url: data.output_spreadsheet_url,
                          }
                        : prev
                    );
                    setFinalLinks((prev) => {
                      const exists = prev.some(
                        (item) => item.url === data.output_spreadsheet_url
                      );
                      if (exists) return prev;
                      return [
                        ...prev,
                        {
                          name: "メーカーごとの各種依頼書スプレッドシート",
                          url: data.output_spreadsheet_url,
                        },
                      ];
                    });
                  }
                  // Append final debug_logs only if no dbg were streamed
                  if (!streamingReceivedRef.current) {
                    const maybeLogs = (data as { debug_logs?: unknown })
                      .debug_logs;
                    if (Array.isArray(maybeLogs)) {
                      const stringLogs = maybeLogs.filter(
                        (x): x is string => typeof x === "string"
                      );
                      if (stringLogs.length) {
                        setLogs((prev) => [
                          ...prev,
                          ...stringLogs.map((ln) => `[BE] ${ln}`),
                        ]);
                      }
                    }
                  }
                }
              } else if (ev === "done") {
                pushLog("スプレッドシートの生成が完了しました");
                finished = true;
                break;
              } else {
                pushLog(`[BE:${String(ev)}] ${JSON.stringify(data)}`);
              }
            } catch {
              pushLog(`[BE] ${payloadRaw}`);
            }
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      pushLog("スプレッドシート生成中にエラーが発生しました");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-slate-100">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8">
        <section className="space-y-1">
          <h1 className="text-xl font-semibold text-slate-100">
            センター: {decodedCenterId}
          </h1>
          <p className="text-xs text-slate-400">
            見積書ファイルとOCR対象ファイルをアップロードし、解析を実行します。
          </p>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4 rounded-lg border border-slate-800 bg-slate-900/60 p-5">
            <h2 className="text-sm font-semibold text-slate-200">
              見積書ファイル
            </h2>
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded border border-dashed border-slate-700 bg-slate-950/40 p-6 text-sm text-slate-400 transition hover:border-sky-500">
              <span>
                {refFile ? refFile.name : "クリックして Excel / CSV を選択"}
              </span>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(event) =>
                  setRefFile(event.target.files?.[0] ?? null)
                }
              />
            </label>
          </div>
          <div className="space-y-4 rounded-lg border border-slate-800 bg-slate-900/60 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-200">
                OCR対象ファイル
              </h2>
              <span className="text-[11px] text-slate-500">
                ドラッグで並び替え
              </span>
            </div>
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded border border-dashed border-slate-700 bg-slate-950/40 p-6 text-sm text-slate-400 transition hover:border-sky-500">
              <span>クリックして画像 / PDF を追加</span>
              <input
                type="file"
                multiple
                accept="image/*,.pdf"
                className="hidden"
                onChange={handleAddOcr}
              />
            </label>
            <div className="flex max-h-64 flex-col gap-2 overflow-auto pr-1">
              {ocrFiles.length === 0 ? (
                <p className="text-xs text-slate-500">ファイル未選択</p>
              ) : (
                ocrFiles.map((file, index) => (
                  <div
                    key={`${file.name}-${index}`}
                    draggable
                    onDragStart={(event) => onDragStart(event, index)}
                    onDragOver={onDragOver}
                    onDrop={(event) => onDrop(event, index)}
                    onDragEnd={() => setDragging(null)}
                    className={`flex items-center gap-3 rounded border px-3 py-2 text-sm transition ${
                      dragging === index
                        ? "border-sky-500 bg-slate-900/80"
                        : "border-slate-700 bg-slate-950/50 hover:border-sky-500"
                    }`}
                  >
                    <span className="w-6 text-center text-xs text-slate-500">
                      {index + 1}
                    </span>
                    <span className="flex-1 truncate" title={file.name}>
                      {file.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveOcr(index)}
                      className="text-xs text-slate-400 transition hover:text-rose-400"
                      title="削除"
                    >
                      ✕
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="flex items-center gap-4">
          <button
            type="button"
            onClick={runAnalyze}
            disabled={analyzing}
            className="inline-flex items-center gap-3 rounded-lg bg-gradient-to-r from-sky-600 to-indigo-600 px-10 py-4 text-base font-semibold text-white shadow-lg transition hover:from-sky-500 hover:to-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {analyzing ? (
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-transparent" />
            ) : null}
            <span>{analyzing ? "解析中..." : "解析開始"}</span>
          </button>
          {response ? (
            <button
              type="button"
              onClick={runExport}
              disabled={!canExport || exporting}
              className="inline-flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-900/80 px-8 py-3 text-sm font-semibold text-slate-100 transition hover:border-sky-500 hover:text-sky-200 disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-600"
            >
              {exporting ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-transparent" />
              ) : null}
              <span>
                {exporting ? "出力中..." : "ステップ2: スプレッドシート生成"}
              </span>
            </button>
          ) : null}
          {error ? <p className="text-sm text-rose-400">{error}</p> : null}
        </section>

        {logs.length > 0 ? (
          <section className="rounded-lg border border-slate-800 bg-slate-900/50 p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-200">
              処理ログ
            </h2>
            <div
              ref={logRef}
              // Increased max-height so the log panel shows more lines (approx. 2x)
              className="max-h-[36rem] overflow-auto rounded border border-slate-800 bg-slate-900 p-3 text-xs text-slate-200 shadow-sm"
              style={{
                fontFamily:
                  'ui-monospace, SFMono-Regular, Menlo, Monaco, "Roboto Mono", "Helvetica Neue", monospace',
              }}
            >
              {logs.map((line, index) => (
                <div key={`${line}-${index}`}>{line}</div>
              ))}
            </div>
          </section>
        ) : null}

        {response ? (
          <section className="rounded-lg border border-slate-800 bg-slate-900/50 p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-200">
              生成されたファイル
            </h2>
            <ul className="space-y-1 text-sm">
              {finalLinks.map((link) => (
                <li key={link.url}>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sky-300 hover:text-sky-200"
                  >
                    ▶ {link.name}
                  </a>
                </li>
              ))}
              {finalLinks.length === 0 ? (
                <li className="text-xs text-slate-500">
                  まだ生成されていません
                </li>
              ) : null}
            </ul>
          </section>
        ) : null}

        {response ? (
          <section className="space-y-6">
            <div className="grid gap-3 rounded-lg border border-slate-800 bg-slate-900/50 p-5 text-sm text-slate-300 sm:grid-cols-2 lg:grid-cols-6">
              <div>
                <span className="block text-[11px] uppercase tracking-wide text-slate-500">
                  センター名
                </span>
                <span className="font-medium text-slate-100">
                  {response.center_name || "(不明)"}
                </span>
              </div>
              <div>
                <span className="block text-[11px] uppercase tracking-wide text-slate-500">
                  対象月
                </span>
                <span className="font-medium text-slate-100">
                  {response.center_month || "-"}
                </span>
              </div>
              <div>
                <span className="block text-[11px] uppercase tracking-wide text-slate-500">
                  見本フラグ件数
                </span>
                <span className="font-medium text-slate-100">
                  {response.flags.length}
                </span>
              </div>
              <div>
                <span className="block text-[11px] uppercase tracking-wide text-slate-500">
                  メーカー数
                </span>
                <span className="font-medium text-slate-100">
                  {Object.keys(response.maker_cds ?? {}).length}
                </span>
              </div>
              <div>
                <span className="block text-[11px] uppercase tracking-wide text-slate-500">
                  見積書件数
                </span>
                <span className="font-medium text-slate-100">
                  {Math.max(0, (response.reference_table?.length ?? 0) - 1)}
                </span>
              </div>
              <div>
                <span className="block text-[11px] uppercase tracking-wide text-slate-500">
                  OCR件数
                </span>
                <span className="font-medium text-slate-100">
                  {Math.max(0, (response.ocr_table?.length ?? 0) - 1)}
                </span>
              </div>
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-5">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  見積書プレビュー
                </h3>
                <DataTable rows={response.reference_table} />
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-5">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  OCR結果プレビュー
                </h3>
                <DataTable rows={response.ocr_table} />
              </div>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-5">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                抽出結果 (メーカー × 商品CD)
              </h3>
              <CalcResultTable response={response} />
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
