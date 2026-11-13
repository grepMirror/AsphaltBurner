import L from 'leaflet'
import { useEffect, useRef } from 'react'
import { DEFAULT_ZONES, INTENSITY_COLOR, intensityOf, type ZoneEdges } from '../lib/intensity'
import type { Activity } from '../types'

export function ActivityMap({
  activities,
  selectedId,
  maxHr,
  split = DEFAULT_ZONES,
  onSelect,
}: {
  activities: Activity[]
  selectedId: string | null
  maxHr: number
  split?: ZoneEdges
  onSelect: (id: string) => void
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  useEffect(() => {
    const host = hostRef.current
    if (!host || mapRef.current) return
    host.replaceChildren()
    const map = L.map(host, { zoomControl: true, maxZoom: 16 })
    map.setView([45.9, 6.15], 10)
    const attribution = 'Tiles &copy; Esri'
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
      attribution,
      maxZoom: 16,
    }).addTo(map)
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 16,
    }).addTo(map)
    layerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map
    const timer = window.setTimeout(() => map.invalidateSize(), 150)
    return () => {
      window.clearTimeout(timer)
      map.remove()
      mapRef.current = null
      layerRef.current = null
    }
  }, [])

  const signature = `${maxHr}|${split.join(',')}|${selectedId ?? ''}|${activities.map((activity) => activity.id).join(',')}`

  useEffect(() => {
    const map = mapRef.current
    const layer = layerRef.current
    if (!map || !layer) return
    layer.clearLayers()
    const bounds = L.latLngBounds([])
    for (const activity of activities) {
      if (activity.track.length < 2) continue
      const selected = activity.id === selectedId
      const level = intensityOf(activity, maxHr, split)
      const line = L.polyline(activity.track, {
        color: selected ? '#f8fafc' : level ? INTENSITY_COLOR[level] : '#94a3b8',
        weight: selected ? 5 : 3,
        opacity: selected ? 1 : 0.82,
      })
      line.on('click', () => onSelectRef.current(activity.id))
      line.addTo(layer)
      bounds.extend(line.getBounds())
    }

    const fit = () => {
      const selected = activities.find((activity) => activity.id === selectedId)
      if (selected && selected.track.length >= 2) {
        map.fitBounds(L.latLngBounds(selected.track), { padding: [36, 36], maxZoom: 14 })
      } else if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [28, 28], maxZoom: 12 })
      }
    }
    map.invalidateSize()
    fit()
    window.requestAnimationFrame(fit)
  }, [signature, activities, selectedId, maxHr, split])

  const mapped = activities.filter((activity) => activity.track.length >= 2).length

  return (
    <div className="relative h-full min-h-[520px] overflow-hidden rounded-xl border border-white/10">
      <div ref={hostRef} className="absolute inset-0" />
      <p className="pointer-events-none absolute right-3 top-3 z-[400] rounded-md bg-black/70 px-2 py-1 text-xs text-white/80">
        {mapped === 1 ? '1 route on the map' : `${mapped} routes on the map`}
      </p>
    </div>
  )
}
