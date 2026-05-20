"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Channel, ChannelCategory } from "@/lib/types";

type Props = {
  initialChannels: Channel[];
  initialCategories: ChannelCategory[];
};

type Filter = number | "all" | "uncategorized";

export function ChannelManager({ initialChannels, initialCategories }: Props) {
  const router = useRouter();
  const [channels, setChannels] = useState<Channel[]>(initialChannels);
  const [categories, setCategories] = useState<ChannelCategory[]>(initialCategories);
  const [filter, setFilter] = useState<Filter>("all");
  const [refreshing, setRefreshing] = useState(false);

  function refresh() {
    setRefreshing(true);
    router.refresh();
    setTimeout(() => setRefreshing(false), 600);
  }

  const filtered = useMemo(() => {
    if (filter === "all") return channels;
    if (filter === "uncategorized") return channels.filter((c) => c.category_ids.length === 0);
    return channels.filter((c) => c.category_ids.includes(filter));
  }, [channels, filter]);

  const catById = useMemo(() => {
    const m = new Map<number, ChannelCategory>();
    for (const c of categories) m.set(c.id, c);
    return m;
  }, [categories]);

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h1 className="mb-3 text-xl font-semibold">채널 추가</h1>
        <AddChannelForm
          categories={categories}
          onAdded={(ch) => {
            setChannels((prev) => {
              const existing = prev.findIndex((c) => c.id === ch.id);
              if (existing >= 0) {
                const next = [...prev];
                next[existing] = ch;
                return next;
              }
              return [ch, ...prev];
            });
            refresh();
          }}
        />
      </section>

      <CategoryBar
        categories={categories}
        filter={filter}
        counts={{
          all: channels.length,
          uncategorized: channels.filter((c) => c.category_ids.length === 0).length,
          byId: Object.fromEntries(
            categories.map((c) => [
              c.id,
              channels.filter((ch) => ch.category_ids.includes(c.id)).length,
            ]),
          ),
        }}
        onFilter={setFilter}
        onChanged={async () => {
          const r = await fetch("/api/channel-categories");
          if (r.ok) {
            const j = (await r.json()) as { categories: ChannelCategory[] };
            setCategories(j.categories);
          }
          refresh();
        }}
      />

      <section>
        <div className="mb-3 text-sm text-[color:var(--muted)]">
          {filtered.length}개 채널{refreshing ? " · 갱신 중..." : ""}
        </div>
        {filtered.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[color:var(--border)] p-8 text-center text-sm text-[color:var(--muted)]">
            {channels.length === 0
              ? "위에서 채널을 추가해보세요. URL, @handle, 또는 UC... 채널 ID를 받습니다."
              : "이 카테고리에는 채널이 없습니다."}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((ch) => (
              <ChannelCard
                key={ch.id}
                channel={ch}
                categories={categories}
                catById={catById}
                onChanged={(updated) => {
                  if (updated) {
                    setChannels((prev) =>
                      prev.map((c) => (c.id === updated.id ? updated : c)),
                    );
                  } else {
                    setChannels((prev) => prev.filter((c) => c.id !== ch.id));
                  }
                  refresh();
                }}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function AddChannelForm({
  categories,
  onAdded,
}: {
  categories: ChannelCategory[];
  onAdded: (channel: Channel) => void;
}) {
  const [input, setInput] = useState("");
  const [selectedCats, setSelectedCats] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleCat(id: number) {
    setSelectedCats((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: input.trim(), category_ids: selectedCats }),
      });
      const data = (await res.json()) as { channel?: Channel; error?: string };
      if (!res.ok || !data.channel) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      onAdded(data.channel);
      setInput("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card-panel flex flex-col gap-3 p-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="채널 URL, @handle, 또는 UC... ID"
          className="flex-1 rounded-md border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2 text-sm outline-none"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="btn-primary px-4 py-2 text-sm disabled:cursor-not-allowed"
        >
          {busy ? "추가 중..." : "추가"}
        </button>
      </div>
      {categories.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-[color:var(--muted)]">카테고리:</span>
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => toggleCat(c.id)}
              className={`rounded-full border px-2.5 py-1 ${
                selectedCats.includes(c.id)
                  ? "border-[color:var(--accent)] bg-[color:var(--accent-soft)] text-[color:var(--accent-strong)]"
                  : "border-[color:var(--border)] text-[color:var(--muted)] hover:text-[color:var(--foreground)]"
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
      {error && <p className="text-xs text-[color:var(--danger)]">{error}</p>}
    </form>
  );
}

function CategoryBar({
  categories,
  filter,
  counts,
  onFilter,
  onChanged,
}: {
  categories: ChannelCategory[];
  filter: Filter;
  counts: { all: number; uncategorized: number; byId: Record<number, number> };
  onFilter: (f: Filter) => void;
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function createCat() {
    const name = newName.trim();
    if (!name) return;
    setError(null);
    const r = await fetch("/api/channel-categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!r.ok) {
      const j = (await r.json()) as { error?: string };
      setError(j.error ?? `HTTP ${r.status}`);
      return;
    }
    setNewName("");
    setAdding(false);
    onChanged();
  }

  async function deleteCat(id: number) {
    if (!confirm("이 카테고리를 삭제할까요? (채널 자체는 남습니다)")) return;
    const r = await fetch(`/api/channel-categories/${id}`, { method: "DELETE" });
    if (r.ok) onChanged();
  }

  async function renameCat(id: number) {
    const name = editName.trim();
    if (!name) return;
    const r = await fetch(`/api/channel-categories/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (r.ok) {
      setEditingId(null);
      onChanged();
    } else {
      const j = (await r.json()) as { error?: string };
      setError(j.error ?? `HTTP ${r.status}`);
    }
  }

  return (
    <section className="card-panel p-3">
      <div className="flex flex-wrap items-center gap-2">
        <FilterPill
          active={filter === "all"}
          label={`전체 (${counts.all})`}
          onClick={() => onFilter("all")}
        />
        <FilterPill
          active={filter === "uncategorized"}
          label={`분류 없음 (${counts.uncategorized})`}
          onClick={() => onFilter("uncategorized")}
        />
        {categories.map((c) =>
          editingId === c.id ? (
            <span key={c.id} className="inline-flex items-center gap-1">
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") renameCat(c.id);
                  if (e.key === "Escape") setEditingId(null);
                }}
                autoFocus
                className="w-24 rounded-md border border-[color:var(--border)] bg-[color:var(--background)] px-2 py-1 text-xs outline-none"
              />
              <button
                type="button"
                onClick={() => renameCat(c.id)}
                className="text-xs text-[color:var(--accent-strong)]"
              >
                저장
              </button>
              <button
                type="button"
                onClick={() => setEditingId(null)}
                className="text-xs text-[color:var(--muted)]"
              >
                취소
              </button>
            </span>
          ) : (
            <span key={c.id} className="group inline-flex items-center">
              <FilterPill
                active={filter === c.id}
                label={`${c.name} (${counts.byId[c.id] ?? 0})`}
                onClick={() => onFilter(c.id)}
              />
              <button
                type="button"
                onClick={() => {
                  setEditingId(c.id);
                  setEditName(c.name);
                }}
                className="ml-1 hidden text-xs text-[color:var(--muted)] hover:text-[color:var(--foreground)] group-hover:inline"
                title="이름 변경"
              >
                ✎
              </button>
              <button
                type="button"
                onClick={() => deleteCat(c.id)}
                className="ml-1 hidden text-xs text-[color:var(--muted)] hover:text-[color:var(--danger)] group-hover:inline"
                title="삭제"
              >
                ✕
              </button>
            </span>
          ),
        )}
        {adding ? (
          <span className="inline-flex items-center gap-1">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") createCat();
                if (e.key === "Escape") {
                  setAdding(false);
                  setNewName("");
                }
              }}
              autoFocus
              placeholder="카테고리 이름"
              className="w-32 rounded-md border border-[color:var(--border)] bg-[color:var(--background)] px-2 py-1 text-xs outline-none"
            />
            <button
              type="button"
              onClick={createCat}
              className="text-xs text-[color:var(--accent-strong)]"
            >
              생성
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setNewName("");
              }}
              className="text-xs text-[color:var(--muted)]"
            >
              취소
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="rounded-full border border-dashed border-[color:var(--border)] px-3 py-1 text-xs text-[color:var(--muted)] hover:text-[color:var(--foreground)]"
          >
            + 카테고리 추가
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-[color:var(--danger)]">{error}</p>}
    </section>
  );
}

