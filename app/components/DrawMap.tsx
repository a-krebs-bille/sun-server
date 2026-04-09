'use client'

import { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, FeatureGroup, Polygon, Marker, Popup, useMap, CircleMarker } from 'react-leaflet'
import { EditControl } from 'react-leaflet-draw'
import 'leaflet/dist/leaflet.css'
import 'leaflet-draw/dist/leaflet.draw.css'
import { supabase } from '../../lib/supabase'
import L from 'leaflet'

function makeIcon(status: 'sunny' | 'partial' | 'shaded') {
  if (status === 'sunny') return L.divIcon({
    html: `<div style="width:40px;height:40px;border-radius:50%;background:#f97316;border:3px solid white;box-shadow:0 0 0 4px rgba(249,115,22,0.25),0 2px 8px rgba(249,115,22,0.5);display:flex;align-items:center;justify-content:center;font-size:20px;line-height:1;">☀️</div>`,
    className: '', iconSize: [40, 40], iconAnchor: [20, 20],
  })
  if (status === 'partial') return L.divIcon({
    html: `<div style="width:38px;height:38px;border-radius:50%;background:#fbbf24;border:3px solid white;box-shadow:0 0 0 4px rgba(251,191,36,0.25),0 2px 8px rgba(251,191,36,0.4);display:flex;align-items:center;justify-content:center;font-size:19px;line-height:1;">🌤️</div>`,
    className: '', iconSize: [38, 38], iconAnchor: [19, 19],
  })
  return L.divIcon({
    html: `<div style="width:36px;height:36px;border-radius:50%;background:#94a3b8;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.15);display:flex;align-items:center;justify-content:center;font-size:18px;line-height:1;">⛅</div>`,
    className: '', iconSize: [36, 36], iconAnchor: [18, 18],
  })
}

function LocateUser({ onLocated }: { onLocated: (pos: [number, number]) => void }) {
  const map = useMap()
  const [pos, setPos] = useState<[number, number] | null>(null)
  const called = useRef(false)

  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const latlng: [number, number] = [coords.latitude, coords.longitude]
        setPos(latlng)
        map.setView(latlng, 15)
        if (!called.current) { onLocated(latlng); called.current = true }
      },
      () => {}
    )
  }, [map]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!pos) return null
  return (
    <>
      <CircleMarker center={pos} radius={8} pathOptions={{ color: 'white', weight: 2, fillColor: '#3b82f6', fillOpacity: 1 }} />
      <CircleMarker center={pos} radius={20} pathOptions={{ color: '#3b82f6', weight: 1, fillColor: '#3b82f6', fillOpacity: 0.15 }} />
    </>
  )
}

function getCenter(coordinates: number[][]): [number, number] {
  const lat = coordinates.reduce((sum, c) => sum + c[0], 0) / coordinates.length
  const lng = coordinates.reduce((sum, c) => sum + c[1], 0) / coordinates.length
  return [lat, lng]
}

interface DrawMapProps {
  venues: any[]
  isOwner: boolean
  search: string
  sunnyOnly: boolean
  onVenueCreated: (venue: any) => void
  onUserLocated: (pos: [number, number]) => void
}

export default function DrawMap({ venues, isOwner, search, sunnyOnly, onVenueCreated, onUserLocated }: DrawMapProps) {
  async function handleCreated(e: any) {
    const { layerType, layer } = e
    if (layerType === 'polygon') {
      const coordinates = layer.getLatLngs()[0].map((latlng: any) => [latlng.lat, latlng.lng])
      const name = prompt('Enter venue name:') || 'New Venue'
      const description = prompt('Enter a short description:') || 'Outdoor seating area'
      const { data, error } = await supabase.from('venues').insert({
        name, description,
        lat: coordinates[0][0],
        lng: coordinates[0][1],
        outdoor_area: coordinates,
      }).select()
      if (!error && data) onVenueCreated(data[0])
    }
  }

  const filtered = venues.filter(v =>
    v.outdoor_area &&
    v.name.toLowerCase().includes(search.toLowerCase()) &&
    (!sunnyOnly || v.is_sunny)
  )

  return (
    <MapContainer center={[56.1629, 10.2039]} zoom={15} style={{ width: '100%', height: '100%' }}>
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
      />
      <LocateUser onLocated={onUserLocated} />

      {filtered.map(venue => {
        const status: 'sunny' | 'partial' | 'shaded' = venue.sun_status ?? (venue.is_sunny ? 'sunny' : 'shaded')
        const centre = getCenter(venue.outdoor_area)
        const statusLabel = status === 'sunny' ? '☀️ In the sun' : status === 'partial' ? '🌤️ Partially sunny' : '⛅ In the shade'
        const statusColor = status === 'sunny' ? '#f97316' : status === 'partial' ? '#d97706' : '#64748b'
        const statusBg = status === 'sunny' ? '#fff7ed' : status === 'partial' ? '#fffbeb' : '#f1f5f9'
        const polygonColor = status === 'sunny' ? '#f97316' : status === 'partial' ? '#fbbf24' : '#94a3b8'
        const fillColor = status === 'sunny' ? '#fbbf24' : status === 'partial' ? '#fde68a' : '#cbd5e1'
        return (
          <FeatureGroup key={venue.id}>
            {isOwner && (
              <Polygon
                positions={venue.outdoor_area}
                pathOptions={{ color: polygonColor, weight: 2, fillColor, fillOpacity: 0.35 }}
              />
            )}
            <Marker position={centre} icon={makeIcon(status)}>
              <Popup>
                <div style={{ fontFamily: 'Helvetica, Arial, sans-serif', minWidth: '150px' }}>
                  <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '4px' }}>{venue.name}</div>
                  <div style={{ color: '#666', fontSize: '13px', marginBottom: '8px' }}>{venue.description}</div>
                  <div style={{ display: 'inline-block', padding: '2px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 600, background: statusBg, color: statusColor, marginBottom: '10px' }}>
                    {statusLabel}
                  </div>
                  <br />
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${centre[0]},${centre[1]}`}
                    target="_blank" rel="noopener noreferrer"
                    style={{ background: '#f97316', color: 'white', padding: '6px 14px', borderRadius: '8px', textDecoration: 'none', fontSize: '13px', fontWeight: 600 }}
                  >
                    Get directions
                  </a>
                </div>
              </Popup>
            </Marker>
          </FeatureGroup>
        )
      })}

      {isOwner && (
        <FeatureGroup>
          <EditControl
            position="topright"
            onCreated={handleCreated}
            draw={{ rectangle: false, circle: false, circlemarker: false, marker: false, polyline: false, polygon: true }}
          />
        </FeatureGroup>
      )}
    </MapContainer>
  )
}
