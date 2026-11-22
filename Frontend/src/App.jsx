import { Suspense, useEffect, useState } from 'react'
import { ErrorState } from './components/DataState'
import LoadingSurface from './components/LoadingSurface'
import PageLoadingBoundary, { RequestProgress } from './components/PageLoadingBoundary'
import PageTitle from './components/PageTitle'
import Sidebar from './components/Sidebar'
import Topbar from './components/Topbar'
import { isValidPage, pageMeta } from './config/navigation'
import { canOpenPage, isAdmin } from './utils/permissions'
import { useDashboardData } from './hooks/useDashboardData'
import AcceptInvitePage from './pages/auth/AcceptInvitePage'
import LoginPage from './pages/auth/LoginPage'
import SignupPage from './pages/auth/SignupPage'
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage'
import VerifyEmailPage from './pages/auth/VerifyEmailPage'
import { pageRegistry } from './pages/pageRegistry'
import { getAuthToken } from './services/api/client'
import {
  fetchCurrentUser,
  logoutUser,
  getPendingVerificationState,
  setPendingVerificationState,
} from './services/auth/authService'

function getHashState() {
  const rawHash = window.location.hash.replace('#', '')
  const [route = '', query = ''] = rawHash.split('?')
  return {
    route,
    params: new URLSearchParams(query),
  }
}

