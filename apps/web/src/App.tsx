import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Landing from './pages/Landing'
import Projects from './pages/Projects'
import Editor from './pages/Editor'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/editor/:sceneId" element={<Editor />} />
      </Routes>
    </BrowserRouter>
  )
}
