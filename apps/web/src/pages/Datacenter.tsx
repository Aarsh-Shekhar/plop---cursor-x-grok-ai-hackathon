// Datacenter (/datacenter): teammate's walkable GPU/storage server room —
// rack aisles, part swapping, live DCIM telemetry, vendor procurement swarm.
// Selecting a compute node offers "zoom into server", which opens the
// component-level PC rig (Roblox-style zoom from facility → machine).
import { useNavigate } from 'react-router-dom'
import DatacenterRoom from '../components/datacenter/DatacenterRoom'

export default function Datacenter() {
  const navigate = useNavigate()
  return (
    <DatacenterRoom
      onBack={() => navigate('/')}
      onZoomPc={() => navigate('/pc')}
    />
  )
}
