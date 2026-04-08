'use client'

import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, FeatureGroup, Polygon, Marker, Popup, useMap, CircleMarker } from 'react-leaflet'
import { EditControl } from 'react-leaflet-draw'
import 'leaflet/dist/leaflet.css'
import 'leaflet-draw/dist/leaflet.draw.css'
import { supabase } from '../../lib/supabase'
import L from 'leaflet'

function makeIcon(sunny: boolean) {
  return L.divIcon({
    html: sunny
      ? `<div style="
          width: 40px; height: 40px; border-radius: 50%;
          background: #f97316; border: 3px solid white;
          box-shadow: 0 0 0 4px rgba(249,115,22,0.25), 0 2px 8px rgba(249,115,22,0.5);
          display: flex; align-items: center; justify-content: center;
          font-size: 20px; line-height: 1;
        ">☀️</div>`
      : `<div style="
          width: 36px; height: 36px; border-radius: 50%;
          background: #94a3b8; border: 3px solid white;
          box-shadow: 0 2px 6px rgba(0,0,0,0.15);
          display: flex; align-items: center; justify-content: center;
          font-size: 18px; line-height: 1;
        ">⛅</div>`,
    className: '',
    iconSize: sunny ? [40, 40] : [36, 36],
    iconAnchor: sunny ? [20, 20] : [18, 18],
  })
}

function LocateUser() {
  const map = useMap()
  const [pos, setPos] = useState<[number, number] | null>(null)

  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const latlng: [number, number] = [coords.latitude, coords.longitude]
        setPos(latlng)
        map.setView(latlng, 15)
      },
      () => {}
    )
  }, [map])

  if (!pos) return null
  return (
    <>
      <CircleMarker
        center={pos}
        radius={8}
        pathOptions={{ color: 'white', weight: 2, fillColor: '#3b82f6', fillOpacity: 1 }}
      />
      <CircleMarker
        center={pos}
        radius={20}
        pathOptions={{ color: '#3b82f6', weight: 1, fillColor: '#3b82f6', fillOpacity: 0.15 }}
      />
    </>
  )
}

function getCenter(coordinates: number[][]): [number, number] {
  const lat = coordinates.reduce((sum, c) => sum + c[0], 0) / coordinates.length
  const lng = coordinates.reduce((sum, c) => sum + c[1], 0) / coordinates.length
  return [lat, lng]
}

export default function DrawMap({ search = '' }: { search?: string }) {
  const [venues, setVenues] = useState<any[]>([])
  const [isOwner, setIsOwner] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setIsOwner(!!data.session)
    })
    async function loadVenues() {
      const { data, error } = await supabase.from('venues').select('*')
      if (error) {
        console.error('Error loading venues:', error)
        return
      }
      const venues = data || []

      // Check sun status for each venue in parallel
      const withSun = await Promise.all(
        venues.map(async venue => {
          if (!venue.outdoor_area) return venue
          try {
            const res = await fetch('/api/sunshine', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                lat: venue.lat,
                lng: venue.lng,
                outdoor_area: venue.outdoor_area,
              }),
            })
            const { is_sunny } = await res.json()
            return { ...venue, is_sunny }
          } catch {
            return venue
          }
        })
      )
      setVenues(withSun)
    }
    loadVenues()
  }, [])

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
      if (error) {
        console.error('Error saving venue:', error)
      } else {
        setVenues(prev => [...prev, data[0]])
      }
    }
  }

  const filtered = venues.filter(v =>
    v.name.toLowerCase().includes(search.toLowerCase()) && v.outdoor_area
  )

  return (
    <MapContainer
      center={[56.1629, 10.2039]}
      zoom={15}
      style={{ width: '100%', height: '100%' }}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
      />
      <LocateUser />

      {filtered.map(venue => {
        const sunny = !!venue.is_sunny
        const center = getCenter(venue.outdoor_area)
        return (
          <FeatureGroup key={venue.id}>
            {/* Polygon only visible to business owners */}
            {isOwner && (
              <Polygon
                positions={venue.outdoor_area}
                pathOptions={{
                  color: sunny ? '#f97316' : '#94a3b8',
                  weight: 2,
                  fillColor: sunny ? '#fbbf24' : '#cbd5e1',
                  fillOpacity: 0.35,
                }}
              />
            )}
            <Marker position={center} icon={makeIcon(sunny)}>
              <Popup>
                <div style={{ fontFamily: 'sans-serif', minWidth: '150px' }}>
                  <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '4px' }}>{venue.name}</div>
                  <div style={{ color: '#666', fontSize: '13px', marginBottom: '6px' }}>{venue.description}</div>
                  <div style={{
                    display: 'inline-block',
                    padding: '2px 10px',
                    borderRadius: '999px',
                    fontSize: '12px',
                    fontWeight: 600,
                    background: sunny ? '#fff7ed' : '#f1f5f9',
                    color: sunny ? '#f97316' : '#64748b',
                  }}>
                    {sunny ? '☀️ In the sun' : '⛅ In the shade'}
                  </div>
                </div>
              </Popup>
            </Marker>
          </FeatureGroup>
        )
      })}

      {/* Drawing tool only for business owners */}
      {isOwner && (
        <FeatureGroup>
          <EditControl
            position="topright"
            onCreated={handleCreated}
            draw={{
              rectangle: false,
              circle: false,
              circlemarker: false,
              marker: false,
              polyline: false,
              polygon: true,
            }}
          />
        </FeatureGroup>
      )}
    </MapContainer>
  )
}
