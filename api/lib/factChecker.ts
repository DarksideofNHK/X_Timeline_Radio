/**
 * ファクトチェッカーモジュール
 * Gemini API + Google Search Groundingを使用して台本の事実確認を行う
 * フルモード（APIキー設定時）のみ使用
 */

// Gemini API with Grounding
const GEMINI_GROUNDING_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

export interface FactCheckIssue {
  original: string;        // 問題のある文章
  problem: string;         // 何が問題か
  suggestion: string;      // 修正案
  confidence: 'high' | 'medium' | 'low';  // 信頼度
  source?: string;         // 情報源（あれば）
}

export interface FactCheckResult {
  verified: boolean;       // 問題なしならtrue
  issues: FactCheckIssue[];
  checkedAt: string;       // チェック日時
  scriptModified: boolean; // 台本を修正したかどうか
}

export interface ScriptSection {
  id: string;
  type: string;
  title: string;
  script: string;
  chunks?: string[];
  estimatedDuration: number;
}

/**
 * 台本のファクトチェックを実行
 * @param sections 台本セクション配列
 * @param apiKey Gemini APIキー
 * @returns ファクトチェック結果
 */
export async function checkFacts(
  sections: ScriptSection[],
  apiKey: string
): Promise<FactCheckResult> {
  const issues: FactCheckIssue[] = [];

  // 各セクションをチェック（オープニング、各コーナー）
  for (const section of sections) {
    if (!section.script || section.script.length < 50) continue;

    try {
      const sectionIssues = await checkSectionFacts(section.script, section.title, apiKey);
      issues.push(...sectionIssues);
    } catch (error) {
      console.error(`[FactChecker] Error checking section "${section.title}":`, error);
      // エラーがあっても続行
    }
  }

  return {
    verified: issues.length === 0,
    issues,
    checkedAt: new Date().toISOString(),
    scriptModified: false,
  };
}

/**
 * 単一セクションの事実確認
 */
async function checkSectionFacts(
  script: string,
  sectionTitle: string,
  apiKey: string
): Promise<FactCheckIssue[]> {
  const prompt = `以下のラジオ番組台本の事実関係を確認してください。

【セクション】${sectionTitle}

【台本内容】
${script}

【チェック対象】
1. 数字（金額、人数、日付、統計など）が正確か
2. 人名と役職が正しいか
3. 出来事や事実関係が正確か
4. 引用されている発言の内容が事実と異なっていないか
5. 明らかな誤情報や古い情報が含まれていないか

【チェック不要な項目】
- 投稿者の個人的な意見や感想
- 冗談やジョーク
- ラジオ番組としての演出（「すごいですね」などのリアクション）
- 正確さを求められない一般的な表現

【重要】
- 事実と確認できないものは報告しないでください
- 明らかに間違っている場合のみ報告
- 不確かな場合は報告しない（過剰な修正を避ける）

【出力形式】
問題が見つかった場合のみ、JSON形式で出力してください。
問題がない場合は {"issues": []} と出力してください。

\`\`\`json
{
  "issues": [
    {
      "original": "問題のある文章の引用",
      "problem": "何が問題か（具体的に）",
      "suggestion": "修正案",
      "confidence": "high/medium/low",
      "source": "情報源（あれば）"
    }
  ]
}
\`\`\``;

  try {
    // Gemini API with Google Search Grounding
    const response = await fetch(`${GEMINI_GROUNDING_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,  // 低い温度で事実重視
          maxOutputTokens: 4096,
          responseMimeType: 'application/json',
        },
        tools: [{
          google_search_retrieval: {
            dynamic_retrieval_config: {
              mode: 'MODE_DYNAMIC',
              dynamic_threshold: 0.3,  // 検索を積極的に使用
            }
          }
        }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[FactChecker] Gemini API error:', response.status, errorText.slice(0, 200));
      return [];
    }

    const data = await response.json();
    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // JSONを抽出
    const parsed = extractJSON(responseText);
    const issues = parsed.issues || [];

    console.log(`[FactChecker] Section "${sectionTitle}": ${issues.length} issues found`);

    return issues.map((issue: any) => ({
      original: issue.original || '',
      problem: issue.problem || '',
      suggestion: issue.suggestion || '',
      confidence: issue.confidence || 'medium',
      source: issue.source,
    }));

  } catch (error) {
    console.error('[FactChecker] Error:', error);
    return [];
  }
}

/**
 * ファクトチェック結果を元に台本を修正
 */
export function applyFactCheckFixes(
  sections: ScriptSection[],
  issues: FactCheckIssue[]
): ScriptSection[] {
  if (issues.length === 0) return sections;

  // 高信頼度の問題のみ自動修正
  const highConfidenceIssues = issues.filter(i => i.confidence === 'high');

  if (highConfidenceIssues.length === 0) {
    console.log('[FactChecker] No high-confidence issues to fix automatically');
    return sections;
  }

  return sections.map(section => {
    let modifiedScript = section.script;

    for (const issue of highConfidenceIssues) {
      if (issue.original && issue.suggestion && modifiedScript.includes(issue.original)) {
        console.log(`[FactChecker] Fixing: "${issue.original}" -> "${issue.suggestion}"`);
        modifiedScript = modifiedScript.replace(issue.original, issue.suggestion);
      }
    }

    // chunksも再生成が必要な場合
    if (modifiedScript !== section.script) {
      return {
        ...section,
        script: modifiedScript,
        // chunksはgenerate-full-script.tsで再生成される
      };
    }

    return section;
  });
}

/**
 * ファクトチェック注意書きを追加（フリーミアムモード用）
 */
export function getFactCheckDisclaimer(showType: string): string {
  const disclaimers: Record<string, string> = {
    'x-timeline-radio': 'この番組はAIが生成したコンテンツです。Xの投稿内容の正確性は保証されません。',
    'politician-watch': 'この番組はAIが生成した政治コンテンツです。政治家の発言は原文を確認してください。',
    'old-media-buster': 'この番組はAIが生成したメディア批評です。紹介した内容は投稿者の意見であり、事実確認はされていません。',
    'disaster-news': 'この番組はAIが生成した災害情報です。最新の正確な情報は気象庁や自治体でご確認ください。',
  };

  return disclaimers[showType] || disclaimers['x-timeline-radio'];
}

/**
 * JSON抽出ヘルパー
 */
function extractJSON(text: string): any {
  // コードブロック内のJSONを抽出
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    return JSON.parse(codeBlockMatch[1].trim());
  }

  // 直接JSONを抽出
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[0]);
  }

  return { issues: [] };
}
