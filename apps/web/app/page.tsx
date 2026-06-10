import UploadBox from "@/components/UploadBox";

export default function HomePage() {
  return (
    <main className="min-h-[calc(100vh-3rem)] flex flex-col items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-xl space-y-5">
        <div className="text-center space-y-1.5">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Book Editor</h1>
          <p className="text-gray-500 text-sm sm:text-base">Upload a Burmese book and get a corrected version with typos, spacing, and formatting fixed.</p>
        </div>
        <UploadBox />
      </div>
    </main>
  );
}
