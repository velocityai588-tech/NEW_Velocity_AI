/*Main Part*/

// src/api/jira/auth.ts
// Implements OAuth2 Authorization Code flow (3-legged OAuth) for Jira Cloud
// Multi-tenant SaaS implementation - each user connects their own Jira account
import fetch from 'node-fetch';
import { URLSearchParams } from 'url';
import * as crypto from 'crypto';
import { Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';

// Extend express-session SessionData to include Jira properties
declare module 'express-session' {
  interface SessionData {
    jiraUserId?: string;
    jiraCloudId?: string;
    jiraStoreKey?: string;
    jiraCodeVerifier?: string;
    jiraMagicLinkToken?: string;
    jiraAccessibleResources?: JiraResource[];
    orgId?: string;
    supabaseUserId?: string;
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
  'read:account',  // Required for /me endpoint
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

// Lazy-initialize Supabase client to ensure env vars are loaded
let supabase: any = null;

function getSupabaseClient() {
  if (!supabase) {
    const supabaseUrl = process.env.SUPABASE_URL || '';
    const supabaseKey = process.env.SUPABASE_ANON_KEY || '';
    
    if (!supabaseUrl || !supabaseKey) {
      console.warn('[Supabase] Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables');
      return null;
    }
    
    supabase = createClient(supabaseUrl, supabaseKey);
    console.log('[Supabase] Client initialized');
  }
  return supabase;
}

// Create or authenticate a Supabase user for Jira OAuth
async function createOrAuthSupabaseUser(jiraEmail: string, jiraId: string): Promise<{ userId: string; magicLinkToken?: string; session: any } | null> {
  try {
    const supabaseClient = getSupabaseClient();
    if (!supabaseClient) {
      console.warn('[Supabase Auth] Supabase not configured');
      return null;
    }

    const supabaseUrl = process.env.SUPABASE_URL || '';
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

    // If we have a service role key, use admin API to upsert user
    if (supabaseServiceKey) {
      try {
        const { createClient: createAdminClient } = await import('@supabase/supabase-js');
        const adminClient = createAdminClient(supabaseUrl, supabaseServiceKey);

        console.log('[Supabase Auth] Using admin API to upsert user:', jiraEmail);

        // Try to get existing user first
        const { data: { users }, error: listError } = await adminClient.auth.admin.listUsers();
        let existingUser = users?.find(u => u.email === jiraEmail);

        if (!existingUser) {
          // Create new user with random password (OAuth users don't need passwords)
          const randomPassword = crypto.randomBytes(32).toString('hex');
          const { data: newUserData, error: createError } = await adminClient.auth.admin.createUser({
            email: jiraEmail,
            password: randomPassword,
            email_confirm: true, // Automatically confirm email for OAuth users
            user_metadata: {
              provider: 'jira',
              jira_id: jiraId
            }
          });

          if (createError) {
            console.warn('[Supabase Auth] Failed to create user:', createError.message);
            return null;
          }

          existingUser = newUserData?.user;
          console.log('[Supabase Auth] Created new Supabase user:', existingUser?.id);
        } else {
          console.log('[Supabase Auth] Found existing Supabase user:', existingUser.id);
          // Update user metadata with Jira info
          await adminClient.auth.admin.updateUserById(existingUser.id, {
            user_metadata: {
              ...(existingUser.user_metadata || {}),
              provider: 'jira',
              jira_id: jiraId
            }
          });
        }

        if (!existingUser) {
          console.error('[Supabase Auth] No user object returned');
          return null;
        }

        // Generate a magic link for the frontend to use for sign-in
        let magicLinkToken: string | undefined;
        try {
          const redirectUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/auth/callback`;
          
          const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
            type: 'magiclink',
            email: jiraEmail,
            options: {
              redirectTo: redirectUrl
            }
          });

          if (!linkError && linkData?.properties?.hashed_token) {
            magicLinkToken = linkData.properties.hashed_token;
            console.log('[Supabase Auth] Generated magic link token for user');
          } else {
            console.warn('[Supabase Auth] Could not generate magic link:', linkError?.message);
          }
        } catch (linkErr) {
          console.warn('[Supabase Auth] Magic link generation failed:', linkErr instanceof Error ? linkErr.message : String(linkErr));
        }

        console.log('[Supabase Auth] Successfully created/authenticated user:', existingUser.id);
        return { userId: existingUser.id, magicLinkToken, session: null };
      } catch (adminErr) {
        console.warn('[Supabase Auth] Admin API error:', adminErr instanceof Error ? adminErr.message : String(adminErr));
        // Fall through to non-admin approach
      }
    }

    // Fallback: without service role key, we can't create users server-side
    // Instead, we'll rely on the frontend to call the Supabase SDK after Jira auth
    // Store the Jira email so the frontend can use magic link
    console.log('[Supabase Auth] Service role key not available, will rely on frontend to complete Supabase auth');
    return { userId: null, session: null };
  } catch (err) {
    console.error('[Supabase Auth] Error in createOrAuthSupabaseUser:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

// Generate PKCE parameters
function generatePKCE(): PKCE {
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  return { codeVerifier, codeChallenge };
}

// In-memory token store (map user session -> token store)
// For production, use database with encryption (Supabase Vault, etc.)
const jiraTokens: Map<string, TokenStore> = new Map();

// In-memory PKCE state store - for local dev only
// In production (Vercel), PKCE data is stored in Supabase
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

// Run cleanup every 5 minutes (local dev only)
setInterval(() => cleanupExpiredPKCE(), 5 * 60 * 1000);

// Store PKCE in Supabase for serverless compatibility
async function storePKCEInDatabase(state: string, codeVerifier: string, supabaseUserId?: string): Promise<void> {
  try {
    const supabaseClient = getSupabaseClient();
    if (!supabaseClient) {
      console.log('[Jira OAuth] Supabase not configured, using in-memory store only');
      jiraPKCEStore.set(state, { codeVerifier, timestamp: Date.now() });
      return;
    }

    const { error } = await supabaseClient
      .from('jira_oauth_pkce')
      .insert({
        state,
        code_verifier: codeVerifier,
        supabase_user_id: supabaseUserId || null,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString()
      });

    if (error) {
      console.warn('[Jira OAuth] Failed to store PKCE in Supabase, falling back to memory:', error);
      jiraPKCEStore.set(state, { codeVerifier, timestamp: Date.now() });
    } else {
      console.log('[Jira OAuth] PKCE stored in Supabase (userId:', supabaseUserId || 'none', ')');
    }
  } catch (err) {
    console.warn('[Jira OAuth] Error storing PKCE:', err);
    jiraPKCEStore.set(state, { codeVerifier, timestamp: Date.now() });
  }
}

// Retrieve PKCE from Supabase (or memory as fallback)
async function retrievePKCEFromDatabase(state: string): Promise<{ codeVerifier: string; supabaseUserId: string | null } | null> {
  try {
    const supabaseClient = getSupabaseClient();
    if (!supabaseClient) {
      console.log('[Jira OAuth] Supabase not configured, checking in-memory store');
      const data = jiraPKCEStore.get(state);
      return data ? { codeVerifier: data.codeVerifier, supabaseUserId: null } : null;
    }

    const { data, error } = await supabaseClient
      .from('jira_oauth_pkce')
      .select('code_verifier, supabase_user_id')
      .eq('state', state)
      .single();

    if (error) {
      console.warn('[Jira OAuth] PKCE not found in Supabase:', error.message);
      const memData = jiraPKCEStore.get(state);
      if (memData) {
        console.log('[Jira OAuth] Found PKCE in memory store');
        return { codeVerifier: memData.codeVerifier, supabaseUserId: null };
      }
      return null;
    }

    if (data) {
      console.log('[Jira OAuth] Retrieved PKCE from Supabase');
      // Delete after retrieval (one-time use)
      try {
        await supabaseClient
          .from('jira_oauth_pkce')
          .delete()
          .eq('state', state);
      } catch (cleanupErr) {
        console.warn('[Jira OAuth] Failed to cleanup PKCE:', cleanupErr);
      }
      
      return { codeVerifier: data.code_verifier, supabaseUserId: data.supabase_user_id || null };
    }

    return null;
  } catch (err) {
    console.warn('[Jira OAuth] Error retrieving PKCE:', err);
    // Check in-memory as fallback
    const memData = jiraPKCEStore.get(state);
    return memData ? { codeVerifier: memData.codeVerifier, supabaseUserId: null } : null;
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

    console.warn(`[Jira] /me endpoint returned ${response.status}: ${response.statusText}, attempting fallback...`);

    // If /me endpoint fails, try to extract from ID token
    if (tokenData?.id_token) {
      console.log('[Jira] Extracting user info from ID token...');
      const idTokenPayload = decodeIdToken(tokenData.id_token);
      
      if (idTokenPayload) {
        console.log('[Jira] User info extracted from ID token:', { 
          email: idTokenPayload.email,
          name: idTokenPayload.name,
          sub: idTokenPayload.sub
        });
        return idTokenPayload;
      } else {
        console.warn('[Jira] ID token decoding returned null');
      }
    } else {
      console.warn('[Jira] No ID token available in token response');
    }

    // If both fail, return a minimal user object with available data
    console.warn('[Jira] Could not fetch user info from /me or ID token, using minimal fallback');
    return {
      email: 'unknown@jira.atlassian.net',
      name: 'Jira User',
      account_id: 'unknown'
    };
  } catch (error) {
    console.error('[Jira] Error fetching user info:', error);
    // Return minimal fallback instead of throwing
    console.warn('[Jira] Returning minimal fallback user object due to error');
    return {
      email: 'unknown@jira.atlassian.net',
      name: 'Jira User',
      account_id: 'unknown'
    };
  }
}

// Store Jira user in Supabase
async function saveJiraUserToSupabase(jiraUser: any, tokenData: any): Promise<void> {
  try {
    const supabaseClient = getSupabaseClient();
    if (!supabaseClient) {
      console.warn('[Supabase] Supabase not configured, skipping user save');
      return;
    }

    const { data, error } = await supabaseClient
      .from('jira_users')
      .upsert(
        {
          jira_id: jiraUser.account_id,
          email: jiraUser.email,
          display_name: jiraUser.name,
          avatar_url: jiraUser.picture,
          jira_token_data: {
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            expires_in: tokenData.expires_in,
            stored_at: new Date().toISOString()
          },
          auth_provider: 'jira',
          updated_at: new Date().toISOString()
        },
        { onConflict: 'jira_id' }
      );

    if (error) {
      console.error('[Supabase] Error saving Jira user:', error);
      throw error;
    }

    console.log('[Supabase] Jira user saved:', { jira_id: jiraUser.account_id, email: jiraUser.email });
  } catch (error) {
    console.error('[Supabase] Failed to save Jira user:', error);
    // Don't throw - continue anyway, auth still works even if Supabase save fails
  }
}

// Initiate OAuth flow
async function login(req: Request, res: Response): Promise<void> {
  try {
    // Capture the Supabase Auth user id (sent by client)
    const supabaseUserId = (req.query.supabaseUserId as string) || undefined;
    if (supabaseUserId) {
      req.session.supabaseUserId = supabaseUserId;
      console.log('[Jira OAuth Login] supabaseUserId:', supabaseUserId);
    }

    // Generate PKCE parameters
    const { codeVerifier, codeChallenge } = generatePKCE();
    
    // Generate unique state for this OAuth flow
    const state = crypto.randomBytes(32).toString('hex');
    
    console.log('[Jira OAuth Login] Starting OAuth flow:', {
      sessionID: req.sessionID,
      state,
      supabaseUserId: supabaseUserId || 'none',
      timestamp: new Date().toISOString()
    });

    // Store PKCE data in Supabase (with supabaseUserId for serverless compatibility)
    await storePKCEInDatabase(state, codeVerifier, supabaseUserId);

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
  const clientId = getClientId();
  const clientSecret = getClientSecret();
  const redirectUri = getRedirectUri(req);
  
  console.log('[Jira OAuth] Token exchange params:', {
    grant_type: 'authorization_code',
    client_id: clientId ? '***' : 'MISSING',
    client_secret: clientSecret ? '***' : 'MISSING',
    code: code ? code.substring(0, 20) + '...' : 'MISSING',
    redirect_uri: redirectUri,
    code_verifier: codeVerifier ? codeVerifier.substring(0, 20) + '...' : 'MISSING',
  });

  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    code: code,
    redirect_uri: redirectUri,
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
    console.error('[Jira OAuth] Token exchange failed:', {
      status: response.status,
      statusText: response.statusText,
      error: errorText,
      redirectUri: redirectUri,
      hasClientId: !!clientId,
      hasClientSecret: !!clientSecret,
      hasCode: !!code,
      hasCodeVerifier: !!codeVerifier
    });
    throw new Error(`Token exchange failed: ${response.status} ${response.statusText}. ${errorText}`);
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
    
    // Retrieve PKCE code verifier + supabaseUserId from database
    const pkceResult = await retrievePKCEFromDatabase(state);
    
    if (!pkceResult) {
      console.error('[Jira OAuth Callback] ✗ Code verifier not found in database or session');
      console.error('[Jira OAuth Callback] DEBUG: State was:', state);
      res.status(400).json({ 
        error: 'PKCE verification failed',
        details: 'State parameter not found. Session may have expired.',
        state: state.substring(0, 20) + '...'
      });
      return;
    }

    const { codeVerifier, supabaseUserId: pkceUserId } = pkceResult;
    // Resolve supabaseUserId: PKCE store > session > null
    const supabaseUserId = pkceUserId || req.session?.supabaseUserId || null;

    console.log('[Jira OAuth Callback] ✓ Code verifier retrieved, supabaseUserId:', supabaseUserId || 'none');
    
    // Exchange code for tokens
    try {
      const tokenResp = await exchangeCodeForToken(code, codeVerifier, req);
      console.log('[Jira OAuth Callback] ✓ Token exchange successful');
      
      // Clear the code_verifier from session after use
      delete req.session.jiraCodeVerifier;

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
      const cloudId = primaryResource.id;

      // 1. Get Jira user info and create/auth Supabase user
      console.log('[Jira OAuth Callback] Fetching Jira user info...');
      let jiraUser: any = null;
      let finalSupabaseUserId = supabaseUserId; // Use provided supabaseUserId if we have one

      try {
        jiraUser = await getJiraUserInfo(tokenResp.access_token, tokenResp);
        console.log('[Jira OAuth Callback] ✓ Jira user info:', { 
          email: jiraUser?.email, 
          account_id: jiraUser?.account_id,
          name: jiraUser?.name 
        });

        // Create or authenticate Supabase user if we don't have one yet
        if (!finalSupabaseUserId && jiraUser?.email && jiraUser?.email !== 'unknown@jira.atlassian.net') {
          console.log('[Jira OAuth Callback] Creating/authenticating Supabase user for:', jiraUser.email);
          const supabaseAuthResult = await createOrAuthSupabaseUser(jiraUser.email, jiraUser.account_id);
          if (supabaseAuthResult?.userId) {
            finalSupabaseUserId = supabaseAuthResult.userId;
            console.log('[Jira OAuth Callback] ✓ Supabase user created/authenticated:', finalSupabaseUserId);
            // Store magic link token in session for later use
            if (supabaseAuthResult.magicLinkToken) {
              req.session.jiraMagicLinkToken = supabaseAuthResult.magicLinkToken;
            }
          } else {
            console.warn('[Jira OAuth Callback] Failed to create/auth Supabase user, will continue anyway');
          }
        }

        // Save Jira user to Supabase as well
        if (jiraUser && jiraUser.email !== 'unknown@jira.atlassian.net') {
          await saveJiraUserToSupabase(jiraUser, tokenResp);
        }
      } catch (e) {
        console.warn('[Jira OAuth Callback] Could not fetch Jira user info:', e);
      }
      
      // --- Multi-tenant: create/find org and store connection in DB ---
      // Import DB helpers (dynamic to avoid circular deps at module level)
      console.log('[Jira OAuth Callback] Loading db module...');
      const db = await import('./db.js');
      console.log('[Jira OAuth Callback] db module loaded, functions:', Object.keys(db).join(', '));
      let orgId: string | null = null;

      // 2. Check if an org already exists for this Jira cloud site
      console.log('[Jira OAuth Callback] Checking for existing org with cloudId:', cloudId);
      orgId = await db.findOrgByCloudId(cloudId);
      if (orgId) {
        console.log('[Jira OAuth Callback] Found existing org for cloud', cloudId, '→', orgId);
        // If we have a finalSupabaseUserId and they're not already a member, add them
        if (finalSupabaseUserId) {
          const existingMembership = await db.findUserOrg(finalSupabaseUserId);
          if (!existingMembership || existingMembership.orgId !== orgId) {
            await db.addOrgMember(orgId, finalSupabaseUserId, 'employee');
          }
        }
      }

      // 3. If no org exists for this cloud site, create one
      if (!orgId) {
        console.log('[Jira OAuth Callback] Creating new org for site:', primaryResource.name);
        // If we have a finalSupabaseUserId, they become the owner; otherwise create org without owner
        orgId = await db.createOrganization(
          primaryResource.name || 'My Organization',
          finalSupabaseUserId || null // pass null if no user
        );
        console.log('[Jira OAuth Callback] Created org:', orgId);
      }

      // 4. Store Jira connection (tokens) in DB — persists across restarts/serverless
      if (orgId) {
        console.log('[Jira OAuth Callback] Storing Jira connection for org:', orgId);
        const jiraAccountId = jiraUser?.account_id;

        await db.upsertJiraConnection(
          orgId, cloudId, primaryResource.name, primaryResource.url,
          tokenResp.access_token, tokenResp.refresh_token,
          tokenResp.expires_in, jiraAccountId, finalSupabaseUserId || undefined
        );
        console.log('[Jira OAuth Callback] ✓ Jira connection stored');

        // Also store for all accessible resources
        for (let i = 1; i < resources.length; i++) {
          await db.upsertJiraConnection(
            orgId, resources[i].id, resources[i].name, resources[i].url,
            tokenResp.access_token, tokenResp.refresh_token,
            tokenResp.expires_in, jiraAccountId, finalSupabaseUserId || undefined
          );
        }

        // Deduplicate issues on reconnect (fire-and-forget to not block redirect)
        console.log('[Jira OAuth Callback] Starting deduplication for org:', orgId, 'cloud:', cloudId);
        void (async () => {
          try {
            const deletedCount = await db.deduplicateIssuesForOrgCloud(orgId, cloudId);
            if (deletedCount > 0) {
              console.log('[Jira OAuth Callback] ✓ Deduplication complete, removed', deletedCount, 'duplicate(s)');
            }
          } catch (err) {
            console.warn('[Jira OAuth Callback] Deduplication failed (non-blocking):', err instanceof Error ? err.message : String(err));
          }
        })();

        // Also deduplicate for all accessible resources
        for (let i = 1; i < resources.length; i++) {
          void (async () => {
            try {
              await db.deduplicateIssuesForOrgCloud(orgId, resources[i].id);
            } catch (err) {
              console.warn('[Jira OAuth Callback] Deduplication failed for resource', resources[i].id, ':', err instanceof Error ? err.message : String(err));
            }
          })();
        }
      } else {
        console.error('[Jira OAuth Callback] ✗ FAILED to create/find org - no DB storage will happen!');
      }

      // Also keep in-memory for backward compat (same session requests)
      const storeKey = req.sessionID;
      const tokenStore: TokenStore = {
        accessToken: tokenResp.access_token,
        refreshToken: tokenResp.refresh_token,
        expiresAt: Date.now() + (tokenResp.expires_in * 1000),
        cloudId: cloudId,
        userId: storeKey,
        siteName: primaryResource.name,
        siteUrl: primaryResource.url,
      };
      jiraTokens.set(storeKey, tokenStore);

      // Store cloudId, orgId and user info in session
      req.session.jiraCloudId = cloudId;
      req.session.jiraUserId = storeKey;
      req.session.jiraStoreKey = storeKey;
      if (orgId) req.session.orgId = orgId;
      if (finalSupabaseUserId) req.session.supabaseUserId = finalSupabaseUserId;

      // Save session before redirecting
      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => {
          if (err) { console.error('[Jira OAuth] Session save failed:', err); reject(err); }
          else { console.log('[Jira OAuth] ✓ Session saved (orgId:', orgId, ')'); resolve(); }
        });
      });

      console.log('[Jira OAuth Callback] ✓ Authentication complete! orgId:', orgId);
      
      // FIX: Define isProduction in this scope
      const isVercel = process.env.VERCEL === '1';
      const isProduction = process.env.NODE_ENV === 'production' || isVercel;

      // Determine redirect URL based on environment and request origin
      // Redirect to auth callback so frontend can complete Supabase auth
      let baseRedirectUrl = 'http://localhost:5173/auth/callback';
      
      if (req.hostname === 'velocitydevelopment.vercel.app') {
        baseRedirectUrl = 'https://velocitydevelopment.vercel.app/auth/callback';
      } else if (req.hostname === 'www.joinvelocity.co' || req.hostname === 'joinvelocity.co') {
        baseRedirectUrl = 'https://www.joinvelocity.co/auth/callback';
      } else if (isProduction) {
        const frontendUrl = process.env.FRONTEND_URL_PROD || 'https://www.joinvelocity.co';
        baseRedirectUrl = frontendUrl + '/auth/callback';
      } else if (process.env.FRONTEND_URL) {
        baseRedirectUrl = process.env.FRONTEND_URL + '/auth/callback';
      }

      // Add query parameters for Jira auth
      const redirectParams = new URLSearchParams({ jira: 'true' });
      if (req.session.jiraMagicLinkToken) {
        redirectParams.append('token', req.session.jiraMagicLinkToken);
      }
      const redirectUrl = baseRedirectUrl + '?' + redirectParams.toString();
      
      console.log('[Jira OAuth Callback] Determining redirect URL:', {
        isProduction,
        nodeEnv: process.env.NODE_ENV,
        vercelEnv: process.env.VERCEL,
        hostname: req.hostname,
        redirectUrl
      });
      
      res.redirect(redirectUrl);
    } catch (tokenErr) {
      console.error('[Jira OAuth Callback] Token exchange or resource fetch failed:', tokenErr instanceof Error ? tokenErr.message : String(tokenErr));
      res.status(400).json({
        error: 'Token exchange failed',
        details: tokenErr instanceof Error ? tokenErr.message : 'Unknown error during token exchange',
        debug: process.env.NODE_ENV === 'development' ? { stack: tokenErr instanceof Error ? tokenErr.stack : undefined } : undefined
      });
      return;
    }
    
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

// Get valid access token for an org (DB-based, with automatic refresh)
export async function getAccessTokenForOrg(orgId: string, cloudId?: string): Promise<{ accessToken: string; cloudId: string } | null> {
  try {
    const db = await import('./db.js');
    const conn = await db.getJiraConnection(orgId, cloudId);
    if (!conn) {
      console.log('[Jira OAuth] No DB connection found for org:', orgId);
      return null;
    }

    // Check if token needs refresh (5 min buffer)
    const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0;
    if (Date.now() >= expiresAt - 5 * 60 * 1000 && conn.refresh_token) {
      try {
        console.log('[Jira OAuth] Token expired for org', orgId, ', refreshing...');
        const newTokens = await refreshAccessToken(conn.refresh_token);
        await db.updateConnectionTokens(conn.id, newTokens.access_token, newTokens.refresh_token, newTokens.expires_in);
        return { accessToken: newTokens.access_token, cloudId: conn.cloud_id };
      } catch (err) {
        console.error('[Jira OAuth] Token refresh failed for org', orgId, ':', err);
        return null;
      }
    }

    return { accessToken: conn.access_token, cloudId: conn.cloud_id };
  } catch (err) {
    console.error('[Jira OAuth] getAccessTokenForOrg error:', err);
    return null;
  }
}

// Get valid access token for user (tries org DB first, falls back to in-memory)
export async function getAccessToken(req: Request): Promise<string | null> {
  // Try org-based DB lookup first
  const orgId = (req.query?.orgId as string) || req.session?.orgId;
  if (orgId) {
    const result = await getAccessTokenForOrg(orgId, req.session?.jiraCloudId || undefined);
    if (result) return result.accessToken;
  }

  // Fallback to in-memory Map (backward compat)
  const storeKey = req.session?.jiraStoreKey;
  if (!storeKey) return null;
  const tokenStore = jiraTokens.get(storeKey);
  if (!tokenStore) return null;

  const needsRefresh = Date.now() >= (tokenStore.expiresAt - 5 * 60 * 1000);
  if (needsRefresh && tokenStore.refreshToken) {
    try {
      const newTokens = await refreshAccessToken(tokenStore.refreshToken);
      tokenStore.accessToken = newTokens.access_token;
      tokenStore.refreshToken = newTokens.refresh_token;
      tokenStore.expiresAt = Date.now() + (newTokens.expires_in * 1000);
      jiraTokens.set(storeKey, tokenStore);
      return newTokens.access_token;
    } catch (err) {
      jiraTokens.delete(storeKey);
      return null;
    }
  }
  return tokenStore.accessToken;
}

// Get Jira Cloud ID for user (tries org DB first)
export async function getCloudId(req: Request): Promise<string | null> {
  if (req.session?.jiraCloudId) return req.session.jiraCloudId;

  const orgId = (req.query?.orgId as string) || req.session?.orgId;
  if (orgId) {
    try {
      const db = await import('./db.js');
      const conn = await db.getJiraConnection(orgId);
      if (conn) return conn.cloud_id;
    } catch (e) { /* fallthrough */ }
  }

  const storeKey = req.session?.jiraStoreKey;
  if (!storeKey) return null;
  const tokenStore = jiraTokens.get(storeKey);
  return tokenStore?.cloudId || null;
}

// Get user's Jira site info
export async function getSiteInfo(req: Request): Promise<{ name?: string; url?: string } | null> {
  const orgId = (req.query?.orgId as string) || req.session?.orgId;
  if (orgId) {
    try {
      const db = await import('./db.js');
      const conn = await db.getJiraConnection(orgId);
      if (conn) return { name: conn.site_name, url: conn.site_url };
    } catch (e) { /* fallthrough */ }
  }

  const storeKey = req.session?.jiraStoreKey;
  if (!storeKey) return null;
  const tokenStore = jiraTokens.get(storeKey);
  if (!tokenStore) return null;
  return { name: tokenStore.siteName, url: tokenStore.siteUrl };
}

// Check if user has valid Jira connection
export function isConnected(req: Request): boolean {
  // Check session-based indicators
  if (req.session?.orgId && req.session?.jiraCloudId) return true;
  const storeKey = req.session?.jiraStoreKey;
  if (storeKey && jiraTokens.has(storeKey)) return true;
  if (storeKey && req.session?.jiraCloudId) return true;
  return false;
}

// Disconnect user's Jira account
export async function disconnect(req: Request): Promise<void> {
  const orgId = req.session?.orgId;
  const cloudId = req.session?.jiraCloudId;

  // Remove from DB
  if (orgId) {
    try {
      const db = await import('./db.js');
      await db.deleteJiraConnection(orgId, cloudId || undefined);
    } catch (e) { console.warn('[Jira OAuth] DB disconnect failed:', e); }
  }

  // Remove from memory
  const storeKey = req.session?.jiraStoreKey;
  if (storeKey) jiraTokens.delete(storeKey);

  delete req.session.jiraCloudId;
  delete req.session.jiraUserId;
  delete req.session.jiraStoreKey;
  delete req.session.jiraCodeVerifier;
  delete req.session.orgId;
  console.log('[Jira OAuth] User disconnected (orgId:', orgId, ')');
}

// Export OAuth handlers
export const jiraAuth = {
  login,
  callback,
  getAccessToken,
  getAccessTokenForOrg,
  getCloudId,
  getSiteInfo,
  isConnected,
  disconnect,
};