import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { dataDir, dataPath } from "./paths";
import type {
  Analysis,
  Channel,
  ChannelCategory,
  ChannelRow,
  Comment,
  CommentInsight,
  CommentRow,
  Provider,
  ScriptInsight,
  Snapshot,
  Synthesis,
  Video,
  VideoRow,
  VideoTranscript,
  VideoTranscriptRow,
} from "./types";

const DATA_DIR = dataDir();
const DB_PATH = dataPath("videos.db");

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, "thumbnails"), { recursive: true });

let _db: Database.Database | null = null;

export function db(): Database.Database {
  if (_db) return _db;
  const d = new Database(DB_PATH);
  d.pragma("journal_mode = WAL");
  d.pragma("foreign_keys = ON");
  d.exec(`
    CREATE TABLE IF NOT EXISTS videos (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      title TEXT NOT NULL,
      channel_name TEXT,
      channel_id TEXT,
      thumbnail_url TEXT,
      thumbnail_local TEXT,
      view_count INTEGER,
      like_count INTEGER,
      duration_seconds INTEGER,
      upload_date TEXT,
      description TEXT,
      tags_json TEXT,
      my_note TEXT,
      fetched_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS video_tags (
      video_id TEXT NOT NULL,
      tag TEXT NOT NULL,
      PRIMARY KEY (video_id, tag),
      FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS analyses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      video_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      prompt TEXT NOT NULL,
      response TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE,
      UNIQUE (video_id, provider)
    );

    CREATE TABLE IF NOT EXISTS video_comments (
      id TEXT PRIMARY KEY,
      video_id TEXT NOT NULL,
      parent_id TEXT,
      author TEXT,
      author_thumbnail TEXT,
      text TEXT NOT NULL,
      like_count INTEGER,
      reply_count INTEGER,
      published_text TEXT,
      is_pinned INTEGER DEFAULT 0,
      is_creator_heart INTEGER DEFAULT 0,
      is_channel_owner INTEGER DEFAULT 0,
      position INTEGER NOT NULL,
      fetched_at TEXT NOT NULL,
      FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_comments_video ON video_comments(video_id, position);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS video_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      video_id TEXT NOT NULL,
      view_count INTEGER NOT NULL,
      like_count INTEGER,
      captured_at TEXT NOT NULL,
      FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_snapshots_video_time ON video_snapshots(video_id, captured_at);

    CREATE TABLE IF NOT EXISTS comment_insights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      video_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      prompt TEXT NOT NULL,
      response TEXT NOT NULL,
      comment_count INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE,
      UNIQUE (video_id, provider)
    );

    CREATE TABLE IF NOT EXISTS syntheses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cache_key TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      video_ids_json TEXT NOT NULL,
      prompt TEXT NOT NULL,
      response TEXT NOT NULL,
      video_count INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (cache_key, provider)
    );

    CREATE TABLE IF NOT EXISTS video_transcripts (
      video_id TEXT PRIMARY KEY,
      language TEXT,
      available_languages_json TEXT NOT NULL,
      segments_json TEXT NOT NULL,
      segment_count INTEGER NOT NULL,
      fetched_at TEXT NOT NULL,
      FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS channels (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      handle TEXT,
      name TEXT,
      thumbnail_url TEXT,
      subscriber_count INTEGER,
      subscriber_text TEXT,
      video_count INTEGER,
      video_count_text TEXT,
      description TEXT,
      my_note TEXT,
      fetched_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS channel_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS channel_category_map (
      channel_id TEXT NOT NULL,
      category_id INTEGER NOT NULL,
      PRIMARY KEY (channel_id, category_id),
      FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES channel_categories(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_ccm_category ON channel_category_map(category_id);

    CREATE TABLE IF NOT EXISTS script_insights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      video_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      prompt TEXT NOT NULL,
      response TEXT NOT NULL,
      segment_count INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE,
      UNIQUE (video_id, provider)
    );
  `);

  // 기존 DB에 parent_id 없으면 추가 (마이그레이션)
  const cols = d.prepare("PRAGMA table_info(video_comments)").all() as { name: string }[];
  if (!cols.some((c) => c.name === "parent_id")) {
    d.exec("ALTER TABLE video_comments ADD COLUMN parent_id TEXT");
  }
  d.exec("CREATE INDEX IF NOT EXISTS idx_comments_parent ON video_comments(parent_id)");
  _db = d;
  return d;
}

