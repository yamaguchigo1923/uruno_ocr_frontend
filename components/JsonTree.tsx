"use client";

import { useMemo } from "react";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

function isRecord(value: JsonValue): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPrimitive(value: JsonValue): value is JsonPrimitive {
  return typeof value !== "object" || value === null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) {
    return <>{text}</>;
  }
  const parts = text.split(new RegExp(`(${escapeRegExp(query)})`, "gi"));
  return (
    <>
      {parts.map((part, index) => (
        <span
          key={`${part}-${index}`}
          className={
            part.toLowerCase() === query.toLowerCase()
              ? "bg-amber-400/40 text-amber-100"
              : undefined
          }
        >
          {part}
        </span>
      ))}
    </>
  );
}

interface NodeProps {
  label?: string;
  value: JsonValue;
  query: string;
  depth: number;
}

function JsonNode({ label, value, query, depth }: NodeProps) {
  if (isPrimitive(value)) {
    const renderedValue =
      value === null
        ? "null"
        : typeof value === "string"
        ? `"${value}"`
        : String(value);
    return (
      <li className="py-0.5">
        <span className="font-mono text-xs text-sky-200">
          {label ? <Highlight text={`${label}: `} query={query} /> : null}
        </span>
        <span className="font-mono text-xs text-slate-100">
          <Highlight text={renderedValue} query={query} />
        </span>
      </li>
    );
  }

  const entries = Array.isArray(value)
    ? value.map((item, index) => [String(index), item] as [string, JsonValue])
    : Object.entries(value);

  const summary = label
    ? `${label} ${Array.isArray(value) ? "[ ]" : "{ }"}`
    : Array.isArray(value)
    ? "[ ]"
    : "{ }";

  const defaultOpen = depth < 2 || query.length > 0;

  return (
    <li className="py-0.5">
      <details
        className="rounded border border-slate-700/60 bg-slate-900/40 px-2 py-1"
        open={defaultOpen}
      >
        <summary className="cursor-pointer font-mono text-xs text-slate-200">
          <Highlight text={summary} query={query} />
        </summary>
        <ul className="ml-3 border-l border-slate-800/60 pl-3">
          {entries.map(([key, child]) => (
            <JsonNode
              key={key}
              label={key}
              value={child}
              query={query}
              depth={depth + 1}
            />
          ))}
        </ul>
      </details>
    </li>
  );
}

export interface JsonTreeProps {
  data: JsonValue;
  query?: string;
}

export function JsonTree({ data, query = "" }: JsonTreeProps) {
  const tree = useMemo(() => ({ root: data }), [data]);
  return (
    <ul className="space-y-1">
      <JsonNode label="root" value={tree.root} query={query} depth={0} />
    </ul>
  );
}

export type { JsonValue };
