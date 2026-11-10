import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Archive, ChevronDown, LifeBuoy, BarChart3, Globe2, BadgeDollarSign, Boxes, Building2, CheckSquare, Factory, Receipt, Ship, Wallet, ExternalLink, FileText, Handshake, LayoutDashboard, LogOut, Menu, Moon, Package, PanelLeftClose, PanelLeftOpen, Settings, Sun, Truck, Users } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { canAccess, ROLE_LABEL, type ModuleKey } from '@/lib/roles'
import { applyTheme, getTheme } from '@/lib/theme'
import { LEGACY_CRM_URL } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { NotificationBell } from './NotificationBell'
import { GlobalSearch } from './GlobalSearch'
import { ChangePasswordButton } from './ChangePassword'
import { QuickAdd } from './QuickAdd'

type NavItem = { to: string; label: string; icon: typeof Users; module: ModuleKey }
// Menu in groups, in the order people work: sell -> deliver -> catalog -> admin.
const NAV_GROUPS: { id: string; title: string | null; items: NavItem[] }[] = [
  { id: 'main', title: null, items: [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard, module: 'dashboard' },
    { to: '/tasks', label: 'Tasks', icon: CheckSquare, module: 'tasks' },
    { to: '/reports', label: 'Reports', icon: BarChart3, module: 'reports' },
  ] },
  { id: 'sales', title: 'Sales', items: [
    { to: '/research', label: 'Market Research', icon: Globe2, module: 'research' },
    { to: '/crm', label: 'CRM & Importers', icon: Building2, module: 'crm' },
    { to: '/pipeline', label: 'Sales Pipeline', icon: Handshake, module: 'pipeline' },
    { to: '/quotations', label: 'Quotations', icon: FileText, module: 'quotations' },
    { to: '/proformas', label: 'Proforma Invoices', icon: Receipt, module: 'proformas' },
  ] },
  { id: 'ops', title: 'Operations', items: [
    { to: '/orders', label: 'Orders & Shipments', icon: Boxes, module: 'orders' },
    { to: '/planner', label: 'Container Planner', icon: Truck, module: 'planner' },
    { to: '/logistics', label: 'Shipping & Logistics', icon: Ship, module: 'logistics' },
    { to: '/payments', label: 'Payments', icon: Wallet, module: 'payments' },
  ] },
  { id: 'catalog', title: 'Products & Prices', items: [
    { to: '/products', label: 'Products', icon: Package, module: 'products' },
    { to: '/pricing', label: 'Pricing', icon: BadgeDollarSign, module: 'pricing' },
    { to: '/suppliers', label: 'Suppliers', icon: Factory, module: 'suppliers' },
  ] },
  { id: 'admin', title: 'Admin', items: [
    { to: '/team', label: 'Team & Roles', icon: Users, module: 'team' },
    { to: '/settings', label: 'Company Settings', icon: Settings, module: 'settings' },
    { to: '/archive', label: 'Old CRM Archive', icon: Archive, module: 'archive' },
  ] },
]
const HELP: NavItem = { to: '/help', label: 'Help', icon: LifeBuoy, module: 'help' }
const isIn = (pathname: string, to: string) => (to === '/' ? pathname === '/' : pathname === to || pathname.startsWith(to + '/'))

