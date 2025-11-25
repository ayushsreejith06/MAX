"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Prevent hydration mismatch by not rendering until mounted
  if (!mounted) {
    return (
      <button
        className="p-2 rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors"
        aria-label="Toggle theme"
      >
        🌙
      </button>
    );
  }

  const currentTheme = theme || "dark";

  return (
    <button
      onClick={() => setTheme(currentTheme === "dark" ? "light" : "dark")}
      className="p-2 rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
      aria-label={`Switch to ${currentTheme === "dark" ? "light" : "dark"} mode`}
    >
      {currentTheme === "dark" ? "🌙" : "☀️"}
    </button>
  );
}

