/** School-local calendar dates ("2026-12-08"), the same convention as packages/rules. Asia/Dubai, no DST. */
const OFFSET_MIN = 240;
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function today(now = new Date()): string {
  return new Date(now.getTime() + OFFSET_MIN * 60_000).toISOString().slice(0, 10);
}
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
export function isoWeekday(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return wd === 0 ? 7 : wd;
}
export function mondayOf(date: string): string {
  return addDays(date, 1 - isoWeekday(date));
}
/** The school week to show: this week, or next week from Saturday. */
export function schoolWeek(date: string): string[] {
  const mon = mondayOf(isoWeekday(date) > 5 ? addDays(date, 2) : date);
  return [0, 1, 2, 3, 4].map((i) => addDays(mon, i));
}
export function fmtShort(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${DAYS[isoWeekday(date) - 1]} ${d} ${MONTHS[m - 1]}`;
}
export function dayName(date: string): string {
  return DAYS[isoWeekday(date) - 1];
}
