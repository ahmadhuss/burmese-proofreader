function normalizeApiBase(value: string): string {
  return value.replace(/\/+$/, "").replace(/\/api$/i, "");
}

const BASE = normalizeApiBase(
  typeof window === "undefined"
    ? process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5556"
    : process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5556"
);

export interface LogEntry {
  ts: string;
  msg: string;
  level: "info" | "warn" | "error";
}

export interface JobStatus {
  id: string;
  status: string;
  fileName: string;
  modelName: string;
  totalChunks: number;
  completedChunks: number;
  failedChunks: number;
  progressPercent: number;
  errorMessage: string | null;
  processingLog: LogEntry[];
}

export interface WarningSummary {
  political: { found: boolean; severity: string; notes: string[] };
  adultSexual: { found: boolean; severity: string; notes: string[] };
  bl: { found: boolean; severity: string; notes: string[] };
}

export interface JobResult {
  status: string;
  outputTxtUrl: string;
  outputDocxUrl: string;
  warningSummary: WarningSummary;
}

export interface JobSummary {
  id: string;
  fileName: string;
  fileType: string | null;
  status: string;
  modelName: string;
  totalChunks: number;
  completedChunks: number;
  failedChunks: number;
  warningSummary: WarningSummary | null;
  createdAt: string;
  updatedAt: string;
}

export async function getJobs(): Promise<JobSummary[]> {
  const res = await fetch(`${BASE}/api/jobs`);
  if (!res.ok) throw new Error("Failed to fetch jobs");
  const data = await res.json();
  return data.jobs;
}

export interface PreviewChunk {
  chunkIndex: number;
  chapterTitle: string | null;
  correctedText: string | null;
}

export interface JobPreview {
  status: string;
  totalChunks: number;
  completedChunks: number;
  chunks: PreviewChunk[];
}

export async function getJobPreview(jobId: string): Promise<JobPreview> {
  const res = await fetch(`${BASE}/api/jobs/${jobId}/preview`);
  if (!res.ok) throw new Error("Failed to fetch preview");
  return res.json();
}

export async function uploadBook(file: File): Promise<{ jobId: string; status: string }> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${BASE}/api/upload`, { method: "POST", body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Upload failed" }));
    throw new Error(err.error || "Upload failed");
  }
  return res.json();
}

export async function getJobStatus(jobId: string): Promise<JobStatus> {
  const res = await fetch(`${BASE}/api/jobs/${jobId}`);
  if (!res.ok) throw new Error("Failed to fetch job status");
  return res.json();
}

export async function getJobResult(jobId: string): Promise<JobResult> {
  const res = await fetch(`${BASE}/api/jobs/${jobId}/result`);
  if (!res.ok) throw new Error("Job result not available");
  return res.json();
}

export async function retryJob(jobId: string): Promise<void> {
  const res = await fetch(`${BASE}/api/jobs/${jobId}/retry`, { method: "POST" });
  if (!res.ok) throw new Error("Retry failed");
}

export async function clearAllData(): Promise<void> {
  const res = await fetch(`${BASE}/api/jobs`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to clear data");
}

export function fileUrl(path: string): string {
  return `${BASE}${path}`;
}
