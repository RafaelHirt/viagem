import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { geoCircle, geoDistance, geoGraticule10, geoMercator, geoPath } from 'd3-geo'
import { feature } from 'topojson-client'
import type { GeometryCollection, Topology } from 'topojson-specification'
import world from 'world-atlas/countries-110m.json'
import { LocateFixed, Maximize2, Minus, Move, Plus, RotateCcw } from 'lucide-react'
import type { GeoArea, TripPreview, TripStop } from '../shared/types'
import { formatLeg } from '../shared/trip-planner'
import { AIRPORTS, REGIONS, findAirport, isAirportInArea } from '../shared/airports'
import './area-map.css'

interface AreaMapProps {
  value?: GeoArea
  onChange: (area: GeoArea | undefined) => void
  region?: string
  focusAirport?: string
  otherAreas?: { area: GeoArea; index: number }[]
  onSelectArea?: (index: number) => void
  areaNumber?: number
  tripPreview?: TripPreview
  readOnly?: boolean
  heading?: string
  connectionStops?: TripStop[]
  connectionAnchor?: TripStop
}

const WIDTH = 900
const HEIGHT = 430
const EARTH_RADIUS_KM = 6371
const MIN_RADIUS = 100
const MAX_RADIUS = 5000
const REFERENCE_AIRPORTS = ['CDG', 'LHR', 'LIS', 'MAD', 'FCO', 'AMS', 'BRU', 'BER', 'VIE', 'ATH', 'WAW', 'OSL', 'ARN', 'HEL', 'IST', 'GRU', 'GIG', 'BSB', 'GYN', 'REC', 'SSA', 'MAO', 'EZE', 'SCL', 'LIM', 'BOG', 'MEX', 'JFK', 'LAX', 'YYZ', 'DXB', 'CAI', 'JNB', 'NRT', 'ICN', 'SIN', 'BKK', 'DEL', 'SYD', 'AKL']
const CITY_LABELS: Record<string, string> = { CDG: 'Paris', LHR: 'Londres', LIS: 'Lisboa', MAD: 'Madri', FCO: 'Roma', BRU: 'Bruxelas', BER: 'Berlim', VIE: 'Viena', ATH: 'Atenas', WAW: 'Varsóvia', ARN: 'Estocolmo', HEL: 'Helsinque', IST: 'Istambul', GRU: 'São Paulo', GIG: 'Rio de Janeiro', BSB: 'Brasília', GYN: 'Goiânia', EZE: 'Buenos Aires', MEX: 'Cidade do México', JFK: 'Nova York', CAI: 'Cairo', NRT: 'Tóquio', ICN: 'Seul', SIN: 'Singapura', DEL: 'Nova Délhi' }
const countries = feature(
  world as unknown as Topology,
  world.objects.countries as unknown as GeometryCollection,
).features
const graticule = geoGraticule10()

interface Camera { lat: number; lon: number; scale: number }
interface Gesture {
  mode: 'pan' | 'resize' | 'move' | 'select'
  pointerId: number
  area?: GeoArea
  startDistanceKm?: number
  areaIndex?: number
  startX: number
  startY: number
  camera: Camera
  moved: boolean
}

function regionCamera(region?: string, focusAirport?: string, area?: GeoArea): Camera {
  const airport = focusAirport ? findAirport(focusAirport) : undefined
  const selectedRegion = REGIONS.find((item) => item.id === region || item.label === region)
  const center = airport ?? area ?? selectedRegion?.center ?? { lat: 48, lon: 10 }
  // The catalog stores a zoom multiplier, while d3 expects pixels per radian.
  return { lat: center.lat, lon: center.lon, scale: selectedRegion ? selectedRegion.scale * 180 : 710 }
}

function projectionFor(camera: Camera) {
  return geoMercator()
    .rotate([-camera.lon, 0])
    .center([0, camera.lat])
    .translate([WIDTH / 2, HEIGHT / 2])
    .scale(camera.scale)
    .clipExtent([[0, 0], [WIDTH, HEIGHT]])
}

function cameraForAreas(areas: GeoArea[]): Camera {
  const radians = Math.PI / 180
  const x = areas.reduce((sum, area) => sum + Math.cos(area.lon * radians), 0)
  const y = areas.reduce((sum, area) => sum + Math.sin(area.lon * radians), 0)
  const center = { lon: Math.atan2(y, x) / radians, lat: areas.reduce((sum, area) => sum + area.lat, 0) / areas.length, scale: 1 }
  const path = geoPath(projectionFor(center))
  const bounds = areas.map(area => path.bounds(geoCircle().center([area.lon, area.lat]).radius(area.radiusKm / EARTH_RADIUS_KM / radians)()))
  const width = Math.max(...bounds.map(box => box[1][0])) - Math.min(...bounds.map(box => box[0][0]))
  const height = Math.max(...bounds.map(box => box[1][1])) - Math.min(...bounds.map(box => box[0][1]))
  return { ...center, scale: Math.max(125, Math.min(4500, (WIDTH - 160) / Math.max(width, .01), (HEIGHT - 110) / Math.max(height, .01))) }
}

