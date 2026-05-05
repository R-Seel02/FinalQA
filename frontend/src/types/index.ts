export type UserRole = 'customer' | 'concierge';

export type BottleState =
  | 'available'
  | 'reserved'
  | 'out'
  | 'damaged'
  | 'missing'
  | 'retired';

export type ReservationState =
  | 'reserved'
  | 'out'
  | 'returned'
  | 'cancelled'
  | 'reassigned';

export interface User {
  id: string;
  email: string;
  role: UserRole;
}

export interface Bottle {
  _id: string;
  labelName: string;
  producer: string;
  vintage: number;
  region: string;
  varietal: string;
  photoUrl: string;
  retailValueCents: number;
  pricePerNightCents: number;
  depositCents: number;
  state: BottleState;
}

export interface FinancialEvent {
  kind: string;
  amountCents: number;
  at: string;
  reference: string;
}

export interface ForfeitureRecord {
  outcome: 'clean' | 'broken_seal' | 'damaged' | 'missing';
  inspectorId: string;
  inspectedAt: string;
  notes: string;
}

export interface Reservation {
  _id: string;
  customerId: string;
  bottleId: string | Bottle;
  startDate: string;
  endDate: string;
  pricePerNightCents: number;
  depositCents: number;
  totalRentalCents: number;
  state: ReservationState;
  events: FinancialEvent[];
  forfeiture?: ForfeitureRecord;
  lateFeesAccruedCents: number;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
