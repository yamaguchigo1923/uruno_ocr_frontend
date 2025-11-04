"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { buildApiUrl } from "@/lib/api";

interface CenterSummary {
  id: string;
  displayName: string;
}

export default function Home() {
  const [centers, setCenters] = useState<CenterSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch(buildApiUrl("/centers/list"));
        if (!active) return;
        if (!res.ok) {
          throw new Error(`${res.status} ${res.statusText}`);
        }
        const json = (await res.json()) as { centers?: CenterSummary[] };
        setCenters(json.centers ?? []);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10">
      <section className="space-y-3">
        <h1 className="text-2xl font-semibold text-slate-100">
          センター別ページ一覧
        </h1>
        <p className="text-sm text-slate-400">
          バックエンド({" "}
          <code className="rounded bg-slate-900 px-1 py-0.5 text-xs text-sky-300">
            FastAPI
          </code>
          )と連携し、センター毎のOCR解析フローにアクセスできます。
        </p>
      </section>
      <section className="rounded-lg border border-slate-800 bg-slate-900/50 p-6">
        {loading ? (
          <p className="text-sm text-slate-400">読み込み中...</p>
        ) : null}
        {error ? (
          <p className="text-sm text-rose-400">取得に失敗しました: {error}</p>
        ) : null}
        {!loading && !error && centers.length === 0 ? (
          <p className="text-sm text-slate-400">センター定義がありません。</p>
        ) : null}
        <ul className="grid gap-3 sm:grid-cols-2">
          {centers.map((center) => (
            <li
              key={center.id}
              className="rounded border border-slate-800/70 bg-slate-950/60 p-4 shadow-sm transition hover:border-sky-500/70 hover:shadow-lg"
            >
              <h2 className="text-base font-semibold text-slate-100">
                {center.displayName}
              </h2>
              <p className="mb-3 text-xs text-slate-500">ID: {center.id}</p>
              <Link
                href={`/center/${encodeURIComponent(center.id)}`}
                className="inline-flex items-center gap-2 text-sm font-medium text-sky-300 hover:text-sky-200"
              >
                ページへ移動
                <span aria-hidden="true">→</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section className="rounded-lg border border-slate-800 bg-slate-900/50 p-6 text-sm text-slate-400">
        <h2 className="mb-2 text-base font-semibold text-slate-100">
          利用手順
        </h2>
        <ol className="list-decimal space-y-1 pl-4 text-xs text-slate-400">
          <li>
            ヘッダーのセンター選択、または上記一覧からセンターページを開きます。
          </li>
          <li>
            参照ExcelとOCR対象ファイルをアップロードし、解析を開始します。
          </li>
          <li>
            計算結果を確認し、必要に応じてスプレッドシート出力を実行します。
          </li>
        </ol>
      </section>
    </div>
  );
}
