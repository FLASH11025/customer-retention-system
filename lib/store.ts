import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  ModelMetrics,
  PredictionItem,
  PredictionSummary,
  BackendHealth,
} from "./api";

export interface FilterState {
  search: string;
  riskLevels: string[];
  plans: string[];
  predictionStatus: "ALL" | "STAY" | "LEAVE";
}

interface AppStore {
  // Model state
  metrics: ModelMetrics | null;
  setMetrics: (metrics: ModelMetrics | null) => void;

  // Predictions state
  predictions: PredictionItem[] | null;
  summary: PredictionSummary | null;
  setPredictionResults: (
    summary: PredictionSummary | null,
    predictions: PredictionItem[] | null
  ) => void;

  // Active decision threshold (0.05 to 0.95)
  threshold: number;
  setThreshold: (threshold: number) => void;

  // Retention playbook completed customer IDs
  retentionDone: Record<string, boolean>;
  toggleRetentionDone: (customerId: string) => void;

  // Customer table filters
  filters: FilterState;
  setFilters: (filters: Partial<FilterState>) => void;
  resetFilters: () => void;

  // Backend connectivity (null = unknown, true/false = online/offline)
  backendOnline: boolean | null;
  setBackendOnline: (online: boolean | null) => void;
  backendHealth: BackendHealth | null;
  setBackendHealth: (health: BackendHealth | null) => void;

  // Theme state
  theme: "light" | "dark";
  toggleTheme: () => void;
  setTheme: (theme: "light" | "dark") => void;

  // Clear session
  clearSessionData: () => void;
}

const defaultFilters: FilterState = {
  search: "",
  riskLevels: [],
  plans: [],
  predictionStatus: "ALL",
};

/**
 * Quota-safe localStorage wrapper. localStorage (unlike sessionStorage)
 * survives reloads, new tabs, and browser restarts, so a scored cohort is not
 * lost when the user opens Risk Radar / Customers elsewhere. Very large
 * prediction batches could exceed the ~5MB origin quota; in that case we
 * silently keep state in memory only instead of crashing the score flow.
 */
const safeWindowStorage = {
  getItem: (name: string): string | null => {
    try {
      if (typeof window === "undefined") return null;
      return window.localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name: string, value: string): void => {
    try {
      if (typeof window === "undefined") return;
      window.localStorage.setItem(name, value);
    } catch {
      // Quota exceeded or storage blocked — state stays in memory for this
      // session; the backend keeps the last batch too (GET /predict/last).
    }
  },
  removeItem: (name: string): void => {
    try {
      if (typeof window === "undefined") return;
      window.localStorage.removeItem(name);
    } catch {
      // noop
    }
  },
};

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      metrics: null,
      setMetrics: (metrics) => set({ metrics }),

      predictions: null,
      summary: null,
      setPredictionResults: (summary, predictions) =>
        set({ summary, predictions }),

      threshold: 0.5,
      setThreshold: (threshold) => set({ threshold }),

      backendOnline: null,
      setBackendOnline: (online) => set({ backendOnline: online }),
      backendHealth: null,
      setBackendHealth: (health) => set({ backendHealth: health }),

      retentionDone: {},
      toggleRetentionDone: (customerId) => {
        const current = get().retentionDone;
        set({
          retentionDone: {
            ...current,
            [customerId]: !current[customerId],
          },
        });
      },

      filters: defaultFilters,
      setFilters: (newFilters) =>
        set({
          filters: { ...get().filters, ...newFilters },
        }),
      resetFilters: () => set({ filters: defaultFilters }),

      theme: "light",
      toggleTheme: () => {
        const next = get().theme === "light" ? "dark" : "light";
        set({ theme: next });
        if (typeof document !== "undefined") {
          document.documentElement.classList.toggle("dark", next === "dark");
        }
      },
      setTheme: (theme) => {
        set({ theme });
        if (typeof document !== "undefined") {
          document.documentElement.classList.toggle("dark", theme === "dark");
        }
      },

      clearSessionData: () =>
        set({
          predictions: null,
          summary: null,
          retentionDone: {},
          filters: defaultFilters,
          threshold: 0.5,
        }),
    }),
    {
      name: "predictchurn-storage-v2",
      storage: createJSONStorage(() => safeWindowStorage),
      partialize: (state) => ({
        predictions: state.predictions,
        summary: state.summary,
        threshold: state.threshold,
        retentionDone: state.retentionDone,
        theme: state.theme,
        filters: state.filters,
      }),
    }
  )
);
