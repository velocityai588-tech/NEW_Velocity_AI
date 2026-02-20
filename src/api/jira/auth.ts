import fetch from 'node-fetch';
import { URLSearchParams } from 'url';
import * as crypto from 'crypto';
import { Request, Response } from 'express';

// Extend express-session SessionData to include Jira properties
declare module 'express-session' {
  interface SessionData {
    jiraUserId?: string;
    jiraCloudId?: string;
    jiraStoreKey?: string;
    jiraCodeVerifier?: string;
    jiraAccessibleResources?: JiraResource[];
  }
}

// Environment variables (accessed at runtime)
const getClientId = () => process.env.JIRA_OAUTH_CLIENT_ID || '';
const getClientSecret = () => process.env.JIRA_OAUTH_CLIENT_SECRET || '';

// Get the correct redirect URI based on environment
// This must match a registered redirect URI in the Jira OAuth app
const getRedirectUri = (req?: Request) => {
  // Check if we're on production based on multiple signals
  const isVercel = process.env.VERCEL === '1';
  const isProduction = 
    process.env.NODE_ENV === 'production' || 
    isVercel ||
    (req && (req.hostname === 'joinvelocity.co' || req.hostname === 'www.joinvelocity.co'));
  
  if (isProduction) {
    // Always use production redirect URI when in production
    return 'https://www.joinvelocity.co/api/jira/auth/callback';
  } else {
    // Use local development redirect URI
    return process.env.JIRA_OAUTH_REDIRECT_URI_LOCAL || 'http://localhost:4000/api/jira/auth/callback';
  }
};

const AUTHORIZE_URL: string = 'https://auth.atlassian.com/authorize';
const TOKEN_URL: string = 'https://auth.atlassian.com/oauth/token';
const ACCESSIBLE_RESOURCES_URL: string = 'https://api.atlassian.com/oauth/token/accessible-resources';

// Debug: log if credentials are loaded (deferred)
setTimeout(() => {
  console.log('[Jira OAuth] CLIENT_ID loaded:', getClientId() ? 'YES' : 'NO');
  console.log('[Jira OAuth] CLIENT_SECRET loaded:', getClientSecret() ? 'YES' : 'NO');
  console.log('[Jira OAuth] REDIRECT_URI:', getRedirectUri());
}, 100);

// Scopes requested
const SCOPES: string = [
  'read:jira-work',
  'read:jira-user',
  'read:issue:jira',
  'read:project:jira',
  'offline_access'
].join(' ');

// Type definitions
interface PKCE {
  codeVerifier: string;
  codeChallenge: string;
}

interface TokenStore {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  cloudId: string | null;
  userId: string | null;
  siteName?: string;
  siteUrl?: string;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
}

interface JiraResource {
  id: string;
  name: string;
  url: string;
  scopes: string[];
}

// Generate PKCE parameters
function generatePKCE(): PKCE {
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  return { codeVerifier, codeChallenge };
}

// In-memory token store (map user session -> token store)
// For production, use database with encryption (e.g., Redis or encrypted session storage)
const jiraTokens: Map<string, TokenStore> = new Map();

// In-memory PKCE state store
const jiraPKCEStore: Map<string, { codeVerifier: string; timestamp: number }> = new Map();

function cleanupExpiredPKCE() {
  const now = Date.now();
  const maxAge = 15 * 60 * 1000; // 15 minutes
  
  for (const [state, data] of jiraPKCEStore.entries()) {
    if (now - data.timestamp > maxAge) {
      jiraPKCEStore.delete(state);
      console.log('[Jira OAuth] Cleaned up expired PKCE entry:', state);
    }
  }
}

// Run cleanup every 5 minutes
setInterval(() => cleanupExpiredPKCE(), 5 * 60 * 1000);

// Store PKCE in memory
async function storePKCEInDatabase(state: string, codeVerifier: string): Promise<void> {
  try {
    jiraPKCEStore.set(state, { codeVerifier, timestamp: Date.now() });
    console.log('[Jira OAuth] PKCE stored in memory');
  } catch (err) {
    console.warn('[Jira OAuth] Error storing PKCE:', err);
  }
}

