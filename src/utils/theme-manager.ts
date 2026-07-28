

export type Theme = "github-dark" | "github-lite";

const STORAGE_KEY = "restic-browser-theme";


const themes: Record<Theme, Record<string, string>> = {
  "github-dark": {
    "--lumo-base-color": "#0d1117",
    "--lumo-tint-5pct": "rgba(201, 209, 217, 0.05)",
    "--lumo-tint-10pct": "rgba(201, 209, 217, 0.10)",
    "--lumo-tint-20pct": "rgba(201, 209, 217, 0.20)",
    "--lumo-tint-30pct": "rgba(201, 209, 217, 0.30)",
    "--lumo-tint-40pct": "rgba(201, 209, 217, 0.40)",
    "--lumo-tint-50pct": "rgba(201, 209, 217, 0.50)",
    "--lumo-tint-60pct": "rgba(201, 209, 217, 0.60)",
    "--lumo-tint-70pct": "rgba(201, 209, 217, 0.70)",
    "--lumo-tint-80pct": "rgba(201, 209, 217, 0.80)",
    "--lumo-tint-90pct": "rgba(201, 209, 217, 0.90)",
    "--lumo-tint": "#c9d1d9",
    "--lumo-shade-5pct": "rgba(0, 0, 0, 0.15)",
    "--lumo-shade-10pct": "rgba(0, 0, 0, 0.25)",
    "--lumo-shade-20pct": "rgba(0, 0, 0, 0.35)",
    "--lumo-shade-30pct": "rgba(0, 0, 0, 0.45)",
    "--lumo-shade-40pct": "rgba(0, 0, 0, 0.55)",
    "--lumo-shade-50pct": "rgba(0, 0, 0, 0.65)",
    "--lumo-shade-60pct": "rgba(0, 0, 0, 0.75)",
    "--lumo-shade-70pct": "rgba(0, 0, 0, 0.85)",
    "--lumo-shade-80pct": "rgba(0, 0, 0, 0.90)",
    "--lumo-shade-90pct": "rgba(0, 0, 0, 0.95)",
    "--lumo-shade": "#000000",
    "--lumo-contrast-5pct": "rgba(201, 209, 217, 0.05)",
    "--lumo-contrast-10pct": "rgba(201, 209, 217, 0.10)",
    "--lumo-contrast-20pct": "rgba(201, 209, 217, 0.20)",
    "--lumo-contrast-30pct": "rgba(201, 209, 217, 0.30)",
    "--lumo-contrast-40pct": "rgba(201, 209, 217, 0.40)",
    "--lumo-contrast-50pct": "rgba(201, 209, 217, 0.50)",
    "--lumo-contrast-60pct": "rgba(201, 209, 217, 0.60)",
    "--lumo-contrast-70pct": "rgba(201, 209, 217, 0.70)",
    "--lumo-contrast-80pct": "rgba(201, 209, 217, 0.80)",
    "--lumo-contrast-90pct": "rgba(201, 209, 217, 0.90)",
    "--lumo-contrast": "#c9d1d9",
    "--lumo-header-text-color": "#f0f6fc",
    "--lumo-body-text-color": "#c9d1d9",
    "--lumo-secondary-text-color": "#8b949e",
    "--lumo-tertiary-text-color": "#6e7681",
    "--lumo-disabled-text-color": "#484f58",
    "--lumo-primary-color": "#8b949e",
    "--lumo-primary-color-50pct": "rgba(139, 148, 158, 0.5)",
    "--lumo-primary-color-10pct": "rgba(139, 148, 158, 0.1)",
    "--lumo-primary-text-color": "#8b949e",
    "--lumo-primary-contrast-color": "#0d1117",
    "--lumo-error-color": "#f85149",
    "--lumo-error-color-50pct": "rgba(248, 81, 73, 0.5)",
    "--lumo-error-color-10pct": "rgba(248, 81, 73, 0.1)",
    "--lumo-error-text-color": "#f85149",
    "--lumo-success-color": "#3fb950",
    "--lumo-success-color-50pct": "rgba(63, 185, 80, 0.5)",
    "--lumo-success-color-10pct": "rgba(63, 185, 80, 0.1)",
    "--lumo-success-text-color": "#3fb950",
    "color-scheme": "dark",
  },
  "github-lite": {
    "--lumo-base-color": "#fafafa",
    "--lumo-tint-5pct": "rgba(39, 39, 42, 0.05)",
    "--lumo-tint-10pct": "rgba(39, 39, 42, 0.10)",
    "--lumo-tint-20pct": "rgba(39, 39, 42, 0.20)",
    "--lumo-tint-30pct": "rgba(39, 39, 42, 0.30)",
    "--lumo-tint-40pct": "rgba(39, 39, 42, 0.40)",
    "--lumo-tint-50pct": "rgba(39, 39, 42, 0.50)",
    "--lumo-tint-60pct": "rgba(39, 39, 42, 0.60)",
    "--lumo-tint-70pct": "rgba(39, 39, 42, 0.70)",
    "--lumo-tint-80pct": "rgba(39, 39, 42, 0.80)",
    "--lumo-tint-90pct": "rgba(39, 39, 42, 0.90)",
    "--lumo-tint": "#27272a",
    "--lumo-shade-5pct": "rgba(255, 255, 255, 0.05)",
    "--lumo-shade-10pct": "rgba(255, 255, 255, 0.10)",
    "--lumo-shade-20pct": "rgba(255, 255, 255, 0.20)",
    "--lumo-shade-30pct": "rgba(255, 255, 255, 0.30)",
    "--lumo-shade-40pct": "rgba(255, 255, 255, 0.40)",
    "--lumo-shade-50pct": "rgba(255, 255, 255, 0.50)",
    "--lumo-shade-60pct": "rgba(255, 255, 255, 0.60)",
    "--lumo-shade-70pct": "rgba(255, 255, 255, 0.70)",
    "--lumo-shade-80pct": "rgba(255, 255, 255, 0.80)",
    "--lumo-shade-90pct": "rgba(255, 255, 255, 0.90)",
    "--lumo-shade": "#ffffff",
    "--lumo-contrast-5pct": "rgba(39, 39, 42, 0.05)",
    "--lumo-contrast-10pct": "rgba(39, 39, 42, 0.10)",
    "--lumo-contrast-20pct": "rgba(39, 39, 42, 0.20)",
    "--lumo-contrast-30pct": "rgba(39, 39, 42, 0.30)",
    "--lumo-contrast-40pct": "rgba(39, 39, 42, 0.40)",
    "--lumo-contrast-50pct": "rgba(39, 39, 42, 0.50)",
    "--lumo-contrast-60pct": "rgba(39, 39, 42, 0.60)",
    "--lumo-contrast-70pct": "rgba(39, 39, 42, 0.70)",
    "--lumo-contrast-80pct": "rgba(39, 39, 42, 0.80)",
    "--lumo-contrast-90pct": "rgba(39, 39, 42, 0.90)",
    "--lumo-contrast": "#27272a",
    "--lumo-header-text-color": "#18181b",
    "--lumo-body-text-color": "#27272a",
    "--lumo-secondary-text-color": "#71717a",
    "--lumo-tertiary-text-color": "#a1a1aa",
    "--lumo-disabled-text-color": "#d4d4d8",
    "--lumo-primary-color": "#52525b",
    "--lumo-primary-color-50pct": "rgba(82, 82, 91, 0.5)",
    "--lumo-primary-color-10pct": "rgba(82, 82, 91, 0.1)",
    "--lumo-primary-text-color": "#52525b",
    "--lumo-primary-contrast-color": "#fafafa",
    "--lumo-error-color": "#dc2626",
    "--lumo-error-color-50pct": "rgba(220, 38, 38, 0.5)",
    "--lumo-error-color-10pct": "rgba(220, 38, 38, 0.1)",
    "--lumo-error-text-color": "#dc2626",
    "--lumo-success-color": "#16a34a",
    "--lumo-success-color-50pct": "rgba(22, 163, 74, 0.5)",
    "--lumo-success-color-10pct": "rgba(22, 163, 74, 0.1)",
    "--lumo-success-text-color": "#16a34a",
    "color-scheme": "light",
  },
};


export function getSavedTheme(): Theme {
  if (typeof localStorage !== "undefined") {
    const saved = localStorage.getItem(STORAGE_KEY) as Theme;
    if (saved && themes[saved]) {
      return saved;
    }
  }
  return "github-lite";
}


export function saveTheme(theme: Theme): void {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(STORAGE_KEY, theme);
  }
}


export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  const themeVars = themes[theme];
  
  if (!themeVars) {
    console.error(`Unknown theme: ${theme}`);
    return;
  }
  
  
  Object.entries(themeVars).forEach(([key, value]) => {
    if (key === "color-scheme") {
      root.style.colorScheme = value;
    } else {
      root.style.setProperty(key, value);
    }
  });
  
  
  saveTheme(theme);
  
  
  window.dispatchEvent(new CustomEvent("theme-changed", { detail: { theme } }));
}


export function toggleTheme(): Theme {
  const currentTheme = getSavedTheme();
  const newTheme: Theme = currentTheme === "github-dark" ? "github-lite" : "github-dark";
  applyTheme(newTheme);
  return newTheme;
}


export function initTheme(): void {
  const theme = getSavedTheme();
  applyTheme(theme);
}
