import type { FlightQuery } from '../shared/types'
import { previewTrip } from '../shared/trip-planner'
import AreaMap from './AreaMap'

export default function SavedSearchMap({ query }: { query: FlightQuery }) {
  const areas = query.tripPlan?.areas ?? (query.area ? [query.area] : [])
  return <AreaMap readOnly value={areas[0]} onChange={() => {}} otherAreas={areas.slice(1).map((area, index) => ({ area, index: index + 1 }))}
    areaNumber={query.tripPlan ? 1 : undefined} tripPreview={query.tripPlan ? previewTrip(query.tripPlan) : undefined}
    region={query.tripPlan || query.area ? undefined : query.destination} focusAirport={query.arrivalAirport} />
}