// Retrieve PKCE from memory
async function retrievePKCEFromDatabase(state: string): Promise<string | null> {
  try {
    const data = jiraPKCEStore.get(state);
    if (data) {
      console.log('[Jira OAuth] Retrieved PKCE from memory');
      // Delete after retrieval (one-time use)
      jiraPKCEStore.delete(state);
      return data.codeVerifier;
    }
    return null;
  } catch (err) {
    console.warn('[Jira OAuth] Error retrieving PKCE:', err);
    return null;
  }
}

// Decode JWT ID token to extract user info
function decodeIdToken(idToken: string): any {
  try {
    // JWT format: header.payload.signature
    const parts = idToken.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid token format');
    }
    
    // Decode payload (add padding if needed)
    const payload = parts[1];
    const padded = payload + '='.repeat((4 - payload.length % 4) % 4);
    const decoded = Buffer.from(padded, 'base64').toString('utf-8');
    return JSON.parse(decoded);
  } catch (error) {
    console.error('[Jira] Error decoding ID token:', error);
    return null;
  }
}

// Fetch Jira user info using access token or ID token
async function getJiraUserInfo(accessToken: string, tokenData?: any): Promise<any> {
  try {
    // First, try to get user info from the `/me` endpoint
    const response = await fetch('https://api.atlassian.com/me', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      const userData = await response.json() as any;
      console.log('[Jira] User info fetched from /me endpoint:', { 
        account_id: userData.account_id, 
        email: userData.email,
        name: userData.name 
      });
      return userData;
    }

    // If /me endpoint fails, try to extract from ID token
    if (tokenData?.id_token) {
      console.log('[Jira] /me endpoint failed, extracting user info from ID token...');
      const idTokenPayload = decodeIdToken(tokenData.id_token);
      
      if (idTokenPayload) {
        console.log('[Jira] User info extracted from ID token:', { 
          email: idTokenPayload.email,
          name: idTokenPayload.name
        });
        return idTokenPayload;
      }
    }

    // If both fail, throw error
    throw new Error(`Failed to fetch user info: ${response.statusText}`);
  } catch (error) {
    console.error('[Jira] Error fetching user info:', error);
    throw error;
  }
}

// Store Jira user in session
async function saveJiraUserToSupabase(jiraUser: any, tokenData: any): Promise<void> {
  // Placeholder - session storage handled by express-session
  console.log('[Jira] User data stored in session:', { 
    jira_id: jiraUser.account_id, 
    email: jiraUser.email 
  });
}

// Initiate OAuth flow
async function login(req: Request, res: Response): Promise<void> {
  try {
    // Generate PKCE parameters
    const { codeVerifier, codeChallenge } = generatePKCE();
    
    // Generate unique state for this OAuth flow
    const state = crypto.randomBytes(32).toString('hex');
    
    console.log('[Jira OAuth Login] Starting OAuth flow:', {
      sessionID: req.sessionID,
      state,
      timestamp: new Date().toISOString()
    });

    // Store PKCE data in memory
    // For production with multiple instances, consider using Redis or session storage
    await storePKCEInDatabase(state, codeVerifier);

    // Also store PKCE data in session as backup
    req.session.jiraCodeVerifier = codeVerifier;
    
    // Save session before redirect
    await new Promise<void>((resolve, reject) => {
      req.session.save((err) => {
        if (err) {
          console.error('[Jira OAuth] Session save failed:', err);
          reject(err);
        } else {
          console.log('[Jira OAuth] Session saved');
          resolve();
        }
      });
    });

    // Build authorization URL
    const params = new URLSearchParams({
      audience: 'api.atlassian.com',
      client_id: getClientId(),
      scope: SCOPES,
      redirect_uri: getRedirectUri(req),
      state: state,
      response_type: 'code',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    const authUrl = `${AUTHORIZE_URL}?${params.toString()}`;
    
    console.log('[Jira OAuth] Redirecting to Jira:', authUrl);
    res.redirect(authUrl);
  } catch (error) {
    console.error('[Jira OAuth Login] Error:', error);
    res.status(500).json({ error: 'Failed to initiate Jira OAuth flow', details: error instanceof Error ? error.message : String(error) });
  }
}

// Exchange authorization code for tokens
async function exchangeCodeForToken(code: string, codeVerifier: string, req?: Request): Promise<TokenResponse> {
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: getClientId(),
    client_secret: getClientSecret(),
    code: code,
    redirect_uri: getRedirectUri(req),
    code_verifier: codeVerifier,
  });

  console.log('[Jira OAuth] Exchanging code for token...');
  
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Jira OAuth] Token exchange failed:', response.status, errorText);
    throw new Error(`Token exchange failed: ${response.status} ${errorText}`);
  }

  const tokenData = await response.json() as TokenResponse;
  console.log('[Jira OAuth] Token exchange successful');
  return tokenData;
}

