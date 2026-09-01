import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireActiveSemesterAdmin } from '@/src/program/canonical-access'

// ─── Types ───────────────────────────────────────────────────────────────────

type Recipient = {
  name: string
  email: string
  counterpartName: string
  meetingDate: string   // e.g. "Friday, April 4, 2026"
  slotLabel: string     // e.g. "3:30 – 4:15 PM"
  format: string        // e.g. "In-person" | "Online"
  location?: string
  role: 'mentor' | 'startup'
}

type NotifyRequest = {
  recipients: Recipient[]
}

// ─── Email builder ───────────────────────────────────────────────────────────

function buildEmailHtml(r: Recipient): string {
  const formatLine =
    r.format.toLowerCase().includes('person')
      ? `<b>Format:</b> In-person${r.location ? ` — ${r.location}` : ''}`
      : `<b>Format:</b> Online (link will be shared separately)`

  const greeting = r.role === 'mentor'
    ? `You have a mentorship session with <b>${r.counterpartName}</b> coming up.`
    : `Your startup has a mentorship session with <b>${r.counterpartName}</b> coming up.`

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:'Inter',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">

        <!-- Header -->
        <tr><td style="background:#002147;padding:24px 32px;">
          <p style="margin:0;color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-0.3px;">Almaworks</p>
          <p style="margin:4px 0 0;color:#75AADB;font-size:12px;font-weight:500;text-transform:uppercase;letter-spacing:0.08em;">Session Notification</p>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:32px;">
          <p style="margin:0 0 8px;font-size:15px;color:#374151;">Hi ${r.name},</p>
          <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6;">${greeting}</p>

          <!-- Session card -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;border-radius:8px;overflow:hidden;margin-bottom:24px;">
            <tr><td style="padding:0;background:#002147;border-radius:8px 8px 0 0;height:4px;line-height:4px;font-size:4px;">&nbsp;</td></tr>
            <tr><td style="padding:20px 24px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:6px 12px 6px 0;width:50%;">
                    <p style="margin:0;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;">Date</p>
                    <p style="margin:4px 0 0;font-size:15px;color:#111827;font-weight:600;">${r.meetingDate}</p>
                  </td>
                  <td style="padding:6px 0;width:50%;">
                    <p style="margin:0;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;">Time</p>
                    <p style="margin:4px 0 0;font-size:15px;color:#111827;font-weight:600;">${r.slotLabel}</p>
                  </td>
                </tr>
                <tr>
                  <td colspan="2" style="padding:12px 0 6px;border-top:1px solid #e5e7eb;">
                    <p style="margin:0;font-size:13px;color:#374151;">${formatLine}</p>
                  </td>
                </tr>
              </table>
            </td></tr>
          </table>

          <p style="margin:0 0 6px;font-size:13px;color:#6b7280;line-height:1.6;">
            If you have any questions or need to reschedule, please reach out to the Almaworks admin team directly.
          </p>
          <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6;">
            We look forward to seeing you there!
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:20px 32px;background:#f9fafb;border-top:1px solid #f3f4f6;">
          <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center;">
            Almaworks Mentorship Program &middot; This is an automated notification
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}

function buildEmailText(r: Recipient): string {
  const greeting = r.role === 'mentor'
    ? `You have a mentorship session with ${r.counterpartName} coming up.`
    : `Your startup has a mentorship session with ${r.counterpartName} coming up.`
  return [
    `Hi ${r.name},`,
    '',
    greeting,
    '',
    `Date: ${r.meetingDate}`,
    `Time: ${r.slotLabel}`,
    `Format: ${r.format}${r.location ? ` — ${r.location}` : ''}`,
    '',
    'If you have any questions or need to reschedule, please reach out to the Almaworks admin team.',
    '',
    '— Almaworks Mentorship Program',
  ].join('\n')
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !anonKey) {
      return NextResponse.json({ error: 'Missing Supabase environment variables.' }, { status: 500 })
    }

    // Auth
    const authHeader = req.headers.get('authorization') ?? ''
    const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!accessToken) return NextResponse.json({ error: 'Missing bearer token.' }, { status: 401 })

    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: authData, error: authErr } = await userClient.auth.getUser()
    if (authErr || !authData.user) return NextResponse.json({ error: 'Invalid auth token.' }, { status: 401 })

    await requireActiveSemesterAdmin(userClient, authData.user.id)

    // Parse body
    const body = await req.json() as NotifyRequest
    const { recipients } = body
    if (!Array.isArray(recipients) || recipients.length === 0) {
      return NextResponse.json({ error: 'No recipients provided.' }, { status: 400 })
    }

    const apiKey = process.env.RESEND_API_KEY
    const fromAddress = process.env.NOTIFY_FROM_EMAIL ?? 'Almaworks <notifications@almaworks.co>'

    // ── DRY RUN (no API key configured) ──────────────────────────────────────
    if (!apiKey) {
      const preview = recipients.map(r => ({
        to: r.email,
        subject: `Your Almaworks session on ${r.meetingDate}`,
        body_preview: buildEmailText(r),
        dry_run: true,
        message: 'RESEND_API_KEY is not set — this email would have been sent successfully.',
      }))
      return NextResponse.json({ sent: 0, dry_run: true, preview })
    }

    // ── LIVE SEND via Resend ──────────────────────────────────────────────────
    const results: { email: string; ok: boolean; error?: string }[] = []

    for (const r of recipients) {
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: fromAddress,
            to: [r.email],
            subject: `Your Almaworks session on ${r.meetingDate}`,
            html: buildEmailHtml(r),
            text: buildEmailText(r),
          }),
        })
        if (!res.ok) {
          results.push({ email: r.email, ok: false, error: await res.text() })
        } else {
          results.push({ email: r.email, ok: true })
        }
      } catch (e) {
        results.push({ email: r.email, ok: false, error: String(e) })
      }
    }

    const sent = results.filter(r => r.ok).length
    return NextResponse.json({ sent, dry_run: false, results })
  } catch (err) {
    if (err instanceof Error && err.message === 'Semester administrator access required.') {
      return NextResponse.json({ error: err.message }, { status: 403 })
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected server error.' },
      { status: 500 },
    )
  }
}
