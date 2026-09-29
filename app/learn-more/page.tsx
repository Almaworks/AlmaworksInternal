import Link from 'next/link'
import { AlmaworksBrand } from '@/components/AlmaworksBrand'

export default function LearnMorePage() {
  return (
    <div className="min-h-screen bg-white text-[#002147]">
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-5 border-b border-[#002147]/10">
        <Link href="/">
          <AlmaworksBrand iconSize={32} priority />
        </Link>
        <Link
          href="/"
          className="text-sm font-medium px-5 py-2.5 bg-[#002147] text-white rounded-full hover:bg-[#002147]/90 transition-colors"
        >
          Sign in
        </Link>
      </nav>

      {/* Hero */}
      <section className="pt-20 pb-16 px-8 max-w-4xl mx-auto">
        <p className="text-[#75AADB] text-sm font-semibold tracking-widest uppercase mb-4">
          Columbia University · New York City
        </p>
        <h1 className="text-5xl md:text-6xl font-semibold leading-tight tracking-tight mb-6">
          Almaworks
          <br />
          Accelerator
        </h1>
        <p className="text-xl text-[#002147]/60 max-w-2xl leading-relaxed">
          Columbia University&apos;s startup accelerator and fellowship for NYC student
          entrepreneurs. No equity. No fees. No IP claims.
        </p>
      </section>

      {/* Stats */}
      <section className="border-y border-[#002147]/10 py-10 px-8">
        <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8">
          {[
            { value: '100+', label: 'Graduated Companies' },
            { value: '$150M+', label: 'Raised by Alumni' },
            { value: '50+', label: 'Expert Mentors' },
            { value: '$250K', label: 'Annual Prize Pool' },
          ].map(({ value, label }) => (
            <div key={label}>
              <p className="text-3xl md:text-4xl font-semibold text-[#75AADB] mb-1">{value}</p>
              <p className="text-sm text-[#002147]/50 font-medium">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* About */}
      <section className="py-16 px-8 max-w-4xl mx-auto">
        <h2 className="text-2xl font-semibold mb-4">About the Program</h2>
        <p className="text-[#002147]/70 leading-relaxed mb-4">
          Almaworks accepts no equity and assists early-stage startups founded by
          Columbia-affiliated students in achieving growth. Over 100 graduated companies
          have raised $150M+ collectively and gained admission to programs including
          TechStars, Y Combinator, and Entrepreneurs Roundtable Accelerator.
        </p>
        <p className="text-[#002147]/70 leading-relaxed">
          Each cohort includes 5+ startups selected through a highly competitive process.
          Participants receive mentorship from 50+ NYC startup ecosystem experts, access to
          Columbia Startup Lab resources, investor introductions, and more — all at no cost.
        </p>
      </section>

      {/* Perks */}
      <section className="py-12 px-8 bg-[#002147]">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-semibold text-white mb-8">What participants receive</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {[
              'Mentorship from NYC startup ecosystem experts (growth, product, funding, legal, finance, wellness)',
              'Investor access and introductions',
              'Columbia Startup Lab resources and campus space',
              'Student product testers from the Columbia community',
              'Resume circulation to help build your founding team',
              'Media reach of 13,000+ subscribers and followers',
            ].map((perk) => (
              <div key={perk} className="flex gap-3 p-4 rounded-xl bg-white/[0.05] border border-white/10">
                <div className="w-1.5 h-1.5 rounded-full bg-[#75AADB] mt-2 shrink-0" />
                <p className="text-white/70 text-sm leading-relaxed">{perk}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonial */}
      <section className="py-16 px-8 max-w-4xl mx-auto">
        <blockquote className="text-xl md:text-2xl font-semibold leading-snug text-[#002147] mb-6">
          &ldquo;The Almaworks experience was super helpful and unique for us at visit.org.
          We expanded our NYC network of mentors, investors, and fellow entrepreneurs.
          The team created a supportive, family-like environment.&rdquo;
        </blockquote>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-[#75AADB]/20 flex items-center justify-center text-[#002147] font-bold text-sm">
            MA
          </div>
          <div>
            <p className="font-semibold text-[#002147] text-sm">Michal Alter</p>
            <p className="text-xs text-[#002147]/50">CEO of visit.org · Inc. 5000 Honoree</p>
          </div>
        </div>
      </section>

      {/* CVC */}
      <section className="py-10 px-8 bg-[#75AADB]/10 border-y border-[#75AADB]/20">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-[#002147] mb-1">Columbia Venture Competition</h3>
            <p className="text-sm text-[#002147]/60">$250,000 prize pool · Top NYC investor attendance</p>
          </div>
          <a
            href="mailto:almaworkscu@gmail.com"
            className="shrink-0 px-6 py-2.5 bg-[#002147] text-white text-sm font-semibold rounded-full hover:bg-[#002147]/90 transition-colors"
          >
            Get in touch
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 px-8 border-t border-[#002147]/10">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-[#002147]/40">© 2026 Almaworks · Columbia University</p>
          <div className="flex flex-wrap justify-center gap-6 text-sm text-[#002147]/70">
            <Link href="/privacy" className="underline underline-offset-4">Privacy policy</Link>
            <Link href="/terms" className="underline underline-offset-4">Terms of service</Link>
            <a href="mailto:almaworkscu@gmail.com" className="hover:text-[#002147] transition-colors">almaworkscu@gmail.com</a>
            <a href="https://coreatcu.com" target="_blank" rel="noopener noreferrer" className="hover:text-[#002147] transition-colors">CORE</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
