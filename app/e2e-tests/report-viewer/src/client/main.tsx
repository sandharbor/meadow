/*
Copyright 2026 Sand Harbor Software, LLC

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Link, useParams } from 'react-router-dom'
import RunsList from './components/RunsList.tsx'
import RunDetail from './components/RunDetail.tsx'
import ScenarioViewer from './components/ScenarioViewer.tsx'
import './index.css'

const Breadcrumbs: React.FC = () => {
  const { runId, testSlug } = useParams()

  return (
    <nav className="flex items-center gap-1 text-sm">
      <Link to="/" className="text-brand-500 hover:text-brand-700 font-medium">
        E2E Reports
      </Link>
      {runId && (
        <>
          <span className="text-neutral-400">/</span>
          <Link to={`/${runId}`} className="text-brand-500 hover:text-brand-700 font-medium">
            {runId}
          </Link>
        </>
      )}
      {testSlug && (
        <>
          <span className="text-neutral-400">/</span>
          <span className="text-neutral-600 font-medium">{testSlug}</span>
        </>
      )}
    </nav>
  )
}

const AppHeader: React.FC = () => {
  return (
    <header className="bg-white border-b border-neutral-200 px-4 py-2 flex items-center gap-4 flex-shrink-0">
      <h1 className="text-sm font-bold text-brand-500">E2E Report Viewer</h1>
      <Routes>
        <Route path="/" element={null} />
        <Route path="/:runId" element={<Breadcrumbs />} />
        <Route path="/:runId/:testSlug" element={<Breadcrumbs />} />
      </Routes>
    </header>
  )
}

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <div className="h-full flex flex-col">
        <AppHeader />
        <div className="flex-1 min-h-0">
          <Routes>
            <Route path="/" element={<RunsList />} />
            <Route path="/:runId" element={<RunDetail />} />
            <Route path="/:runId/:testSlug" element={<ScenarioViewer />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
