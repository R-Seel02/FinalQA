import { useState, FormEvent } from 'react';
import { Bottle } from '../types';
import { api } from '../api/client';
import { formatCents } from '../utils/format';

interface Props {
  bottle: Bottle;
  onClose: () => void;
  onSuccess: () => void;
}

export function ReservationModal({ bottle, onClose, onSuccess }: Props) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);

  const [startDate, setStartDate] = useState(tomorrowStr);
  const [endDate, setEndDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Client-side preview of total. Server is authoritative.
  const nights =
    startDate && endDate
      ? Math.max(
          0,
          Math.round(
            (new Date(endDate).getTime() - new Date(startDate).getTime()) /
              (1000 * 60 * 60 * 24)
          )
        )
      : 0;
  const previewTotal = nights * bottle.pricePerNightCents;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.createReservation(
        bottle._id,
        new Date(startDate),
        new Date(endDate)
      );
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'reservation failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal">
        <header>
          <h2>
            Reserve {bottle.labelName} {bottle.vintage}
          </h2>
          <button onClick={onClose} aria-label="Close" className="close">
            &times;
          </button>
        </header>
        <form onSubmit={handleSubmit}>
          <label>
            Start date
            <input
              type="date"
              value={startDate}
              min={tomorrowStr}
              onChange={(e) => setStartDate(e.target.value)}
              required
            />
          </label>
          <label>
            End date
            <input
              type="date"
              value={endDate}
              min={startDate}
              onChange={(e) => setEndDate(e.target.value)}
              required
            />
          </label>
          {nights > 0 && (
            <div className="estimate">
              <div>
                <span>{nights} night{nights !== 1 ? 's' : ''} &times; {formatCents(bottle.pricePerNightCents)}</span>
                <strong>{formatCents(previewTotal)}</strong>
              </div>
              <div>
                <span>Refundable deposit</span>
                <strong>{formatCents(bottle.depositCents)}</strong>
              </div>
              <div className="total">
                <span>Charged today</span>
                <strong>{formatCents(previewTotal + bottle.depositCents)}</strong>
              </div>
            </div>
          )}
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          <div className="actions">
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" disabled={submitting || nights < 1} className="primary">
              {submitting ? 'Reserving...' : 'Confirm reservation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
