import { type TimeRange } from "@/lib/timeRange";
import { cn } from "@/lib/utils";

interface TimeRangeFilterProps {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
}

const OPTIONS: { label: string; value: TimeRange }[] = [
  { label: "Live", value: "live" },
  { label: "Today", value: "today" },
  { label: "Yesterday", value: "yesterday" },
  { label: "7 Days", value: "7days" },
];

export function TimeRangeFilter({ value, onChange }: TimeRangeFilterProps) {
  return (
    <div className="flex items-center gap-1 rounded-md border border-border bg-card p-0.5">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "flex items-center gap-1.5 rounded px-3 py-1 text-xs font-medium transition-colors",
            value === opt.value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {opt.value === "live" && (
            <span
              className={cn(
                "inline-block h-1.5 w-1.5 rounded-full",
                value === "live" ? "bg-green-400 animate-pulse" : "bg-muted-foreground",
              )}
            />
          )}
          {opt.label}
        </button>
      ))}
    </div>
  );
}
