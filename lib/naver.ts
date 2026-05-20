// 네이버 검색광고 API (한국 키워드의 월간 PC/모바일 검색수)
// docs: https://naver.github.io/searchad-apidoc/
//
// 사용 키:
//   NAVER_AD_API_KEY      — "액세스 라이선스" (헤더 X-API-KEY)
//   NAVER_AD_SECRET_KEY   — "비밀키"          (HMAC 서명용, 헤더로 직접 안 보냄)
//   NAVER_AD_CUSTOMER_ID  — "CUSTOMER ID"    (헤더 X-Customer, 숫자)

import crypto from "node:crypto";
import { getSetting } from "./db";

export type NaverAdCreds = {
  apiKey: string;
  secretKey: string;
  customerId: string;
};

export const NAVER_AD_KEYS = {
  apiKey: "NAVER_AD_API_KEY",
  secretKey: "NAVER_AD_SECRET_KEY",
  customerId: "NAVER_AD_CUSTOMER_ID",
} as const;

export function getNaverAdCreds(): NaverAdCreds | null {
  const apiKey = getSetting(NAVER_AD_KEYS.apiKey) || process.env[NAVER_AD_KEYS.apiKey] || "";
  const secretKey = getSetting(NAVER_AD_KEYS.secretKey) || process.env[NAVER_AD_KEYS.secretKey] || "";
  const customerId =
    getSetting(NAVER_AD_KEYS.customerId) || process.env[NAVER_AD_KEYS.customerId] || "";
  if (!apiKey || !secretKey || !customerId) return null;
  return { apiKey, secretKey, customerId };
}

export function naverAdConfigured(): boolean {
  return getNaverAdCreds() !== null;
}

function sign(timestamp: string, method: string, path: string, secret: string): string {
  return crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${method}.${path}`)
    .digest("base64");
}

export type NaverKeywordRow = {
  keyword: string;
  monthlyPc: number | null; // null = 데이터 없음, 0 = 10건 미만
  monthlyMobile: number | null;
  monthlyTotal: number | null;
  isLowVolume: boolean; // "< 10" 응답이면 true
  competition: string | null; // 낮음/중간/높음
  avgAdDepth: number | null;
};

function parseQc(v: unknown): { value: number | null; low: boolean } {
  if (typeof v === "number") return { value: v, low: false };
  if (typeof v === "string") {
    if (v.includes("<")) return { value: 0, low: true }; // "< 10"
    const n = parseInt(v.replace(/[^\d]/g, ""), 10);
    return Number.isFinite(n) ? { value: n, low: false } : { value: null, low: false };
  }
  return { value: null, low: false };
}

type ApiRow = {
  relKeyword?: string;
  monthlyPcQcCnt?: number | string;
  monthlyMobileQcCnt?: number | string;
  compIdx?: string;
  plAvgDepth?: number;
};

export async function fetchNaverKeywordVolume(
  hintKeyword: string,
): Promise<NaverKeywordRow[] | null> {
  const creds = getNaverAdCreds();
  if (!creds) return null;

  const path = "/keywordstool";
  const params = new URLSearchParams({ hintKeywords: hintKeyword, showDetail: "1" });
  const ts = Date.now().toString();
  const signature = sign(ts, "GET", path, creds.secretKey);

  const res = await fetch(`https://api.naver.com${path}?${params.toString()}`, {
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "X-Timestamp": ts,
      "X-API-KEY": creds.apiKey,
      "X-Customer": creds.customerId,
      "X-Signature": signature,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Naver API ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as { keywordList?: ApiRow[] };
  const rows = data.keywordList ?? [];

  return rows.map((r) => {
    const pc = parseQc(r.monthlyPcQcCnt);
    const mo = parseQc(r.monthlyMobileQcCnt);
    const total =
      pc.value != null && mo.value != null
        ? pc.value + mo.value
        : pc.value ?? mo.value ?? null;
    return {
      keyword: r.relKeyword ?? "",
      monthlyPc: pc.value,
      monthlyMobile: mo.value,
      monthlyTotal: total,
      isLowVolume: pc.low || mo.low,
      competition: r.compIdx ?? null,
      avgAdDepth: typeof r.plAvgDepth === "number" ? r.plAvgDepth : null,
    };
  });
}
