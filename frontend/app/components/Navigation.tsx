"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Navigation() {
  const pathname = usePathname();

  const navItems = [
    { href: "/", label: "Dashboard" },
    { href: "/sectors", label: "Sectors" },
    { href: "/agents", label: "Agents" },
    { href: "/discussions", label: "Discussions" },
  ];

  return (
    <nav className="border-b border-card bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center">
            <Link
              href="/"
              className="text-xl font-bold text-accent hover:text-up-trend transition-colors"
            >
              MAX
            </Link>
          </div>
          <div className="flex items-center space-x-8">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-2 text-sm font-medium transition-colors uppercase ${
                    isActive
                      ? "text-accent border-b-2 border-accent"
                      : "text-primary-text/60 hover:text-primary-text"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
}