export function databasePath(): string {
  return DB_PATH;
}

export async function createDatabaseBackup(targetPath: string): Promise<void> {
  await db().backup(targetPath);
}

export function restoreDatabaseFromBuffer(buffer: Buffer): void {
  const now = new Date().toISOString().replace(/[:.]/g, "-");
  const tempPath = path.join(DATA_DIR, `restore-${now}.db`);
  const safetyPath = path.join(DATA_DIR, `videos-before-restore-${now}.db`);

  fs.writeFileSync(tempPath, buffer, { mode: 0o600 });
  let candidate: Database.Database | null = null;
  try {
    candidate = new Database(tempPath, { readonly: true });
    const row = candidate.prepare("PRAGMA integrity_check").get() as { integrity_check: string };
    if (row.integrity_check !== "ok") {
      throw new Error(`DB 무결성 검사 실패: ${row.integrity_check}`);
    }
  } finally {
    candidate?.close();
  }

  if (_db) {
    _db.pragma("wal_checkpoint(TRUNCATE)");
    _db.close();
    _db = null;
  }

  if (fs.existsSync(DB_PATH)) {
    fs.copyFileSync(DB_PATH, safetyPath);
  }
  for (const suffix of ["-wal", "-shm"]) {
    const p = `${DB_PATH}${suffix}`;
    if (fs.existsSync(p)) fs.rmSync(p);
  }
  fs.copyFileSync(tempPath, DB_PATH);
  fs.rmSync(tempPath, { force: true });
  db();
}

function rowToVideo(row: VideoRow, userTags: string[]): Video {
  const { tags_json, ...rest } = row;
  let tags: string[] = [];
  if (tags_json) {
    try {
      tags = JSON.parse(tags_json);
    } catch {
      tags = [];
    }
  }
  return { ...rest, tags, user_tags: userTags };
}

export function listVideos(): Video[] {
  const rows = db()
    .prepare("SELECT * FROM videos ORDER BY created_at DESC")
    .all() as VideoRow[];
  const tagsByVideo = new Map<string, string[]>();
  const allTags = db()
    .prepare("SELECT video_id, tag FROM video_tags")
    .all() as { video_id: string; tag: string }[];
  for (const { video_id, tag } of allTags) {
    const arr = tagsByVideo.get(video_id) ?? [];
    arr.push(tag);
    tagsByVideo.set(video_id, arr);
  }
  return rows.map((r) => rowToVideo(r, tagsByVideo.get(r.id) ?? []));
}

export function getVideo(id: string): Video | null {
  const row = db()
    .prepare("SELECT * FROM videos WHERE id = ?")
    .get(id) as VideoRow | undefined;
  if (!row) return null;
  const userTags = (db()
    .prepare("SELECT tag FROM video_tags WHERE video_id = ?")
    .all(id) as { tag: string }[]).map((r) => r.tag);
  return rowToVideo(row, userTags);
}

export function upsertVideo(v: {
  id: string;
  url: string;
  title: string;
  channel_name: string | null;
  channel_id: string | null;
  thumbnail_url: string | null;
  thumbnail_local: string | null;
  view_count: number | null;
  like_count: number | null;
  duration_seconds: number | null;
  upload_date: string | null;
  description: string | null;
  tags: string[];
}): Video {
  const now = new Date().toISOString();
  db()
    .prepare(
      `INSERT INTO videos (id, url, title, channel_name, channel_id, thumbnail_url, thumbnail_local,
         view_count, like_count, duration_seconds, upload_date, description, tags_json, fetched_at, created_at)
       VALUES (@id, @url, @title, @channel_name, @channel_id, @thumbnail_url, @thumbnail_local,
         @view_count, @like_count, @duration_seconds, @upload_date, @description, @tags_json, @fetched_at, @created_at)
       ON CONFLICT(id) DO UPDATE SET
         url = excluded.url,
         title = excluded.title,
         channel_name = excluded.channel_name,
         channel_id = excluded.channel_id,
         thumbnail_url = excluded.thumbnail_url,
         thumbnail_local = excluded.thumbnail_local,
         view_count = excluded.view_count,
         like_count = excluded.like_count,
         duration_seconds = excluded.duration_seconds,
         upload_date = excluded.upload_date,
         description = excluded.description,
         tags_json = excluded.tags_json,
         fetched_at = excluded.fetched_at`,
    )
    .run({
      ...v,
      tags_json: JSON.stringify(v.tags),
      fetched_at: now,
      created_at: now,
    });
  return getVideo(v.id)!;
}

