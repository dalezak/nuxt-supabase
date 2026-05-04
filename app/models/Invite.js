import SupaModel from './SupaModel';
import SupaModels from './SupaModels';
import Invites from './Invites';

// Invite: a pending invitation to either a group (group_id set) or a
// friendship (group_id null). When the recipient signs up with the matching
// email, a DB trigger auto-joins them to the group / auto-accepts the friend
// request and marks the invite accepted.
//
// `send` and `sendFriend` invoke the layer's `invite-send` Edge Function,
// which handles auth, validates group ownership (for group invites), upserts
// the invite row, and (optionally) sends a branded email if the consuming
// app passes `app_name` / `app_url` / `from_email` parameters.

export default class Invite extends SupaModel {

  id = null;
  group_id = null;
  email = null;
  invited_by = null;
  token = null;
  status = 'pending';
  created_at = null;

  constructor(data = {}) {
    super(data);
    Object.assign(this, data);
  }

  // Send a group invite. `branding` is the per-app email/branding context
  // forwarded to the Edge Function: { app_name, app_url, from_name, from_email }.
  // `groupName` and `fromName` are used in the email body / subject.
  // Returns { added: true } if the invitee already had an account and was
  // added directly, or { invited: true } if an email invite was sent / queued.
  static async send(groupId, email, groupName, fromName, branding = {}) {
    return invokeFunction('invite-send', { groupId, email, groupName, fromName, ...branding });
  }

  // Send a friend invite (no group). Inserts the invite row directly via RLS,
  // then fires the email Edge Function in the background. When the invitee
  // signs up, the DB trigger creates an accepted friendship automatically.
  static async sendFriend(userId, email, fromName, branding = {}) {
    const normalizedEmail = email.trim().toLowerCase();
    await this.insertModel('invites', {
      group_id: null,
      email: normalizedEmail,
      invited_by: userId,
    });
    invokeFunction('invite-send', { email: normalizedEmail, fromName, ...branding })
      .catch(e => consoleError('invite email', e));
  }

  // Resend the email for an existing pending invite.
  static async resend(email, fromName, branding = {}) {
    return invokeFunction('invite-send', { email, fromName, ...branding });
  }

  // Pending friend invites this user has sent (recipient hasn't signed up yet).
  static async loadPendingFriendInvites(userId) {
    return SupaModels.loadModels(Invites, Invite, 'invites', {
      select: 'id, email, created_at',
      where: [
        ['group_id', 'is', null],
        ['invited_by', 'eq', userId],
        ['status', 'eq', 'pending'],
      ],
      order: 'created_at:desc',
      limit: 1000,
    });
  }

  static async cancel(inviteId) {
    await SupaModels.deleteModels('invites', [['id', 'eq', inviteId]]);
  }
}
