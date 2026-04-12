// src/api/google/extractionService.ts
// AI Service to extract structured action items from raw email content.
// Uses Groq (Llama 3) for high-performance extraction.

import fetch from 'node-fetch';

export interface ExtractedAction {
  title: string;
  description: string;
  metadata: {
    priority?: string;
    dueDate?: string;
    suggestedProject?: string;
  };
}

export async function extractActionItemsFromEmail(subject: string, body: string): Promise<ExtractedAction | null> {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) {
    console.warn('[Extraction] GROQ_API_KEY not set, skipping AI extraction');
    return {
      title: subject,
      description: body.slice(0, 200) + '...',
      metadata: {}
    };
  }

  const prompt = `
    You are a project manager assistant. Extract a single primary action item from this email.
    Return ONLY a JSON object with this structure:
    {
      "title": "Short concise task name",
      "description": "Clear 1-2 sentence description of what needs to be done",
      "metadata": {
        "priority": "low | medium | high",
        "dueDate": "YYYY-MM-DD or null",
        "suggestedProject": "Possible project name or null"
      }
    }

    Email Subject: ${subject}
    Email Body: ${body.slice(0, 2000)}
  `;

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${groqKey}`
      },
      body: JSON.stringify({
        model: 'llama-3-70b-8192', // Use a powerful model for extraction
        messages: [
          { role: 'system', content: 'You extract project tasks from emails. Return raw JSON only.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' }
      })
    }) as any;

    if (!response.ok) {
      console.error('[Extraction] Groq API error:', await response.text());
      return null;
    }

    const data = await response.json() as any;
    const content = data.choices?.[0]?.message?.content;
    
    if (content) {
      return JSON.parse(content) as ExtractedAction;
    }
  } catch (error) {
    console.error('[Extraction] Failed to parse AI response:', error);
  }

  return null;
}
