export function formatCount(n: number | null | undefined): string {
  if (n == null) return "-";
  if (n >= 100_000_000) return (n / 100_000_000).toFixed(1).replace(/\.0$/, "") + "억";
  if (n >= 10_000) return (n / 10_000).toFixed(1).replace(/\.0$/, "") + "만";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "천";
  return n.toLocaleString("ko-KR");
}

export function formatDuration(s: number | null | undefined): string {
  if (s == null) return "";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

export function formatRelativeDate(iso: string | null | undefined): string {
  const days = daysSince(iso);
  if (days == null) return "";
  if (days < 1) return "오늘";
  if (days < 7) return `${days}일 전`;
  if (days < 30) return `${Math.floor(days / 7)}주 전`;
  if (days < 365) return `${Math.floor(days / 30)}개월 전`;
  return `${Math.floor(days / 365)}년 전`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function viewsPerDay(views: number | null | undefined, uploadDate: string | null | undefined): number | null {
  const d = daysSince(uploadDate);
  if (views == null) return null;
  if (d == null || d === 0) return views;
  return views / d;
}
