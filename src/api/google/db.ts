// src/api/google/db.ts
// Supabase persistence for Google/Gmail connections and pending action items.

import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient | null {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
  if (!url || !key) {
    console.warn('[GoogleDB] Missing SUPABASE_URL or key');
    return null;
  }
  _client = createClient(url, key);
  return _client;
}

export interface GoogleConnection {
  organization_id: string;
  user_id: string;
  email: string;
  access_token: string;
  refresh_token?: string;
  expiry_date?: number;
}

export interface PendingAction {
  id: string;
  organization_id: string;
  source_email_id: string;
  from_email: string;
  subject: string;
  title: string;
  description: string;
  metadata: any;
  status: 'pending' | 'approved' | 'dismissed';
}

// ── Connection Helpers ────────────────────────────────────────────────────────

export async function upsertGoogleConnection(conn: GoogleConnection): Promise<void> {
  const client = getClient();
  if (!client) return;

  const { error } = await client.from('google_connections').upsert(
    {
      ...conn,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'organization_id' }
  );

  if (error) console.error('[GoogleDB] upsertGoogleConnection error:', error.message);
}

export async function getGoogleConnection(orgId: string): Promise<GoogleConnection | null> {
  const client = getClient();
  if (!client) return null;

  const { data, error } = await client
    .from('google_connections')
    .select('*')
    .eq('organization_id', orgId)
    .single();

  if (error || !data) return null;
  return data;
}

export async function deleteGoogleConnection(orgId: string): Promise<void> {
  const client = getClient();
  if (!client) return;
  await client.from('google_connections').delete().eq('organization_id', orgId);
}

// ── Action Items Helpers ──────────────────────────────────────────────────────

export async function upsertPendingActions(orgId: string, actions: Partial<PendingAction>[]): Promise<void> {
  const client = getClient();
  if (!client || actions.length === 0) return;

  const rows = actions.map(a => ({
    ...a,
    organization_id: orgId,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await client.from('pending_actions').upsert(rows, { onConflict: 'organization_id,source_email_id' });
  if (error) console.error('[GoogleDB] upsertPendingActions error:', error.message);
}

export async function getPendingActions(orgId: string): Promise<PendingAction[]> {
  const client = getClient();
  if (!client) return [];

  const { data, error } = await client
    .from('pending_actions')
    .select('*')
    .eq('organization_id', orgId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[GoogleDB] getPendingActions error:', error.message);
    return [];
  }
  return data || [];
}

export async function updateActionStatus(actionId: string, status: 'approved' | 'dismissed'): Promise<void> {
  const client = getClient();
  if (!client) return;

  const { error } = await client
    .from('pending_actions')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', actionId);

  if (error) console.error('[GoogleDB] updateActionStatus error:', error.message);
}
