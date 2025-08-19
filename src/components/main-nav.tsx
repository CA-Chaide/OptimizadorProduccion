'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar';
import {
  LayoutDashboard,
  Upload,
  ClipboardList,
  CalendarDays,
  Users,
  Settings2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/data-import', label: 'Data Import', icon: Upload },
  { href: '/production-plan', label: 'Production Plan', icon: ClipboardList },
  { href: '/absenteeism', label: 'Absenteeism', icon: CalendarDays },
  { href: '/personnel', label: 'Personnel', icon: Users },
  { href: '/constraints', label: 'Constraints', icon: Settings2 },
];

export function MainNav({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  const pathname = usePathname();

  return (
    <nav className={cn('flex flex-col', className)} {...props}>
      {navItems.map((item) => (
        <SidebarMenuItem key={item.href}>
          <Link href={item.href}>
            <SidebarMenuButton
              isActive={pathname === item.href}
              tooltip={item.label}
              asChild
            >
              <div>
                <item.icon className="h-4 w-4" />
                <span>{item.label}</span>
              </div>
            </SidebarMenuButton>
          </Link>
        </SidebarMenuItem>
      ))}
    </nav>
  );
}
