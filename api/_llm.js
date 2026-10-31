// Model routing and the single enabled tool: live web search.
const MAX_STEPS = 6;
const DEADLINE_MS = 48000;
const GEMINI_MODEL = 'gemini-2.5-flash-lite';
const OPENROUTER_MODEL = 'nvidia/nemotron-3-ultra-550b-a55b:free';

const PERSONA = `You are Glitch, an AI assistant with the personality of an annoyed, passive-aggressive secretary: a little arrogant, but never over the top. You are witty and a bit sarcastic, with light teasing for vague or lazy questions, but you stay technically accurate and genuinely useful. Answer the actual question directly and keep replies tight. Admit uncertainty instead of inventing facts. Drop the sarcasm completely for health, grief, safety or other serious topics.

You are running on a website. Your web tool is available in both Flash and Cognition modes:
- web_search(query): search Google for current information and return a concise summary with source URLs. Use it for current events, recent changes, live or time-sensitive facts, and whenever the user explicitly asks to search. Never pretend you searched if no search results were returned.
You can analyze text extracted from user-attached files when their contents are included in the conversation, including PDFs, code, spreadsheets, and documents. You cannot directly access files on the user’s device, run code, or open apps. Do not claim to execute code; you can explain, review, debug, and write code.`;

const MODE_NOTE = {
  flash: 'Mode: flash. Be quick and light. For current or time-sensitive questions, use web_search results and clearly distinguish verified information from uncertainty.',
  cognition: `Mode: cognition. Think carefully; prefer correctness and depth for reasoning and code. For current or time-sensitive questions, use web_search results and clearly distinguish verified information from uncertainty.\nWhen the user asks you to create, edit, or generate code files, produce complete usable file contents, not just snippets. Put EVERY file in its own fenced code block and include a filename in the opening fence using this exact format: \`\`\`python filename=main.py\n...code...\n\`\`\`. Use the correct language label and a safe, descriptive filename with extension (examples: \`\`\`html filename=index.html\`\`, \`\`\`javascript filename=app.js\`\`, \`\`\`json filename=package.json\`\`). Keep explanations outside the code blocks. For multi-file projects, include every required file and practical setup instructions. The website will display a Download file button for each named code block, so do not omit filenames. Never claim a file was uploaded to a remote server; the download is generated in the user's browser.`,
};

const TOOLS = [
  {
    name: 'web_search',
    description: 'Search the web for current information. Returns a short summary with sources.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: 'What to look up' } },
      required: ['query'],
    },
  },
];

// ---- tool execution ---------------------------------------------------------
async function webSearch(query) {
  const key = process.env.GOOGLE_API_KEY;
  if (!key) return 'Web search is unavailable (GOOGLE_API_KEY is not set).';
  const model = GEMINI_MODEL;
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: `Search the web and answer concisely with the key facts: ${query}` }] }],
      tools: [{ google_search: {} }],
      generationConfig: { maxOutputTokens: 1200 },
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) return `Web search failed (${r.status}).`;
  const data = await r.json();
  const cand = data.candidates && data.candidates[0];
  const text = ((cand && cand.content && cand.content.parts) || []).map((p) => p.text || '').join('').trim();
  const sources = ((cand && cand.groundingMetadata && cand.groundingMetadata.groundingChunks) || [])
    .map((c) => c.web && c.web.uri ? `- ${c.web.title || c.web.uri}: ${c.web.uri}` : '')
    .filter(Boolean).slice(0, 5);
  return (text || 'No results.') + (sources.length ? `\n\nSources:\n${sources.join('\n')}` : '');
}

async function runTool(ctx, name, args) {
  args = args && typeof args === 'object' ? args : {};
  if (name === 'web_search') return webSearch(String(args.query || '').slice(0, 300));
  return `Unknown tool: ${name}`;
}

// ---- Gemini (flash) ---------------------------------------------------------
async function runGemini(ctx, system, messages) {
  const key = process.env.GOOGLE_API_KEY;
  if (!key) throw new Error('Flash mode needs GOOGLE_API_KEY on the server.');
  const model = GEMINI_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.text }],
  }));

  const started = Date.now();
  for (let step = 0; step < MAX_STEPS; step++) {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents,
        tools: [{ functionDeclarations: TOOLS }],
        generationConfig: { maxOutputTokens: 4096 },
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) throw new Error(`Gemini returned ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const data = await r.json();
    const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
    const calls = parts.filter((p) => p.functionCall);
    if (!calls.length) {
      const text = parts.map((p) => p.text || '').join('').trim();
      if (!text) throw new Error('Gemini sent an empty reply.');
      return text;
    }
    contents.push({ role: 'model', parts });
    const answers = [];
    for (const c of calls) {
      const result = await runTool(ctx, c.functionCall.name, c.functionCall.args);
      answers.push({ functionResponse: { name: c.functionCall.name, response: { result } } });
    }
    contents.push({ role: 'user', parts: answers });
    if (Date.now() - started > DEADLINE_MS) break;
  }
  return "I ran out of time before finishing. Ask me again, preferably with a smaller request.";
}

// ---- OpenRouter (cognition) ---------------------------------------------------
async function runOpenRouter(ctx, system, messages) {
  const key = process.env.OPENROUTER_API_KEY;
  const model = OPENROUTER_MODEL;
  if (!key) throw new Error('Cognition mode needs OPENROUTER_API_KEY on the server.');

  const convo = [{ role: 'system', content: system }, ...messages.map((m) => ({ role: m.role, content: m.text }))];
  let useTools = true;
  const started = Date.now();

  for (let step = 0; step < MAX_STEPS; step++) {
    const body = { model, messages: convo, max_tokens: 4096 };
    if (useTools) {
      body.tools = TOOLS.map((t) => ({ type: 'function', function: t }));
    }
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(40000),
    });
    if (!r.ok) {
      const detail = (await r.text()).slice(0, 300);
      if (useTools && /tool/i.test(detail)) { useTools = false; continue; }   // this model can't use tools: chat without them
      throw new Error(`OpenRouter returned ${r.status}: ${detail}`);
    }
    const data = await r.json();
    const msg = data.choices && data.choices[0] && data.choices[0].message;
    if (!msg) throw new Error('OpenRouter sent no message.');
    const calls = msg.tool_calls || [];
    if (!calls.length) {
      const text = (typeof msg.content === 'string' ? msg.content : '').trim();
      if (!text) throw new Error('The model sent an empty reply.');
      return text;
    }
    convo.push({ role: 'assistant', content: msg.content || '', tool_calls: calls });
    for (const c of calls) {
      let args = {};
      try { args = JSON.parse(c.function.arguments || '{}'); } catch { /* bad JSON from the model: run with empty args */ }
      convo.push({ role: 'tool', tool_call_id: c.id, content: await runTool(ctx, c.function.name, args) });
    }
    if (Date.now() - started > DEADLINE_MS) break;
  }
  return "I ran out of time before finishing. Ask me again, preferably with a smaller request.";
}

function systemPrompt(mode) {
  return `${PERSONA}\n\n${MODE_NOTE[mode] || MODE_NOTE.flash}\nToday is ${new Date().toISOString().slice(0, 10)}.`;
}

module.exports = { systemPrompt, runGemini, runOpenRouter, runTool, TOOLS };
