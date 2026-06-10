"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getJobPreview, getJobStatus, getJobResult, fileUrl, WarningSummary as WarningSummaryType } from "@/lib/api";
import { chunkTextWithHeading } from "@/lib/chunks";
import { useState, useRef } from "react";
import ChunkBlock from "@/components/ChunkBlock";
import WarningSummary from "@/components/WarningSummary";

export default function SessionDetailPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: preview, isLoading: loadingPreview } = useQuery({
    queryKey: ["preview", jobId],
    queryFn: () => getJobPreview(jobId),
    staleTime: Infinity
  });

  const { data: status } = useQuery({
    queryKey: ["status", jobId],
    queryFn: () => getJobStatus(jobId),
    staleTime: Infinity
  });

  const { data: result } = useQuery({
    queryKey: ["result", jobId],
    queryFn: () => getJobResult(jobId),
    staleTime: Infinity
  });

  const chunks = preview?.chunks ?? [];
  const warn = result?.warningSummary as WarningSummaryType | undefined;

  function copyAll() {
    const text = chunks
      .map(chunkTextWithHeading)
      .join("\n\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-5 sm:py-8 space-y-5 pb-24">
      {/* Back + header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <button onClick={() => router.back()} className="text-sm text-gray-400 hover:text-gray-700 transition mb-2 flex items-center gap-1">
            ← Back
          </button>
          <h1 className="text-xl font-bold text-gray-900 break-all">{status?.fileName ?? "Session"}</h1>
          {status && (
            <p className="text-xs text-gray-400 mt-1">
              {status.modelName} · {status.completedChunks}/{status.totalChunks} chunks
            </p>
          )}
        </div>

        {/* Download buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={copyAll} className="text-xs sm:text-sm px-2.5 sm:px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition">
            {copied ? "✓ Copied" : "Copy all"}
          </button>
          {result && (
            <>
              <a
                href={fileUrl(result.outputTxtUrl)}
                download
                className="text-xs sm:text-sm px-2.5 sm:px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition"
              >
                .txt
              </a>
              <a href={fileUrl(result.outputDocxUrl)} download className="text-xs sm:text-sm px-2.5 sm:px-3 py-1.5 rounded-lg bg-gray-900 text-white hover:bg-gray-700 transition">
                .docx
              </a>
            </>
          )}
        </div>
      </div>

      {/* Warnings */}
      {warn && <WarningSummary summary={warn} />}

      {/* Content */}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-gray-100 bg-gray-50">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-gray-700">Corrected Text</span>
            <span className="text-xs font-medium text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full">{chunks.length} chunks</span>
            <span className="text-xs font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">✓ Complete</span>
          </div>
          <button onClick={() => containerRef.current?.scrollTo({ top: 0, behavior: "smooth" })} className="text-xs text-gray-400 hover:text-gray-700 transition">
            ↑ Top
          </button>
        </div>

        {/* Text body */}
        <div ref={containerRef} className="px-4 sm:px-8 py-5 sm:py-8 space-y-6 overflow-y-auto overflow-x-hidden" style={{ maxHeight: "calc(100vh - 240px)" }}>
          {loadingPreview && <p className="text-gray-400 text-sm text-center py-12">Loading…</p>}

          {!loadingPreview && chunks.length === 0 && <p className="text-gray-400 text-sm text-center py-12">No content available.</p>}

          {chunks.map((chunk, i) => (
            <ChunkBlock key={chunk.chunkIndex} chunk={chunk} index={i} />
          ))}

          <div className="h-4" />
        </div>
      </div>
    </div>
  );
}
