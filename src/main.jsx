import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

/* O site público e a Sala de Gestão (/gestao) são carregados
   separadamente: quem visita o site não baixa o código da gestão,
   e a gestão não carrega o 3D do site. */
const isGestao = window.location.pathname.replace(/\/+$/, '').startsWith('/gestao')
const Root = isGestao
  ? lazy(() => import('./gestao/GestaoApp.jsx'))
  : lazy(() => import('./App.jsx'))

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#030305' }} />}>
      <Root />
    </Suspense>
  </StrictMode>,
)
