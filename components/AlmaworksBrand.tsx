import Image from 'next/image'

type AlmaworksBrandProps = {
  compact?: boolean
  tone?: 'black' | 'white'
  iconSize?: number
  priority?: boolean
  className?: string
}

export function AlmaworksBrand({
  compact = false,
  tone = 'black',
  iconSize = 32,
  priority = false,
  className = '',
}: AlmaworksBrandProps) {
  const iconSrc = tone === 'white'
    ? '/images/almaworks-laurel-white.png'
    : '/images/almaworks-laurel-black.png'

  return (
    <span
      className={`inline-flex items-center ${compact ? '' : 'gap-2.5'} ${tone === 'white' ? 'text-white' : 'text-black'} ${className}`}
      aria-label={compact ? 'Almaworks' : undefined}
    >
      <Image
        src={iconSrc}
        alt={compact ? 'Almaworks' : ''}
        width={iconSize}
        height={iconSize}
        priority={priority}
        className="shrink-0 object-contain"
      />
      {!compact && <strong className="text-[1.05rem] font-semibold tracking-[-0.025em]">Almaworks</strong>}
    </span>
  )
}
