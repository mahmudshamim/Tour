"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";

type Theme = "light" | "dark";

const KEY = "terra.theme.v1";

const ThemeCtx = createContext<{
  theme: Theme;
  toggle: () => void;
}>({ theme: "light", toggle: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Default = light (solid white), even if the device prefers dark. The
  // choice is remembered per device; read after mount so the server's
  // first paint and the browser's agree.
  const [theme, setTheme] = useState<Theme>("light");
  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) === "dark") setTheme("dark");
    } catch {
      /* private mode */
    }
  }, []);
  const toggle = useCallback(
    () =>
      setTheme((t) => {
        const next = t === "light" ? "dark" : "light";
        try {
          localStorage.setItem(KEY, next);
        } catch {
          /* private mode */
        }
        return next;
      }),
    []
  );
  return (
    <ThemeCtx.Provider value={{ theme, toggle }}>{children}</ThemeCtx.Provider>
  );
}

export const useTheme = () => useContext(ThemeCtx);
