import { useState, useEffect, useCallback } from 'react';
import { Reservation, Bottle } from '../types';
import { api } from '../api/client';
import { formatCents, formatDate } from '../utils/format';

export function MyRentalsPage() {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    api
      .myReservations()
      .then((res) => {
        setReservations(res.items);
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'failed to load');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCancel = async (id: string) => {
    if (!window.confirm('Cancel this reservation? Your deposit and rental fee will be refunded.')) {
      return;
    }
    try {
      await api.cancelReservation(id);
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'cancellation failed');
    }
  };

  if (loading) return <p>Loading...</p>;

  return (
    <div className="my-rentals-page">
      <h1>My rentals</h1>
      {error && <div className="banner error">{error}</div>}
      {reservations.length === 0 ? (
        <p>You have no active or upcoming reservations.</p>
      ) : (
        <ul className="reservation-list">
          {reservations.map((r) => {
            const bottle = typeof r.bottleId === 'object' ? (r.bottleId as Bottle) : null;
            return (
              <li key={r._id} className={`reservation reservation-${r.state}`}>
                <div className="reservation-header">
                  <h3>
                    {bottle ? `${bottle.labelName} ${bottle.vintage}` : 'Bottle'}
                  </h3>
                  <span className={`badge badge-${r.state}`}>{r.state}</span>
                </div>
                <p>
                  {formatDate(r.startDate)} &mdash; {formatDate(r.endDate)}
                </p>
                <p>
                  Rental: {formatCents(r.totalRentalCents)} &middot; Deposit:{' '}
                  {formatCents(r.depositCents)}
                </p>
                {r.state === 'reserved' && (
                  <button onClick={() => handleCancel(r._id)}>Cancel</button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
