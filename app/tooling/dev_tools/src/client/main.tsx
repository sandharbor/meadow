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
import ConfigManager from './components/ConfigManager'
import './index.css'

const App: React.FC = () => {
  return (
    <>
      <header className="bg-white border-b border-neutral-200 px-4 py-3">
        <h1 className="text-lg font-bold text-brand-700">dev_tools_app</h1>
      </header>
      <main className="min-h-[calc(100vh-49px)] bg-gradient-to-br from-neutral-50 to-brand-50">
        <ConfigManager />
      </main>
    </>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
