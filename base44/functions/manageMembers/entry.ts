import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { authorize, getSettings } from '../../shared/tenant.ts';
import { writeAudit } from '../../shared/audit.ts';
import { str } from '../../shared/utils.ts';

// Manage Members — admin-only user/membership management for the single business.
// Actions: list, invite, update_role, deactivate, reactivate.
export default async function(req) {
  const base44 = createClientFromRequest(req);
  try {
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const auth = await authorize(base44, user, 'manageMembers');
    if (!auth.authorized) return Response.json({ error: auth.error }, { status: auth.status });
    const { ctx } = auth;

    // Defense-in-depth: role/permission management requires explicit Admin authority.
    // The permission map already limits manageMembers to admin, but we enforce it
    // again here so that any future permission change cannot accidentally open this path.
    if (ctx.role !== 'admin') {
      return Response.json({ error: 'Forbidden: only Admin can manage users and roles' }, { status: 403 });
    }

    const body = await req.json();
    const action = str(body.action);

    if (action === 'list') {
      const members = await base44.asServiceRole.entities.ShopMembership.filter(
        { is_active: true }, '-created_date', 100
      );
      return Response.json({ success: true, members });
    }

    if (action === 'invite') {
      const email = str(body.email).toLowerCase();
      const role = str(body.role);
      if (!email) return Response.json({ error: 'Email required' }, { status: 400 });
      if (!['admin', 'staff', 'cashier'].includes(role)) return Response.json({ error: 'Invalid role' }, { status: 400 });

      const existing = await base44.asServiceRole.entities.ShopMembership.filter(
        { user_email: email, is_active: true }, '-created_date', 1
      );
      if (existing.length > 0) return Response.json({ error: 'User already a member' }, { status: 400 });

      let invitedUser = null;
      try { invitedUser = await base44.users.inviteUser(email, 'user'); } catch (e) { /* may already exist */ }

      // If inviteUser didn't return a user (e.g. user already existed and threw), find them
      // by email so we can link the membership and cache the selected JewelERP role immediately.
      // The 'user' platform role from inviteUser is auth-only and must never override the
      // selected ShopMembership role.
      if (!invitedUser?.id) {
        const existing = await base44.asServiceRole.entities.User.filter({ email }, undefined, 1).catch(() => []);
        if (existing.length > 0) invitedUser = existing[0];
      }

      const settings = await getSettings(base44);
      const membership = await base44.asServiceRole.entities.ShopMembership.create({
        user_id: invitedUser?.id || '', user_email: email, user_name: str(body.name),
        shop_name: settings?.shop_name || '', role,
        is_active: true, status: 'invited', invited_by: user.id,
        invited_by_name: user.full_name || user.email || '', joined_date: new Date().toISOString(),
      });

      // Cache the selected JewelERP role on the User so resolveSession finds it on first login.
      if (invitedUser?.id) {
        await base44.asServiceRole.entities.User.update(invitedUser.id, { active_shop_role: role }).catch(() => {});
      }

      await writeAudit(base44, {
        action: 'invite_user', module: 'members', record_id: membership.id,
        new_value: { email, role }, user_id: user.id, user_name: user.full_name || user.email || '', user_role: ctx.role,
      });
      return Response.json({ success: true, membership_id: membership.id });
    }

    if (action === 'update_role') {
      const membershipId = str(body.membership_id);
      const newRole = str(body.role);
      if (!['admin', 'staff', 'cashier'].includes(newRole)) return Response.json({ error: 'Invalid role' }, { status: 400 });

      const membership = await base44.asServiceRole.entities.ShopMembership.get(membershipId).catch(() => null);
      if (!membership) return Response.json({ error: 'Membership not found' }, { status: 404 });

      // SECURITY: Prevent self-role-change (privilege escalation / self-demotion lockout).
      if (membership.user_id && membership.user_id === user.id) {
        return Response.json({ error: 'You cannot change your own role' }, { status: 403 });
      }

      await base44.asServiceRole.entities.ShopMembership.update(membershipId, { role: newRole });
      // Sync the user's role
      if (membership.user_id) {
        await base44.asServiceRole.entities.User.update(membership.user_id, { active_shop_role: newRole }).catch(() => {});
      }
      await writeAudit(base44, {
        action: 'update_role', module: 'members', record_id: membershipId,
        previous_value: { role: membership.role }, new_value: { role: newRole },
        user_id: user.id, user_name: user.full_name || user.email || '', user_role: ctx.role,
      });
      return Response.json({ success: true });
    }

    if (action === 'deactivate' || action === 'reactivate') {
      const membershipId = str(body.membership_id);
      const membership = await base44.asServiceRole.entities.ShopMembership.get(membershipId).catch(() => null);
      if (!membership) return Response.json({ error: 'Membership not found' }, { status: 404 });

      // SECURITY: Prevent self-deactivation (would lock the admin out).
      if (membership.user_id && membership.user_id === user.id) {
        return Response.json({ error: 'You cannot deactivate your own account' }, { status: 403 });
      }

      const isActive = action === 'reactivate';
      const status = action === 'reactivate' ? 'active' : 'revoked';
      await base44.asServiceRole.entities.ShopMembership.update(membershipId, { is_active: isActive, status });
      // Clear the user's role when deactivated
      if (membership.user_id && !isActive) {
        await base44.asServiceRole.entities.User.update(membership.user_id, { active_shop_role: '' }).catch(() => {});
      } else if (membership.user_id && isActive) {
        await base44.asServiceRole.entities.User.update(membership.user_id, { active_shop_role: membership.role }).catch(() => {});
      }
      await writeAudit(base44, {
        action: action + '_member', module: 'members', record_id: membershipId,
        user_id: user.id, user_name: user.full_name || user.email || '', user_role: ctx.role,
      });
      return Response.json({ success: true });
    }

    if (action === 'delete') {
      const membershipId = str(body.membership_id);
      const membership = await base44.asServiceRole.entities.ShopMembership.get(membershipId).catch(() => null);
      if (!membership) return Response.json({ error: 'Membership not found' }, { status: 404 });

      // SECURITY: Prevent self-deletion (would remove the admin's own access).
      if (membership.user_id && membership.user_id === user.id) {
        return Response.json({ error: 'You cannot delete your own account' }, { status: 403 });
      }

      await base44.asServiceRole.entities.ShopMembership.delete(membershipId);
      // Clear the user's cached role so a stale role does not persist after deletion.
      if (membership.user_id) {
        await base44.asServiceRole.entities.User.update(membership.user_id, { active_shop_role: '' }).catch(() => {});
      }
      await writeAudit(base44, {
        action: 'delete_member', module: 'members', record_id: membershipId,
        previous_value: { email: membership.user_email, role: membership.role },
        user_id: user.id, user_name: user.full_name || user.email || '', user_role: ctx.role,
      });
      return Response.json({ success: true });
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}