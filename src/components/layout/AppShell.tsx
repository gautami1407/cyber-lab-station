import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Bell, FlaskConical, LogOut, Menu, Shield, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertBanner } from "@/components/common/AlertBanner";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/useAuth";
import { BRAND, getPageMeta, NAV_ITEMS } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { authService } from "@/services/authService";
import { securityService } from "@/services/securityService";
import type { HealthStatus } from "@/types";

function useHealth() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const next = await securityService.getHealth();
        if (active) setHealth(next);
      } catch {
        if (active) setHealth(null);
      }
    };
    void load();
    const id = setInterval(() => void load(), 15000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);
  return health;
}

function SidebarNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { setOpenMobile, isMobile } = useSidebar();
  const { user } = useAuth();
  const health = useHealth();

  const closeMobile = () => {
    if (isMobile) setOpenMobile(false);
  };

  const groups = [
    { id: "overview", label: "Overview" },
    { id: "projects", label: "Projects" },
    { id: "ops", label: "Operations" },
  ] as const;

  return (
    <>
      <SidebarHeader className="p-4">
        <Link
          to="/dashboard"
          onClick={closeMobile}
          className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5"
        >
          <span className="rounded-lg bg-primary/15 p-1.5 text-primary">
            <Shield aria-hidden="true" className="size-5" />
          </span>
          <span>
            <span className="block text-sm font-semibold tracking-tight">{BRAND.name}</span>
            <span className="block font-mono text-[10px] tracking-widest text-primary uppercase">
              Security Toolkit
            </span>
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.id}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {NAV_ITEMS.filter((item) => item.group === group.id).map((item) => {
                  const active = pathname === item.to;
                  const Icon = item.icon;
                  return (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={item.label}
                        className={cn(
                          active &&
                            "bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary data-[active=true]:bg-primary/15 data-[active=true]:text-primary",
                        )}
                      >
                        <Link to={item.to} onClick={closeMobile}>
                          <Icon aria-hidden="true" />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarSeparator />
      <SidebarFooter className="gap-3 p-4">
        <div className="rounded-xl border border-sidebar-border bg-sidebar-accent/40 p-3 text-xs">
          <p className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Mode</span>
            <StatusBadge tone="accent" icon={<FlaskConical className="size-3" aria-hidden="true" />}>
              LAB
            </StatusBadge>
          </p>
          <p className="mt-2 flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Backend / API</span>
            <StatusBadge tone={!health ? "accent" : health.api && health.database ? "success" : health.api ? "warning" : "danger"}>
              {!health ? "Checking" : health.api && health.database ? "Connected" : health.api ? "Disconnected" : "Unavailable"}
            </StatusBadge>
          </p>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-sidebar-border px-3 py-2">
          <Avatar className="size-8">
            <AvatarFallback className="bg-primary/15 text-xs text-primary">
              {(user?.username ?? "NA").slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{user?.username ?? "Not signed in"}</p>
            <p className="truncate font-mono text-[10px] text-muted-foreground">
              {user?.email ?? "Register to persist sessions"}
            </p>
          </div>
        </div>
      </SidebarFooter>
    </>
  );
}

function AppHeader() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const page = getPageMeta(pathname);
  const { toggleSidebar } = useSidebar();
  const health = useHealth();
  const { user, setUser } = useAuth();
  const connectionState = !health ? "Checking" : health.api && health.database ? "Connected" : health.api ? "Disconnected" : "Unavailable";

  return (
    <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-background/80 px-4 py-3 backdrop-blur md:px-6">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={toggleSidebar}
        aria-label="Open navigation"
      >
        <Menu aria-hidden="true" />
      </Button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold sm:text-base">{page.title}</p>
        <p className="hidden truncate text-xs text-muted-foreground sm:block">{page.description}</p>
      </div>
      <StatusBadge tone={connectionState === "Connected" ? "success" : connectionState === "Disconnected" ? "warning" : connectionState === "Checking" ? "accent" : "danger"}>
        {connectionState === "Checking" ? "● Checking" : `● ${connectionState}`}
      </StatusBadge>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Notifications">
            <Bell aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel>Notifications</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="items-start whitespace-normal">
            LAB ENVIRONMENT — scans run only against administrator-configured allowlisted targets.
          </DropdownMenuItem>
          <DropdownMenuItem className="items-start whitespace-normal">
            Authorized-use confirmation is required before any scan action.
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="User menu">
            <UserRound aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>{user?.username ?? "Guest"}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link to="/settings">Settings</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/documentation">Documentation</Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              void authService.logout().then(() => {
                setUser(null);
                toast.message("Signed out.");
              });
            }}
          >
            <LogOut aria-hidden="true" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}

export function AppShell() {
  const health = useHealth();
  return (
    <SidebarProvider>
      <Sidebar collapsible="offcanvas">
        <SidebarNav />
      </Sidebar>
      <SidebarInset>
        <AppHeader />
        <div className="mx-auto w-full max-w-7xl flex-1 space-y-6 px-4 py-6 md:px-6">
          {health && !health.database ? (
            <AlertBanner variant="warning" title="Database unavailable">
              The API is reachable but PostgreSQL did not respond.
            </AlertBanner>
          ) : null}
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
