import axios, { AxiosError } from "axios";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";
const ORG_STORAGE_KEY = "scropids.active_org_slug";
const API_BASE_SUFFIX = /\/api\/v1\/?$/;
const LOCAL_DEV_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function resolveApiBaseUrl(): string {
  if (typeof window === "undefined") {
    return API_BASE_URL;
  }

  try {
    const parsed = new URL(API_BASE_URL);
    if (LOCAL_DEV_HOSTS.has(window.location.hostname) && LOCAL_DEV_HOSTS.has(parsed.hostname)) {
      return "/api/v1";
    }
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return API_BASE_URL;
  }
}

const RESOLVED_API_BASE_URL = resolveApiBaseUrl();

export const api = axios.create({
  baseURL: RESOLVED_API_BASE_URL,
  withCredentials: true,
  xsrfCookieName: "csrftoken",
  xsrfHeaderName: "X-CSRFToken",
});

api.interceptors.request.use((config) => {
  const orgSlug = localStorage.getItem(ORG_STORAGE_KEY);
  if (orgSlug) {
    config.headers["X-Organization-Slug"] = orgSlug;
  }
  return config;
});

export function setActiveOrgSlug(slug: string): void {
  localStorage.setItem(ORG_STORAGE_KEY, slug);
}

export function getActiveOrgSlug(): string | null {
  return localStorage.getItem(ORG_STORAGE_KEY);
}

export function clearActiveOrgSlug(): void {
  localStorage.removeItem(ORG_STORAGE_KEY);
}

export function adminUrl(path = "/admin/"): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (!/^https?:\/\//i.test(RESOLVED_API_BASE_URL)) {
    return normalizedPath;
  }

  const backendBaseUrl = RESOLVED_API_BASE_URL.replace(API_BASE_SUFFIX, "");
  return `${backendBaseUrl}${normalizedPath}`;
}

export function agentApiBaseUrl(): string {
  if (/^https?:\/\//i.test(RESOLVED_API_BASE_URL)) {
    return RESOLVED_API_BASE_URL.replace(/\/$/, "");
  }

  if (typeof window !== "undefined") {
    const normalized = RESOLVED_API_BASE_URL.startsWith("/") ? RESOLVED_API_BASE_URL : `/${RESOLVED_API_BASE_URL}`;
    return `${window.location.origin}${normalized}`.replace(/\/$/, "");
  }

  return "http://localhost:8000/api/v1";
}

export function browserDownloadUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (typeof window !== "undefined") {
    return `${window.location.origin}${normalizedPath}`;
  }

  if (/^https?:\/\//i.test(RESOLVED_API_BASE_URL)) {
    const backendBaseUrl = RESOLVED_API_BASE_URL.replace(API_BASE_SUFFIX, "");
    return `${backendBaseUrl}${normalizedPath}`;
  }

  return normalizedPath;
}

export function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<{ detail?: string }>;
    return axiosError.response?.data?.detail ?? axiosError.message;
  }
  return "Unexpected error.";
}
