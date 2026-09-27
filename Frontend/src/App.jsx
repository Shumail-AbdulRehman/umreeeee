import { useEffect, useState } from 'react'
import { ErrorState, LoadingState } from './components/DataState'
import PageTitle from './components/PageTitle'
import Sidebar from './components/Sidebar'
import Topbar from './components/Topbar'
import { isValidPage } from './config/navigation'
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
  const route = hashState.route
  const isInvitationRoute = route === 'accept-invite'
  const invitationToken = hashState.params.get('token') || ''
  const openCreateUser = hashState.params.get('modal') === 'add'
  const openCreateIntegration = hashState.params.get('modal') === 'add'
  const filterGroupId = hashState.params.get('group_id') || ''
  const filterIntegrationId = hashState.params.get('integration_id') || ''
  const page = isValidPage(route) && canOpenPage(user, route) ? route : isAdmin(user) ? 'insights' : 'prompt-studio'
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
    window.location.hash = isAdmin(nextUser) ? 'insights' : 'prompt-studio'
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
      <div className="auth-loading">
        <LoadingState />
      </div>
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
    <div className="app-shell">
      <Sidebar page={page} onNavigate={navigate} user={user} onLogout={handleLogout} />

      <main className="min-w-0">
        <Topbar page={page} user={user} />

        <div className="content">
          <PageTitle page={page} />
          {isStandalonePage ? <ActivePage key={`${page}:${filterGroupId}:${filterIntegrationId}:${hashState.params.get('run_id') || ''}:${hashState.params.get('status') || ''}`} currentUser={user}
            openCreateUser={openCreateUser} openCreateIntegration={openCreateIntegration}
            filterGroupId={filterGroupId} filterIntegrationId={filterIntegrationId}
            runId={hashState.params.get('run_id') || ''} filterStatus={hashState.params.get('status') || ''}
            testId={hashState.params.get('test') || ''} /> : null}
          {!isStandalonePage && loading ? <LoadingState /> : null}
          {!isStandalonePage && !loading && error ? <ErrorState error={error} /> : null}
          {!isStandalonePage && !loading && !error && data ? <ActivePage data={data} currentUser={user} /> : null}
        </div>
      </main>
    </div>
  )
}
