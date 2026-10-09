import { NextResponse } from 'next/server'
import { AuthorizationError, requireAuthenticatedUser } from '@/src/auth/server'
import { requireActiveSemesterAdmin } from '@/src/program/canonical-access'
import { setSemesterMemberAccess } from '@/src/program/server/canonical-admin'
import { addProgramMember, MemberRegistrationConflict } from '@/src/program/server/member-registration'
import { sendMemberWelcome } from '@/src/program/server/member-welcome'
import { ReconciliationRequiredError } from '@/src/program/server/user-access'

export async function POST(request: Request) {
  try {
    const { user, profileId, userClient, adminClient } = await requireAuthenticatedUser(request)
    const semesterId = await requireActiveSemesterAdmin(userClient, user.id)
    const body: unknown = await request.json().catch(() => null)
    if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Invalid member details.' }, { status: 400 })
    const payload = body as { email?: string; fullName?: string; role?: string; restoreAccess?: boolean }
    const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : ''
    const fullName = typeof payload.fullName === 'string' ? payload.fullName.trim() : ''
    const role = payload.role
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email) || !fullName || (role !== 'mentor' && role !== 'startup' && role !== 'admin')) {
      return NextResponse.json({ error: 'A name, valid email, and role are required.' }, { status: 400 })
    }
    const result = await addProgramMember({ email, fullName, role, restoreAccess: payload.restoreAccess === true }, {
      lookup: async targetEmail => {
        const profile = await userClient.from('profiles').select('id,auth_user_id,status,is_active').eq('email', targetEmail).maybeSingle()
        if (profile.error) throw new Error(profile.error.message)
        if (!profile.data) return null
        const membership = await userClient.from('semester_memberships').select('role,status').eq('semester_id', semesterId).eq('profile_id', profile.data.id).maybeSingle()
        if (membership.error) throw new Error(membership.error.message)
        return { id: profile.data.id, authUserId: profile.data.auth_user_id, status: profile.data.status, isActive: profile.data.is_active, membership: membership.data }
      },
      createIdentity: async (targetEmail, name) => {
        const { data, error } = await adminClient.auth.admin.createUser({
          email: targetEmail, email_confirm: false,
          user_metadata: { full_name: name }, app_metadata: { almaworks_added: true },
        })
        if (error || !data.user) throw new Error('Unable to create sign-in identity. No membership was granted. Check the existing account before retrying.')
        return data.user.id
      },
      grantAccess: async targetId => {
        await setSemesterMemberAccess(userClient, {
          actorProfileId: profileId, approve: true, email, fullName, profileId: targetId, role, semesterId,
        })
        const identity = await adminClient.auth.admin.getUserById(targetId)
        if (identity.error || !identity.data.user) throw new ReconciliationRequiredError('Access was saved, but sign-in setup could not be checked. Check this account before retrying.')
        const authUser = identity.data.user
        // Existing password sign-ins keep their password. Google-only identities
        // need the same password-setup entry as a newly added identity.
        if (!authUser.identities?.some(item => item.provider === 'email')) {
          const updated = await adminClient.auth.admin.updateUserById(targetId, { app_metadata: { ...authUser.app_metadata, almaworks_added: true } })
          if (updated.error) throw new ReconciliationRequiredError('Access was saved, but sign-in setup could not be prepared. Check this account before retrying.')
        }
      },
      removeNewIdentity: async targetId => {
        const result = await adminClient.auth.admin.deleteUser(targetId)
        if (result.error) throw new Error(result.error.message)
      },
      notify: (targetEmail, name) => sendMemberWelcome({ apiKey: process.env.SEQUENZY_API_KEY, origin: process.env.NOTIFICATION_APP_ORIGIN, email: targetEmail, fullName: name }),
    })
    return NextResponse.json({ ok: true, email, role, ...result })
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status })
    if (error instanceof MemberRegistrationConflict) return NextResponse.json({ error: error.message, restoreRequired: error.restoreRequired }, { status: 409 })
    if (error instanceof ReconciliationRequiredError) return NextResponse.json({ error: error.message, reconciliationRequired: true }, { status: 500 })
    const status = error instanceof Error && error.message.includes('Semester administrator access required') ? 403 : 500
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to add member.' }, { status })
  }
}
