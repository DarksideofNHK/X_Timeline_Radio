import { kv } from '@vercel/kv';

// レート制限の設定値（環境変数から取得）
const IP_DAILY_LIMIT = parseInt(process.env.FREEMIUM_IP_DAILY_LIMIT || '2', 10);
const INTERVAL_SECONDS = parseInt(process.env.FREEMIUM_INTERVAL_SECONDS || '600', 10);
const MONTHLY_LIMIT = parseInt(process.env.FREEMIUM_MONTHLY_LIMIT || '1000', 10);

// 日本時間の今日の日付を取得
function getTodayStringJST(): string {
  const now = new Date();
  const jstOffset = 9 * 60 * 60 * 1000; // UTC+9
  const jstDate = new Date(now.getTime() + jstOffset);
  return jstDate.toISOString().split('T')[0]; // YYYY-MM-DD
}

// 日本時間の今月を取得
function getMonthStringJST(): string {
  const now = new Date();
  const jstOffset = 9 * 60 * 60 * 1000;
  const jstDate = new Date(now.getTime() + jstOffset);
  return jstDate.toISOString().slice(0, 7); // YYYY-MM
}

// IPアドレスをハッシュ化
function hashIP(ip: string): string {
  return ip.replace(/[.:]/g, '_');
}

// KVキー生成
function getIPDailyKey(ip: string): string {
  const today = getTodayStringJST();
  const ipHash = hashIP(ip);
  return `freemium:ip:${today}:${ipHash}`;
}

function getIntervalKey(ip: string): string {
  const ipHash = hashIP(ip);
  return `freemium:interval:${ipHash}`;
}

function getGlobalMonthlyKey(): string {
  const month = getMonthStringJST();
  return `freemium:global:${month}`;
}

// レート制限チェック結果
export interface RateLimitResult {
  allowed: boolean;
  reason?: 'ip_daily' | 'interval' | 'global_monthly';
  remaining: {
    daily: number;
    intervalSeconds: number;
    monthly: number;
  };
  resetAt: {
    daily: string;
    interval: string;
    monthly: string;
  };
}

// レート制限チェック（消費なし）
export async function checkRateLimit(ip: string): Promise<RateLimitResult> {
  const today = getTodayStringJST();
  const month = getMonthStringJST();

  try {
    const ipDailyKey = getIPDailyKey(ip);
    const intervalKey = getIntervalKey(ip);
    const globalKey = getGlobalMonthlyKey();

    // 並列でKV取得
    const [ipDailyCount, lastRequest, globalCount] = await Promise.all([
      kv.get<number>(ipDailyKey) || 0,
      kv.get<number>(intervalKey) || 0,
      kv.get<number>(globalKey) || 0
    ]);

    const now = Date.now();
    const intervalRemaining = lastRequest ? Math.max(0, INTERVAL_SECONDS - Math.floor((now - lastRequest) / 1000)) : 0;

    // 各制限の残り
    const dailyRemaining = Math.max(0, IP_DAILY_LIMIT - (ipDailyCount as number));
    const monthlyRemaining = Math.max(0, MONTHLY_LIMIT - (globalCount as number));

    // 制限チェック
    if ((globalCount as number) >= MONTHLY_LIMIT) {
      return {
        allowed: false,
        reason: 'global_monthly',
        remaining: {
          daily: dailyRemaining,
          intervalSeconds: intervalRemaining,
          monthly: 0
        },
        resetAt: {
          daily: `${today}T23:59:59+09:00`,
          interval: new Date(now + intervalRemaining * 1000).toISOString(),
          monthly: `${month}-01T00:00:00+09:00`
        }
      };
    }

    if ((ipDailyCount as number) >= IP_DAILY_LIMIT) {
      return {
        allowed: false,
        reason: 'ip_daily',
        remaining: {
          daily: 0,
          intervalSeconds: intervalRemaining,
          monthly: monthlyRemaining
        },
        resetAt: {
          daily: `${today}T23:59:59+09:00`,
          interval: new Date(now + intervalRemaining * 1000).toISOString(),
          monthly: `${month}-01T00:00:00+09:00`
        }
      };
    }

    if (intervalRemaining > 0) {
      return {
        allowed: false,
        reason: 'interval',
        remaining: {
          daily: dailyRemaining,
          intervalSeconds: intervalRemaining,
          monthly: monthlyRemaining
        },
        resetAt: {
          daily: `${today}T23:59:59+09:00`,
          interval: new Date(now + intervalRemaining * 1000).toISOString(),
          monthly: `${month}-01T00:00:00+09:00`
        }
      };
    }

    return {
      allowed: true,
      remaining: {
        daily: dailyRemaining,
        intervalSeconds: 0,
        monthly: monthlyRemaining
      },
      resetAt: {
        daily: `${today}T23:59:59+09:00`,
        interval: '',
        monthly: `${month}-01T00:00:00+09:00`
      }
    };

  } catch (error) {
    console.error('[RateLimiter] KV error during check:', error);
    // KVエラー時は拒否（安全側に倒す）
    return {
      allowed: false,
      reason: 'global_monthly',
      remaining: {
        daily: 0,
        intervalSeconds: INTERVAL_SECONDS,
        monthly: 0
      },
      resetAt: {
        daily: `${today}T23:59:59+09:00`,
        interval: new Date(Date.now() + INTERVAL_SECONDS * 1000).toISOString(),
        monthly: `${month}-01T00:00:00+09:00`
      }
    };
  }
}

