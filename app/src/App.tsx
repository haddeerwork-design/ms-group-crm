import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AuthProvider, useAuth } from '@/lib/auth'
import { canAccess, type ModuleKey } from '@/lib/roles'
import { AppShell } from '@/components/layout/AppShell'
import { ErrorState, Loading } from '@/components/ui/states'
import { Button } from '@/components/ui/button'
import { Login } from '@/pages/Login'
import { Dashboard } from '@/pages/Dashboard'
import { Settings } from '@/pages/Settings'
import { Team } from '@/pages/Team'
import { Products } from '@/pages/Products'
import { Pricing } from '@/pages/Pricing'

function Guard({ module, children }: { module: ModuleKey; children: JSX.Element }) {
  const { roles } = useAuth()
  return canAccess(roles, module) ? children : <Navigate to="/" replace />
}

function Root() {
  const { loading, session, error, signOut } = useAuth()
  if (loading) return <div className="grid min-h-screen place-items-center"><Loading /></div>
  if (!session) return <Login />
  if (error) return (
    <div className="mx-auto mt-24 max-w-md space-y-4 p-6">
      <ErrorState message={error} />
      <Button variant="outline" onClick={signOut}>Sign out</Button>
    </div>
  )
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Dashboard />} />
        <Route path="products" element={<Guard module="products"><Products /></Guard>} />
        <Route path="pricing" element={<Guard module="pricing"><Pricing /></Guard>} />
        <Route path="team" element={<Guard module="team"><Team /></Guard>} />
        <Route path="settings" element={<Guard module="settings"><Settings /></Guard>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <HashRouter><Root /></HashRouter>
      <Toaster richColors position="top-right" />
    </AuthProvider>
  )
}
