# Skill: 新番組タイプの追加

X Timeline Radio v2に新しい番組タイプを追加する際の手順とベストプラクティス。

## 概要

このスキルは、既存の3番組（X Timeline Radio、政治家ウオッチ、オールドメディアをぶっ壊せラジオ）をベースに、新しい番組タイプを追加するためのガイドです。

## 必要な変更ファイル一覧

1. `src/config/showTypes.ts` - 番組定義
2. `api/collect-posts.ts` - Grok投稿収集クエリ
3. `api/generate-full-script.ts` - 台本生成プロンプト
4. `src/components/SectionIndicator.tsx` - UIアイコン

---

## Step 1: 番組定義の追加（showTypes.ts）

```typescript
// src/config/showTypes.ts に追加

export const SHOW_TYPES: Record<string, ShowTypeConfig> = {
  // ... 既存の定義 ...

  'new-show-id': {
    id: 'new-show-id',
    name: '新番組名',
    description: '番組の説明文',
    voice: 'shimmer',  // alloy, echo, fable, onyx, nova, shimmer
    bgm: '/bgm/適切なBGM.mp3',
    allowDownload: true,
    genres: [
      { id: 'genre1', name: 'ジャンル1', icon: '🔥' },
      { id: 'genre2', name: 'ジャンル2', icon: '📰' },
      // 3-7ジャンル推奨
    ],
  },
};
```

### 重要ポイント
- `id`はケバブケース（例: `politician-watch`）
- `genres`は3〜7個が適切（多すぎると番組が長くなる）
- `voice`は番組の雰囲気に合わせて選択

---

## Step 2: Grok投稿収集クエリの追加（collect-posts.ts）

### 2.1 クエリ定義の追加

```typescript
// api/collect-posts.ts

// ジャンル別のGrok検索クエリ
const newShowQueries: Record<string, string> = {
  'genre1': '(キーワード1 OR キーワード2) (条件1 OR 条件2) lang:ja',
  'genre2': '検索クエリ...',
};
```

### 2.2 クエリ選択ロジックの追加

```typescript
// getQueriesForGenre関数内に追加
if (showType === 'new-show-id') {
  return newShowQueries[genre] || '日本語 バズ投稿';
}
```

### 2.3 Grokへの指示文追加（重要）

```typescript
// 投稿収集時の追加指示
const newShowInstructions = isNewShow ? `
【重要：○○関連投稿の収集ポイント】

★最重要★ 以下を含む投稿を優先：
- 具体的な事実や数字を含む投稿
- 元ソースへのリンクがある投稿
- 賛否両論の反応がある投稿

【投稿データに含めるべき情報】
- key_point: 投稿の要点
- source_type: 情報源の種類
- engagement_reason: なぜバズっているか
` : '';
```

### Grokクエリのベストプラクティス

1. **具体的なキーワード**: 抽象的な言葉より具体的なキーワード
2. **OR演算子**: 類義語や関連語をORで繋ぐ
3. **除外条件**: `-spam -広告` などでノイズ除去
4. **日本語指定**: `lang:ja` を必ず含める
5. **時間制限**: 直近24時間以内の投稿を優先

---

## Step 3: 台本生成プロンプトの追加（generate-full-script.ts）

### 3.1 番組別プロンプトの追加

```typescript
// api/generate-full-script.ts

function getShowSpecificPrompt(showType: string): string {
  // ... 既存のcase文 ...

  if (showType === 'new-show-id') {
    return `
あなたは「新番組名」のAIパーソナリティです。

【番組コンセプト】
- ターゲット: 〇〇に興味がある大人
- トーン: 〇〇（例: 辛口だが愛のある、ユーモアを交えた）
- 特徴: 〇〇

【各コーナーの構成】
1. オープニング（30秒）: 挨拶と今日のテーマ紹介
2. メインコーナー×ジャンル数: 各2-3分、投稿を3-5件引用
3. クロージング（30秒）: まとめと締めの挨拶

【投稿引用のルール】
- 必ず「〇〇さんの投稿では」と発言者を明示
- 投稿内容を要約しつつ核心を伝える
- 批判的な投稿も公平に紹介

【重要：平易な言葉への置き換え】
- 難読熟語は避け、一般的な表現に言い換える
- ラジオで聞いて一発で意味が伝わる言葉を選ぶ
`;
  }
}
```

### 3.2 TTS読み方ルールの追加（必須）