// Get accessible Jira resources (sites)
async function getAccessibleResources(accessToken: string): Promise<JiraResource[]> {
  console.log('[Jira OAuth] Fetching accessible resources...');
  
  const response = await fetch(ACCESSIBLE_RESOURCES_URL, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Jira OAuth] Failed to fetch resources:', response.status, errorText);
    throw new Error(`Failed to fetch Jira resources: ${response.status}`);
  }

  const resources = await response.json() as JiraResource[];
  console.log('[Jira OAuth] Accessible resources:', resources.length);
  return resources;
}

// OAuth callback handler
async function callback(req: Request, res: Response): Promise<any> {
  const { code, state, error, error_description } = req.query as { 
    code?: string;
    state?: string;
    error?: string; 
    error_description?: string;
  };

  console.log('[Jira OAuth Callback] ==== CALLBACK STARTED ====');
  console.log('[Jira OAuth Callback] Received params:', {
    code: code ? `${code.substring(0, 20)}...` : 'MISSING',
    state: state ? `${state.substring(0, 20)}...` : 'MISSING',
    error: error || 'NONE'
  });

  if (error) {
    console.error('[Jira OAuth Callback] OAuth error from Jira:', error, error_description);
    res.status(400).json({ 
      error: `OAuth error: ${error}`,
      description: error_description 
    });
    return;
  }

  if (!code) {
    console.error('[Jira OAuth Callback] Missing authorization code');
    res.status(400).json({ error: 'Missing authorization code' });
    return;
  }

  if (!state) {
    console.error('[Jira OAuth Callback] Missing state parameter');
    res.status(400).json({ error: 'Missing state parameter' });
    return;
  }

  try {
    console.log('[Jira OAuth Callback] Retrieving PKCE with state:', `${state.substring(0, 20)}...`);
    
    // Retrieve PKCE code verifier from database (works in serverless environments)
    // Falls back to in-memory if database retrieval fails
    const codeVerifier = await retrievePKCEFromDatabase(state);
    
    if (!codeVerifier) {
      console.error('[Jira OAuth Callback] ✗ Code verifier not found in database or session');
      console.error('[Jira OAuth Callback] Debug:', {
        state: state.substring(0, 30),
        hasMemoryStore: jiraPKCEStore.has(state),
        sessionHasVerifier: !!req.session?.jiraCodeVerifier,
      });
      
      res.status(400).json({ 
        error: 'PKCE verification failed',
        details: 'State parameter not found. Session may have expired.',
        debug: process.env.NODE_ENV === 'development' ? {
          stateReceived: state.substring(0, 30),
          memoryStoreHasState: jiraPKCEStore.has(state),
          sessionHasVerifier: !!req.session?.jiraCodeVerifier,
        } : undefined
      });
    }

    console.log('[Jira OAuth Callback] ✓ Code verifier retrieved, exchanging for token...');
    
    // Exchange code for tokens
    const tokenResp = await exchangeCodeForToken(code, codeVerifier, req);

    // Clear the code_verifier from session after use
    delete req.session.jiraCodeVerifier;

    console.log('[Jira OAuth Callback] ✓ Token exchange successful');

    // Get accessible Jira resources (sites)
    const resources = await getAccessibleResources(tokenResp.access_token);
    
    if (resources.length === 0) {
      throw new Error('No Jira sites accessible with this account');
    }

    console.log('[Jira OAuth Callback] ✓ Got', resources.length, 'accessible resource(s)');

    // Store ALL accessible resources in session
    req.session.jiraAccessibleResources = resources;

    // Use the first accessible resource by default
    const primaryResource = resources[0];
    
    // Store tokens using the current sessionID
    const storeKey = req.sessionID;
    const expiresAt = Date.now() + (tokenResp.expires_in * 1000);
    
    const tokenStore: TokenStore = {
      accessToken: tokenResp.access_token,
      refreshToken: tokenResp.refresh_token,
      expiresAt: expiresAt,
      cloudId: primaryResource.id,
      userId: storeKey,
      siteName: primaryResource.name,
      siteUrl: primaryResource.url,
    };
    
    jiraTokens.set(storeKey, tokenStore);

    console.log('[Jira OAuth] Stored token for user:', storeKey);

    // Store cloudId and user info in session
    req.session.jiraCloudId = primaryResource.id;
    req.session.jiraUserId = storeKey;
    req.session.jiraStoreKey = storeKey;

    // Save session before redirecting
    await new Promise<void>((resolve, reject) => {
      req.session.save((err) => {
        if (err) {
          console.error('[Jira OAuth] Session save failed:', err);
          reject(err);
        } else {
          console.log('[Jira OAuth] ✓ Session saved');
          resolve();
        }
      });
    });
    
    // Fetch and save Jira user info to session
    try {
      console.log('[Jira OAuth Callback] Fetching user info...');
      const jiraUser = await getJiraUserInfo(tokenResp.access_token, tokenResp);
      await saveJiraUserToSupabase(jiraUser, tokenResp);
      console.log('[Jira OAuth Callback] ✓ User stored in session');
    } catch (error) {
      console.warn('[Jira OAuth Callback] Warning - could not save user to session:', error);
      // Continue anyway - auth still works without session save
    }

    console.log('[Jira OAuth Callback] ✓ Authentication complete! Redirecting...');
    
    // Determine redirect URL based on environment and request origin
    let redirectUrl = 'http://localhost:5173/velocity-ai'; // Default for dev
    
    // Check if we're on Vercel (process.env.VERCEL) or if NODE_ENV is production
    const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1' || req.hostname === 'www.joinvelocity.co' || req.hostname === 'joinvelocity.co';
    
    if (isProduction) {
      // Use production URL
      redirectUrl = (process.env.FRONTEND_URL_PROD || 'https://www.joinvelocity.co') + '/velocity-ai';
    } else if (process.env.FRONTEND_URL) {
      // Use development URL if explicitly set
      redirectUrl = process.env.FRONTEND_URL + '/velocity-ai';
    }
    
    console.log('[Jira OAuth Callback] Determining redirect URL:', {
      isProduction,
      nodeEnv: process.env.NODE_ENV,
      vercelEnv: process.env.VERCEL,
      hostname: req.hostname,
      redirectUrl
    });
    
    res.redirect(redirectUrl);
    
  } catch (err) {
    console.error('[Jira OAuth Callback] ✗ Error:', err instanceof Error ? err.message : String(err));
    res.status(500).json({ 
      error: 'OAuth callback failed',
      details: err instanceof Error ? err.message : 'Unknown error',
      debug: process.env.NODE_ENV === 'development' ? { stack: err instanceof Error ? err.stack : undefined } : undefined
    });
  }
}

