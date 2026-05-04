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

import React, { useEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Link, useNavigate, useParams } from 'react-router-dom'
import RunsList from './components/RunsList.tsx'
import RunDetail from './components/RunDetail.tsx'
import ScenarioViewer from './components/ScenarioViewer.tsx'
import './index.css'

const FIXTURE_RUN_ID = '__fixture'
const FIXTURE_TEST_SLUG = 'canonical'

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

// AppActionsMenu — single top-right kebab that's always visible. Items are
// context-aware: "Copy path" shows only on a scenario page, but "Open test
// scenario artifact" is reachable from anywhere so the user can jump to the
// regenerable fixture from the runs list, a run detail, or another scenario.
const AppActionsMenu: React.FC = () => {
  const { runId, testSlug } = useParams<{ runId: string; testSlug: string }>()
  const onScenario = Boolean(runId && testSlug)
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as HTMLElement)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const copyPath = async () => {
    setOpen(false)
    try {
      const res = await fetch(`/api/${runId}/${testSlug}/scenario-path`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const { path } = await res.json()
      await navigator.clipboard.writeText(path)
      setFeedback('Path copied')
    } catch {
      setFeedback('Copy failed')
    }
    window.setTimeout(() => setFeedback(null), 1500)
  }

  const openFixtureScenario = () => {
    setOpen(false)
    navigate(`/${FIXTURE_RUN_ID}/${FIXTURE_TEST_SLUG}`)
  }

  return (
    <div ref={ref} className="ml-auto relative flex items-center">
      {feedback && (
        <span className="text-[11px] text-neutral-500 mr-2">{feedback}</span>
      )}
      <button
        aria-label="More actions"
        className="text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100 rounded px-2 py-0.5 text-base font-bold cursor-pointer leading-none"
        onClick={() => setOpen((prev) => !prev)}
      >
        …
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1 bg-white border border-neutral-200 rounded shadow-lg z-30 py-1 min-w-[200px]">
          {onScenario && (
            <button
              className="w-full text-left px-3 py-1 text-xs hover:bg-neutral-50 cursor-pointer"
              onClick={copyPath}
            >
              Copy path
            </button>
          )}
          <button
            className="w-full text-left px-3 py-1 text-xs hover:bg-neutral-50 cursor-pointer"
            onClick={openFixtureScenario}
          >
            Open test scenario artifact
          </button>
        </div>
      )}
    </div>
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
      <AppActionsMenu />
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