```typescript
【重要：TTSの読み方 - スクリプト内でひらがなに変換すること】
以下の漢字は**スクリプト内でひらがなに変換して出力**すること：
- 「血税」→「けつぜい」
- 「捏造」→「ねつぞう」
- 「忖度」→「そんたく」
- 「揶揄」→「やゆ」
- 「糾弾」→「きゅうだん」
- 「誹謗」→「ひぼう」
- 「偏向」→「へんこう」
- 「大盤振る舞い」→「おおばんぶるまい」
- 「憤る」→「いきどおる」
- 「媚中反日」→「びちゅうはんにち」
- 「火の玉」→「ひのたま」
- 「厚顔無恥」→「こうがんむち」
// 番組特有の難読語があれば追加
```

### TTS対策のベストプラクティス

1. **難読漢字はひらがなに**: Geminiプロンプトで指示
2. **平易な言葉を推奨**: 四字熟語より日常語
3. **人名は読み仮名追加**: 政治家名など
4. **チャンク境界対策**: 先頭に全角スペース追加済み

---

## Step 4: UIアイコンの追加（SectionIndicator.tsx）

### 4.1 番組別アイコンの追加

```typescript
// src/components/SectionIndicator.tsx

// getSectionIcon関数内に追加
if (type === 'opening') {
  if (showType === 'new-show-id') return '🎯';  // 番組を象徴するアイコン
  // ...
}
if (type === 'closing') {
  if (showType === 'new-show-id') return '✨';
  // ...
}

// ジャンル別アイコン
const newShowIcons: Record<string, string> = {
  'genre1': '🔥',
  'genre2': '📰',
  // ...
};

if (showType === 'new-show-id') icons = newShowIcons;
```

### 4.2 ジャンル短縮名の追加

```typescript
// getGenreShortName関数内に追加
const newShowNames: Record<string, string> = {
  'genre1': '略称1',  // 2-3文字
  'genre2': '略称2',
};

if (showType === 'new-show-id') names = newShowNames;
```

---

## Step 5: テストと調整

### 5.1 動作確認チェックリスト

- [ ] 番組選択メニューに新番組が表示される
- [ ] 投稿収集が正常に動作する
- [ ] 台本生成が正常に動作する
- [ ] TTS音声が正しく読み上げる
- [ ] UIアイコンが正しく表示される
- [ ] BGMが正しく再生される

### 5.2 よくある問題と対処

| 問題 | 原因 | 対処 |
|------|------|------|
| 投稿が集まらない | Grokクエリが狭すぎる | キーワードを広げる、OR条件追加 |
| TTSが読めない | 難読漢字 | ひらがな変換リストに追加 |
| 番組が長すぎる | ジャンルが多い | ジャンル数を減らす（5個以下推奨） |
| 単語の頭が切れる | チャンク境界 | 全角スペース追加済み、それでも問題なら分割ロジック調整 |

### 5.3 TTS読み上げテスト方法

1. 台本生成後、`sections`の各`chunks`を確認
2. 難読漢字がひらがなに変換されているか確認
3. 実際に再生して聞き取りにくい箇所をメモ
4. 問題があればTTSルールに追加

---

## 番組追加の実例

### 例: 「テック速報ラジオ」を追加する場合

```typescript
// 1. showTypes.ts
'tech-news': {
  id: 'tech-news',
  name: 'テック速報ラジオ',
  voice: 'nova',
  genres: [
    { id: 'ai', name: 'AI・機械学習', icon: '🤖' },
    { id: 'startup', name: 'スタートアップ', icon: '🚀' },
    { id: 'gadget', name: 'ガジェット', icon: '📱' },
  ],
}

// 2. collect-posts.ts
const techNewsQueries = {
  'ai': '(AI OR 機械学習 OR ChatGPT OR Claude) (発表 OR リリース OR 新機能) lang:ja',
  'startup': '(スタートアップ OR 資金調達 OR IPO) (日本 OR 国内) lang:ja',
  'gadget': '(iPhone OR Android OR ガジェット) (レビュー OR 発売) lang:ja',
};

// 3. generate-full-script.ts - テック用語の読み方追加
- 「AI」→「エーアイ」
- 「API」→「エーピーアイ」
- 「UI/UX」→「ユーアイ・ユーエックス」
```

---

## 関連ファイル

- `/src/config/showTypes.ts` - 番組定義
- `/api/collect-posts.ts` - 投稿収集API
- `/api/generate-full-script.ts` - 台本生成API
- `/src/components/SectionIndicator.tsx` - UIコンポーネント
- `/src/components/AudioPlayer.tsx` - 音声再生
- `/src/store/useStore.ts` - 状態管理

## 注意事項

1. **Vercelデプロイ**: APIファイルを変更したら自動デプロイを待つ
2. **キャッシュ**: ブラウザキャッシュをクリアしてテスト
3. **BGMファイル**: `/public/bgm/`に配置、著作権に注意
4. **APIキー**: Grok API（XAI_API_KEY）、Gemini API（GEMINI_API_KEY）が必要
