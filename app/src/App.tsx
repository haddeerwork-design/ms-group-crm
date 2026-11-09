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
import { Planner } from '@/pages/Planner'
import { Quotations } from '@/pages/Quotations'
import { QuotationEditor } from '@/pages/QuotationEditor'
import { QuotationPrint } from '@/pages/QuotationPrint'
import { Companies } from '@/pages/Companies'
import { CompanyDetail } from '@/pages/CompanyDetail'
import { Pipeline } from '@/pages/Pipeline'
import { Tasks } from '@/pages/Tasks'
import { Suppliers } from '@/pages/Suppliers'
import { Logistics } from '@/pages/Logistics'
import { Proformas } from '@/pages/Proformas'
import { ProformaEditor } from '@/pages/ProformaEditor'
import { ProformaPrint } from '@/pages/ProformaPrint'

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
      <Route path="proformas/:id/print" element={<Guard module="proformas"><ProformaPrint /></Guard>} />
      <Route path="quotations/:id/print" element={<Guard module="quotations"><QuotationPrint /></Guard>} />
      <Route element={<AppShell />}>
        <Route index element={<Dashboard />} />
        <Route path="crm" element={<Guard module="crm"><Companies /></Guard>} />
        <Route path="crm/:id" element={<Guard module="crm"><CompanyDetail /></Guard>} />
        <Route path="pipeline" element={<Guard module="pipeline"><Pipeline /></Guard>} />
        <Route path="tasks" element={<Guard module="tasks"><Tasks /></Guard>} />
        <Route path="products" element={<Guard module="products"><Products /></Guard>} />
        <Route path="pricing" element={<Guard module="pricing"><Pricing /></Guard>} />
        <Route path="planner" element={<Guard module="planner"><Planner /></Guard>} />
        <Route path="quotations" element={<Guard module="quotations"><Quotations /></Guard>} />
        <Route path="quotations/:id" element={<Guard module="quotations"><QuotationEditor /></Guard>} />
        <Route path="suppliers" element={<Guard module="suppliers"><Suppliers /></Guard>} />
        <Route path="logistics" element={<Guard module="logistics"><Logistics /></Guard>} />
        <Route path="proformas" element={<Guard module="proformas"><Proformas /></Guard>} />
        <Route path="proformas/:id" element={<Guard module="proformas"><ProformaEditor /></Guard>} />
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