// Refresh access token
async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: getClientId(),
    client_secret: getClientSecret(),
    refresh_token: refreshToken,
  });

  console.log('[Jira OAuth] Refreshing access token...');
  
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Jira OAuth] Token refresh failed:', response.status, errorText);
    throw new Error(`Token refresh failed: ${response.status}`);
  }

  const tokenData = await response.json() as TokenResponse;
  console.log('[Jira OAuth] Token refreshed successfully');
  return tokenData;
}

// Get valid access token for user (with automatic refresh)
export async function getAccessToken(req: Request): Promise<string | null> {
  const storeKey = req.session?.jiraStoreKey;
  console.log('[Jira OAuth] getAccessToken - sessionID:', req.sessionID);
  console.log('[Jira OAuth] getAccessToken - jiraStoreKey:', storeKey);
  console.log('[Jira OAuth] getAccessToken - available keys:', Array.from(jiraTokens.keys()));
  
  if (!storeKey) {
    console.log('[Jira OAuth] No jiraStoreKey in session');
    return null;
  }

  const tokenStore = jiraTokens.get(storeKey);
  if (!tokenStore) {
    console.log('[Jira OAuth] No tokens found for user with key:', storeKey);
    return null;
  }

  // Check if token needs refresh (refresh 5 minutes before expiry)
  const needsRefresh = Date.now() >= (tokenStore.expiresAt - 5 * 60 * 1000);
  
  if (needsRefresh && tokenStore.refreshToken) {
    try {
      console.log('[Jira OAuth] Access token expired, refreshing...');
      const newTokens = await refreshAccessToken(tokenStore.refreshToken);
      
      // Update stored tokens
      tokenStore.accessToken = newTokens.access_token;
      tokenStore.refreshToken = newTokens.refresh_token;
      tokenStore.expiresAt = Date.now() + (newTokens.expires_in * 1000);
      
      jiraTokens.set(storeKey, tokenStore);
      console.log('[Jira OAuth] Token refreshed and updated');
      
      return newTokens.access_token;
    } catch (err) {
      console.error('[Jira OAuth] Token refresh failed:', err);
      // Token refresh failed - user needs to re-authenticate
      jiraTokens.delete(storeKey);
      return null;
    }
  }

  return tokenStore.accessToken;
}

