import { spawn } from "node:child_process";

export function runYtDlp(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn("yt-dlp", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    proc.once("error", (err) => {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        reject(new Error("yt-dlp이 설치되어 있지 않습니다. `brew install yt-dlp`로 설치하세요."));
      } else {
        reject(err);
      }
    });
    proc.once("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        const msg = (stderr.trim() || stdout.trim() || `exit code ${code}`).slice(0, 400);
        reject(new Error(`yt-dlp 실패 (${code}): ${msg}`));
      }
    });
  });
}
