"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, FolderGit2, Users, Settings, LogOut, CreditCard } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { SessionInfo } from "@/types/session";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/projects", label: "Projects", icon: FolderGit2, exact: false },
  { href: "/dashboard/members", label: "Team", icon: Users, exact: false },
  { href: "/dashboard/billing", label: "Billing", icon: CreditCard, exact: false },
  { href: "/dashboard/settings", label: "Settings", icon: Settings, exact: false },
];

interface SidebarProps {
  session: SessionInfo | null;
  onLogout: () => Promise<void>;
}

export function Sidebar({ session, onLogout }: SidebarProps) {
  const pathname = usePathname();

  const isActive = (href: string, exact: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  return (
    <aside className="w-60 min-h-screen bg-card border-r border-border flex flex-col shrink-0">
      {/* Org header */}
      <div className="px-4 py-5 border-b border-border">
        <p className="text-sm font-semibold truncate">{session?.organization.name ?? "—"}</p>
        <p className="text-xs text-muted-foreground mt-0.5 uppercase tracking-widest">
          {session?.organization.plan ?? ""}
        </p>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 space-y-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon, exact }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
              isActive(href, exact)
                ? "bg-primary/10 text-primary font-medium"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </Link>
        ))}
      </nav>

      <Separator className="bg-border" />

      {/* User + logout */}
      <div className="px-4 py-4 space-y-2">
        {session?.user && (
          <div>
            <p className="text-xs font-medium truncate">{session.user.name}</p>
            <p className="text-xs text-muted-foreground truncate">{session.user.email}</p>
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground text-xs"
          onClick={() => void onLogout()}
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </Button>
      </div>
    </aside>
  );
}
