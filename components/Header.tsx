"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { buildApiUrl } from "@/lib/api";
import { CenterConfigModal } from "./CenterConfigModal";

interface CenterSummary {
  id: string;
  displayName: string;
}

export default function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const [centers, setCenters] = useState<CenterSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectValue, setSelectValue] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  const currentCenterFromPath = useMemo(() => {
    if (!pathname) return "";
    const match = pathname.match(/^\/center\/([^/]+)/);
    return match ? decodeURIComponent(match[1]) : "";
  }, [pathname]);

  useEffect(() => {
    setSelectValue(currentCenterFromPath);
  }, [currentCenterFromPath]);

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

  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    setSelectValue(value);
    if (!value) {
      router.push("/");
    } else {
      router.push(`/center/${encodeURIComponent(value)}`);
    }
  };

  const activeCenterId = selectValue || currentCenterFromPath || null;

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-lg font-semibold text-slate-100 hover:text-sky-300"
            >
              uruno_ocr_demo
            </Link>
            <span className="text-[11px] uppercase tracking-wide text-slate-500">
              Frontend (Next.js)
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-slate-400">
              <span>センター</span>
              <select
                value={selectValue}
                onChange={handleChange}
                className="h-9 min-w-[160px] rounded border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
              >
                <option value="">選択してください</option>
                {centers.map((center) => (
                  <option
                    key={center.id}
                    value={center.id}
                    className="text-slate-900"
                  >
                    {center.displayName}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              disabled={!activeCenterId}
              className="flex h-9 w-9 items-center justify-center rounded border border-slate-700 text-lg text-slate-100 transition hover:border-sky-500 hover:text-sky-300 disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-600"
              title="センター設定を表示"
            >
              ≡
            </button>
            {loading ? (
              <span className="text-[11px] text-slate-500">読み込み中...</span>
            ) : null}
            {error ? (
              <span className="text-[11px] text-rose-400">{error}</span>
            ) : null}
          </div>
        </div>
      </header>
      <CenterConfigModal
        centerId={activeCenterId}
        isOpen={modalOpen && Boolean(activeCenterId)}
        onClose={() => setModalOpen(false)}
      />
    </>
  );
}
