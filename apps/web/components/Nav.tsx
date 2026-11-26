"use client";
import { usePathname } from "next/navigation";
import { CalendarDays, ListChecks, Clock, Settings, BarChart3, Inbox } from "lucide-react";

type Role = "teacher" | "incharge" | "admin" | "viewer";

const ITEMS: { href: string; label: string; icon: typeof CalendarDays; roles: Role[] }[] = [
  { href: "/", label: "Book", icon: CalendarDays, roles: ["teacher", "incharge", "admin", "viewer"] },
  { href: "/bookings", label: "My bookings", icon: ListChecks, roles: ["teacher", "incharge", "admin"] },
  { href: "/incharge", label: "Today", icon: Clock, roles: ["incharge", "admin"] },
  { href: "/reports", label: "Reports", icon: BarChart3, roles: ["admin", "viewer"] },
  { href: "/admin", label: "Admin", icon: Settings, roles: ["admin"] },
  { href: "/outbox", label: "Messages", icon: Inbox, roles: ["admin", "incharge"] },
];

export function Nav({ role }: { role: Role }) {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="Main">
      {ITEMS.filter((i) => i.roles.includes(role)).map((i) => {
        const active = i.href === "/" ? path === "/" : path.startsWith(i.href);
        const Icon = i.icon;
        return (
          <a key={i.href} href={i.href} aria-current={active ? "page" : undefined}>
            <Icon size={16} aria-hidden="true" />
            {i.label}
          </a>
        );
      })}
    </nav>
  );
}
