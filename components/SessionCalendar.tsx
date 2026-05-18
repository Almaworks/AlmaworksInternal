'use client'

export type CalSession = {
  id: string
  date: string // YYYY-MM-DD
  partnerName: string | null
  timeSlot: string | null
  format: string | null
  status: string
  topic: string | null
}

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAY_ABBR = ['Su','Mo','Tu','We','Th','Fr','Sa']

function buildMonthCells(year: number, month: number): (number | null)[] {
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = Array(firstDay).fill(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

function pad(n: number) { return String(n).padStart(2, '0') }

export default function SessionCalendar({ sessions }: { sessions: CalSession[] }) {
  if (sessions.length === 0) return null

  const byDate: Record<string, CalSession[]> = {}
  for (const s of sessions) {
    if (!s.date) continue
    if (!byDate[s.date]) byDate[s.date] = []
    byDate[s.date].push(s)
  }

  const sortedDates = Object.keys(byDate).sort()
  const first = new Date(sortedDates[0] + 'T00:00:00')
  const last = new Date(sortedDates[sortedDates.length - 1] + 'T00:00:00')

  const months: { year: number; month: number }[] = []
  let cur = new Date(first.getFullYear(), first.getMonth(), 1)
  const endMonth = new Date(last.getFullYear(), last.getMonth(), 1)
  while (cur <= endMonth) {
    months.push({ year: cur.getFullYear(), month: cur.getMonth() })
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1)
  }

  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {months.map(({ year, month }) => {
        const cells = buildMonthCells(year, month)
        return (
          <div key={`${year}-${month}`} className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-xs font-bold text-[#002147] mb-3">
              {MONTH_NAMES[month]} {year}
            </p>
            <div className="grid grid-cols-7 gap-px">
              {DAY_ABBR.map(d => (
                <div key={d} className="text-center text-[9px] font-semibold text-gray-300 pb-1">{d}</div>
              ))}
              {cells.map((day, i) => {
                if (!day) return <div key={i} className="h-7" />
                const dateStr = `${year}-${pad(month + 1)}-${pad(day)}`
                const daySessions = byDate[dateStr] ?? []
                const has = daySessions.length > 0
                const first = daySessions[0]
                const bg = has
                  ? first.format === 'in-person'
                    ? 'bg-green-100 ring-1 ring-green-300'
                    : first.format === 'online'
                    ? 'bg-blue-100 ring-1 ring-blue-300'
                    : 'bg-[#002147]/10 ring-1 ring-[#002147]/20'
                  : ''
                return (
                  <div
                    key={i}
                    className={`h-7 flex flex-col items-center justify-center rounded-md ${bg}`}
                    title={has ? daySessions.map(s => `${s.partnerName ?? '—'} ${s.timeSlot ?? ''}`).join('\n') : undefined}
                  >
                    <span className={`text-[11px] font-medium leading-none ${has ? 'text-[#002147] font-bold' : 'text-gray-400'}`}>
                      {day}
                    </span>
                    {has && (
                      <span className="text-[7px] leading-none text-[#002147]/60 mt-0.5 truncate max-w-[90%]">
                        {daySessions.length > 1 ? `×${daySessions.length}` : (first.partnerName?.split(' ')[0] ?? '·')}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
            {/* Legend for this month */}
            {Object.keys(byDate).some(d => d.startsWith(`${year}-${pad(month + 1)}`)) && (
              <div className="mt-3 space-y-1 border-t border-gray-50 pt-2">
                {Object.entries(byDate)
                  .filter(([d]) => d.startsWith(`${year}-${pad(month + 1)}`))
                  .sort(([a], [b]) => a.localeCompare(b))
                  .flatMap(([, ss]) => ss)
                  .map((s, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        s.format === 'in-person' ? 'bg-green-500' :
                        s.format === 'online' ? 'bg-blue-500' : 'bg-gray-400'
                      }`} />
                      <span className="text-[10px] text-gray-600 truncate">
                        {new Date(s.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        {s.partnerName ? ` · ${s.partnerName}` : ''}
                        {s.timeSlot ? ` · ${s.timeSlot}` : ''}
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
