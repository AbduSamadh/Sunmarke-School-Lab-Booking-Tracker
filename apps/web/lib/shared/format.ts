const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAYS_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parts(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return { y, m, d, wd: wd === 0 ? 6 : wd - 1 };
}

/** "Tue 8 Dec" */
export function fmtDateShort(date: string) {
  const p = parts(date);
  return `${DAYS[p.wd]} ${p.d} ${MONTHS[p.m - 1]}`;
}

/** "Tuesday 8 Dec" */
export function fmtDateLong(date: string) {
  const p = parts(date);
  return `${DAYS_LONG[p.wd]} ${p.d} ${MONTHS[p.m - 1]}`;
}

export function dayName(date: string) {
  return DAYS[parts(date).wd];
}

export function dayNum(date: string) {
  return parts(date).d;
}

export function monthName(date: string) {
  return MONTHS[parts(date).m - 1];
}
