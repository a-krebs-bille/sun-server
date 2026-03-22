'use client'

import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, FeatureGroup, Polygon, Marker, Popup } from 'react-leaflet'
import { EditControl } from 'react-leaflet-draw'
import 'leaflet/dist/leaflet.css'
import 'leaflet-draw/dist/leaflet.draw.css'
import { supabase } from '../../lib/supabase'
import L from 'leaflet'

const icon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
})

function getCenter(coordinates: number[][]): [number, number] {
  const lat = coordinates.reduce((sum, c) => sum + c[0], 0) / coordinates.length
  const lng = coordinates.reduce((sum, c) => sum + c[1], 0) / coordinates.length
  return [lat, lng]
}

export default function DrawMap() {
  const [venues, setVenues] = useState<any[]>([])

  useEffect(() => {
    async function loadVenues() {
      const { data, error } = await supabase.from('venues').select('*')
      if (error) {
        console.error('Error loading venues:', error)
      } else {
        setVenues(data || [])
      }
    }
    loadVenues()
  }, [])

  async function handleCreated(e: any) {
    const { layerType, layer } = e
    if (layerType === 'polygon') {
      const coordinates = layer.getLatLngs()[0].map((latlng: any) => [
        latlng.lat,
        latlng.lng,
      ])
      const name = prompt('Enter venue name:') || 'New Venue'
      const description = prompt('Enter a short description:') || 'Outdoor seating area'
      const { data, error } = await supabase.from('venues').insert({
        name,
        description,
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

  return (
    <MapContainer
      center={[56.1629, 10.2039]}
      zoom={15}
      style={{ width: '100%', height: '100%' }}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="© OpenStreetMap contributors"
      />
      {venues.map(venue =>
        venue.outdoor_area ? (
          <FeatureGroup key={venue.id}>
            <Polygon
              positions={venue.outdoor_area}
              pathOptions={{ color: 'orange', fillColor: 'orange', fillOpacity: 0.4 }}
            />
            <Marker position={getCenter(venue.outdoor_area)} icon={icon}>
              <Popup>
                <strong>{venue.name}</strong>
                <p>{venue.description}</p>
              </Popup>
            </Marker>
          </FeatureGroup>
        ) : null
      )}
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
    </MapContainer>
  )
}
