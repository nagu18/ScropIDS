import axios, { AxiosError } from "axios";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";
const ORG_STORAGE_KEY = "scropids.active_org_slug";

export const api = axios.create({
  baseURL: API_BASE_URL,
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

export function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<{ detail?: string }>;
    return axiosError.response?.data?.detail ?? axiosError.message;
  }
  return "Unexpected error.";
}
