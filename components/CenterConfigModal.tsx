"use client";

import { useEffect, useState } from "react";
import { buildApiUrl } from "@/lib/api";
import { JsonTree, JsonValue } from "./JsonTree";

interface CenterConfigModalProps {
  centerId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export function CenterConfigModal({
  centerId,
  isOpen,
  onClose,
}: CenterConfigModalProps) {
  const [data, setData] = useState<JsonValue | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    if (!isOpen || !centerId) {
      return;
    }
    setLoading(true);
    setError(null);
    setCopied(false);
    setQuery("");
    (async () => {
      try {
        const res = await fetch(
          buildApiUrl(`/centers/config/${encodeURIComponent(centerId)}`)
        );
        if (!active) return;
        if (!res.ok) {
          throw new Error(`${res.status} ${res.statusText}`);
        }
        const json = (await res.json()) as JsonValue;
        setData(json);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : String(err));
        setData(null);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [centerId, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setData(null);
      setError(null);
      setQuery("");
      setCopied(false);
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const title = centerId ? `センター設定: ${centerId}` : "センター設定";

  const handleCopy = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-[min(90vw,900px)] max-h-[80vh] rounded-lg border border-slate-700 bg-slate-900/95 shadow-xl">
        <header className="flex items-center justify-between border-b border-slate-700 px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
            {loading ? (
              <p className="text-xs text-slate-400">読み込み中...</p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="検索 (key / value)"
              className="h-8 rounded border border-slate-700 bg-slate-800 px-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
            />
            <button
              onClick={handleCopy}
              disabled={!data}
              className="h-8 rounded border border-slate-600 px-3 text-xs font-semibold text-slate-100 transition hover:border-sky-500 hover:text-sky-300 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500"
            >
              Copy
            </button>
            {copied ? (
              <span className="text-[11px] text-emerald-400">copied</span>
            ) : null}
            <button
              onClick={onClose}
              className="h-8 rounded border border-slate-600 px-3 text-xs font-semibold text-slate-100 transition hover:border-rose-500 hover:text-rose-300"
            >
              Close
            </button>
          </div>
        </header>
        <div className="max-h-[60vh] overflow-auto px-5 py-4 text-sm">
          {error ? (
            <p className="text-xs text-rose-400">取得エラー: {error}</p>
          ) : data ? (
            <JsonTree data={data} query={query} />
          ) : (
            <p className="text-xs text-slate-400">
              表示できる設定がありません。
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