function FilterPill({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs ${
        active
          ? "border-[color:var(--foreground)] bg-[color:var(--foreground)] text-[color:var(--background)]"
          : "border-[color:var(--border)] text-[color:var(--muted)] hover:text-[color:var(--foreground)]"
      }`}
    >
      {label}
    </button>
  );
}

function ChannelCard({
  channel,
  categories,
  catById,
  onChanged,
}: {
  channel: Channel;
  categories: ChannelCategory[];
  catById: Map<number, ChannelCategory>;
  onChanged: (updated: Channel | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selectedCats, setSelectedCats] = useState<number[]>(channel.category_ids);
  const [note, setNote] = useState(channel.my_note ?? "");

  async function save() {
    setBusy(true);
    try {
      const r = await fetch(`/api/channels/${channel.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category_ids: selectedCats, note }),
      });
      if (r.ok) {
        const j = (await r.json()) as { channel: Channel };
        onChanged(j.channel);
        setEditing(false);
      }
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    setBusy(true);
    try {
      const r = await fetch(`/api/channels/${channel.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh: true }),
      });
      if (r.ok) {
        const j = (await r.json()) as { channel: Channel };
        onChanged(j.channel);
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`"${channel.name ?? channel.id}" 채널을 목록에서 삭제할까요?`)) return;
    const r = await fetch(`/api/channels/${channel.id}`, { method: "DELETE" });
    if (r.ok) onChanged(null);
  }

  return (
    <div className="card-panel flex flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        {channel.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={channel.thumbnail_url}
            alt={channel.name ?? ""}
            className="h-14 w-14 flex-shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="h-14 w-14 flex-shrink-0 rounded-full bg-[color:var(--border)]" />
        )}
        <div className="min-w-0 flex-1">
          <a
            href={channel.url}
            target="_blank"
            rel="noreferrer"
            className="block truncate font-semibold hover:text-[color:var(--accent-strong)]"
            title={channel.name ?? channel.id}
          >
            {channel.name ?? channel.id}
          </a>
          <p className="text-xs text-[color:var(--muted)]">
            {channel.handle ?? channel.id}
          </p>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[color:var(--muted)]">
            {channel.subscriber_text && <span>구독자 {channel.subscriber_text}</span>}
          </div>
        </div>
      </div>

      {channel.category_ids.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {channel.category_ids.map((id) => {
            const c = catById.get(id);
            if (!c) return null;
            return (
              <span
                key={id}
                className="rounded-full bg-[color:var(--accent-soft)] px-2 py-0.5 text-[10px] text-[color:var(--accent-strong)]"
              >
                {c.name}
              </span>
            );
          })}
        </div>
      )}

      {channel.my_note && !editing && (
        <p className="rounded-md bg-[color:var(--card-hover)] px-2 py-1.5 text-xs text-[color:var(--muted-strong)]">
          {channel.my_note}
        </p>
      )}

      {editing ? (
        <div className="flex flex-col gap-2 border-t border-[color:var(--border)] pt-3">
          <div className="flex flex-wrap gap-1">
            {categories.length === 0 && (
              <span className="text-xs text-[color:var(--muted)]">카테고리를 먼저 만들어 주세요</span>
            )}
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() =>
                  setSelectedCats((prev) =>
                    prev.includes(c.id) ? prev.filter((x) => x !== c.id) : [...prev, c.id],
                  )
                }
                className={`rounded-full border px-2 py-0.5 text-[10px] ${
                  selectedCats.includes(c.id)
                    ? "border-[color:var(--accent)] bg-[color:var(--accent-soft)] text-[color:var(--accent-strong)]"
                    : "border-[color:var(--border)] text-[color:var(--muted)]"
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="이 채널에 대한 메모 (선택)"
            rows={2}
            className="rounded-md border border-[color:var(--border)] bg-[color:var(--background)] px-2 py-1.5 text-xs outline-none"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="btn-primary px-3 py-1 text-xs disabled:cursor-not-allowed"
            >
              저장
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setSelectedCats(channel.category_ids);
                setNote(channel.my_note ?? "");
              }}
              className="rounded-md border border-[color:var(--border)] px-3 py-1 text-xs text-[color:var(--muted)] hover:text-[color:var(--foreground)]"
            >
              취소
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2 border-t border-[color:var(--border)] pt-3 text-xs">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-md border border-[color:var(--border)] px-2 py-1 text-[color:var(--muted)] hover:text-[color:var(--foreground)]"
          >
            편집
          </button>
          <button
            type="button"
            onClick={refresh}
            disabled={busy}
            className="rounded-md border border-[color:var(--border)] px-2 py-1 text-[color:var(--muted)] hover:text-[color:var(--foreground)] disabled:opacity-50"
          >
            {busy ? "..." : "정보 새로고침"}
          </button>
          <button
            type="button"
            onClick={remove}
            className="ml-auto rounded-md border border-[color:var(--border)] px-2 py-1 text-[color:var(--muted)] hover:text-[color:var(--danger)]"
          >
            삭제
          </button>
        </div>
      )}
    </div>
  );
}
