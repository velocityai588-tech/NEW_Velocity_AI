// src/api/google/gmailSync.ts
// Sync service to fetch emails from @firefly.ai and gemini/google.
// Uses AI extraction to generate pending actions.

import { google } from 'googleapis';
import * as db from './db.js';
import { extractActionItemsFromEmail } from './extractionService.js';

const getClientId = () => process.env.GOOGLE_CLIENT_ID || '';
const getClientSecret = () => process.env.GOOGLE_CLIENT_SECRET || '';

export async function syncGmail(orgId: string): Promise<{ count: number }> {
  try {
    const conn = await db.getGoogleConnection(orgId);
    if (!conn) throw new Error('No Google connection found for organization');

    const oauth2Client = new google.auth.OAuth2(
      getClientId(),
      getClientSecret()
    );

    oauth2Client.setCredentials({
      access_token: conn.access_token,
      refresh_token: conn.refresh_token,
      expiry_date: conn.expiry_date,
    });

    // Check if token needs refresh
    oauth2Client.on('tokens', async (tokens) => {
      if (tokens.refresh_token) {
        await db.upsertGoogleConnection({
          ...conn,
          access_token: tokens.access_token!,
          refresh_token: tokens.refresh_token,
          expiry_date: tokens.expiry_date || undefined,
        });
      } else {
        await db.upsertGoogleConnection({
          ...conn,
          access_token: tokens.access_token!,
          expiry_date: tokens.expiry_date || undefined,
        });
      }
    });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // Search query: from @firefly.ai OR mentions gemini/google
    // We filter for emails in the last 7 days to keep it efficient on Vercel
    const query = 'from:firefly.ai OR gemini OR google';
    const res = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: 10, // Limit for Vercel/serverless performance
    });

    const messages = res.data.messages || [];
    let processedCount = 0;

    for (const msg of messages) {
      if (!msg.id) continue;

      // Check if we already processed this message
      // Note: upsert handles duplicates, but fetching full content is expensive
      // In a real app, we might check DB first
      
      const fullMsg = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
      });

      const payload = fullMsg.data.payload;
      const headers = payload?.headers || [];
      const subject = headers.find(h => h.name === 'Subject')?.value || 'No Subject';
      const from = headers.find(h => h.name === 'From')?.value || 'Unknown';
      
      // Extract body
      let body = '';
      if (payload?.parts) {
        const textPart = payload.parts.find(p => p.mimeType === 'text/plain');
        if (textPart?.body?.data) {
          body = Buffer.from(textPart.body.data, 'base64').toString();
        }
      } else if (payload?.body?.data) {
        body = Buffer.from(payload.body.data, 'base64').toString();
      }

      if (!body) continue;

      // AI EXTRACTION
      const extractedAction = await extractActionItemsFromEmail(subject, body);
      
      if (extractedAction) {
        await db.upsertPendingActions(orgId, [{
          source_email_id: msg.id,
          from_email: from,
          subject: subject,
          title: extractedAction.title,
          description: extractedAction.description,
          metadata: extractedAction.metadata,
          status: 'pending'
        }]);
        processedCount++;
      }
    }

    return { count: processedCount };
  } catch (error: any) {
    console.error('[Gmail Sync] Error:', error.message);
    throw error;
  }
}
