'use client'

import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'

const icon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
})

const venues = [
  {
    id: 1,
    name: 'Cafe Solen',
    description: 'Sunny terrace facing south',
    position: [56.1629, 10.2039] as [number, number],
  }
]

export default function Map() {
  return (
    <MapContainer
      center={[56.1629, 10.2039]}
      zoom={13}
      style={{ width: '100%', height: '100%' }}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="© OpenStreetMap contributors"
      />
      {venues.map(venue => (
        <Marker key={venue.id} position={venue.position} icon={icon}>
          <Popup>
            <strong>{venue.name}</strong>
            <p>{venue.description}</p>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  )
}
