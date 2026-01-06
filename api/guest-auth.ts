import type { VercelRequest, VercelResponse } from '@vercel/node';

// ゲスト認証用パスワード（環境変数から取得）
const GUEST_PASSWORD = process.env.GUEST_PASSWORD || '';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ゲストモードが有効か確認
  if (!GUEST_PASSWORD) {
    return res.status(503).json({
      success: false,
      message: 'ゲストモードは現在無効です'
    });
  }

  const { password } = req.body || {};

  if (!password) {
    return res.status(400).json({
      success: false,
      message: 'パスワードを入力してください'
    });
  }

  // パスワード認証
  if (password === GUEST_PASSWORD) {
    console.log('[GuestAuth] Authentication successful');
    return res.status(200).json({
      success: true,
      message: '認証成功'
    });
  } else {
    console.log('[GuestAuth] Authentication failed');
    return res.status(401).json({
      success: false,
      message: 'パスワードが正しくありません'
    });
  }
}
