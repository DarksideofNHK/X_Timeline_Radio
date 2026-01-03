import type { BuzzPost } from '../../src/types/index.js';

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

export async function generateScript(
  posts: BuzzPost[],
  genreName: string,
  apiKey: string
): Promise<{ script: string }> {
  // 各Postを読み上げ用にフォーマット
  const postTexts = posts
    .map((p, i) => {
      const metrics = p.metrics.likes > 0
        ? `（いいね${p.metrics.likes.toLocaleString()}）`
        : '';
      return `${i + 1}. @${p.author.username}${p.author.name !== p.author.username ? `（${p.author.name}）` : ''}さん${metrics}:「${p.text}」`;
    })
    .join('\n');

  const prompt = `
あなたはラジオDJです。お便りコーナーのように、Xの投稿を次々と紹介してください。

【ジャンル】${genreName}

【紹介する投稿】
${postTexts}

【読み上げスタイル】
- 各投稿を「@ユーザー名さんの投稿。『投稿内容』」の形式で紹介
- 投稿ごとに「おお〜」「なるほど」「これは手厳しい！」など短い合いの手を入れる
- テンポよく、サクサクと次々紹介
- 全体で2〜3分程度の長さ
- 最初に「${genreName}のコーナーです！」など軽い導入

【禁止事項】
- 長々とした解説や分析は不要
- 投稿内容を言い換えたり要約しないで、できるだけ原文のまま読む
- URLは読まない
- 「リンクはこちら」などの案内は不要

読み上げスクリプトのみを出力してください:
`;

  const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.8,
        maxOutputTokens: 2048,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const script = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

  console.log(`[Script] Generated ${script.length} chars for ${genreName}`);

  return { script };
}
