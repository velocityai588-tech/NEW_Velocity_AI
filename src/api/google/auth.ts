// src/api/google/auth.ts
// Implements Google OAuth2 flow for Gmail integration.
// Scopes: gmail.readonly, userinfo.email.

import { Request, Response } from 'express';
import { google } from 'googleapis';
import * as db from './db.js';

const getClientId = () => process.env.GOOGLE_CLIENT_ID || '';
const getClientSecret = () => process.env.GOOGLE_CLIENT_SECRET || '';

const getRedirectUri = (req: Request) => {
  const isProduction =
    process.env.NODE_ENV === 'production' ||
    process.env.VERCEL === '1' ||
    req.hostname === 'joinvelocity.co' || 
    req.hostname === 'www.joinvelocity.co';

  if (isProduction) {
    return 'https://www.joinvelocity.co/api/google/auth/callback';
  }
  return 'http://localhost:4000/api/google/auth/callback';
};

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

export async function login(req: Request, res: Response): Promise<void> {
  try {
    const oauth2Client = new google.auth.OAuth2(
      getClientId(),
      getClientSecret(),
      getRedirectUri(req)
    );

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline', // Required to get a refresh_token
      scope: SCOPES,
      prompt: 'consent', // Force consent to ensure we get a refresh_token
    });

    console.log('[Google Auth] Redirecting to Google:', authUrl);
    res.redirect(authUrl);
  } catch (error) {
    console.error('[Google Auth] Login error:', error);
    res.status(500).json({ error: 'Failed to initiate Google OAuth flow' });
  }
}

export async function callback(req: Request, res: Response): Promise<void> {
  const { code } = req.query as { code?: string };

  if (!code) {
    res.status(400).json({ error: 'Missing authorization code' });
    return;
  }

  try {
    const oauth2Client = new google.auth.OAuth2(
      getClientId(),
      getClientSecret(),
      getRedirectUri(req)
    );

    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Get user info to store the email
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    const email = userInfo.data.email;

    if (!email) throw new Error('Could not retrieve user email from Google');

    const organizationId = res.locals.organizationId;
    const userId = res.locals.authUserId;

    if (!organizationId || !userId) {
      throw new Error('Missing session information (organizationId or userId)');
    }

    // Persist to Supabase
    await db.upsertGoogleConnection({
      organization_id: organizationId,
      user_id: userId,
      email: email,
      access_token: tokens.access_token!,
      refresh_token: tokens.refresh_token || undefined,
      expiry_date: tokens.expiry_date || undefined,
    });

    console.log('[Google Auth] Successfully connected Gmail for:', email);

    // Redirect back to settings
    const frontendUrl = process.env.NODE_ENV === 'production' 
      ? 'https://www.joinvelocity.co' 
      : 'http://localhost:5173';
      
    res.redirect(`${frontendUrl}/settings?tab=integrations&connected=google`);
  } catch (error: any) {
    console.error('[Google Auth] Callback error:', error.message);
    res.status(500).json({ error: 'Google OAuth callback failed', details: error.message });
  }
}

export async function disconnect(req: Request, res: Response): Promise<void> {
  try {
    const organizationId = res.locals.organizationId;
    if (!organizationId) throw new Error('Missing organizationId');

    await db.deleteGoogleConnection(organizationId);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to disconnect Google' });
  }
}
