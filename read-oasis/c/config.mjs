// Author: Huy Tran
// Company: Cadence Design Systems Vietnam
// Email: huytran@cadence.com
// Created: 2026-09-27
//
// Deployment configuration. Same Supabase project as toan3.html / tiengviet3.html (anon key is public by design;
// row access is enforced by RLS in supabase_read_oasis.sql). Cloud sync is OFF until a parent signs in and enables it.
export const SUPA_URL = 'https://wbcszbyhsvhrkyyvkzfc.supabase.co';
export const SUPA_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndiY3N6Ynloc3Zocmt5eXZremZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk4OTA1MDcsImV4cCI6MjEwNTQ2NjUwN30.K0uYmd7HjjQTMSjipkTQdxnrzuE0CCby2GeEX872l8I';
export const SUPA_JS_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
export const SYNC_TABLE = 'ro_progress';
