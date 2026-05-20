export type Provider = "claude" | "openai" | "gemini";

export interface VideoRow {
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
  tags_json: string | null;
  my_note: string | null;
  fetched_at: string;
  created_at: string;
}

export interface Video extends Omit<VideoRow, "tags_json"> {
  tags: string[];
  user_tags: string[];
}

export interface CommentRow {
  id: string;
  video_id: string;
  parent_id: string | null;
  author: string | null;
  author_thumbnail: string | null;
  text: string;
  like_count: number | null;
  reply_count: number | null;
  published_text: string | null;
  is_pinned: number;
  is_creator_heart: number;
  is_channel_owner: number;
  position: number;
  fetched_at: string;
}

export interface Comment extends Omit<CommentRow, "is_pinned" | "is_creator_heart" | "is_channel_owner"> {
  is_pinned: boolean;
  is_creator_heart: boolean;
  is_channel_owner: boolean;
}

export interface Snapshot {
  id: number;
  video_id: string;
  view_count: number;
  like_count: number | null;
  captured_at: string;
}

export interface Analysis {
  id: number;
  video_id: string;
  provider: Provider;
  model: string;
  prompt: string;
  response: string;
  created_at: string;
}

export interface CommentInsight {
  id: number;
  video_id: string;
  provider: Provider;
  model: string;
  prompt: string;
  response: string;
  comment_count: number;
  created_at: string;
}

export interface Synthesis {
  id: number;
  cache_key: string; // hash of sorted video_ids
  provider: Provider;
  model: string;
  video_ids_json: string;
  prompt: string;
  response: string;
  video_count: number;
  created_at: string;
}

export interface VideoTranscriptRow {
  video_id: string;
  language: string | null;
  available_languages_json: string;
  segments_json: string;
  segment_count: number;
  fetched_at: string;
}

export interface VideoTranscript {
  video_id: string;
  language: string | null;
  available_languages: string[];
  segments: { start_ms: number; end_ms: number; text: string }[];
  segment_count: number;
  fetched_at: string;
}

export interface ScriptInsight {
  id: number;
  video_id: string;
  provider: Provider;
  model: string;
  prompt: string;
  response: string;
  segment_count: number; // 분석 시점의 세그먼트 수 (캐시 무효화 판단)
  created_at: string;
}

export interface ChannelRow {
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
  my_note: string | null;
  fetched_at: string;
  created_at: string;
}

export interface ChannelCategory {
  id: number;
  name: string;
  color: string | null;
  position: number;
  created_at: string;
}

export interface Channel extends ChannelRow {
  category_ids: number[];
}

export interface FetchedVideo {
  id: string;
  url: string;
  title: string;
  channel_name: string | null;
  channel_id: string | null;
  thumbnail_url: string | null;
  view_count: number | null;
  like_count: number | null;
  duration_seconds: number | null;
  upload_date: string | null;
  description: string | null;
  tags: string[];
}