export default function App() {
  const [hashState, setHashState] = useState(getHashState)
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [verificationState, setVerificationState] = useState(getPendingVerificationState)
  const [navCollapsed, setNavCollapsed] = useState(() => window.localStorage.getItem('sentinel.nav.collapsed') === 'true')
  const route = hashState.route
  const isInvitationRoute = route === 'accept-invite'
  const invitationToken = hashState.params.get('token') || ''
  const openCreateUser = hashState.params.get('modal') === 'add'
  const openCreateIntegration = hashState.params.get('modal') === 'add'
  const filterGroupId = hashState.params.get('group_id') || ''
  const filterIntegrationId = hashState.params.get('integration_id') || ''
  const page = isValidPage(route) && canOpenPage(user, route) ? route : isAdmin(user) ? 'insights' : 'my-activity'
  const ActivePage = pageRegistry[page] || pageRegistry['prompt-studio']
  const isStandalonePage =
    page !== 'insights'
  const shouldLoadDashboard = Boolean(user) && page === 'insights'
  const { data, error, loading } = useDashboardData({ enabled: shouldLoadDashboard })

  useEffect(() => {
    const onHashChange = () => setHashState(getHashState())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  useEffect(() => {
    const onExpired = () => {
      setUser(null)
      window.location.hash = 'login'
      setHashState(getHashState())
    }
    window.addEventListener('sentinel:session-expired', onExpired)
    return () => window.removeEventListener('sentinel:session-expired', onExpired)
  }, [])

  useEffect(() => {
    let active = true

    async function loadSession() {
      if (!getAuthToken()) {
        if (active) {
          setAuthLoading(false)
        }
        return
      }

      try {
        const currentUser = await fetchCurrentUser()
        if (active) {
          setUser(currentUser)
        }
      } catch {
        logoutUser()
        if (active) {
          setUser(null)
        }
      } finally {
        if (active) {
          setAuthLoading(false)
        }
      }
    }

    loadSession()

    return () => {
      active = false
    }
  }, [])

  const navigate = (key) => {
    if (!isValidPage(key)) return
    if (key === page) return
    if (!window.dispatchEvent(new Event('sentinel:before-navigation', { cancelable: true }))) return
    window.location.hash = key
    setHashState(getHashState())
  }

  const handleAuthenticated = (nextUser) => {
    setUser(nextUser)
    setPendingVerificationState(null)
    setVerificationState({ email: '', message: '' })
    window.location.hash = isAdmin(nextUser) ? 'insights' : 'my-activity'
    setHashState(getHashState())
  }

  const handleVerificationRequired = (pendingState) => {
    setPendingVerificationState(pendingState)
    setVerificationState({
      email: pendingState?.email || '',
      message: pendingState?.message || '',
    })
    window.location.hash = 'verify-email'
    setHashState(getHashState())
  }

  const handleLogout = () => {
    logoutUser()
    setUser(null)
    setVerificationState({ email: '', message: '' })
    window.location.hash = 'login'
    setHashState(getHashState())
  }

  const handleGoToLogin = () => {
    logoutUser()
    setUser(null)
    window.location.hash = 'login'
    setHashState(getHashState())
  }

  const AuthPage =
    route === 'accept-invite'
      ? AcceptInvitePage
      : route === 'signup'
      ? SignupPage
      : route === 'verify-email'
        ? VerifyEmailPage
        : route === 'forgot-password'
          ? ForgotPasswordPage
          : LoginPage

  if (authLoading) {
    if (isInvitationRoute) {
      return (
        <AcceptInvitePage
          token={invitationToken}
          onGoToLogin={handleGoToLogin}
        />
      )
    }

    return (
      <main className="auth-loading">
        <LoadingSurface kind="session" label="Restoring your session…" />
      </main>
    )
  }

  if (isInvitationRoute) {
    return (
      <AcceptInvitePage
        token={invitationToken}
        onGoToLogin={handleGoToLogin}
      />
    )
  }

  if (!user) {
    return (
      <AuthPage
        email={verificationState.email}
        initialMessage={verificationState.message}
        onAuthenticated={handleAuthenticated}
        onVerificationRequired={handleVerificationRequired}
        onVerificationStateChanged={(nextState) => {
          const mergedState = {
            email: nextState?.email ?? verificationState.email,
            message: nextState?.message ?? verificationState.message,
          }
          setPendingVerificationState(mergedState)
          setVerificationState(mergedState)
        }}
        onGoToLogin={handleGoToLogin}
        token={invitationToken}
      />
    )
  }

  return (
    <div className={`app-shell ${navCollapsed ? 'nav-collapsed' : ''}`}>
      <a className="skip-link" href="#main-content" onClick={(event) => { event.preventDefault(); document.getElementById('main-content')?.focus() }}>Skip to content</a>
      <RequestProgress />
      <Sidebar page={page} onNavigate={navigate} user={user} onLogout={handleLogout}
        collapsed={navCollapsed} onToggleCollapse={() => setNavCollapsed((current) => {
          window.localStorage.setItem('sentinel.nav.collapsed', String(!current))
          return !current
        })} />

      <main className="min-w-0" id="main-content" tabIndex={-1}>
        <Topbar page={page} user={user} onNavigate={navigate} onLogout={handleLogout} />

        <div className="content">
          <PageTitle page={page} />
          {isStandalonePage ? <PageLoadingBoundary key={`${page}:${filterGroupId}:${filterIntegrationId}:${hashState.params.get('run_id') || ''}:${hashState.params.get('status') || ''}`} label={pageMeta[page].title} kind={page}><Suspense fallback={<LoadingSurface kind={page} label={`Opening ${pageMeta[page].title}…`} />}><ActivePage currentUser={user}
            openCreateUser={openCreateUser} openCreateIntegration={openCreateIntegration}
            filterGroupId={filterGroupId} filterIntegrationId={filterIntegrationId}
            runId={hashState.params.get('run_id') || ''} filterStatus={hashState.params.get('status') || ''}
            conversationId={hashState.params.get('chat') || ''}
            testId={hashState.params.get('test') || ''} /></Suspense></PageLoadingBoundary> : null}
          {!isStandalonePage && loading ? <LoadingSurface kind="insights" label="Loading overview…" /> : null}
          {!isStandalonePage && !loading && error ? <ErrorState error={error} /> : null}
          {!isStandalonePage && !loading && !error && data ? <Suspense fallback={<LoadingSurface label="Opening overview…" />}><ActivePage data={data} currentUser={user} /></Suspense> : null}
        </div>
      </main>
    </div>
  )
}
