/**
 * Support Inbox validation + security contract checks.
 *
 * Pure client validators plus schema/source-text assertions so ticket
 * numbers, ownership, and internal notes cannot leak or be spoofed.
 *
 * Run with: npm run test:support
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  isSupportCategory,
  isSupportPriority,
  isSupportStatus,
  isSupportTicketNo,
  SUPPORT_ATTACHMENT_MAX_BYTES,
  SUPPORT_ATTACHMENT_MAX_FILES,
  SUPPORT_CATEGORIES,
  SUPPORT_STATUSES,
  SUPPORT_STATUS_LABEL,
  validateReplyBody,
  validateTicketDraft,
} from '../src/lib/support/types';

const ROOT = process.cwd();
let failures = 0;

function assert(cond: boolean, label: string) {
  if (cond) {
    console.log(`  PASS  ${label}`);
  } else {
    failures++;
    console.error(`  FAIL  ${label}`);
  }
}

function main() {
  console.log('\n[1] ticket draft validation\n');
  assert(validateTicketDraft({ category: 'bug', subject: 'Cannot export PDF', body: 'The export button does nothing.' }) === null, 'valid draft accepted');
  assert(validateTicketDraft({ category: 'nope', subject: 'Cannot export PDF', body: 'The export button does nothing.' }) !== null, 'unknown category rejected');
  assert(validateTicketDraft({ category: 'bug', subject: 'ab', body: 'The export button does nothing.' }) !== null, 'short subject rejected');
  assert(validateTicketDraft({ category: 'bug', subject: 'x'.repeat(161), body: 'The export button does nothing.' }) !== null, 'long subject rejected');
  assert(validateTicketDraft({ category: 'bug', subject: 'Cannot export PDF', body: 'short' }) !== null, 'short body rejected');
  assert(validateTicketDraft({ category: 'account', subject: '  Locked out  ', body: '  I cannot sign in after reset.  ' }) === null, 'trimmed lengths accepted');

  console.log('\n[2] reply / ticket number helpers\n');
  assert(validateReplyBody('Thanks') === null, 'short reply accepted');
  assert(validateReplyBody('   ') !== null, 'whitespace-only reply rejected');
  assert(validateReplyBody('x'.repeat(8001)) !== null, 'oversized reply rejected');
  assert(isSupportTicketNo('SUP-20260918-0001'), 'canonical ticket number accepted');
  assert(!isSupportTicketNo('SUP-2026-1'), 'short ticket number rejected');
  assert(!isSupportTicketNo('sup-20260918-0001'), 'lowercase prefix rejected');
  assert(isSupportCategory('pdf-editor') && isSupportStatus('waiting_for_user') && isSupportPriority('urgent'), 'enums recognized');
  assert(!isSupportStatus('Open') && !isSupportCategory('Bug'), 'display labels are not stored values');
  assert(SUPPORT_CATEGORIES.length === 6 && SUPPORT_STATUSES.length === 6, 'category/status counts');
  assert(SUPPORT_STATUS_LABEL.in_review === 'In Review', 'status labels match product copy');
  assert(SUPPORT_ATTACHMENT_MAX_BYTES === 8 * 1024 * 1024, '8 MB attachment cap');
  assert(SUPPORT_ATTACHMENT_MAX_FILES === 4, 'max 4 attachments');

  console.log('\n[3] schema security contract\n');
  const schema = readFileSync(join(ROOT, 'supabase/schema.sql'), 'utf8');
  assert(schema.includes("ticket_no text not null unique"), 'ticket_no unique');
  assert(schema.includes("'SUP-' || stamp || '-' || lpad(n::text, 4, '0')"), 'server-generated SUP-YYYYMMDD-XXXX');
  assert(schema.includes('create or replace function public.create_support_ticket'), 'create RPC exists');
  assert(schema.includes('create or replace function public.reply_support_ticket'), 'reply RPC exists');
  assert(schema.includes('create or replace function public.update_support_ticket'), 'update RPC exists');
  assert(schema.includes('create or replace function public.add_support_note'), 'note RPC exists');
  assert(schema.includes('if not public.is_admin() then') && schema.includes("raise exception 'admin required'"), 'admin RPCs reject non-admins');
  assert(schema.includes('uid := auth.uid()') && schema.includes('ticket_no, user_id, user_email'), 'create RPC locks user_id to auth.uid()');
  assert(!/create_support_ticket[\s\S]*p_user_id/.test(schema), 'create RPC has no client user_id argument');
  assert(schema.includes('create table if not exists public.support_notes'), 'internal notes are a separate table');
  assert(schema.includes('create policy "support_notes_select"'), 'notes select policy exists');
  assert(/create policy "support_notes_select"[\s\S]*for select using \(public\.is_admin\(\)\)/.test(schema), 'notes are admin-only');
  assert(schema.includes('Users never UPDATE tickets'), 'users cannot update ticket status');
  assert(schema.includes("grant select on table public.support_tickets to authenticated"), 'tickets are read-only to the client role');
  assert(schema.includes('create policy "support_tickets_select"'), 'ticket select RLS exists');
  assert(schema.includes('user_id = auth.uid()') && schema.includes('or public.is_admin()'), 'users see own tickets; admins see all');
  assert(schema.includes("bucket_id = 'support-attachments'"), 'private attachment bucket policies');
  assert(schema.includes('alter publication supabase_realtime add table public.support_messages'), 'realtime on messages');
  assert(schema.includes('replica identity full'), 'realtime filters can use ticket_id');
  assert(schema.includes("byte_size <= 8388608"), 'attachment size enforced in SQL');

  console.log('\n[4] app wiring\n');
  const sidebar = readFileSync(join(ROOT, 'src/components/layout/sidebar.tsx'), 'utf8');
  const layout = readFileSync(join(ROOT, 'src/app/studio/layout.tsx'), 'utf8');
  const access = readFileSync(join(ROOT, 'src/lib/workspace/access.ts'), 'utf8');
  const inbox = readFileSync(join(ROOT, 'src/app/studio/support/page.tsx'), 'utf8');
  const thread = readFileSync(join(ROOT, 'src/app/studio/support/[id]/page.tsx'), 'utf8');
  const api = readFileSync(join(ROOT, 'src/lib/support/api.ts'), 'utf8');
  const uploads = readFileSync(join(ROOT, 'src/lib/uploads.ts'), 'utf8');

  assert(sidebar.includes("/studio/support") && sidebar.includes('Support Inbox'), 'sidebar link present');
  assert(!sidebar.includes("scope: 'support'"), 'support is not gated by allowed_tools');
  assert(!access.includes("'support'"), 'TOOL_SCOPES does not add a support lock');
  assert(!layout.includes('/studio/support'), 'support is available to every signed-in user');
  assert(inbox.includes('createSupportTicket') && inbox.includes('listSupportTickets'), 'inbox creates and lists tickets');
  assert(thread.includes('replySupportTicket') && thread.includes('Internal notes'), 'thread can reply; admin notes exist');
  assert(thread.includes('canManageUsers') && thread.includes('addSupportNote'), 'notes are admin-gated in UI');
  assert(api.includes("rpc('create_support_ticket'") && api.includes("rpc('update_support_ticket'"), 'client uses RPCs, not trusted ids');
  assert(!api.includes('p_user_id') && !api.includes('user_id: input'), 'client never sends a user id to create/update');
  assert(uploads.includes('validateSupportAttachment'), 'attachment sniffing exists');

  if (failures) {
    console.error(`\n${failures} support check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll support checks passed.\n');
}

main();
