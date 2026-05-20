import path from "node:path";

export function dataDir(): string {
  return process.env.YTB_DATA_DIR || path.join(process.cwd(), "data");
}

export function dataPath(...parts: string[]): string {
  return path.join(dataDir(), ...parts);
}
