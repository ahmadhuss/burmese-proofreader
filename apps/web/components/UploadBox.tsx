"use client";

import { useRef, useState, DragEvent, ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { uploadBook } from "@/lib/api";

const ALLOWED = [".docx", ".pdf", ".txt"];

export default function UploadBox() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    if (!ALLOWED.includes(ext)) {
      setError(`Unsupported file type. Allowed: ${ALLOWED.join(", ")}`);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const { jobId } = await uploadBook(file);
      router.push(`/jobs/${jobId}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setLoading(false);
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  return (
    <div
      onDragOver={e => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onClick={() => !loading && inputRef.current?.click()}
      className={`
        border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center cursor-pointer transition-colors
        ${dragging ? "border-blue-500 bg-blue-50" : "border-gray-300 hover:border-blue-400 hover:bg-gray-50"}
        ${loading ? "opacity-60 cursor-not-allowed" : ""}
      `}
    >
      <input ref={inputRef} type="file" accept={ALLOWED.join(",")} className="hidden" onChange={onChange} disabled={loading} />

      <div className="flex flex-col items-center gap-3">
        <div className="text-4xl sm:text-5xl">{loading ? "⏳" : "📄"}</div>
        {loading ? (
          <p className="text-gray-600 font-medium">Uploading…</p>
        ) : (
          <>
            <p className="text-gray-700 font-semibold text-base sm:text-lg">Drop your book here or tap to browse</p>
            <p className="text-gray-400 text-sm">Supported: .docx, .pdf, .txt — up to 100 MB</p>
          </>
        )}
      </div>

      {error && <p className="mt-4 text-red-600 text-sm font-medium">{error}</p>}
    </div>
  );
}