export function deleteVideo(id: string): void {
  db().prepare("DELETE FROM videos WHERE id = ?").run(id);
}

export function updateNote(id: string, note: string): void {
  db().prepare("UPDATE videos SET my_note = ? WHERE id = ?").run(note, id);
}

export function setTags(id: string, tags: string[]): void {
  const tx = db().transaction(() => {
    db().prepare("DELETE FROM video_tags WHERE video_id = ?").run(id);
    const ins = db().prepare("INSERT OR IGNORE INTO video_tags (video_id, tag) VALUES (?, ?)");
    for (const t of tags) {
      const trimmed = t.trim();
      if (trimmed) ins.run(id, trimmed);
    }
  });
  tx();
}

export function getAnalysis(videoId: string, provider: Provider): Analysis | null {
  const row = db()
    .prepare("SELECT * FROM analyses WHERE video_id = ? AND provider = ?")
    .get(videoId, provider) as Analysis | undefined;
  return row ?? null;
}

export function getAnalyses(videoId: string): Analysis[] {
  return db()
    .prepare("SELECT * FROM analyses WHERE video_id = ? ORDER BY created_at DESC")
    .all(videoId) as Analysis[];
}

function rowToComment(r: CommentRow): Comment {
  return {
    ...r,
    is_pinned: Boolean(r.is_pinned),
    is_creator_heart: Boolean(r.is_creator_heart),
    is_channel_owner: Boolean(r.is_channel_owner),
  };
}

export function replaceComments(
  videoId: string,
  comments: {
    id: string;
    parent_id: string | null;
    author: string | null;
    author_thumbnail: string | null;
    text: string;
    like_count: number | null;
    reply_count: number | null;
    published_text: string | null;
    is_pinned: boolean;
    is_creator_heart: boolean;
    is_channel_owner: boolean;
  }[],
): void {
  const now = new Date().toISOString();
  const tx = db().transaction(() => {
    db().prepare("DELETE FROM video_comments WHERE video_id = ?").run(videoId);
    const ins = db().prepare(
      `INSERT INTO video_comments
        (id, video_id, parent_id, author, author_thumbnail, text, like_count, reply_count, published_text,
         is_pinned, is_creator_heart, is_channel_owner, position, fetched_at)
       VALUES (@id, @video_id, @parent_id, @author, @author_thumbnail, @text, @like_count, @reply_count,
         @published_text, @is_pinned, @is_creator_heart, @is_channel_owner, @position, @fetched_at)`,
    );
    comments.forEach((c, i) => {
      ins.run({
        id: c.id,
        video_id: videoId,
        parent_id: c.parent_id,
        author: c.author,
        author_thumbnail: c.author_thumbnail,
        text: c.text,
        like_count: c.like_count,
        reply_count: c.reply_count,
        published_text: c.published_text,
        is_pinned: c.is_pinned ? 1 : 0,
        is_creator_heart: c.is_creator_heart ? 1 : 0,
        is_channel_owner: c.is_channel_owner ? 1 : 0,
        position: i,
        fetched_at: now,
      });
    });
  });
  tx();
}

export function listComments(videoId: string): Comment[] {
  const rows = db()
    .prepare("SELECT * FROM video_comments WHERE video_id = ? ORDER BY position ASC")
    .all(videoId) as CommentRow[];
  return rows.map(rowToComment);
}

export function getCommentsMeta(videoId: string): { count: number; fetched_at: string | null } {
  const row = db()
    .prepare(
      "SELECT COUNT(*) AS count, MAX(fetched_at) AS fetched_at FROM video_comments WHERE video_id = ?",
    )
    .get(videoId) as { count: number; fetched_at: string | null };
  return row;
}

