import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Toaster, toast } from 'sonner'
import { AuthProvider, useAuth } from '@/lib/auth'
import { LangProvider, tr, useT } from '@/lib/i18n'
import { canAccess, type ModuleKey } from '@/lib/roles'
import { AppShell } from '@/components/layout/AppShell'
import { ErrorState, Loading } from '@/components/ui/states'
import { Button } from '@/components/ui/button'
import { Login } from '@/pages/Login'
import { ForcedPasswordChange } from '@/components/layout/ChangePassword'
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
import { Orders } from '@/pages/Orders'
import { OrderCreate } from '@/pages/OrderCreate'
import { OrderDetail } from '@/pages/OrderDetail'
import { Payments } from '@/pages/Payments'
import { Reports } from '@/pages/Reports'
import { MarketResearch } from '@/pages/MarketResearch'
import { Archive } from '@/pages/Archive'
import { Help } from '@/pages/Help'
import { Activity } from '@/pages/Activity'
import { CatalogPrint } from '@/pages/CatalogPrint'

function Guard({ module, children }: { module: ModuleKey; children: JSX.Element }) {
  const { roles } = useAuth()
  return canAccess(roles, module) ? children : <Navigate to="/" replace />
}

function Root() {
  const { loading, session, error, signOut, recovering, finishRecovery } = useAuth()
  if (loading) return <div className="grid min-h-screen place-items-center"><Loading /></div>
  if (!session) return <Login />
  if (recovering) return <ForcedPasswordChange onSignOut={signOut} recovery onDone={finishRecovery} />
  if (session.user.user_metadata?.must_change_password) return <ForcedPasswordChange onSignOut={signOut} />
  if (error) return (
    <div className="mx-auto mt-24 max-w-md space-y-4 p-6">
      <ErrorState message={error} />
      <Button variant="outline" onClick={signOut}>Sign out</Button>
    </div>
  )
  return (
    <Routes>
      <Route path="proformas/:id/print" element={<Guard module="proformas"><ProformaPrint /></Guard>} />
      <Route path="catalog/print" element={<Guard module="products"><CatalogPrint /></Guard>} />
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
        <Route path="orders" element={<Guard module="orders"><Orders /></Guard>} />
        <Route path="orders/new" element={<Guard module="orders"><OrderCreate /></Guard>} />
        <Route path="orders/:id" element={<Guard module="orders"><OrderDetail /></Guard>} />
        <Route path="payments" element={<Guard module="payments"><Payments /></Guard>} />
        <Route path="suppliers" element={<Guard module="suppliers"><Suppliers /></Guard>} />
        <Route path="logistics" element={<Guard module="logistics"><Logistics /></Guard>} />
        <Route path="proformas" element={<Guard module="proformas"><Proformas /></Guard>} />
        <Route path="proformas/:id" element={<Guard module="proformas"><ProformaEditor /></Guard>} />
        <Route path="reports" element={<Guard module="reports"><Reports /></Guard>} />
        <Route path="research" element={<Guard module="research"><MarketResearch /></Guard>} />
        <Route path="archive" element={<Guard module="archive"><Archive /></Guard>} />
        <Route path="help" element={<Help />} />
        <Route path="team" element={<Guard module="team"><Team /></Guard>} />
        <Route path="settings" element={<Guard module="settings"><Settings /></Guard>} />
        <Route path="activity" element={<Guard module="activity"><Activity /></Guard>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

// Toasts and confirm boxes follow the interface language (English text is the key).
for (const k of ['success', 'error', 'message', 'warning', 'info'] as const) {
  const orig = toast[k]
  toast[k] = ((m: unknown, o?: { action?: { label: unknown } }) => {
    if (o?.action && typeof o.action.label === 'string') o = { ...o, action: { ...o.action, label: tr(o.action.label) } }
    return orig(typeof m === 'string' ? tr(m) : (m as string), o as never)
  }) as typeof orig
}
const nativeConfirm = window.confirm.bind(window)
window.confirm = (m?: string) => nativeConfirm(m ? tr(m) : m)

function AppToaster() {
  const { rtl } = useT()
  return <Toaster richColors position={rtl ? 'top-left' : 'top-right'} dir={rtl ? 'rtl' : 'ltr'} />
}

export default function App() {
  return (
    <LangProvider>
      <AuthProvider>
        <HashRouter><Root /></HashRouter>
        <AppToaster />
      </AuthProvider>
    </LangProvider>
  )
}
