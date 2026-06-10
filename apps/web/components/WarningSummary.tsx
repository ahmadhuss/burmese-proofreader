import { WarningSummary as WarningSummaryType } from "@/lib/api";

interface Props {
  summary: WarningSummaryType;
}

const SEVERITY_COLOR: Record<string, string> = {
  none: "text-green-600",
  low: "text-yellow-600",
  medium: "text-orange-600",
  high: "text-red-600"
};

function WarningRow({ label, data }: { label: string; data: WarningSummaryType["political"] }) {
  const color = SEVERITY_COLOR[data.severity] ?? "text-gray-600";
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className={data.found ? "text-red-500" : "text-green-500"}>{data.found ? "⚠" : "✓"}</span>
        <span className="font-medium text-gray-700">{label}</span>
        {data.found && <span className={`text-xs font-semibold uppercase ${color}`}>{data.severity}</span>}
      </div>
      {data.notes?.length > 0 && (
        <ul className="ml-6 text-sm text-gray-500 list-disc space-y-0.5">
          {data.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function WarningSummary({ summary }: Props) {
  const hasWarnings = summary.political.found || summary.adultSexual.found || summary.bl.found;

  if (!hasWarnings) {
    return <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-green-700 text-sm font-medium">✓ No content warnings detected</div>;
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 space-y-3">
      <h3 className="font-semibold text-amber-800">Content Warning</h3>
      <WarningRow label="Political content" data={summary.political} />
      <WarningRow label="18+ Sexual content" data={summary.adultSexual} />
      <WarningRow label="BL / Boys Love content" data={summary.bl} />
    </div>
  );
}