export function addSnapshot(
  videoId: string,
  data: { view_count: number; like_count: number | null },
): Snapshot {
  const now = new Date().toISOString();
  const result = db()
    .prepare(
      `INSERT INTO video_snapshots (video_id, view_count, like_count, captured_at)
       VALUES (?, ?, ?, ?)`,
    )
    .run(videoId, data.view_count, data.like_count, now);
  return {
    id: Number(result.lastInsertRowid),
    video_id: videoId,
    view_count: data.view_count,
    like_count: data.like_count,
    captured_at: now,
  };
}

export function listSnapshots(videoId: string): Snapshot[] {
  return db()
    .prepare("SELECT * FROM video_snapshots WHERE video_id = ? ORDER BY captured_at ASC")
    .all(videoId) as Snapshot[];
}

export function latestSnapshot(videoId: string): Snapshot | null {
  const row = db()
    .prepare(
      "SELECT * FROM video_snapshots WHERE video_id = ? ORDER BY captured_at DESC LIMIT 1",
    )
    .get(videoId) as Snapshot | undefined;
  return row ?? null;
}

export function allSnapshotsByVideo(): Map<string, Snapshot[]> {
  const rows = db()
    .prepare("SELECT * FROM video_snapshots ORDER BY video_id, captured_at ASC")
    .all() as Snapshot[];
  const map = new Map<string, Snapshot[]>();
  for (const r of rows) {
    const arr = map.get(r.video_id) ?? [];
    arr.push(r);
    map.set(r.video_id, arr);
  }
  return map;
}

export function getSetting(key: string): string | null {
  const row = db()
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string | null): void {
  const now = new Date().toISOString();
  if (value == null || value === "") {
    db().prepare("DELETE FROM settings WHERE key = ?").run(key);
    return;
  }
  db()
    .prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .run(key, value, now);
}

export function saveAnalysis(a: {
  video_id: string;
  provider: Provider;
  model: string;
  prompt: string;
  response: string;
}): void {
  const now = new Date().toISOString();
  db()
    .prepare(
      `INSERT INTO analyses (video_id, provider, model, prompt, response, created_at)
       VALUES (@video_id, @provider, @model, @prompt, @response, @created_at)
       ON CONFLICT(video_id, provider) DO UPDATE SET
         model = excluded.model,
         prompt = excluded.prompt,
         response = excluded.response,
         created_at = excluded.created_at`,
    )
    .run({ ...a, created_at: now });
}

export function getCommentInsight(videoId: string, provider: Provider): CommentInsight | null {
  const row = db()
    .prepare("SELECT * FROM comment_insights WHERE video_id = ? AND provider = ?")
    .get(videoId, provider) as CommentInsight | undefined;
  return row ?? null;
}

export function getCommentInsights(videoId: string): CommentInsight[] {
  return db()
    .prepare("SELECT * FROM comment_insights WHERE video_id = ? ORDER BY created_at DESC")
    .all(videoId) as CommentInsight[];
}

export function getTranscript(videoId: string): VideoTranscript | null {
  const row = db()
    .prepare("SELECT * FROM video_transcripts WHERE video_id = ?")
    .get(videoId) as VideoTranscriptRow | undefined;
  if (!row) return null;
  let segs: { start_ms: number; end_ms: number; text: string }[] = [];
  let langs: string[] = [];
  try {
    segs = JSON.parse(row.segments_json);
  } catch {}
  try {
    langs = JSON.parse(row.available_languages_json);
  } catch {}
  return {
    video_id: row.video_id,
    language: row.language,
    available_languages: langs,
    segments: segs,
    segment_count: row.segment_count,
    fetched_at: row.fetched_at,
  };
}

