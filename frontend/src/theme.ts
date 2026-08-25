import { useEffect, useState } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "eeg-viewer:theme";

function getStoredTheme(): Theme | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}

function getSystemTheme(): Theme {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // localStorage unavailable; theme still applies for this session
  }
}

/** Manages the light/dark theme: persists an explicit user choice, and
 * otherwise follows the OS preference live. */
export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => getStoredTheme() ?? getSystemTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (getStoredTheme()) return; // an explicit user choice overrides the OS setting
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setTheme(e.matches ? "dark" : "light");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  function toggle() {
    setTheme((t) => (t === "light" ? "dark" : "light"));
  }

  return [theme, toggle];
}

/**
 * Canvas drawing colors per theme. Kept in sync with the CSS custom
 * properties in styles.css so the EEG/spectrogram canvases (drawn with
 * the 2D context API, outside CSS's reach) match the surrounding chrome.
 */
export const CANVAS_COLORS = {
  light: {
    background: "#ffffff",
    gridStrong: "#e9ecef",
    gridWeak: "#f1f3f5",
    text: "#212529",
    mutedText: "#495057",
    badTrace: "#adb5bd",
    badLabel: "#d33d3d",
    badRowTint: "rgba(211, 61, 61, 0.06)",
    badSegmentFill: "rgba(211, 61, 61, 0.15)",
    badSegmentStroke: "rgba(211, 61, 61, 0.5)",
  },
  dark: {
    background: "#1a1a19",
    gridStrong: "#34342f",
    gridWeak: "#252521",
    text: "#f5f5f2",
    mutedText: "#c3c2b7",
    badTrace: "#716f66",
    badLabel: "#e66767",
    badRowTint: "rgba(230, 103, 103, 0.10)",
    badSegmentFill: "rgba(230, 103, 103, 0.18)",
    badSegmentStroke: "rgba(230, 103, 103, 0.55)",
  },
} as const;

/**
 * Validated categorical trace palette (dataviz skill reference palette),
 * fixed hue order for CVD-safety — never cycle or reassign by rank.
 */
export const TRACE_COLORS = {
  light: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"],
  dark: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"],
} as const;
