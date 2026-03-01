"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  LayoutDashboard, Bot, Plus, Gamepad2, Settings,
  ChevronDown, LogOut, Menu, X, MessageCircle, PanelLeft, Wrench,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface SidebarProps {
  user: { name: string; email: string };
}

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, exact: true },
  {
    label: "Agents",
    icon: Bot,
    children: [
      { label: "All Agents", href: "/agents" },
      { label: "Create Agent", href: "/agents/create" },
      { label: "Manual Build", href: "/agents/manual" },
    ],
  },
  { label: "Playground", href: "/playground", icon: Gamepad2 },
  { label: "WhatsApp", href: "/whatsapp", icon: MessageCircle },
  { label: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [agentsOpen, setAgentsOpen] = useState(pathname.startsWith("/agents"));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("sidebar-collapsed");
    if (stored === "true") setCollapsed(true);
  }, []);

  const isExpanded = !collapsed || hovered;

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    if (next) setHovered(false);
    localStorage.setItem("sidebar-collapsed", String(next));
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    toast.success("Signed out");
    router.push("/");
    router.refresh();
  };

  const isActive = (href: string, exact = false) => {
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  };

  const renderNav = (expanded: boolean) => (
    <div className="flex flex-col h-full">
      {/* Logo + Toggle */}
      <div className="flex items-center gap-2 px-3 py-[18px] border-b border-[var(--sidebar-border)]">
        <div className="w-8 h-8 flex-shrink-0 flex items-center justify-center">
          <Logo width={32} height={32} />
        </div>
        {expanded && (
          <span className="font-bold text-[var(--sidebar-foreground)] text-sm whitespace-nowrap flex-1 overflow-hidden">
            PublicAI Foundry
          </span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); toggleCollapsed(); }}
          className={cn(
            "w-7 h-7 rounded-lg flex items-center justify-center text-[var(--muted-foreground)] hover:text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-accent)] transition-colors flex-shrink-0",
            !expanded && "ml-auto"
          )}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <PanelLeft className={cn("w-4 h-4 transition-transform duration-300", !expanded && "rotate-180")} />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto overflow-x-hidden">
        {navItems.map((item) => {
          if (item.children) {
            const agentsActive = isActive("/agents");
            return (
              <div key={item.label}>
                <button
                  onClick={() => expanded && setAgentsOpen(!agentsOpen)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150",
                    agentsActive && !expanded
                      ? "bg-indigo-600/15 text-indigo-400"
                      : agentsOpen && expanded
                      ? "bg-indigo-600/10 text-indigo-400"
                      : "text-[var(--muted-foreground)] hover:bg-[var(--sidebar-accent)] hover:text-[var(--sidebar-foreground)]"
                  )}
                >
                  <item.icon className="w-4 h-4 flex-shrink-0" />
                  {expanded && (
                    <>
                      <span className="flex-1 text-left">{item.label}</span>
                      <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", agentsOpen && "rotate-180")} />
                    </>
                  )}
                </button>
                {expanded && (
                  <AnimatePresence>
                    {agentsOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden ml-4 mt-1 space-y-1"
                      >
                        {item.children.map((child) => (
                          <Link
                            key={child.href}
                            href={child.href}
                            onClick={() => setMobileOpen(false)}
                            className={cn(
                              "flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all duration-150",
                              isActive(child.href, child.href === "/agents")
                                ? "bg-indigo-600/15 text-indigo-400 font-medium"
                                : "text-[var(--muted-foreground)] hover:bg-[var(--sidebar-accent)] hover:text-[var(--sidebar-foreground)]"
                            )}
                          >
                            {child.href === "/agents/create" && <Plus className="w-3.5 h-3.5" />}
                            {child.href === "/agents/manual" && <Wrench className="w-3.5 h-3.5" />}
                            {child.label}
                          </Link>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                )}
              </div>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href!}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150",
                isActive(item.href!, item.exact)
                  ? "bg-indigo-600/15 text-indigo-400"
                  : "text-[var(--muted-foreground)] hover:bg-[var(--sidebar-accent)] hover:text-[var(--sidebar-foreground)]"
              )}
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              {expanded && <span className="whitespace-nowrap">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* User section */}
      <div className="p-3 border-t border-[var(--sidebar-border)]">
        {expanded ? (
          <div className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-[var(--sidebar-accent)] transition-colors">
            <Avatar className="w-8 h-8 flex-shrink-0">
              <AvatarFallback className="bg-indigo-600 text-white text-xs">
                {user.name.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[var(--sidebar-foreground)] truncate">{user.name}</p>
              <p className="text-xs text-[var(--muted-foreground)] truncate">{user.email}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleLogout}
              className="w-7 h-7 text-[var(--muted-foreground)] hover:text-red-400 hover:bg-red-500/10 flex-shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" />
            </Button>
          </div>
        ) : (
          <div className="flex justify-center">
            <button
              onClick={handleLogout}
              title="Sign out"
              className="rounded-xl p-1 hover:bg-[var(--sidebar-accent)] transition-colors"
            >
              <Avatar className="w-8 h-8">
                <AvatarFallback className="bg-indigo-600 text-white text-xs">
                  {user.name.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <motion.aside
        animate={{ width: isExpanded ? 240 : 64 }}
        transition={{ type: "spring", damping: 30, stiffness: 250 }}
        onMouseEnter={() => collapsed && setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="hidden lg:flex flex-col bg-[var(--sidebar-background)] border-r border-[var(--sidebar-border)] h-screen sticky top-0 overflow-hidden z-20 flex-shrink-0"
      >
        {renderNav(isExpanded)}
      </motion.aside>

      {/* Mobile toggle */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-50 w-9 h-9 rounded-xl bg-[var(--card)] border border-[var(--border)] flex items-center justify-center text-[var(--foreground)]"
      >
        <Menu className="w-4 h-4" />
      </button>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              className="lg:hidden fixed inset-0 bg-black/60 z-40"
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="lg:hidden fixed left-0 top-0 bottom-0 w-64 z-50 bg-[var(--sidebar-background)] border-r border-[var(--sidebar-border)]"
            >
              <button
                onClick={() => setMobileOpen(false)}
                className="absolute top-4 right-4 w-7 h-7 rounded-lg flex items-center justify-center text-[var(--muted-foreground)] hover:text-[var(--sidebar-foreground)]"
              >
                <X className="w-4 h-4" />
              </button>
              {renderNav(true)}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