// レート制限を消費
export async function consumeRateLimit(ip: string): Promise<RateLimitResult> {
  const today = getTodayStringJST();
  const month = getMonthStringJST();

  try {
    // まずチェック
    const checkResult = await checkRateLimit(ip);
    if (!checkResult.allowed) {
      return checkResult;
    }

    const ipDailyKey = getIPDailyKey(ip);
    const intervalKey = getIntervalKey(ip);
    const globalKey = getGlobalMonthlyKey();

    // カウント更新
    const now = Date.now();
    await Promise.all([
      kv.incr(ipDailyKey).then(() => kv.expire(ipDailyKey, 86400)), // 24時間TTL
      kv.set(intervalKey, now, { ex: INTERVAL_SECONDS }), // インターバルTTL
      kv.incr(globalKey).then(() => kv.expire(globalKey, 32 * 24 * 60 * 60)) // 32日TTL
    ]);

    // 更新後の残りを取得
    const [newIpCount, newGlobalCount] = await Promise.all([
      kv.get<number>(ipDailyKey) || 0,
      kv.get<number>(globalKey) || 0
    ]);

    return {
      allowed: true,
      remaining: {
        daily: Math.max(0, IP_DAILY_LIMIT - (newIpCount as number)),
        intervalSeconds: INTERVAL_SECONDS,
        monthly: Math.max(0, MONTHLY_LIMIT - (newGlobalCount as number))
      },
      resetAt: {
        daily: `${today}T23:59:59+09:00`,
        interval: new Date(now + INTERVAL_SECONDS * 1000).toISOString(),
        monthly: `${month}-01T00:00:00+09:00`
      }
    };

  } catch (error) {
    console.error('[RateLimiter] KV error during consume:', error);
    // KVエラー時は拒否
    return {
      allowed: false,
      reason: 'global_monthly',
      remaining: {
        daily: 0,
        intervalSeconds: INTERVAL_SECONDS,
        monthly: 0
      },
      resetAt: {
        daily: `${today}T23:59:59+09:00`,
        interval: new Date(Date.now() + INTERVAL_SECONDS * 1000).toISOString(),
        monthly: `${month}-01T00:00:00+09:00`
      }
    };
  }
}

// 使用状況取得（UI表示用）
export async function getUsageStatus(ip: string): Promise<{
  used: { daily: number; monthly: number };
  remaining: { daily: number; monthly: number };
  limits: { daily: number; monthly: number; intervalSeconds: number };
}> {
  try {
    const ipDailyKey = getIPDailyKey(ip);
    const globalKey = getGlobalMonthlyKey();

    const [ipDailyCount, globalCount] = await Promise.all([
      kv.get<number>(ipDailyKey) || 0,
      kv.get<number>(globalKey) || 0
    ]);

    return {
      used: {
        daily: ipDailyCount as number,
        monthly: globalCount as number
      },
      remaining: {
        daily: Math.max(0, IP_DAILY_LIMIT - (ipDailyCount as number)),
        monthly: Math.max(0, MONTHLY_LIMIT - (globalCount as number))
      },
      limits: {
        daily: IP_DAILY_LIMIT,
        monthly: MONTHLY_LIMIT,
        intervalSeconds: INTERVAL_SECONDS
      }
    };

  } catch (error) {
    console.error('[RateLimiter] KV error during getUsageStatus:', error);
    return {
      used: { daily: 0, monthly: 0 },
      remaining: { daily: IP_DAILY_LIMIT, monthly: MONTHLY_LIMIT },
      limits: { daily: IP_DAILY_LIMIT, monthly: MONTHLY_LIMIT, intervalSeconds: INTERVAL_SECONDS }
    };
  }
}

// IPアドレス取得ヘルパー
export function getClientIP(headers: { [key: string]: string | string[] | undefined }, socket?: { remoteAddress?: string }): string {
  const forwarded = headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0]?.trim() || 'unknown';
  }
  if (Array.isArray(forwarded)) {
    return forwarded[0]?.split(',')[0]?.trim() || 'unknown';
  }
  return socket?.remoteAddress || 'unknown';
}
