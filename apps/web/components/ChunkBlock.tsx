import { PreviewChunk } from "@/lib/api";
import { chunkBodyText } from "@/lib/chunks";

interface Props {
  chunk: PreviewChunk;
  index: number;
  animated?: boolean;
}

export default function ChunkBlock({ chunk, index, animated = false }: Props) {
  const paragraphs = chunkBodyText(chunk)
    .split(/\n{2,}/)
    .filter(Boolean);

  return (
    <div className={animated ? "animate-fade-slide-in" : undefined} style={animated ? { animationDelay: `${index * 40}ms` } : undefined}>
      {index > 0 && <hr className="border-gray-100 mb-6" />}
      {chunk.chapterTitle && <h2 className="text-xl font-bold text-gray-900 mb-4 leading-snug">{chunk.chapterTitle}</h2>}
      <div className="space-y-3">
        {paragraphs.map((para, i) => (
          <p key={i} className="text-gray-800 leading-8 text-[15px] break-words overflow-wrap-anywhere">
            {para.trim()}
          </p>
        ))}
      </div>
    </div>
  );
}
