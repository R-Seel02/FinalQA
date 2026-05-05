import { Request } from 'express';

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

export type InspectionOutcome = 'clean' | 'broken_seal' | 'damaged' | 'missing';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}