export function saveTranscript(t: {
  video_id: string;
  language: string | null;
  available_languages: string[];
  segments: { start_ms: number; end_ms: number; text: string }[];
}): void {
  const now = new Date().toISOString();
  db()
    .prepare(
      `INSERT INTO video_transcripts (video_id, language, available_languages_json, segments_json, segment_count, fetched_at)
       VALUES (@video_id, @language, @available_languages_json, @segments_json, @segment_count, @fetched_at)
       ON CONFLICT(video_id) DO UPDATE SET
         language = excluded.language,
         available_languages_json = excluded.available_languages_json,
         segments_json = excluded.segments_json,
         segment_count = excluded.segment_count,
         fetched_at = excluded.fetched_at`,
    )
    .run({
      video_id: t.video_id,
      language: t.language,
      available_languages_json: JSON.stringify(t.available_languages),
      segments_json: JSON.stringify(t.segments),
      segment_count: t.segments.length,
      fetched_at: now,
    });
}

export function getScriptInsight(videoId: string, provider: Provider): ScriptInsight | null {
  const row = db()
    .prepare("SELECT * FROM script_insights WHERE video_id = ? AND provider = ?")
    .get(videoId, provider) as ScriptInsight | undefined;
  return row ?? null;
}

export function getScriptInsights(videoId: string): ScriptInsight[] {
  return db()
    .prepare("SELECT * FROM script_insights WHERE video_id = ? ORDER BY created_at DESC")
    .all(videoId) as ScriptInsight[];
}

export function saveScriptInsight(a: {
  video_id: string;
  provider: Provider;
  model: string;
  prompt: string;
  response: string;
  segment_count: number;
}): void {
  const now = new Date().toISOString();
  db()
    .prepare(
      `INSERT INTO script_insights (video_id, provider, model, prompt, response, segment_count, created_at)
       VALUES (@video_id, @provider, @model, @prompt, @response, @segment_count, @created_at)
       ON CONFLICT(video_id, provider) DO UPDATE SET
         model = excluded.model,
         prompt = excluded.prompt,
         response = excluded.response,
         segment_count = excluded.segment_count,
         created_at = excluded.created_at`,
    )
    .run({ ...a, created_at: now });
}

export function getSynthesis(cacheKey: string, provider: Provider): Synthesis | null {
  const row = db()
    .prepare("SELECT * FROM syntheses WHERE cache_key = ? AND provider = ?")
    .get(cacheKey, provider) as Synthesis | undefined;
  return row ?? null;
}

export function getRecentSyntheses(limit = 20): Synthesis[] {
  return db()
    .prepare("SELECT * FROM syntheses ORDER BY created_at DESC LIMIT ?")
    .all(limit) as Synthesis[];
}

export function saveSynthesis(a: {
  cache_key: string;
  provider: Provider;
  model: string;
  video_ids_json: string;
  prompt: string;
  response: string;
  video_count: number;
}): void {
  const now = new Date().toISOString();
  db()
    .prepare(
      `INSERT INTO syntheses (cache_key, provider, model, video_ids_json, prompt, response, video_count, created_at)
       VALUES (@cache_key, @provider, @model, @video_ids_json, @prompt, @response, @video_count, @created_at)
       ON CONFLICT(cache_key, provider) DO UPDATE SET
         model = excluded.model,
         video_ids_json = excluded.video_ids_json,
         prompt = excluded.prompt,
         response = excluded.response,
         video_count = excluded.video_count,
         created_at = excluded.created_at`,
    )
    .run({ ...a, created_at: now });
}

// === Channels ===

function rowToChannel(row: ChannelRow, categoryIds: number[]): Channel {
  return { ...row, category_ids: categoryIds };
}

export function listChannels(): Channel[] {
  const rows = db()
    .prepare("SELECT * FROM channels ORDER BY created_at DESC")
    .all() as ChannelRow[];
  const mapRows = db()
    .prepare("SELECT channel_id, category_id FROM channel_category_map")
    .all() as { channel_id: string; category_id: number }[];
  const catsByChannel = new Map<string, number[]>();
  for (const { channel_id, category_id } of mapRows) {
    const arr = catsByChannel.get(channel_id) ?? [];
    arr.push(category_id);
    catsByChannel.set(channel_id, arr);
  }
  return rows.map((r) => rowToChannel(r, catsByChannel.get(r.id) ?? []));
}

export function getChannel(id: string): Channel | null {
  const row = db()
    .prepare("SELECT * FROM channels WHERE id = ?")
    .get(id) as ChannelRow | undefined;
  if (!row) return null;
  const cats = (db()
    .prepare("SELECT category_id FROM channel_category_map WHERE channel_id = ?")
    .all(id) as { category_id: number }[]).map((r) => r.category_id);
  return rowToChannel(row, cats);
}

