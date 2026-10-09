'use client'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/client'
export function AccountAccessNotice({ title, children }: { title: string; children: React.ReactNode }) {
  async function signOut() { await createClient().auth.signOut(); window.location.assign('/') }
  return <main className="flex min-h-screen items-center justify-center bg-[#002147] px-4 py-10">
    <section className="w-full max-w-md rounded-2xl bg-white p-8 text-gray-700 shadow-xl">
      <h1 className="text-xl font-semibold text-[#002147]">{title}</h1>
      <div className="mt-4 space-y-3 text-sm leading-6">{children}</div>
      <p className="mt-5 text-sm">Contact <a className="underline" href="mailto:almaworkscu@gmail.com">almaworkscu@gmail.com</a> for help.</p>
      <Link className="mt-5 block text-sm underline" href="/">Check access again</Link>
      <button type="button" onClick={() => void signOut()} className="mt-5 w-full rounded-xl border border-gray-300 px-4 py-3">Sign out</button>
    </section>
  </main>
}
