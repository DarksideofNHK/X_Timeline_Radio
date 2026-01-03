import express from 'express';
import cors from 'cors';
import { collectBuzzPosts } from './api/collect-posts.js';
import { generateScript } from './api/generate-script.js';
import { generateFullScript } from './api/generate-full-script.js';
import { generateAudio } from './api/generate-audio.js';
import { generateAudioOpenAI } from './api/generate-audio-openai.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// バズPost収集API
app.post('/api/collect-posts', async (req, res) => {
  try {
    const { genre, apiKey } = req.body;
    console.log(`[API] Collecting buzz posts for genre: ${genre}`);

    const result = await collectBuzzPosts(genre, apiKey);
    res.json(result);
  } catch (error: any) {
    console.error('[API] Error collecting posts:', error);
    res.status(500).json({ error: error.message });
  }
});

// スクリプト生成API
app.post('/api/generate-script', async (req, res) => {
  try {
    const { posts, genreName, apiKey } = req.body;
    console.log(`[API] Generating script for ${posts.length} posts`);

    const result = await generateScript(posts, genreName, apiKey);
    res.json(result);
  } catch (error: any) {
    console.error('[API] Error generating script:', error);
    res.status(500).json({ error: error.message });
  }
});

// フルスクリプト生成API（AIスクリプトモード用）
app.post('/api/generate-full-script', async (req, res) => {
  try {
    const { allPosts, apiKey, style = 'comprehensive' } = req.body;
    const postCount = Object.values(allPosts as Record<string, any[]>).reduce(
      (sum, posts) => sum + posts.length,
      0
    );
    console.log(`[API] Generating full script for ${postCount} posts (style: ${style})`);

    const result = await generateFullScript({ allPosts, apiKey, style });
    res.json(result);
  } catch (error: any) {
    console.error('[API] Error generating full script:', error);
    res.status(500).json({ error: error.message });
  }
});

// 音声生成API（Gemini）
app.post('/api/generate-audio', async (req, res) => {
  try {
    const { script, apiKey, voiceId = 'Aoede' } = req.body;
    console.log(`[API] Generating audio with Gemini (voice: ${voiceId}, ${script.length} chars)`);

    const result = await generateAudio(script, apiKey, voiceId);
    res.json(result);
  } catch (error: any) {
    console.error('[API] Error generating audio (Gemini):', error);
    res.status(500).json({ error: error.message });
  }
});

// 音声生成API（OpenAI）
app.post('/api/generate-audio-openai', async (req, res) => {
  try {
    const { script, apiKey, voice = 'nova', speed = 1.0 } = req.body;
    console.log(`[API] Generating audio with OpenAI (voice: ${voice}, speed: ${speed}, ${script.length} chars)`);

    const result = await generateAudioOpenAI(script, apiKey, voice, speed);
    res.json(result);
  } catch (error: any) {
    console.error('[API] Error generating audio (OpenAI):', error);
    res.status(500).json({ error: error.message });
  }
});

// ヘルスチェック
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🎙️ X Timeline Radio Server running on http://localhost:${PORT}`);
});
