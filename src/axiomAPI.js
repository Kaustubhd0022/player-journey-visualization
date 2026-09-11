// Groq API Integration
const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const CONFIGURED_MODEL = import.meta.env.VITE_GROQ_MODEL || 'openai/gpt-oss-120b';

const CANDIDATE_MODELS = [
  CONFIGURED_MODEL,
  'openai/gpt-oss-120b',
  'qwen/qwen3.8-27b',
  'openai/gpt-oss-20b',
  'groq/compound',
].filter((m, idx, arr) => m && arr.indexOf(m) === idx);

export async function callAxiom(messages, systemPrompt, onChunk) {
  let lastError = null;

  for (const model of CANDIDATE_MODELS) {
    try {
      const payload = {
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages.map(m => ({
            role: m.role === 'ai' ? 'assistant' : 'user',
            content: m.text,
          }))
        ],
        temperature: 0.7,
        max_tokens: 1000,
        stream: true,
      };

      const response = await fetch(GROQ_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const err = await response.text();
        if (response.status === 404 || err.includes('model_not_found')) {
          console.warn(`[AXIOM] Model "${model}" not available (404), trying fallback...`);
          lastError = new Error(`AXIOM API error: ${response.status} - ${err}`);
          continue;
        }
        throw new Error(`AXIOM API error: ${response.status} - ${err}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (trimmed.startsWith('data: ')) {
            try {
              const json = JSON.parse(trimmed.slice(6));
              const content = json.choices[0]?.delta?.content || '';
              if (content) {
                fullText += content;
                onChunk(fullText);
              }
            } catch (e) {
              // Skip malformed chunks
            }
          }
        }
      }

      return fullText;
    } catch (err) {
      if (err.message && (err.message.includes('model_not_found') || err.message.includes('404'))) {
        continue;
      }
      throw err;
    }
  }

  throw lastError || new Error('No available Groq model succeeded.');
}
