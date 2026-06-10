"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { getJobs, JobSummary, WarningSummary, fileUrl } from "@/lib/api";

const STATUS_STYLE: Record<string, string> = {
  COMPLETED: "bg-green-100 text-green-700",
  PARTIALLY_COMPLETED: "bg-amber-100 text-amber-700",
  FAILED: "bg-red-100 text-red-700",
  PROCESSING: "bg-blue-100 text-blue-700",
  UPLOADING: "bg-gray-100 text-gray-600"
};

const STATUS_LABEL: Record<string, string> = {
  COMPLETED: "Completed",
  PARTIALLY_COMPLETED: "Partial",
  FAILED: "Failed",
  PROCESSING: "Processing",
  EXTRACTING: "Extracting",
  SPLITTING: "Splitting",
  GENERATING_OUTPUT: "Generating",
  UPLOADED: "Queued"
};

function hasWarnings(w: WarningSummary | null) {
  return w && (w.political.found || w.adultSexual.found || w.bl.found);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function SessionRow({ job }: { job: JobSummary }) {
  const done = job.status === "COMPLETED" || job.status === "PARTIALLY_COMPLETED";
  const warn = hasWarnings(job.warningSummary);

  return (
    <div className="bg-white border border-gray-100 rounded-xl px-4 py-3 sm:px-5 sm:py-4 hover:border-gray-200 hover:shadow-sm transition">
      <div className="flex items-start gap-3">
        {/* File icon */}
        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center text-lg sm:text-xl shrink-0 mt-0.5">
          {job.fileType === "pdf" ? "📕" : job.fileType === "txt" ? "📃" : "📘"}
        </div>

        {/* Main info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-gray-800 text-sm truncate max-w-[160px] sm:max-w-none">{job.fileName}</p>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${STATUS_STYLE[job.status] ?? "bg-gray-100 text-gray-600"}`}>
              {STATUS_LABEL[job.status] ?? job.status}
            </span>
            {warn && <span className="text-xs bg-amber-50 text-amber-600 border border-amber-200 px-2 py-0.5 rounded-full shrink-0">⚠</span>}
          </div>
          <div className="flex items-center gap-2 mt-1 text-xs text-gray-400 flex-wrap">
            <span>{formatDate(job.createdAt)}</span>
            <span>·</span>
            <span className="truncate">{job.modelName}</span>
            <span>·</span>
            <span>
              {job.completedChunks}/{job.totalChunks}
            </span>
          </div>

          {/* Actions row */}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {done && (
              <>
                <a
                  href={fileUrl(`/api/files/${job.id}/final.txt`)}
                  download
                  onClick={e => e.stopPropagation()}
                  className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition"
                >
                  .txt
                </a>
                <a
                  href={fileUrl(`/api/files/${job.id}/final.docx`)}
                  download
                  onClick={e => e.stopPropagation()}
                  className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition"
                >
                  .docx
                </a>
              </>
            )}
            {done ? (
              <Link href={`/sessions/${job.id}`} className="text-xs px-3 py-1 rounded-lg bg-gray-900 text-white hover:bg-gray-700 transition font-medium">
                Read
              </Link>
            ) : (
              <Link href={`/jobs/${job.id}`} className="text-xs px-3 py-1 rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50 transition font-medium">
                View
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SessionsPage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["sessions"],
    queryFn: getJobs,
    refetchInterval: 8000
  });

  const jobs = data ?? [];
  const done = jobs.filter(j => j.status === "COMPLETED" || j.status === "PARTIALLY_COMPLETED");
  const active = jobs.filter(j => !["COMPLETED", "PARTIALLY_COMPLETED", "FAILED"].includes(j.status));
  const failed = jobs.filter(j => j.status === "FAILED");

  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-5 pb-24">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Sessions</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {jobs.length} total · {done.length} completed
          </p>
        </div>
        <button onClick={() => refetch()} className="text-sm text-gray-500 hover:text-gray-800 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition">
          Refresh
        </button>
      </div>

      {isLoading && <p className="text-gray-400 text-sm">Loading…</p>}
      {error && <p className="text-red-500 text-sm">Failed to load sessions.</p>}

      {!isLoading && jobs.length === 0 && (
        <div className="text-center py-16 text-gray-300 space-y-3">
          <p className="text-4xl">📚</p>
          <p className="text-sm">No sessions yet. Upload a book to get started.</p>
        </div>
      )}

      {active.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">In Progress</h2>
          {active.map(j => (
            <SessionRow key={j.id} job={j} />
          ))}
        </section>
      )}

      {done.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Completed</h2>
          {done.map(j => (
            <SessionRow key={j.id} job={j} />
          ))}
        </section>
      )}

      {failed.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Failed</h2>
          {failed.map(j => (
            <SessionRow key={j.id} job={j} />
          ))}
        </section>
      )}
    </main>
  );
}
