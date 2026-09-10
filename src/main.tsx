import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AppProvider } from './state/store'
import App from './App'
import './styles.css'

const container = document.getElementById('root')
if (container) {
  createRoot(container).render(
    <StrictMode>
      <AppProvider>
        <App />
      </AppProvider>
    </StrictMode>,
  )
}
