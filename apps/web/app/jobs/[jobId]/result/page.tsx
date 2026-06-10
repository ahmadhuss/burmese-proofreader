import { getJobResult } from "@/lib/api";
import ResultDownload from "@/components/ResultDownload";

interface Props {
  params: Promise<{ jobId: string }>;
}

export default async function ResultPage({ params }: Props) {
  const { jobId } = await params;

  let result;
  try {
    result = await getJobResult(jobId);
  } catch {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-xl text-center space-y-4">
          <p className="text-red-600 font-medium">Result not available yet.</p>
          <a href={`/jobs/${jobId}`} className="text-blue-500 hover:underline text-sm">
            ← Back to progress
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-xl space-y-4">
        <div className="text-center space-y-1">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Your Corrected Book</h1>
          <p className="text-xs sm:text-sm text-gray-400 truncate px-4">{jobId}</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-6">
          <ResultDownload jobId={jobId} result={result} />
        </div>
      </div>
    </main>
  );
}
