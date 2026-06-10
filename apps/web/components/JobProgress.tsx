"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getJobStatus, LogEntry } from "@/lib/api";

const DONE_STATUSES = ["COMPLETED", "PARTIALLY_COMPLETED", "FAILED"];

const STATUS_LABELS: Record<string, string> = {
  UPLOADED: "File uploaded",
  EXTRACTING: "Extracting text…",
  SPLITTING: "Splitting chapters…",
  PROCESSING: "Processing chunks…",
  GENERATING_OUTPUT: "Generating final files…",
  COMPLETED: "Completed",
  PARTIALLY_COMPLETED: "Completed with some errors",
  FAILED: "Processing failed"
};

const LOG_COLORS: Record<string, string> = {
  info: "text-green-400",
  warn: "text-yellow-400",
  error: "text-red-400"
};

function formatTime(ts: string) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function LogPanel({ logs }: { logs: LogEntry[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs.length]);

  return (
    <div className="bg-gray-950 rounded-xl border border-gray-800 flex flex-col">
      <div className="px-3 py-2 border-b border-gray-800 flex items-center gap-2 shrink-0">
        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        <span className="text-gray-400 text-xs font-mono uppercase tracking-wider">Log</span>
      </div>
      <div className="overflow-y-auto p-3 space-y-1 font-mono text-xs" style={{ maxHeight: "220px" }}>
        {logs.length === 0 ? (
          <p className="text-gray-600 italic">Waiting for logs…</p>
        ) : (
          logs.map((entry, i) => (
            <div key={i} className="flex gap-2 leading-relaxed">
              <span className="text-gray-600 shrink-0">{formatTime(entry.ts)}</span>
              <span className={LOG_COLORS[entry.level] ?? "text-gray-300"}>{entry.msg}</span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

export default function JobProgress({ jobId }: { jobId: string }) {
  const router = useRouter();

  const { data, error } = useQuery({
    queryKey: ["job", jobId],
    queryFn: () => getJobStatus(jobId),
    refetchInterval: query => {
      const status = query.state.data?.status;
      return status && DONE_STATUSES.includes(status) ? false : 3000;
    }
  });

  useEffect(() => {
    if (data?.status === "COMPLETED" || data?.status === "PARTIALLY_COMPLETED") {
      router.push(`/jobs/${jobId}/result`);
    }
  }, [data?.status, jobId, router]);

  if (error) return <p className="text-red-600 text-sm">Failed to load job status.</p>;
  if (!data) return <p className="text-gray-500 text-sm">Loading…</p>;

  const label = STATUS_LABELS[data.status] ?? data.status;
  const isFailed = data.status === "FAILED";
  const isDone = DONE_STATUSES.includes(data.status);

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className={`font-semibold text-sm sm:text-base ${isFailed ? "text-red-600" : "text-gray-800"}`}>{label}</span>
          {!isDone && <span className="animate-spin text-blue-500 text-sm">⟳</span>}
        </div>

        {data.totalChunks > 0 && (
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-gray-500">
              <span>
                Chunk {data.completedChunks} / {data.totalChunks}
              </span>
              <span>{data.progressPercent}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
              <div className="h-2 rounded-full transition-all duration-500 bg-blue-500" style={{ width: `${data.progressPercent}%` }} />
            </div>
            {data.failedChunks > 0 && <p className="text-xs text-amber-600">{data.failedChunks} chunk(s) failed</p>}
          </div>
        )}

        <div className="flex flex-col gap-1 text-xs text-gray-400">
          <span className="truncate">📄 {data.fileName}</span>
          {data.modelName && <span>🤖 {data.modelName}</span>}
        </div>

        {isFailed && data.errorMessage && <p className="text-xs text-red-500 bg-red-50 p-2 rounded-lg break-words">{data.errorMessage}</p>}
      </div>

      <LogPanel logs={data.processingLog ?? []} />
    </div>
  );
}
