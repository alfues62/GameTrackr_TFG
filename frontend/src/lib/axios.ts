import axios from "axios";
import { getSession, signOut } from "next-auth/react";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000",
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use(async (cfg) => {
  const session = await getSession();
  const token = (session as { accessToken?: string } | null)?.accessToken;
  if (token) {
    cfg.headers.Authorization = `Bearer ${token}`;
  }
  if (typeof FormData !== "undefined" && cfg.data instanceof FormData) {
    delete cfg.headers["Content-Type"];
  }
  return cfg;
});

let signingOut = false;
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const status = (error as { response?: { status?: number } })?.response?.status;
    if (status === 401 && typeof window !== "undefined" && !signingOut) {
      const session = await getSession();
      if (session) {
        signingOut = true;
        await signOut({ callbackUrl: "/" });
      }
    }
    return Promise.reject(error);
  }
);

export function asList<T>(data: T[] | { results?: T[] } | null | undefined): T[] {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  return data.results ?? [];
}

export type Paginated<T> = { count: number; next: string | null; previous: string | null; results: T[] };

export async function fetchAll<T>(url: string, params: Record<string, unknown> = {}): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page <= 25; page++) {
    const res = await api.get<T[] | Paginated<T>>(url, { params: { ...params, page, page_size: 200 } });
    const data = res.data;
    if (Array.isArray(data)) return data;
    out.push(...(data.results ?? []));
    if (!data.next) break;
  }
  return out;
}

export default api;
