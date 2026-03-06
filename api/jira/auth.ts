import { Request, Response } from 'express';
import fetch from 'node-fetch';
import { URLSearchParams } from 'url';
import * as crypto from 'crypto';

const getClientId = () => process.env.JIRA_OAUTH_CLIENT_ID || '';
const getClientSecret = () => process.env.JIRA_OAUTH_CLIENT_SECRET || '';
const getRedirectUri = (req?: Request) => {
  return 'https://www.joinvelocity.co/api/jira/auth/callback';
};

const AUTHORIZE_URL = 'https://auth.atlassian.com/authorize';
const TOKEN_URL = 'https://auth.atlassian.com/oauth/token';
const SCOPES = 'read:jira-work read:jira-user read:issue:jira read:project:jira offline_access';

function generatePKCE() {
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  return { codeVerifier, codeChallenge };
}

export async function handleJiraConnect(req: Request, res: Response) {
  try {
    const { codeVerifier, codeChallenge } = generatePKCE();
    const state = crypto.randomBytes(32).toString('hex');

    // Store PKCE in session (note: Vercel serverless functions don't persist sessions)
    // For production, use external session store (Redis, DB, etc.)
    const authUrl = new URL(AUTHORIZE_URL);
    authUrl.searchParams.append('client_id', getClientId());
    authUrl.searchParams.append('redirect_uri', getRedirectUri(req));
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('scope', SCOPES);
    authUrl.searchParams.append('state', state);
    authUrl.searchParams.append('code_challenge', codeChallenge);
    authUrl.searchParams.append('code_challenge_method', 'S256');

    // Store state and codeVerifier in cookie for callback
    res.setHeader('Set-Cookie', [
      `jira_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
      `jira_code_verifier=${codeVerifier}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`
    ]);

    res.redirect(authUrl.toString());
  } catch (error) {
    console.error('Jira auth error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
}

export async function handleJiraCallback(req: Request, res: Response) {
  try {
    const { code, state } = req.query as { code?: string; state?: string };
    const cookies = req.headers.cookie || '';
    
    const jiraState = cookies.split(';').find(c => c.trim().startsWith('jira_state='))?.split('=')[1];
    const jiraCodeVerifier = cookies.split(';').find(c => c.trim().startsWith('jira_code_verifier='))?.split('=')[1];

    if (!code || !state || state !== jiraState) {
      console.error('[Jira Auth] Invalid state parameter in callback');
      return res.status(400).json({ error: 'Invalid state parameter' });
    }

    // Exchange code for token
    const tokenParams = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: getClientId(),
      client_secret: getClientSecret(),
      code,
      redirect_uri: getRedirectUri(req),
      code_verifier: jiraCodeVerifier || ''
    });

    const tokenResponse = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams.toString()
    });

    if (!tokenResponse.ok) {
      console.error('[Jira Auth] Token exchange failed:', tokenResponse.statusText);
      throw new Error(`Token exchange failed: ${tokenResponse.statusText}`);
    }

    const tokenData = await tokenResponse.json() as { access_token: string; refresh_token?: string };
    const accessToken = tokenData.access_token;
    
    // Fetch accessible resources to get cloudId
    const resourcesRes = await fetch('https://api.atlassian.com/oauth/token/accessible-resources', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    let cloudId = null;
    if (resourcesRes.ok) {
      const resources = await resourcesRes.json() as any[];
      if (resources && resources.length > 0) {
        cloudId = resources[0].id;
      }
    }
    
    // Store token and cloudId in secure cookies
    const cookiesToSet = [
      `jira_access_token=${accessToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${24*60*60}`
    ];
    
    if (cloudId) {
      cookiesToSet.push(
        `jira_cloud_id=${cloudId}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${24*60*60}`
      );
    }
    
    res.setHeader('Set-Cookie', cookiesToSet);
    
    // CRITICAL FIX: Redirect to auth callback to establish Supabase session
    // Don't just store the token - actually authenticate the user!
    console.log('[Jira Auth] Successfully authenticated with Jira, redirecting to auth callback');
    res.redirect('/auth/callback?jira=true');
  } catch (error) {
    console.error('[Jira Auth] Callback error:', error);
    res.status(500).json({ error: 'Callback failed' });
  }
}
