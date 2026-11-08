import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { ExternalLink, LayoutDashboard, LogOut, Menu, Moon, Package, PanelLeftClose, PanelLeftOpen, Settings, Sun, Users } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { canAccess, ROLE_LABEL, type ModuleKey } from '@/lib/roles'
import { applyTheme, getTheme } from '@/lib/theme'
import { LEGACY_CRM_URL } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const NAV: { to: string; label: string; icon: typeof Users; module: ModuleKey }[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, module: 'dashboard' },
  { to: '/products', label: 'Products', icon: Package, module: 'products' },
  { to: '/team', label: 'Team & Roles', icon: Users, module: 'team' },
  { to: '/settings', label: 'Company Settings', icon: Settings, module: 'settings' },
]

export function AppShell() {
  const { profile, roles, signOut } = useAuth()
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem('ms_nav') === '1' } catch { return false } })
  const [mobileOpen, setMobileOpen] = useState(false)
  const [theme, setTheme] = useState(getTheme())
  useEffect(() => applyTheme(theme), [theme])
  useEffect(() => { try { localStorage.setItem('ms_nav', collapsed ? '1' : '0') } catch { /* ignore */ } }, [collapsed])

  const items = NAV.filter((n) => canAccess(roles, n.module))
  const name = profile?.full_name || profile?.email || 'User'

  const sidebar = (
    <nav className="flex h-full flex-col gap-1 p-3">
      <div className={cn('mb-4 flex h-12 items-center rounded-md px-2', collapsed && 'justify-center px-0')}>
        {collapsed
          ? <span className="grid size-9 place-items-center rounded-md bg-forest text-sm font-bold text-white">MS</span>
          : <img src={`${import.meta.env.BASE_URL}logo.png`} alt="MS El-brancy Group" className="h-9 w-auto rounded dark:bg-white dark:p-1" />}
      </div>
      {items.map(({ to, label, icon: Icon }) => (
        <NavLink key={to} to={to} end={to === '/'} onClick={() => setMobileOpen(false)} title={collapsed ? label : undefined}
          className={({ isActive }) => cn(
            'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
            isActive && 'bg-accent text-foreground',
            collapsed && 'justify-center px-0',
          )}>
          <Icon className="size-4 shrink-0" />{!collapsed && label}
        </NavLink>
      ))}
      <div className="mt-auto space-y-1 border-t border-border pt-3">
        <a href={LEGACY_CRM_URL} title="Customers, leads, pricing, planner and quotations still live in the current CRM"
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
          <Button variant="ghost" size="icon" className="hidden md:inline-flex" onClick={() => setCollapsed((c) => !c)} aria-label="Toggle sidebar">
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          </Button>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Toggle dark mode">
              {theme === 'dark' ? <Sun /> : <Moon />}
            </Button>
            <div className="hidden text-right sm:block">
              <div className="text-sm font-medium leading-tight">{name}</div>
              <div className="text-xs text-muted-foreground">{roles.map((r) => ROLE_LABEL[r]).join(' · ') || 'No role'}</div>
            </div>
            <div className="grid size-8 place-items-center rounded-full bg-forest text-xs font-semibold text-white">
              {name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
            </div>
            <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sign out" title="Sign out"><LogOut /></Button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 p-4 md:p-8"><Outlet /></main>
      </div>
    </div>
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
