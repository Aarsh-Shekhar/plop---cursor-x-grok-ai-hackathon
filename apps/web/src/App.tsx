import { BrowserRouter, Route, Routes } from 'react-router-dom'
import ErrorBoundary from './components/ErrorBoundary'
import Landing from './pages/Landing'
import Projects from './pages/Projects'
import Editor from './pages/Editor'
import Room from './pages/Room'
import Demo from './pages/Demo'
import Pc from './pages/Pc'
import Datacenter from './pages/Datacenter'

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/editor/:sceneId" element={<Editor />} />
          <Route path="/room" element={<Room />} />
          <Route path="/demo" element={<Demo />} />
          <Route path="/pc" element={<Pc />} />
          <Route path="/datacenter" element={<Datacenter />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
