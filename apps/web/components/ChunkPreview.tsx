"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { getJobPreview } from "@/lib/api";
import { chunkTextWithHeading } from "@/lib/chunks";
import ChunkBlock from "@/components/ChunkBlock";

const DONE_STATUSES = ["COMPLETED", "PARTIALLY_COMPLETED", "FAILED"];

interface Props {
  jobId: string;
}

export default function ChunkPreview({ jobId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const prevChunkCount = useRef(0);
  const [autoScroll, setAutoScroll] = useState(true);
  const [copied, setCopied] = useState(false);
  const [visible, setVisible] = useState(false);

  const { data } = useQuery({
    queryKey: ["preview", jobId],
    queryFn: () => getJobPreview(jobId),
    refetchInterval: query => {
      const status = query.state.data?.status;
      return status && DONE_STATUSES.includes(status) ? false : 3000;
    }
  });

  const chunks = data?.chunks ?? [];
  const isDone = data ? DONE_STATUSES.includes(data.status) : false;
  const total = data?.totalChunks ?? 0;

  useEffect(() => {
    if (chunks.length > 0 && !visible) setVisible(true);
  }, [chunks.length, visible]);

  useEffect(() => {
    if (chunks.length > prevChunkCount.current && autoScroll) {
      setTimeout(() => {
        containerRef.current?.scrollTo({ top: containerRef.current.scrollHeight, behavior: "smooth" });
      }, 100);
    }
    prevChunkCount.current = chunks.length;
  }, [chunks.length, autoScroll]);

  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 120);
  }, []);

  function copyAll() {
    const text = chunks
      .map(chunkTextWithHeading)
      .join("\n\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!visible) {
    return (
      <div className="flex flex-col items-center justify-center min-h-48 sm:min-h-64 rounded-2xl border-2 border-dashed border-gray-200 text-gray-300 gap-3">
        <span className="text-3xl sm:text-4xl">📄</span>
        <p className="text-sm text-center px-4">Corrected text will appear here as chunks complete</p>
      </div>
    );
  }

  return (
    <div className="animate-slide-in-right flex flex-col rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 border-b border-gray-100 bg-gray-50 shrink-0">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <span className="text-sm font-semibold text-gray-700 shrink-0">Corrected Text</span>
          <span className="text-xs font-medium text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full shrink-0">
            {chunks.length}
            {total > 0 ? `/${total}` : ""} chunks
          </span>
          {isDone ? (
            <span className="text-xs font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-full shrink-0">✓ Done</span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-blue-500 shrink-0">
              <span className="animate-spin">⟳</span>
              <span className="hidden sm:inline">Live</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {!autoScroll && (
            <button
              onClick={() => {
                setAutoScroll(true);
                containerRef.current?.scrollTo({ top: containerRef.current.scrollHeight, behavior: "smooth" });
              }}
              className="text-xs text-blue-500 hover:text-blue-700 px-2 py-1 rounded hover:bg-blue-50 transition"
            >
              ↓
            </button>
          )}
          <button onClick={copyAll} className="text-xs text-gray-500 hover:text-gray-800 px-2 sm:px-3 py-1.5 rounded-lg hover:bg-gray-100 transition font-medium">
            {copied ? "✓" : "Copy"}
          </button>
        </div>
      </div>

      {/* Content */}
      <div ref={containerRef} onScroll={handleScroll} className="overflow-y-auto overflow-x-hidden px-4 sm:px-8 py-4 sm:py-6 space-y-6" style={{ maxHeight: "60vh" }}>
        {chunks.map((chunk, i) => (
          <ChunkBlock key={chunk.chunkIndex} chunk={chunk} index={i} animated />
        ))}

        {!isDone && chunks.length > 0 && (
          <div className="flex items-center gap-2 py-4 text-gray-400 text-sm animate-pulse">
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" />
            <span>Processing next chunk…</span>
          </div>
        )}

        <div className="h-4" />
      </div>
    </div>
  );
}
