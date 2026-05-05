import { ApiError, Bottle, Reservation, User } from '../types';

const BASE_URL = '/api';

let authToken: string | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
  if (token) {
    localStorage.setItem('wine-rental-token', token);
  } else {
    localStorage.removeItem('wine-rental-token');
  }
}

export function loadStoredToken(): string | null {
  const stored = localStorage.getItem('wine-rental-token');
  if (stored) authToken = stored;
  return stored;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await res.text();
  const data: unknown = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const errorBody = data as ApiError;
    const message = errorBody?.error?.message || `request failed (${res.status})`;
    const error = new Error(message) as Error & { status?: number; code?: string };
    error.status = res.status;
    error.code = errorBody?.error?.code;
    throw error;
  }
  return data as T;
}

interface AuthResponse {
  token: string;
  user: User;
}

export const api = {
  // Auth
  register: (email: string, password: string, shippingAddress?: string) =>
    request<AuthResponse>('POST', '/auth/register', {
      email,
      password,
      shippingAddress
    }),

  login: (email: string, password: string) =>
    request<AuthResponse>('POST', '/auth/login', { email, password }),

  // Catalog
  listCatalog: (page = 1, search?: string) => {
    const params = new URLSearchParams({ page: String(page) });
    if (search) params.set('search', search);
    return request<{
      items: Bottle[];
      pagination: {
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
      };
    }>('GET', `/catalog?${params.toString()}`);
  },

  getBottle: (id: string) => request<Bottle>('GET', `/catalog/${id}`),

  // Reservations
  createReservation: (bottleId: string, startDate: Date, endDate: Date) =>
    request<Reservation>('POST', '/reservations', {
      bottleId,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString()
    }),

  cancelReservation: (id: string) =>
    request<Reservation>('DELETE', `/reservations/${id}`),

  myReservations: () =>
    request<{ items: Reservation[] }>('GET', '/reservations/me'),

  // Concierge actions
  createBottle: (input: {
    labelName: string;
    producer: string;
    vintage: number;
    region: string;
    varietal: string;
    photoUrl: string;
    retailValueCents: number;
    pricePerNightCents: number;
  }) => request<Bottle>('POST', '/bottles', input),

  pickupReservation: (id: string) =>
    request<Reservation>('POST', `/reservations/${id}/pickup`),

  processReturn: (id: string, sealIntact: boolean, damageNotes?: string) =>
    request<Reservation>('POST', `/reservations/${id}/return`, {
      sealIntact,
      damageNotes
    }),

  markBottleMissing: (id: string, reason: string) =>
    request<{ bottleId: string; reservationId: string }>(
      'POST',
      `/bottles/${id}/mark-missing`,
      { reason }
    )
};
