// Groq API Integration
const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

export async function callAxiom(messages, systemPrompt, onChunk) {
  const payload = {
    model: 'llama-3.3-70b-versatile', // High-performance model on Groq
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => ({
        role: m.role === 'ai' ? 'assistant' : 'user',
        content: m.text,
      }))
    ],
    temperature: 0.7,
    max_tokens: 500,
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
    throw new Error(`AXIOM API error: ${response.status} - ${err}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (line.trim() === '' || line.trim() === 'data: [DONE]') continue;
      if (line.startsWith('data: ')) {
        try {
          const json = JSON.parse(line.slice(6));
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
}
