"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AddVideoForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "알 수 없는 오류");
      } else {
        setUrl("");
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="YouTube 영상 URL을 붙여넣고 엔터 (예: https://youtu.be/xxxxx)"
          className="flex-1 rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] px-4 py-3 text-sm outline-none focus:border-[color:var(--accent)]"
          disabled={busy}
        />
        <button
          type="submit"
          disabled={busy || !url.trim()}
          className="btn-primary px-5 py-3 text-sm disabled:opacity-50"
        >
          {busy ? "가져오는 중..." : "추가"}
        </button>
      </div>
      {error && <p className="text-sm text-[color:var(--danger)]">{error}</p>}
    </form>
  );
}
