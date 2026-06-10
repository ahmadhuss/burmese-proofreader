"use client";

import { fileUrl, JobResult, retryJob } from "@/lib/api";
import WarningSummary from "./WarningSummary";
import { useState } from "react";

interface Props {
  jobId: string;
  result: JobResult;
}

export default function ResultDownload({ jobId, result }: Props) {
  const [retrying, setRetrying] = useState(false);
  const [retryMsg, setRetryMsg] = useState<string | null>(null);

  async function handleRetry() {
    setRetrying(true);
    try {
      await retryJob(jobId);
      setRetryMsg("Retry started. Redirecting to progress page…");
      setTimeout(() => window.location.replace(`/jobs/${jobId}`), 1500);
    } catch {
      setRetryMsg("Retry failed. Please try again.");
      setRetrying(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-green-800 font-medium">
        {result.status === "PARTIALLY_COMPLETED" ? "⚠ Processing completed with some errors — partial output available" : "✓ Book successfully corrected!"}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <a
          href={fileUrl(result.outputTxtUrl)}
          download
          className="flex items-center gap-3 sm:flex-col sm:items-center bg-white border border-gray-200 rounded-xl p-4 sm:p-5 hover:border-blue-400 hover:shadow transition"
        >
          <span className="text-3xl">📄</span>
          <div className="sm:text-center">
            <p className="font-semibold text-gray-700 text-sm">Download .txt</p>
            <p className="text-xs text-gray-400">Plain text</p>
          </div>
        </a>
        <a
          href={fileUrl(result.outputDocxUrl)}
          download
          className="flex items-center gap-3 sm:flex-col sm:items-center bg-white border border-gray-200 rounded-xl p-4 sm:p-5 hover:border-blue-400 hover:shadow transition"
        >
          <span className="text-3xl">📝</span>
          <div className="sm:text-center">
            <p className="font-semibold text-gray-700 text-sm">Download .docx</p>
            <p className="text-xs text-gray-400">Word document</p>
          </div>
        </a>
      </div>

      <WarningSummary summary={result.warningSummary} />

      {result.status === "PARTIALLY_COMPLETED" && (
        <div className="space-y-2">
          <button
            onClick={handleRetry}
            disabled={retrying}
            className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-xl transition disabled:opacity-60"
          >
            {retrying ? "Starting retry…" : "Retry Failed Chunks"}
          </button>
          {retryMsg && <p className="text-sm text-center text-gray-500">{retryMsg}</p>}
        </div>
      )}

      <a href="/" className="block text-center text-sm text-blue-500 hover:underline">
        ← Upload another book
      </a>
    </div>
  );
}
