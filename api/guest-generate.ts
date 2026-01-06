import type { VercelRequest, VercelResponse } from '@vercel/node';

// ゲスト認証用パスワード（環境変数から取得）
const GUEST_PASSWORD = process.env.GUEST_PASSWORD || '';

// 1日あたりの生成上限
const DAILY_LIMIT = parseInt(process.env.GUEST_DAILY_LIMIT || '10', 10);

// レート制限用のインメモリストレージ（Vercel Serverlessでは再デプロイでリセット）
// 本格運用時はRedisやKVストアを使用
interface UsageRecord {
  count: number;
  date: string;
}

const usageMap = new Map<string, UsageRecord>();

function getTodayString(): string {
  const now = new Date();
  return now.toISOString().split('T')[0]; // YYYY-MM-DD
}

function checkAndUpdateUsage(ip: string): { allowed: boolean; remaining: number; resetAt: string } {
  const today = getTodayString();
  const record = usageMap.get(ip);

  if (!record || record.date !== today) {
    // 新しい日または初回
    usageMap.set(ip, { count: 1, date: today });
    return { allowed: true, remaining: DAILY_LIMIT - 1, resetAt: `${today}T23:59:59+09:00` };
  }

  if (record.count >= DAILY_LIMIT) {
    return { allowed: false, remaining: 0, resetAt: `${today}T23:59:59+09:00` };
  }

  record.count++;
  return { allowed: true, remaining: DAILY_LIMIT - record.count, resetAt: `${today}T23:59:59+09:00` };
}

function getUsageStatus(ip: string): { used: number; remaining: number; limit: number } {
  const today = getTodayString();
  const record = usageMap.get(ip);

  if (!record || record.date !== today) {
    return { used: 0, remaining: DAILY_LIMIT, limit: DAILY_LIMIT };
  }

  return { used: record.count, remaining: DAILY_LIMIT - record.count, limit: DAILY_LIMIT };
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
    const status = getUsageStatus(clientIp);
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
  const usageCheck = checkAndUpdateUsage(clientIp);
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

    // 許可された番組タイプ
    const allowedShowTypes = ['x-timeline-radio', 'disaster-news'];
    if (!allowedShowTypes.includes(showType)) {
      return res.status(400).json({
        error: 'Invalid show type',
        message: `ゲストモードで利用可能な番組: ${allowedShowTypes.join(', ')}`,
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
