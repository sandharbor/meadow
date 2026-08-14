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

import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom'
import BundleEditor from './components/BundleEditor'
import BundleList from '../../areas/bundles/components/BundleList'
import TitleBar from './components/TitleBar'
import UpdateModal from './components/UpdateModal'
import { initializeApiConfig } from '../utils/apiConfig'
import { logger } from '../utils/logger'
import { FindInBundlesOptions } from '../../../../shared_code/types/findInBundlesOptions'
import './index.css'

const FindInBundlesDeepLinkListener: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    if (!window.electronAPI) return;

    window.electronAPI.onOpenFindInBundles((findInBundlesOptions: FindInBundlesOptions) => {
      navigate('/', { state: { findInBundlesOptions } });
    });

    return () => {
      window.electronAPI.offOpenFindInBundles();
    };
  }, [navigate]);

  return null;
};

const App: React.FC = () => {
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);

  useEffect(() => {
    if (!window.electronAPI) return;

    window.electronAPI.onOpenUpdateModal(() => {
      setIsUpdateModalOpen(true);
    });

    return () => {
      window.electronAPI.offOpenUpdateModal();
    };
  }, []);

  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <FindInBundlesDeepLinkListener />
      <TitleBar />

      <div className="h-[calc(100vh-28px)] mt-[28px] overflow-hidden">
        <Routes>
          <Route path="/" element={<BundleList />} />
          <Route path="/bundle/:slug" element={<BundleEditor />} />
        </Routes>
      </div>

      <UpdateModal
        isOpen={isUpdateModalOpen}
        onClose={() => setIsUpdateModalOpen(false)}
      />
    </BrowserRouter>
  );
};

const initializeApp = async () => {
  try {
    logger.info('Initializing API configuration...');
    await initializeApiConfig();
    logger.info('API configuration initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize API configuration:', error);
  }

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
};

initializeApp();