export function AppShell() {
  const { profile, roles, signOut } = useAuth()
  const { pathname } = useLocation()
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem('ms_nav') === '1' } catch { return false } })
  const [mobileOpen, setMobileOpen] = useState(false)
  const [theme, setTheme] = useState(getTheme())
  useEffect(() => applyTheme(theme), [theme])
  useEffect(() => { try { localStorage.setItem('ms_nav', collapsed ? '1' : '0') } catch { /* ignore */ } }, [collapsed])

  const groups = NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((n) => canAccess(roles, n.module)) })).filter((g) => g.items.length)
  // closed groups are remembered per browser; the group of the open page is always shown
  const [closed, setClosed] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem('ms_nav_closed') || '[]') } catch { return [] } })
  useEffect(() => { try { localStorage.setItem('ms_nav_closed', JSON.stringify(closed)) } catch { /* ignore */ } }, [closed])
  const toggleGroup = (id: string) => setClosed((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]))
  const name = profile?.full_name || profile?.email || 'User'

  const sidebar = (
    <nav className="flex h-full min-h-0 flex-col p-3">
      <div className={cn('mb-3 flex h-12 shrink-0 items-center rounded-md px-2', collapsed && 'justify-center px-0')}>
        {collapsed
          ? <span className="grid size-9 place-items-center rounded-md bg-forest text-sm font-bold text-white">MS</span>
          : <><img src={`${import.meta.env.BASE_URL}logo.png`} alt="MS El-brancy Group" className="h-9 w-auto dark:hidden" /><img src={`${import.meta.env.BASE_URL}logo-white.png`} alt="MS El-brancy Group" className="hidden h-9 w-auto dark:block" /></>}
      </div>
      {/* The menu scrolls on its own when the screen is not tall enough; logo and bottom link stay put. */}
      <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overscroll-contain px-1 [scrollbar-width:thin]">
      {groups.map((g, gi) => {
        const active = g.items.some((n) => isIn(pathname, n.to))
        const open = !g.title || collapsed || active || !closed.includes(g.id)
        return (
          <div key={g.id} className={cn('flex shrink-0 flex-col gap-0.5', gi > 0 && (collapsed ? 'mt-2 border-t border-border pt-2' : 'mt-3'))}>
            {g.title && !collapsed && (
              <button type="button" onClick={() => toggleGroup(g.id)} aria-expanded={open} disabled={active}
                className="flex items-center justify-between rounded-md px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80 hover:text-foreground disabled:cursor-default disabled:hover:text-muted-foreground/80">
                {g.title}
                {!active && <ChevronDown className={cn('size-3.5 transition-transform', !open && '-rotate-90')} />}
              </button>
            )}
            {open && g.items.map((n) => <NavItemLink key={n.to} item={n} collapsed={collapsed} onPick={() => setMobileOpen(false)} />)}
          </div>
        )
      })}
      </div>
      <div className="mt-2 shrink-0 space-y-0.5 border-t border-border pt-2">
        {canAccess(roles, HELP.module) && <NavItemLink item={HELP} collapsed={collapsed} onPick={() => setMobileOpen(false)} />}
        <a href={LEGACY_CRM_URL} title="The current CRM stays available until it is switched off"
           className={cn('flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground', collapsed && 'justify-center px-0')}>
          <ExternalLink className="size-4 shrink-0" />{!collapsed && 'Open current CRM'}
        </a>
      </div>
    </nav>
  )

  return (
    <div className="flex min-h-screen">
      <aside className={cn('sticky top-0 hidden h-screen shrink-0 border-r border-border bg-card transition-[width] md:block', collapsed ? 'w-16' : 'w-60')}>
        {sidebar}
      </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setMobileOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <aside className="absolute inset-y-0 left-0 w-64 border-r border-border bg-card" onClick={(e) => e.stopPropagation()}>{sidebar}</aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/85 px-4 backdrop-blur">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu"><Menu /></Button>
          <Button variant="ghost" size="icon" className="hidden md:inline-flex" onClick={() => setCollapsed((c) => !c)} aria-label="Toggle sidebar" data-tip={collapsed ? 'Show menu' : 'Hide menu'}>
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          </Button>
          <GlobalSearch />
          <div className="ml-auto flex items-center gap-2">
            <QuickAdd />
            <NotificationBell />
            <ChangePasswordButton />
            <Button variant="ghost" size="icon" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Toggle dark mode" data-tip={theme === 'dark' ? 'Light mode' : 'Dark mode'}>
              {theme === 'dark' ? <Sun /> : <Moon />}
            </Button>
            <div className="hidden text-right sm:block">
              <div className="text-sm font-medium leading-tight">{name}</div>
              <div className="text-xs text-muted-foreground">{roles.map((r) => ROLE_LABEL[r]).join(' · ') || 'No role'}</div>
            </div>
            <div className="grid size-8 place-items-center rounded-full bg-forest text-xs font-semibold text-white">
              {name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
            </div>
            <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sign out" data-tip="Sign out" data-tip-end=""><LogOut /></Button>
          </div>
        </header>
        <main className={cn('mx-auto w-full flex-1 p-4 md:p-8', pathname === '/' ? 'max-w-[1440px]' : 'max-w-6xl')}><Outlet /></main>
      </div>
    </div>
  )
}

function NavItemLink({ item: { to, label, icon: Icon }, collapsed, onPick }: { item: NavItem; collapsed: boolean; onPick: () => void }) {
  return (
    <NavLink to={to} end={to === '/'} onClick={onPick} title={collapsed ? label : undefined} aria-label={collapsed ? label : undefined}
      className={({ isActive }) => cn(
        'flex shrink-0 items-center gap-3 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
        isActive && 'bg-accent text-foreground',
        collapsed && 'justify-center px-0',
      )}>
      <Icon className="size-4 shrink-0" />{!collapsed && label}
    </NavLink>
  )
}

export function PageHeader({ title, summary, action }: { title: string; summary?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {summary && <p className="mt-1 text-sm text-muted-foreground">{summary}</p>}
      </div>
      {action}
    </div>
  )
}
