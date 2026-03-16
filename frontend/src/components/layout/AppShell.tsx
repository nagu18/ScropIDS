import {
  Bot,
  CalendarClock,
  ExternalLink,
  LayoutDashboard,
  LogOut,
  Radar,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";
import { NavLink } from "react-router-dom";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import logoUrl from "@/assets/scropids-logo.svg";

const navItems = [
  { label: "Overview", to: "/", icon: LayoutDashboard },
  { label: "Alerts", to: "/alerts", icon: ShieldAlert },
  { label: "Agents", to: "/agents", icon: Radar },
  { label: "LLM Config", to: "/llm-config", icon: Bot },
  { label: "Scheduler", to: "/scheduler", icon: CalendarClock },
  { label: "Rules", to: "/rules", icon: ShieldCheck },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { me, activeOrgSlug, switchOrg, logout } = useAuth();

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="border-b border-border bg-[#070c15] p-4 lg:min-h-screen lg:border-b-0 lg:border-r">
        <div className="mb-8 flex items-center gap-2 px-2">
          <img src={logoUrl} alt="ScropIDS logo" className="h-6 w-6 rounded-md border border-accent/40 bg-[#0b162c] p-0.5" />
          <span className="text-lg font-semibold text-foreground">ScropIDS IDS</span>
        </div>
        <nav className="grid gap-1">
          {navItems.map(({ label, to, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted transition hover:bg-card hover:text-foreground",
                  isActive && "bg-card text-foreground"
                )
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <section className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-20 border-b border-border bg-background/90 px-5 py-4 backdrop-blur-md">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted">Tenant Workspace</p>
              <div className="mt-1 max-w-[300px]">
                <Select value={activeOrgSlug ?? undefined} onValueChange={switchOrg}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select organization" />
                  </SelectTrigger>
                  <SelectContent>
                    {(me?.organizations ?? []).map((org) => (
                      <SelectItem key={org.slug} value={org.slug}>
                        {org.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {me?.is_staff && me.username === "Nagendher" ? (
                <Button asChild variant="outline">
                  <a href="/admin/" target="_blank" rel="noreferrer">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Admin Panel
                  </a>
                </Button>
              ) : null}
              <div className="text-right text-xs text-muted">
                <p className="font-medium text-foreground">{me?.username}</p>
                <p>Session Auth</p>
              </div>
              <Button variant="outline" onClick={() => void logout()}>
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </Button>
            </div>
          </div>
        </header>
        <main className="flex-1 px-5 py-6">{children}</main>
      </section>
    </div>
  );
}
