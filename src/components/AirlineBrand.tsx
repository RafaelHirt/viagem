import { useState } from 'react'
import { Plane } from 'lucide-react'
import type { Offer } from '../shared/types'

export default function AirlineBrand({ offer }: { offer: Offer }) {
  const [failed, setFailed] = useState(false)
  if (!offer.airline) return null
  let logo: string | undefined
  try { const url = new URL(offer.airlineLogo || ''); if (url.protocol === 'https:' && url.hostname === 'www.gstatic.com') logo = url.toString() } catch { /* Text remains available. */ }
  return <div className="airline-brand">{logo && !failed ? <img src={logo} alt="" width={30} height={30} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : <Plane size={20} aria-hidden="true" />}<span>{offer.airline}</span></div>
}
