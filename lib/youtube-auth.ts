import { promises as fs } from "node:fs";
import path from "node:path";
import { Innertube } from "youtubei.js";
import type { OAuth2Tokens, DeviceAndUserCode } from "youtubei.js";
import { installYtJsEvaluator } from "./youtube-runtime";
import { dataPath } from "./paths";

installYtJsEvaluator();

const CRED_PATH = dataPath("yt-credentials.json");

let _yt: Innertube | null = null;
let _loaded = false;

type PendingFlow = {
  code: DeviceAndUserCode;
  expiresAt: number;
  resolved: boolean;
  error: string | null;
};
let _pending: PendingFlow | null = null;

async function loadTokens(): Promise<OAuth2Tokens | null> {
  try {
    const raw = await fs.readFile(CRED_PATH, "utf8");
    return JSON.parse(raw) as OAuth2Tokens;
  } catch {
    return null;
  }
}

async function saveTokens(tokens: OAuth2Tokens): Promise<void> {
  await fs.mkdir(path.dirname(CRED_PATH), { recursive: true });
  await fs.writeFile(CRED_PATH, JSON.stringify(tokens, null, 2), { mode: 0o600 });
}

async function clearTokens(): Promise<void> {
  try {
    await fs.unlink(CRED_PATH);
  } catch {
    // already gone
  }
}

function attachUpdateListener(yt: Innertube): void {
  yt.session.on("update-credentials", async ({ credentials }) => {
    try {
      await saveTokens(credentials);
    } catch {
      // best-effort; next refresh will retry
    }
  });
}

async function tryLoadAuthedSession(): Promise<void> {
  if (_loaded) return;
  _loaded = true;
  const tokens = await loadTokens();
  if (!tokens) return;
  try {
    const yt = await Innertube.create({ lang: "ko", location: "KR" });
    attachUpdateListener(yt);
    await yt.session.signIn(tokens);
    _yt = yt;
  } catch {
    _yt = null;
  }
}

export async function innertubeAuthed(): Promise<Innertube | null> {
  await tryLoadAuthedSession();
  return _yt;
}

export async function isSignedIn(): Promise<boolean> {
  await tryLoadAuthedSession();
  return Boolean(_yt && _yt.session.logged_in);
}

function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}

export async function startDeviceFlow(): Promise<DeviceAndUserCode> {
  if (await isSignedIn()) {
    throw new Error("이미 로그인된 상태입니다.");
  }
  if (_pending && !_pending.resolved && Date.now() < _pending.expiresAt) {
    return _pending.code;
  }

  const yt = await Innertube.create({ lang: "ko", location: "KR" });
  attachUpdateListener(yt);

  return await new Promise<DeviceAndUserCode>((resolve, reject) => {
    yt.session.once("auth-pending", (code) => {
      _pending = {
        code,
        expiresAt: Date.now() + code.expires_in * 1000,
        resolved: false,
        error: null,
      };
      resolve(code);
    });

    yt.session.once("auth", async ({ credentials }) => {
      try {
        await saveTokens(credentials);
        _yt = yt;
        _loaded = true;
      } catch (err) {
        if (_pending) {
          _pending.resolved = true;
          _pending.error = toErrorMessage(err);
        }
        return;
      }
      if (_pending) _pending.resolved = true;
    });

    yt.session.once("auth-error", (err) => {
      const msg = toErrorMessage(err);
      if (_pending) {
        _pending.resolved = true;
        _pending.error = msg;
      } else {
        reject(new Error(msg));
      }
    });

    yt.session.signIn().catch((err) => {
      if (!_pending) reject(err);
    });
  });
}

export type AuthStatus =
  | { state: "signed_in" }
  | { state: "pending"; code: DeviceAndUserCode; expiresAt: number }
  | { state: "error"; message: string }
  | { state: "signed_out" };

export async function getAuthStatus(): Promise<AuthStatus> {
  if (await isSignedIn()) return { state: "signed_in" };
  if (_pending && !_pending.resolved && Date.now() < _pending.expiresAt) {
    return { state: "pending", code: _pending.code, expiresAt: _pending.expiresAt };
  }
  if (_pending && _pending.error) {
    const msg = _pending.error;
    _pending = null;
    return { state: "error", message: msg };
  }
  return { state: "signed_out" };
}

export async function signOut(): Promise<void> {
  if (_yt) {
    try {
      await _yt.session.signOut();
    } catch {
      // best-effort
    }
  }
  _yt = null;
  _loaded = true;
  _pending = null;
  await clearTokens();
}
