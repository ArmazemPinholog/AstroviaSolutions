import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

/* O site público e a Sala de Gestão (/gestao) são carregados
   separadamente: quem visita o site não baixa o código da gestão,
   e a gestão não carrega o 3D do site. */
const isGestao = window.location.pathname.replace(/\/+$/, '').startsWith('/gestao')
// na Sala, o celular pode instalar a Astra como app (Adicionar à Tela de Início)
if (isGestao) {
  const tag = (nome, attrs) => document.head.appendChild(Object.assign(document.createElement(nome), attrs))
  tag('link', { rel: 'manifest', href: '/astra.webmanifest' })
  tag('link', { rel: 'apple-touch-icon', href: '/astra-180.png' })
  tag('meta', { name: 'apple-mobile-web-app-capable', content: 'yes' })
  tag('meta', { name: 'mobile-web-app-capable', content: 'yes' })
  tag('meta', { name: 'apple-mobile-web-app-title', content: 'Astra' })
  tag('meta', { name: 'apple-mobile-web-app-status-bar-style', content: 'black' })
}
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
