import type { VercelRequest, VercelResponse } from '@vercel/node';
import { checkRateLimit, consumeRateLimit, getUsageStatus, getClientIP } from '../lib/rateLimiter';
import { processDictionary } from '../lib/dictionaryProcessor';

/**
 * フリーミアム生成エンドポイント
 *
 * - 認証不要
 * - トピック1つのみ指定可能
 * - オープニング + 第1コーナーのみ生成
 * - レート制限: IP 2回/日、10分間隔、月1000回グローバル
 */

// 許可される番組タイプ
const ALLOWED_SHOW_TYPES = [
  'x-timeline-radio',
  'politician-watch',
  'old-media-buster',
  'disaster-news'
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const clientIP = getClientIP(req.headers as any, req.socket);

  // GET: 使用状況の確認
  if (req.method === 'GET') {
    try {
      const status = await getUsageStatus(clientIP);
      return res.status(200).json({
        success: true,
        usage: status,
        message: `本日の残り生成回数: ${status.remaining.daily}/${status.limits.daily}回`,
        costInfo: '1回あたり約$0.02（約¥3）のコストがかかります'
      });
    } catch (error) {
      console.error('[Freemium] Error getting usage status:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to get usage status'
      });
    }
  }

  // POST: 番組生成
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { showType = 'x-timeline-radio', topic } = req.body;

    // 番組タイプの検証
    if (!ALLOWED_SHOW_TYPES.includes(showType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid show type',
        message: `利用可能な番組: ${ALLOWED_SHOW_TYPES.join(', ')}`,
        allowedShowTypes: ALLOWED_SHOW_TYPES
      });
    }

    // トピックの検証（最大50文字）
    const sanitizedTopic = topic?.trim().slice(0, 50) || '';

    // レート制限チェック
    const rateLimitCheck = await checkRateLimit(clientIP);
    if (!rateLimitCheck.allowed) {
      const messages: Record<string, string> = {
        'ip_daily': `本日の生成上限（${rateLimitCheck.remaining.daily + 2}回）に達しました。明日またお試しください。`,
        'interval': `連続生成は${Math.ceil(rateLimitCheck.remaining.intervalSeconds / 60)}分後に可能です。`,
        'global_monthly': 'サービス全体の月間上限に達しました。来月までお待ちください。'
      };

      return res.status(429).json({
        success: false,
        error: 'Rate limit exceeded',
        reason: rateLimitCheck.reason,
        message: messages[rateLimitCheck.reason || 'ip_daily'],
        remaining: rateLimitCheck.remaining,
        resetAt: rateLimitCheck.resetAt
      });
    }

    console.log(`[Freemium] Generating ${showType} for IP: ${clientIP}, topic: "${sanitizedTopic}"`);

    // 1. 投稿収集
    const collectResponse = await fetch(`https://${req.headers.host}/api/collect-posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        showType,
        topic: sanitizedTopic,
        apiKey: process.env.XAI_API_KEY,
        freemiumMode: true  // フリーミアムモードフラグ
      })
    });

    if (!collectResponse.ok) {
      const errorText = await collectResponse.text();
      console.error('[Freemium] Collect posts failed:', errorText);
      return res.status(500).json({
        success: false,
        error: 'Failed to collect posts',
        message: '投稿の収集に失敗しました。しばらく待ってから再試行してください。'
      });
    }

    const postsData = await collectResponse.json();

    // 2. 台本生成 + TTS（フリーミアムモード：第1コーナーまで）
    const scriptResponse = await fetch(`https://${req.headers.host}/api/generate-full-script`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        allPosts: postsData.allPosts || postsData,
        showType,
        apiKey: process.env.GEMINI_API_KEY,
        freemiumMode: true  // フリーミアムモードフラグ
      })
    });

    if (!scriptResponse.ok) {
      const errorText = await scriptResponse.text();
      console.error('[Freemium] Generate script failed:', errorText);
      return res.status(500).json({
        success: false,
        error: 'Failed to generate script',
        message: '台本生成に失敗しました。しばらく待ってから再試行してください。'
      });
    }

    const scriptData = await scriptResponse.json();

    // フリーミアムモード: 最初のセクションのみ返す（オープニング+第1コーナー統合済み）
    const freemiumSections = scriptData.sections?.slice(0, 1) || [];

    // レート制限を消費（生成成功後）
    const consumeResult = await consumeRateLimit(clientIP);

    console.log(`[Freemium] Successfully generated ${showType} for IP: ${clientIP}`);

    return res.status(200).json({
      success: true,
      showType,
      topic: sanitizedTopic || null,
      sections: freemiumSections,
      totalDuration: freemiumSections.reduce((sum: number, s: any) => sum + (s.estimatedDuration || 0), 0),
      showConfig: scriptData.showConfig,
      isFreemium: true,
      usage: {
        remaining: consumeResult.remaining,
        limits: {
          daily: 2,
          intervalSeconds: 600,
          monthly: 1000
        },
        resetAt: consumeResult.resetAt
      },
      upgradePrompt: {
        message: '全コーナーを聴くにはAPIキーを設定してください',
        benefits: [
          '全コーナーを聴ける',
          'ファクトチェック機能',
          'フルカスタマイズ',
          '無制限生成'
        ]
      },
      disclaimer: 'この番組はAIが生成したコンテンツです。事実確認は行われていません。'
    });

  } catch (error: any) {
    console.error('[Freemium] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: '予期せぬエラーが発生しました。しばらく待ってから再試行してください。'
    });
  }
}