export function upsertChannel(c: {
  id: string;
  url: string;
  handle: string | null;
  name: string | null;
  thumbnail_url: string | null;
  subscriber_count: number | null;
  subscriber_text: string | null;
  video_count: number | null;
  video_count_text: string | null;
  description: string | null;
}): Channel {
  const now = new Date().toISOString();
  db()
    .prepare(
      `INSERT INTO channels (id, url, handle, name, thumbnail_url, subscriber_count, subscriber_text,
         video_count, video_count_text, description, fetched_at, created_at)
       VALUES (@id, @url, @handle, @name, @thumbnail_url, @subscriber_count, @subscriber_text,
         @video_count, @video_count_text, @description, @fetched_at, @created_at)
       ON CONFLICT(id) DO UPDATE SET
         url = excluded.url,
         handle = COALESCE(excluded.handle, handle),
         name = COALESCE(excluded.name, name),
         thumbnail_url = COALESCE(excluded.thumbnail_url, thumbnail_url),
         subscriber_count = excluded.subscriber_count,
         subscriber_text = excluded.subscriber_text,
         video_count = excluded.video_count,
         video_count_text = excluded.video_count_text,
         description = COALESCE(excluded.description, description),
         fetched_at = excluded.fetched_at`,
    )
    .run({ ...c, fetched_at: now, created_at: now });
  return getChannel(c.id)!;
}

export function deleteChannel(id: string): void {
  db().prepare("DELETE FROM channels WHERE id = ?").run(id);
}

export function updateChannelNote(id: string, note: string): void {
  db().prepare("UPDATE channels SET my_note = ? WHERE id = ?").run(note, id);
}

export function setChannelCategories(channelId: string, categoryIds: number[]): void {
  const tx = db().transaction(() => {
    db()
      .prepare("DELETE FROM channel_category_map WHERE channel_id = ?")
      .run(channelId);
    const ins = db().prepare(
      "INSERT OR IGNORE INTO channel_category_map (channel_id, category_id) VALUES (?, ?)",
    );
    for (const cid of categoryIds) ins.run(channelId, cid);
  });
  tx();
}

// === Channel categories ===

export function listChannelCategories(): ChannelCategory[] {
  return db()
    .prepare("SELECT * FROM channel_categories ORDER BY position ASC, id ASC")
    .all() as ChannelCategory[];
}

export function createChannelCategory(name: string, color: string | null = null): ChannelCategory {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("카테고리 이름이 비었습니다");
  const now = new Date().toISOString();
  const max = db()
    .prepare("SELECT COALESCE(MAX(position), -1) AS m FROM channel_categories")
    .get() as { m: number };
  const result = db()
    .prepare(
      `INSERT INTO channel_categories (name, color, position, created_at)
       VALUES (?, ?, ?, ?)`,
    )
    .run(trimmed, color, max.m + 1, now);
  return db()
    .prepare("SELECT * FROM channel_categories WHERE id = ?")
    .get(result.lastInsertRowid) as ChannelCategory;
}

export function deleteChannelCategory(id: number): void {
  db().prepare("DELETE FROM channel_categories WHERE id = ?").run(id);
}

export function renameChannelCategory(id: number, name: string): void {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("카테고리 이름이 비었습니다");
  db()
    .prepare("UPDATE channel_categories SET name = ? WHERE id = ?")
    .run(trimmed, id);
}

export function saveCommentInsight(a: {
  video_id: string;
  provider: Provider;
  model: string;
  prompt: string;
  response: string;
  comment_count: number;
}): void {
  const now = new Date().toISOString();
  db()
    .prepare(
      `INSERT INTO comment_insights (video_id, provider, model, prompt, response, comment_count, created_at)
       VALUES (@video_id, @provider, @model, @prompt, @response, @comment_count, @created_at)
       ON CONFLICT(video_id, provider) DO UPDATE SET
         model = excluded.model,
         prompt = excluded.prompt,
         response = excluded.response,
         comment_count = excluded.comment_count,
         created_at = excluded.created_at`,
    )
    .run({ ...a, created_at: now });
}