function areaBoundary(area: GeoArea, bearing: number): [number, number] {
  const lat = area.lat * Math.PI / 180
  const distance = area.radiusKm / EARTH_RADIUS_KM
  const angle = bearing * Math.PI / 180
  const edgeLat = Math.asin(Math.sin(lat) * Math.cos(distance) + Math.cos(lat) * Math.sin(distance) * Math.cos(angle))
  const edgeLon = area.lon * Math.PI / 180 + Math.atan2(
    Math.sin(angle) * Math.sin(distance) * Math.cos(lat),
    Math.cos(distance) - Math.sin(lat) * Math.sin(edgeLat),
  )
  return [edgeLon * 180 / Math.PI, edgeLat * 180 / Math.PI]
}

function clampRadius(radius: number) {
  return Math.min(MAX_RADIUS, Math.max(MIN_RADIUS, Math.round(radius / 25) * 25))
}

export default function AreaMap({ value, onChange, region, focusAirport, otherAreas = [], onSelectArea, areaNumber, tripPreview, readOnly = false, heading, connectionStops, connectionAnchor }: AreaMapProps) {
  const [camera, setCamera] = useState<Camera>(() => regionCamera(region, focusAirport, value))
  const [dragging, setDragging] = useState(false)
  const [unitsPerPixel, setUnitsPerPixel] = useState(1)
  const svgRef = useRef<SVGSVGElement>(null)
  const gesture = useRef<Gesture | null>(null)
  const previousLocation = useRef({ region, focusAirport })
  const allAreas = [...(value ? [value] : []), ...otherAreas.map(item => item.area)]
  const previousAreaCount = useRef(0)
  const labelId = useId()
  const helpId = useId()
  const sliderId = useId()
  const clipId = useId().replace(/:/g, '')

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const update = () => setUnitsPerPixel(1 / (svg.getScreenCTM()?.a || 1))
    update()
    const observer = new ResizeObserver(update)
    observer.observe(svg)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (previousLocation.current.region === region && previousLocation.current.focusAirport === focusAirport) return
    previousLocation.current = { region, focusAirport }
    setCamera(regionCamera(region, focusAirport))
  }, [region, focusAirport])

  useEffect(() => {
    if (areaNumber && allAreas.length !== previousAreaCount.current && allAreas.length > 1) setCamera(cameraForAreas(allAreas))
    previousAreaCount.current = allAreas.length
  }, [allAreas.length, areaNumber])

  const projection = useMemo(() => projectionFor(camera), [camera])
  const path = useMemo(() => geoPath(projection), [projection])
  const areaPath = value
    ? path(geoCircle().center([value.lon, value.lat]).radius(value.radiusKm / EARTH_RADIUS_KM * 180 / Math.PI)())
    : null
  const areaCenter = value ? projection([value.lon, value.lat]) : null
  const resizeHandles = value ? [0, 90, 180, 270].flatMap(bearing => {
    const point = projection(areaBoundary(value, bearing))
    return point ? [{ point, bearing }] : []
  }) : []

  const includedAirports = useMemo(
    () => value ? AIRPORTS.filter((airport) => isAirportInArea(airport, value)) : [],
    [value],
  )
  const nearbyCities = useMemo(() => {
    if (!value) return []
    const sorted = [...includedAirports].sort((a, b) =>
      geoDistance([value.lon, value.lat], [a.lon, a.lat]) - geoDistance([value.lon, value.lat], [b.lon, b.lat]),
    )
    return [...new Set(sorted.map((airport) => CITY_LABELS[airport.code] || airport.city.split(' (')[0]))].slice(0, 3)
  }, [includedAirports, value])

  const markers = useMemo(() => {
    const points = AIRPORTS.flatMap((airport) => {
      const point = projection([airport.lon, airport.lat])
      if (!point || point[0] < 10 || point[0] > WIDTH - 10 || point[1] < 10 || point[1] > HEIGHT - 10) return []
      return [{ airport, point, inside: connectionStops ? connectionStops.some(city => city.airportCode === airport.code) || connectionAnchor?.airportCode === airport.code : (!!value && isAirportInArea(airport, value)) || otherAreas.some(item => isAirportInArea(airport, item.area)) }]
    })
    // Keep the map legible when the world is in view. The area count still uses the complete catalog.
    const occupied = new Set<string>()
    return points.filter(({ point }) => {
      const cell = `${Math.round(point[0] / 21)}:${Math.round(point[1] / 21)}`
      if (occupied.has(cell)) return false
      occupied.add(cell)
      return true
    }).slice(0, 150)
  }, [projection, value, otherAreas, connectionStops, connectionAnchor])

  const cityLabels = useMemo(() => {
    const airports = [...REFERENCE_AIRPORTS.flatMap(code => findAirport(code) ?? []), ...includedAirports]
    const labels: { code: string; city: string; point: [number, number] }[] = []
    const cities = new Set<string>()
    for (const airport of airports) {
      const point = projection([airport.lon, airport.lat])
      if (!point || point[0] < 15 || point[0] > WIDTH - 90 || point[1] < 22 || point[1] > HEIGHT - 15 || cities.has(airport.city)) continue
      if (labels.some(label => Math.abs(label.point[0] - point[0]) < 110 && Math.abs(label.point[1] - point[1]) < 27)) continue
      cities.add(airport.city)
      labels.push({ code: airport.code, city: CITY_LABELS[airport.code] || (airport.city.length > 22 ? `${airport.city.slice(0, 20)}…` : airport.city), point })
      if (labels.length === 16) break
    }
    return labels
  }, [projection, includedAirports])

  function localPoint(event: ReactPointerEvent<SVGSVGElement>): [number, number] | null {
    const svg = svgRef.current
    const matrix = svg?.getScreenCTM()
    if (!svg || !matrix) return null
    const point = svg.createSVGPoint()
    point.x = event.clientX
    point.y = event.clientY
    const transformed = point.matrixTransform(matrix.inverse())
    return [transformed.x, transformed.y]
  }

  function selectPoint(point: [number, number]) {
    const coords = projection.invert?.(point)
    if (!coords || !Number.isFinite(coords[0]) || !Number.isFinite(coords[1])) return
    onChange({
      lat: Math.max(-80, Math.min(80, coords[1])),
      lon: ((coords[0] + 540) % 360) - 180,
      radiusKm: value?.radiusKm ?? 500,
    })
  }

  function onPointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (event.button !== 0 || gesture.current) return
    const point = localPoint(event)
    if (!point) return
    event.preventDefault()
    const target = event.target as Element
    const areaTarget = readOnly ? null : target.closest('[data-other-area]')
    const coords = projection.invert?.(point)
    const inside = !readOnly && value && coords && geoDistance([value.lon, value.lat], coords) * EARTH_RADIUS_KM < value.radiusKm
    gesture.current = {
      mode: !readOnly && target.closest('[data-area-resize]') ? 'resize' : areaTarget ? 'select' : inside ? 'move' : 'pan',
      pointerId: event.pointerId,
      area: value ? { ...value } : undefined,
      startDistanceKm: value && coords ? geoDistance([value.lon, value.lat], coords) * EARTH_RADIUS_KM : undefined,
      areaIndex: areaTarget ? Number(areaTarget.getAttribute('data-other-area')) : undefined,
      startX: point[0], startY: point[1], camera, moved: false,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function onPointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const current = gesture.current
    const point = localPoint(event)
    if (!current || current.pointerId !== event.pointerId || !point) return
    if (current.mode === 'select') return
    const dx = point[0] - current.startX
    const dy = point[1] - current.startY
    if (Math.hypot(dx, dy) > 5 * unitsPerPixel) current.moved = true
    if (!current.moved && current.mode !== 'resize') return
    setDragging(true)
    if (current.mode === 'resize' && current.area) {
      const coords = projection.invert?.(point)
      if (coords) onChange({ ...current.area, radiusKm: clampRadius(current.area.radiusKm + geoDistance([current.area.lon, current.area.lat], coords) * EARTH_RADIUS_KM - (current.startDistanceKm ?? current.area.radiusKm)) })
      return
    }
    const originalProjection = projectionFor(current.camera)
    if (current.mode === 'move' && current.area) {
      const center = originalProjection([current.area.lon, current.area.lat])
      const coords = center && originalProjection.invert?.([center[0] + dx, center[1] + dy])
      if (coords) onChange({ ...current.area, lat: Math.max(-80, Math.min(80, coords[1])), lon: ((coords[0] + 540) % 360) - 180 })
      return
    }
    const coords = originalProjection.invert?.([WIDTH / 2 - dx, HEIGHT / 2 - dy])
    if (coords) setCamera({ ...current.camera, lon: ((coords[0] + 540) % 360) - 180, lat: Math.max(-76, Math.min(76, coords[1])) })
  }

  function onPointerUp(event: ReactPointerEvent<SVGSVGElement>) {
    const current = gesture.current
    if (!current || current.pointerId !== event.pointerId) return
    const point = localPoint(event)
    if (!readOnly && current && !current.moved && current.mode === 'pan' && point) selectPoint(point)
    if (current?.mode === 'select' && current.areaIndex !== undefined) onSelectArea?.(current.areaIndex)
    gesture.current = null
    setDragging(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  function zoom(factor: number) {
    setCamera((current) => ({ ...current, scale: Math.max(125, Math.min(4500, current.scale * factor)) }))
  }

  return (
    <section className="area-map" aria-labelledby={labelId}>
      <div className="area-map-heading">
        <div>
          <h4 id={labelId}>{heading || (readOnly ? 'Destino desta busca' : areaNumber ? `Área ${areaNumber} do roteiro` : 'Marque sua área de viagem')}</h4>
          <p id={helpId}>{readOnly ? value || otherAreas.length ? 'Áreas salvas para esta viagem.' : region || 'Destino selecionado' : value ? 'Arraste a bolha para mover. Puxe a borda para aumentar ou diminuir.' : 'Toque no mapa para criar sua área.'}</p>
        </div>
        {!readOnly && !areaNumber && <button type="button" className={`area-map-region-button ${!value ? 'is-active' : ''}`} onClick={() => onChange(undefined)}>
          {!value ? 'Toda a região' : 'Usar toda a região'}
        </button>}
      </div>

      <div className="area-map-canvas">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className={dragging ? 'is-dragging' : ''}
          role="img"
          aria-label="Mapa para selecionar a área de chegada e retorno"
          aria-describedby={helpId}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={event => { if (gesture.current?.pointerId === event.pointerId) { gesture.current = null; setDragging(false) } }}
        >
          <defs><clipPath id={clipId}><rect width={WIDTH} height={HEIGHT} /></clipPath></defs>
          <g clipPath={`url(#${clipId})`}>
            <rect width={WIDTH} height={HEIGHT} className="area-map-water" />
            <path d={path(graticule) ?? undefined} className="area-map-grid" />
            {countries.map((country, index) => <path key={country.id ?? index} d={path(country) ?? undefined} className="area-map-country" />)}
            {otherAreas.map(({ area, index }) => <g key={index} data-other-area={index} className="area-map-other-area">
              <path d={path(geoCircle().center([area.lon, area.lat]).radius(area.radiusKm / EARTH_RADIUS_KM * 180 / Math.PI)()) ?? undefined} />
            </g>)}
            {areaPath && <path d={areaPath} className={`area-map-selection ${readOnly ? 'is-read-only' : ''}`} />}
            {connectionAnchor && connectionStops?.map(city => <path key={`connection-${city.airportCode}`} className="area-map-connection" d={path({type:'LineString',coordinates:[[connectionAnchor.lon,connectionAnchor.lat],[city.lon,city.lat]]}) || undefined}><title>{connectionAnchor.city} ↔ {city.city} · conexão de referência</title></path>)}
            {tripPreview?.status === 'ready' && tripPreview.stops.slice(1).map((destination, index) => {
              const origin = tripPreview.stops[index]
              return <g key={`route-${index}`} className="area-map-route"><path d={path({ type: 'LineString', coordinates: [[origin.lon, origin.lat], [destination.lon, destination.lat]] }) ?? undefined} /></g>
            })}
            {markers.map(({ airport, point, inside }) => (
              <g key={airport.code} className={`area-map-airport ${inside ? 'is-inside' : ''}`}>
                <circle cx={point[0]} cy={point[1]} r={inside ? 4 : 2.7} />
                <title>{airport.city} · {airport.name} ({airport.code})</title>
              </g>
            ))}
            {cityLabels.map(({ code, city, point }) => (
              <text key={`label-${code}`} x={point[0] + 9} y={point[1] - 9} className="area-map-city-label">{city}</text>
            ))}
            {tripPreview?.status === 'ready' && tripPreview.stops.map((city,index) => {const point=projection([city.lon,city.lat]);return point && <g key={`stop-${index}`} className="area-map-route-stop"><circle cx={point[0]} cy={point[1]} r={10*unitsPerPixel}/><text x={point[0]} y={point[1]+4*unitsPerPixel} style={{fontSize:12*unitsPerPixel}}>{index+1}</text><title>{index+1}. {city.city}</title></g>})}
            {otherAreas.map(({ area, index }) => { const center = projection([area.lon, area.lat]); return center && <g key={`badge-${index}`} data-other-area={index} className="area-map-area-badge"><circle cx={center[0]} cy={center[1]} r={12} /><text x={center[0]} y={center[1] + 4}>{index + 1}</text></g> })}
            {areaCenter && <g className="area-map-center">
              <circle cx={areaCenter[0]} cy={areaCenter[1]} r={8} />
              <circle cx={areaCenter[0]} cy={areaCenter[1]} r={2.5} />
              {areaNumber && <text x={areaCenter[0]} y={areaCenter[1] - 15}>{areaNumber}</text>}
            </g>}
            {!readOnly && areaPath && <path d={areaPath} className="area-map-resize-border" data-area-resize="true" vectorEffect="non-scaling-stroke" />}
            {!readOnly && resizeHandles.map(({ point: [x, y], bearing }) => <g key={bearing} className={`area-map-resize ${bearing % 180 ? 'horizontal' : 'vertical'}`} data-area-resize="true">
              <title>Arraste para ajustar o tamanho da área</title>
              <circle cx={x} cy={y} r={24 * unitsPerPixel} className="area-map-resize-target" />
              <circle cx={x} cy={y} r={11 * unitsPerPixel} vectorEffect="non-scaling-stroke" />
              <path transform={`translate(${x},${y}) scale(${unitsPerPixel}) rotate(${bearing % 180 ? 0 : 90})`} d="M-4,0h8 m-6,-3 -3,3 3,3 m4,-6 3,3 -3,3" vectorEffect="non-scaling-stroke" />
            </g>)}
            {!readOnly && areaCenter && <circle cx={areaCenter[0]} cy={areaCenter[1]} r={14 * unitsPerPixel} className="area-map-move-target" />}
          </g>
        </svg>
        <div className="area-map-controls" aria-label="Controles do mapa">
          <button type="button" onClick={() => zoom(1.4)} aria-label="Aproximar mapa" title="Aproximar"><Plus size={17} /></button>
          <button type="button" onClick={() => zoom(1 / 1.4)} aria-label="Afastar mapa" title="Afastar"><Minus size={17} /></button>
          <button type="button" onClick={() => setCamera(regionCamera(region, focusAirport, value))} aria-label="Recentrar mapa" title="Recentrar"><RotateCcw size={15} /></button>
          {areaNumber && allAreas.length > 0 && <button type="button" onClick={() => setCamera(cameraForAreas(allAreas))} aria-label="Enquadrar áreas do roteiro" title="Enquadrar roteiro"><Maximize2 size={15} /></button>}
        </div>
        <div className="area-map-pan-hint"><Move size={12} />{value && !readOnly ? 'Arraste fora da bolha para mover o mapa' : 'Arraste para mover o mapa'}</div>
        <a className="area-map-attribution" href="https://www.naturalearthdata.com/about/terms-of-use/" target="_blank" rel="noreferrer">Mapa: Natural Earth</a>
      </div>

      {!readOnly && (value ? <div className="area-map-details">
        <div className="area-map-slider-heading">
          <label htmlFor={sliderId}>Tamanho da área</label>
          <span>Raio aproximado de {Math.round(value.radiusKm).toLocaleString('pt-BR')} km</span>
        </div>
        <input
          id={sliderId}
          className="area-map-slider"
          type="range"
          min={MIN_RADIUS}
          max={MAX_RADIUS}
          step={25}
          value={value.radiusKm}
          aria-valuetext={`Raio de ${Math.round(value.radiusKm)} quilômetros`}
          onChange={(event) => onChange({ ...value, radiusKm: Number(event.target.value) })}
        />
        <div className="area-map-slider-ends"><span>Menor área</span><span>Maior área</span></div>
        {nearbyCities.length > 0 && <p className="area-map-nearby" aria-live="polite">Próximo de {nearbyCities.join(', ')}.</p>}
        <details className="area-map-catalog"><summary>Sobre esta área</summary><p>{includedAirports.length} {includedAirports.length === 1 ? 'aeroporto no catálogo' : 'aeroportos no catálogo'}. A presença no mapa não garante passagens disponíveis.</p></details>
      </div> : <div className="area-map-empty">
        <LocateFixed size={17} />
        <p><strong>{areaNumber ? `Posicione a área ${areaNumber}` : 'Toda a região selecionada'}</strong></p>
        <button type="button" className="area-map-create-button" onClick={() => onChange({ lat: camera.lat, lon: camera.lon, radiusKm: 500 })}>Marcar área</button>
      </div>)}
    </section>
  )
}
