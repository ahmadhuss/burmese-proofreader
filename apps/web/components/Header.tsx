"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Header() {
  const path = usePathname();

  const links = [
    { href: "/", label: "Upload" },
    { href: "/sessions", label: "Sessions" }
  ];

  return (
    <header className="border-b border-gray-100 bg-white sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-12 flex items-center justify-between">
        <Link href="/" className="font-bold text-gray-800 text-sm tracking-tight hover:text-gray-600 transition-colors">
          Burmese Book Editor
        </Link>
        <nav className="flex items-center gap-1">
          {links.map(({ href, label }) => {
            const active = href === "/" ? path === "/" : path.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  active ? "bg-gray-100 text-gray-900" : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
