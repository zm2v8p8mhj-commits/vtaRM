import { CPC_META } from '../lib/constants'

export default function CpcBadge({ cpc, esteso = false }) {
  const meta = CPC_META[cpc]
  if (!meta) return <span className="text-slate-400">—</span>
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold"
      style={{ color: meta.color, backgroundColor: meta.bg }}
    >
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: meta.color }} />
      {esteso ? meta.label : cpc}
    </span>
  )
}
