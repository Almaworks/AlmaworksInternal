import Link from 'next/link'
import type { ReactNode } from 'react'

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-slate-800">
      <header className="border-b border-slate-200 px-5 py-5">
        <nav aria-label="Public navigation" className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-4">
          <Link href="/learn-more" className="text-xl font-bold text-[#002147]">Almaworks</Link>
          <Link href="/" className="text-sm font-medium text-[#002147] underline underline-offset-4">Sign in</Link>
        </nav>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-10 sm:py-16">
        <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-600">Almaworks Internal</p>
        <h1 className="text-3xl font-bold tracking-tight text-[#002147] sm:text-4xl">{title}</h1>
        <p className="mt-3 text-sm text-slate-600">Effective date: September 29, 2026</p>
        <article className="mt-10 space-y-8 leading-7 break-words [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-[#002147] [&_p+p]:mt-3 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6 [&_a]:text-[#005b96] [&_a]:underline [&_a]:underline-offset-4">
          {children}
        </article>
      </main>
      <footer className="border-t border-slate-200 px-5 py-7">
        <nav aria-label="Legal navigation" className="mx-auto flex max-w-3xl flex-wrap gap-x-6 gap-y-3 text-sm text-[#002147]">
          <Link href="/privacy" className="underline underline-offset-4">Privacy policy</Link>
          <Link href="/terms" className="underline underline-offset-4">Terms of service</Link>
          <a href="mailto:almaworkscu@gmail.com" className="break-all underline underline-offset-4">Contact Almaworks</a>
        </nav>
      </footer>
    </div>
  )
}
