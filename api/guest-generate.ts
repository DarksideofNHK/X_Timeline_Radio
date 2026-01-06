import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from '@vercel/kv';

// ゲスト認証用パスワード（環境変数から取得）
const GUEST_PASSWORD = process.env.GUEST_PASSWORD || '';

// 1日あたりの生成上限
const DAILY_LIMIT = parseInt(process.env.GUEST_DAILY_LIMIT || '20', 10);

// 日本時間の今日の日付を取得
function getTodayStringJST(): string {
  const now = new Date();
  const jstOffset = 9 * 60 * 60 * 1000; // UTC+9
  const jstDate = new Date(now.getTime() + jstOffset);
  return jstDate.toISOString().split('T')[0]; // YYYY-MM-DD
}

// KVのキーを生成
function getKVKey(ip: string): string {
  const today = getTodayStringJST();
  // IPアドレスをハッシュ化して短くする
  const ipHash = ip.replace(/[.:]/g, '_');
  return `guest:${today}:${ipHash}`;
}

// 使用状況を確認・更新（Vercel KV使用）
async function checkAndUpdateUsage(ip: string): Promise<{ allowed: boolean; remaining: number; resetAt: string }> {
  const today = getTodayStringJST();
  const key = getKVKey(ip);

  try {
    // 現在の使用回数を取得
    const currentCount = await kv.get<number>(key) || 0;

    if (currentCount >= DAILY_LIMIT) {
      return { allowed: false, remaining: 0, resetAt: `${today}T23:59:59+09:00` };
    }

    // カウントを増やす（24時間後に自動期限切れ）
    await kv.set(key, currentCount + 1, { ex: 86400 }); // 24時間TTL

    return {
      allowed: true,
      remaining: DAILY_LIMIT - currentCount - 1,
      resetAt: `${today}T23:59:59+09:00`
    };
  } catch (error) {
    console.error('[Guest] KV error:', error);
    // KVエラー時はフォールバックとして許可（ただしログに記録）
    return { allowed: true, remaining: DAILY_LIMIT - 1, resetAt: `${today}T23:59:59+09:00` };
  }
}

// 使用状況を取得
async function getUsageStatus(ip: string): Promise<{ used: number; remaining: number; limit: number }> {
  const key = getKVKey(ip);

  try {
    const currentCount = await kv.get<number>(key) || 0;
    return {
      used: currentCount,
      remaining: DAILY_LIMIT - currentCount,
      limit: DAILY_LIMIT
    };
  } catch (error) {
    console.error('[Guest] KV error:', error);
    return { used: 0, remaining: DAILY_LIMIT, limit: DAILY_LIMIT };
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Guest-Password');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // ゲストモードが有効か確認
  if (!GUEST_PASSWORD) {
    return res.status(503).json({
      error: 'Guest mode is not enabled',
      message: 'ゲストモードは現在無効です'
    });
  }

  const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
    || req.socket?.remoteAddress
    || 'unknown';

  // GET: 使用状況の確認
  if (req.method === 'GET') {
    const status = await getUsageStatus(clientIp);
    return res.status(200).json({
      ...status,
      costPerGeneration: '$0.10 (≒15円)',
      message: `本日の残り生成回数: ${status.remaining}/${status.limit}回`
    });
  }

  // POST: 番組生成
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // パスワード認証
  const password = req.headers['x-guest-password'] || req.body?.password;
  if (password !== GUEST_PASSWORD) {
    return res.status(401).json({
      error: 'Invalid password',
      message: 'パスワードが正しくありません'
    });
  }

  // レート制限チェック
  const usageCheck = await checkAndUpdateUsage(clientIp);
  if (!usageCheck.allowed) {
    return res.status(429).json({
      error: 'Daily limit exceeded',
      message: `本日の生成上限（${DAILY_LIMIT}回）に達しました`,
      remaining: 0,
      resetAt: usageCheck.resetAt
    });
  }

  try {
    const { showType = 'x-timeline-radio' } = req.body;

    // 全ての番組タイプを許可
    const allowedShowTypes = [
      'x-timeline-radio',
      'politician-watch',
      'old-media-buster',
      'disaster-news'
    ];
    if (!allowedShowTypes.includes(showType)) {
      return res.status(400).json({
        error: 'Invalid show type',
        message: `利用可能な番組: ${allowedShowTypes.join(', ')}`,
        allowedShowTypes
      });
    }

    console.log(`[Guest] Generating ${showType} for IP: ${clientIp}`);

    // 1. 投稿収集 (collect-posts)
    const collectResponse = await fetch(`https://${req.headers.host}/api/collect-posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        showType,
        apiKey: process.env.XAI_API_KEY
      })
    });

    if (!collectResponse.ok) {
      const errorText = await collectResponse.text();
      console.error('[Guest] Collect posts failed:', errorText);
      return res.status(500).json({
        error: 'Failed to collect posts',
        message: '投稿の収集に失敗しました',
        remaining: usageCheck.remaining
      });
    }

    const postsData = await collectResponse.json();

    // 2. 台本生成 + TTS (generate-full-script)
    const scriptResponse = await fetch(`https://${req.headers.host}/api/generate-full-script`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        allPosts: postsData.allPosts || postsData,
        showType,
        apiKey: process.env.GEMINI_API_KEY
      })
    });

    if (!scriptResponse.ok) {
      const errorText = await scriptResponse.text();
      console.error('[Guest] Generate script failed:', errorText);
      return res.status(500).json({
        error: 'Failed to generate script',
        message: '台本生成に失敗しました',
        remaining: usageCheck.remaining
      });
    }

    const scriptData = await scriptResponse.json();

    console.log(`[Guest] Successfully generated ${showType} for IP: ${clientIp}`);

    return res.status(200).json({
      success: true,
      showType,
      script: scriptData,
      usage: {
        remaining: usageCheck.remaining,
        limit: DAILY_LIMIT,
        resetAt: usageCheck.resetAt
      },
      estimatedCost: '$0.10'
    });

  } catch (error) {
    console.error('[Guest] Error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: '予期せぬエラーが発生しました',
      remaining: usageCheck.remaining
    });
  }
}
