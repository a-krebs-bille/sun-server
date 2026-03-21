'use client'

import { useEffect } from 'react'
import { MapContainer, TileLayer, FeatureGroup, Polygon } from 'react-leaflet'
import { EditControl } from 'react-leaflet-draw'
import 'leaflet/dist/leaflet.css'
import 'leaflet-draw/dist/leaflet.draw.css'
import { supabase } from '../../lib/supabase'
import { useState } from 'react'

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

      const { data, error } = await supabase.from('venues').insert({
        name: 'New Venue',
        description: 'Outdoor seating area',
        lat: coordinates[0][0],
        lng: coordinates[0][1],
        outdoor_area: coordinates,
      }).select()

      if (error) {
        console.error('Error saving venue:', error)
      } else {
        setVenues(prev => [...prev, data[0]])
        alert('Outdoor area saved!')
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
      {venues.map(venue => (
        venue.outdoor_area && (
          <Polygon
            key={venue.id}
            positions={venue.outdoor_area}
            pathOptions={{ color: 'orange', fillColor: 'orange', fillOpacity: 0.4 }}
          />
        )
      ))}
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
