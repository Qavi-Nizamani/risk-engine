export type TimeRange = "live" | "today" | "yesterday" | "7days";

/** Returns ISO string bounds { from, to } for a given range, or undefined for "live" (no filter). */
export function timeRangeBounds(range: TimeRange): { from: string; to: string } | undefined {
  if (range === "live") return undefined;

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  if (range === "today") {
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);
    return { from: todayStart.toISOString(), to: todayEnd.toISOString() };
  }

  if (range === "yesterday") {
    const yStart = new Date(todayStart);
    yStart.setDate(yStart.getDate() - 1);
    const yEnd = new Date(yStart);
    yEnd.setHours(23, 59, 59, 999);
    return { from: yStart.toISOString(), to: yEnd.toISOString() };
  }

  // 7days
  const sevenAgo = new Date(todayStart);
  sevenAgo.setDate(sevenAgo.getDate() - 6);
  return { from: sevenAgo.toISOString(), to: new Date(now).toISOString() };
}
