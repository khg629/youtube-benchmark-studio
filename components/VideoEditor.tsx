"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function VideoEditor({
  videoId,
  initialNote,
  initialTags,
}: {
  videoId: string;
  initialNote: string;
  initialTags: string[];
}) {
  const router = useRouter();
  const [note, setNote] = useState(initialNote);
  const [tagsInput, setTagsInput] = useState(initialTags.join(", "));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const tags = tagsInput
        .split(/[,\s]+/)
        .map((t) => t.trim())
        .filter(Boolean);
      await fetch(`/api/videos/${videoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note, tags }),
      });
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm("이 영상을 벤치마킹 목록에서 삭제할까요?")) return;
    setDeleting(true);
    try {
      await fetch(`/api/videos/${videoId}`, { method: "DELETE" });
      router.push("/");
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] p-4">
      <div>
        <label className="mb-1 block text-xs text-[color:var(--muted)]">내 메모</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          placeholder="이 영상에서 가져갈 포인트, 느낀 점 등"
          className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2 text-sm outline-none focus:border-[color:var(--accent)]"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-[color:var(--muted)]">
          내 태그 (쉼표로 구분, 예: 훅, 브이로그)
        </label>
        <input
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2 text-sm outline-none focus:border-[color:var(--accent)]"
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="btn-primary px-4 py-2 text-sm"
        >
          {saving ? "저장 중..." : "저장"}
        </button>
        <button
          onClick={remove}
          disabled={deleting}
          className="ml-auto rounded-md border border-red-900/40 px-4 py-2 text-sm text-red-400 hover:bg-red-950/40 disabled:opacity-50"
        >
          {deleting ? "삭제 중..." : "목록에서 삭제"}
        </button>
      </div>
    </div>
  );
}
