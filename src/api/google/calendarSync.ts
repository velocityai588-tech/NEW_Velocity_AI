// src/api/google/calendarSync.ts
// Syncs Google Calendar events for an org — meetings, leave, team schedules

import { google } from 'googleapis';
import * as db from './db.js';
import { createClient } from '@supabase/supabase-js';

const getSupabase = () => createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const getClientId = () => process.env.GOOGLE_CLIENT_ID || '';
const getClientSecret = () => process.env.GOOGLE_CLIENT_SECRET || '';

export async function syncGoogleCalendar(orgId: string): Promise<{ count: number; events: any[] }> {
  const conn = await db.getGoogleConnection(orgId);
  if (!conn) throw new Error('No Google connection found');

  const oauth2Client = new google.auth.OAuth2(getClientId(), getClientSecret());
  oauth2Client.setCredentials({
    access_token: conn.access_token,
    refresh_token: conn.refresh_token,
    expiry_date: conn.expiry_date,
  });

  // Auto-refresh token
  oauth2Client.on('tokens', async (tokens) => {
    await db.upsertGoogleConnection({
      ...conn,
      access_token: tokens.access_token!,
      refresh_token: tokens.refresh_token || conn.refresh_token,
      expiry_date: tokens.expiry_date || undefined,
    });
  });

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  const supabase = getSupabase();

  // Sync next 30 days of events
  const now = new Date();
  const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const response = await calendar.events.list({
    calendarId: 'primary',
    timeMin: now.toISOString(),
    timeMax: thirtyDaysLater.toISOString(),
    maxResults: 100,
    singleEvents: true,
    orderBy: 'startTime',
  });

  const events = response.data.items || [];
  let syncedCount = 0;

  for (const event of events) {
    if (!event.id || !event.summary) continue;

    const startTime = event.start?.dateTime || event.start?.date;
    const endTime = event.end?.dateTime || event.end?.date;
    if (!startTime || !endTime) continue;

    const attendees = (event.attendees || []).map((a: any) => ({
      email: a.email,
      name: a.displayName,
      status: a.responseStatus,
    }));

    const meetingLink = event.hangoutLink ||
      event.conferenceData?.entryPoints?.find((e: any) => e.entryPointType === 'video')?.uri || null;

    await supabase.from('calendar_events').upsert({
      organization_id: orgId,
      user_id: conn.user_id,
      google_event_id: event.id,
      title: event.summary,
      description: event.description || null,
      start_time: startTime,
      end_time: endTime,
      attendees,
      meeting_link: meetingLink,
      is_all_day: !!event.start?.date,
      status: event.status || 'confirmed',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'google_event_id' });

    syncedCount++;
  }

  console.log(`[Calendar Sync] Synced ${syncedCount} events for org ${orgId}`);
  return { count: syncedCount, events: events.slice(0, 10) };
}

export async function getUpcomingEvents(orgId: string): Promise<any[]> {
  const supabase = getSupabase();
  const now = new Date().toISOString();

  const { data } = await supabase
    .from('calendar_events')
    .select('*')
    .eq('organization_id', orgId)
    .gte('start_time', now)
    .order('start_time', { ascending: true })
    .limit(20);

  return data || [];
}

export async function createCalendarEvent(orgId: string, event: {
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  attendeeEmails?: string[];
}): Promise<any> {
  const conn = await db.getGoogleConnection(orgId);
  if (!conn) throw new Error('No Google connection found');

  const oauth2Client = new google.auth.OAuth2(getClientId(), getClientSecret());
  oauth2Client.setCredentials({
    access_token: conn.access_token,
    refresh_token: conn.refresh_token,
  });

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  const calEvent = await calendar.events.insert({
    calendarId: 'primary',
    requestBody: {
      summary: event.title,
      description: event.description,
      start: { dateTime: event.startTime },
      end: { dateTime: event.endTime },
      attendees: event.attendeeEmails?.map(email => ({ email })),
      conferenceData: {
        createRequest: {
          requestId: `velocity-${Date.now()}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      },
    },
    conferenceDataVersion: 1,
  });

  return calEvent.data;
}
