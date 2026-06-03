import './index.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './App'

const mountPoint = document.getElementById('jwcu-weather-hub-root') || document.getElementById('root');
if (mountPoint) {
  createRoot(mountPoint).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
