'use client'

import { useState } from 'react'

type Template = {
  id: string
  name: string
  subject: string
  body: string
}

const TEMPLATES: Template[] = [
  {
    id: 'intro-outreach',
    name: 'Intro Outreach',
    subject: 'Invitation to Join Almaworks Mentorship Program',
    body: `Hi [Name],

I hope this message finds you well. My name is [Your Name] from Almaworks, a Columbia University-based accelerator supporting early-stage startups.

We're building our mentorship program for [Semester] and would love to have you as a mentor. Your expertise in [Area] would be incredibly valuable to our cohort of founders.

As a mentor, you'd commit to a handful of 45-minute sessions over the semester — completely on your schedule — and share your knowledge and network with our founders.

Would you be open to a quick call to learn more? I'd love to share more details about the program and how we can make this a rewarding experience for you.

Looking forward to hearing from you,

[Your Name]
Almaworks | [Contact Info]`,
  },
  {
    id: 'follow-up',
    name: 'Follow-Up',
    subject: 'Following Up: Almaworks Mentorship Program',
    body: `Hi [Name],

I wanted to follow up on my previous message about the Almaworks mentorship program for [Semester].

I know your schedule is busy, so I'll keep this brief. We'd truly value your experience in [Area] for our founders. The commitment is flexible — just a few 45-minute sessions over the semester at times that work for you.

Would you have 15 minutes for a quick call this week or next? Happy to work around your schedule.

Thanks for considering it,

[Your Name]
Almaworks | [Contact Info]`,
  },
  {
    id: 'mentor-invite',
    name: 'Mentor Invite',
    subject: 'Your Almaworks Mentor Portal Access — [Semester]',
    body: `Hi [Name],

Welcome to Almaworks! We're thrilled to have you as a mentor for [Semester].

To get started, please complete your mentor profile using the link below:

[Magic Link / Portal URL]

Your profile helps our startups learn about your background and get matched to the right sessions. Please fill in:
- Bio and areas of expertise
- LinkedIn profile URL
- Preferred session format (online / in-person)
- General availability

Once your profile is set, our admin team will schedule your sessions and you'll receive calendar invites.

If you have any questions, feel free to reply to this email.

Looking forward to a great semester!

[Your Name]
Almaworks | [Contact Info]`,
  },
]

export default function ResourcesPage() {
  const [selected, setSelected] = useState<Template>(TEMPLATES[0])
  const [copied, setCopied] = useState<string | null>(null)

  function copyField(text: string, field: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(field)
      setTimeout(() => setCopied(null), 1500)
    })
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#002147]">Resources</h1>
        <p className="text-sm text-gray-500 mt-1">Template emails for outreach and onboarding.</p>
      </div>

      <div className="flex gap-6">
        {/* Sidebar */}
        <div className="w-44 shrink-0">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest px-1 mb-2">Email Templates</p>
          <div className="space-y-1">
            {TEMPLATES.map(t => (
              <button
                key={t.id}
                onClick={() => setSelected(t)}
                className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  selected.id === t.id
                    ? 'bg-[#002147] text-white'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                {t.name}
              </button>
            ))}
          </div>
        </div>

        {/* Template viewer */}
        <div className="flex-1 min-w-0 bg-white rounded-2xl border border-gray-100 p-6 space-y-5">
          <h2 className="text-base font-semibold text-[#002147]">{selected.name}</h2>

          {/* Subject line */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Subject</label>
              <button
                onClick={() => copyField(selected.subject, 'subject')}
                className="text-[11px] font-medium text-gray-400 hover:text-[#002147] flex items-center gap-1 transition-colors"
              >
                {copied === 'subject' ? (
                  <span className="text-green-600">Copied!</span>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    Copy
                  </>
                )}
              </button>
            </div>
            <div className="bg-gray-50 rounded-xl px-4 py-3 text-sm text-gray-800 font-medium">
              {selected.subject}
            </div>
          </div>

          {/* Body */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Body</label>
              <button
                onClick={() => copyField(selected.body, 'body')}
                className="text-[11px] font-medium text-gray-400 hover:text-[#002147] flex items-center gap-1 transition-colors"
              >
                {copied === 'body' ? (
                  <span className="text-green-600">Copied!</span>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    Copy
                  </>
                )}
              </button>
            </div>
            <pre className="bg-gray-50 rounded-xl px-4 py-4 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed font-sans max-h-96 overflow-y-auto">
              {selected.body}
            </pre>
          </div>

          <p className="text-xs text-gray-400">
            Replace placeholders in brackets — [Name], [Semester], [Area], [Your Name] — before sending.
          </p>
        </div>
      </div>
    </div>
  )
}
