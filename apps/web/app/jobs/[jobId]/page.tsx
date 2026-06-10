import JobProgress from "@/components/JobProgress";
import ChunkPreview from "@/components/ChunkPreview";
import ResizableLayout from "@/components/ResizableLayout";

interface Props {
  params: Promise<{ jobId: string }>;
}

export default async function JobPage({ params }: Props) {
  const { jobId } = await params;

  return (
    <main className="min-h-screen flex flex-col p-3 sm:p-6 gap-4">
      <div className="text-center space-y-1">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Processing Your Book</h1>
        <p className="text-xs text-gray-400 font-mono truncate px-4">{jobId}</p>
      </div>

      <ResizableLayout
        defaultLeftWidth={320}
        minLeft={240}
        minRight={400}
        left={
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-5">
            <JobProgress jobId={jobId} />
          </div>
        }
        right={<ChunkPreview jobId={jobId} />}
      />
    </main>
  );
}