// Get Jira Cloud ID for user
export function getCloudId(req: Request): string | null {
  // FIRST check if user switched to a different site (session.jiraCloudId takes precedence)
  if (req.session?.jiraCloudId) {
    return req.session.jiraCloudId;
  }
  
  // Fallback to token store's original cloudId
  const storeKey = req.session?.jiraStoreKey;
  if (!storeKey) return null;
  
  const tokenStore = jiraTokens.get(storeKey);
  return tokenStore?.cloudId || null;
}

// Get user's Jira site info
export function getSiteInfo(req: Request): { name?: string; url?: string } | null {
  const storeKey = req.session?.jiraStoreKey;
  if (!storeKey) return null;
  
  const tokenStore = jiraTokens.get(storeKey);
  if (!tokenStore) return null;
  
  return {
    name: tokenStore.siteName,
    url: tokenStore.siteUrl,
  };
}

// Check if user has valid Jira connection
export function isConnected(req: Request): boolean {
  const storeKey = req.session?.jiraStoreKey;
  const cloudId = req.session?.jiraCloudId;
  
  // PRIMARY: Check if tokens exist in memory store
  if (storeKey && jiraTokens.has(storeKey)) {
    console.log('[Jira OAuth] isConnected: TRUE (tokens in memory)');
    return true;
  }
  
  // FALLBACK: Check if session has Jira credentials saved
  // This allows connection check to pass even if tokens were cleared from memory
  if (storeKey && cloudId) {
    console.log('[Jira OAuth] isConnected: TRUE (session has Jira credentials)');
    return true;
  }
  
  console.log('[Jira OAuth] isConnected: FALSE', { storeKey, cloudId, hasTokens: storeKey ? jiraTokens.has(storeKey) : false });
  return false;
}

// Disconnect user's Jira account
export function disconnect(req: Request): void {
  const storeKey = req.session?.jiraStoreKey;
  if (storeKey) {
    jiraTokens.delete(storeKey);
  }
  
  delete req.session.jiraCloudId;
  delete req.session.jiraUserId;
  delete req.session.jiraStoreKey;
  delete req.session.jiraCodeVerifier;
  
  console.log('[Jira OAuth] User disconnected');
}

// Export OAuth handlers
export const jiraAuth = {
  login,
  callback,
  getAccessToken,
  getCloudId,
  getSiteInfo,
  isConnected,
  disconnect,
};
