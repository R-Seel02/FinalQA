import { useState, FormEvent } from 'react';
import { api } from '../api/client';

type Mode = 'idle' | 'pickup' | 'return' | 'missing' | 'add-bottle';

export function StaffPage() {
  const [mode, setMode] = useState<Mode>('idle');
  const [resultMsg, setResultMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const reset = () => {
    setMode('idle');
    setResultMsg(null);
    setErrorMsg(null);
  };

  return (
    <div className="staff-page">
      <h1>Staff dashboard</h1>
      <p className="role-banner">Concierge actions: cellar operations and inspections.</p>

      <nav className="staff-actions">
        <button onClick={() => { reset(); setMode('pickup'); }}>Mark pickup</button>
        <button onClick={() => { reset(); setMode('return'); }}>Process return</button>
        <button onClick={() => { reset(); setMode('missing'); }}>Mark bottle missing</button>
        <button onClick={() => { reset(); setMode('add-bottle'); }}>Add bottle</button>
      </nav>

      {resultMsg && <div className="banner success" role="status">{resultMsg}</div>}
      {errorMsg && <div className="banner error" role="alert">{errorMsg}</div>}

      {mode === 'pickup' && (
        <PickupForm
          onSuccess={(msg) => { setResultMsg(msg); setMode('idle'); }}
          onError={setErrorMsg}
        />
      )}
      {mode === 'return' && (
        <ReturnForm
          onSuccess={(msg) => { setResultMsg(msg); setMode('idle'); }}
          onError={setErrorMsg}
        />
      )}
      {mode === 'missing' && (
        <MissingForm
          onSuccess={(msg) => { setResultMsg(msg); setMode('idle'); }}
          onError={setErrorMsg}
        />
      )}
      {mode === 'add-bottle' && (
        <AddBottleForm
          onSuccess={(msg) => { setResultMsg(msg); setMode('idle'); }}
          onError={setErrorMsg}
        />
      )}
    </div>
  );
}

interface ActionProps {
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

function PickupForm({ onSuccess, onError }: ActionProps) {
  const [reservationId, setReservationId] = useState('');
  const handle = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.pickupReservation(reservationId);
      onSuccess(`Marked reservation ${reservationId} as picked up.`);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'pickup failed');
    }
  };
  return (
    <form onSubmit={handle} className="staff-form">
      <h2>Mark pickup</h2>
      <label>
        Reservation ID
        <input value={reservationId} onChange={(e) => setReservationId(e.target.value)} required />
      </label>
      <button type="submit" className="primary">Confirm pickup</button>
    </form>
  );
}

function ReturnForm({ onSuccess, onError }: ActionProps) {
  const [reservationId, setReservationId] = useState('');
  const [sealIntact, setSealIntact] = useState(true);
  const [damageNotes, setDamageNotes] = useState('');

  const handle = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.processReturn(
        reservationId,
        sealIntact,
        damageNotes || undefined
      );
      const outcome = res.forfeiture?.outcome ?? 'unknown';
      onSuccess(
        outcome === 'clean'
          ? `Clean return processed. Deposit refunded.`
          : `Broken seal recorded. Deposit forfeited.`
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : 'return failed');
    }
  };

  return (
    <form onSubmit={handle} className="staff-form">
      <h2>Process return</h2>
      <label>
        Reservation ID
        <input value={reservationId} onChange={(e) => setReservationId(e.target.value)} required />
      </label>
      <fieldset>
        <legend>Seal inspection</legend>
        <label>
          <input
            type="radio"
            checked={sealIntact}
            onChange={() => setSealIntact(true)}
          />
          Seal intact (clean return)
        </label>
        <label>
          <input
            type="radio"
            checked={!sealIntact}
            onChange={() => setSealIntact(false)}
          />
          Seal broken (deposit forfeit)
        </label>
      </fieldset>
      <label>
        Inspection notes {!sealIntact && <span className="required">(required, ≥20 chars)</span>}
        <textarea
          value={damageNotes}
          onChange={(e) => setDamageNotes(e.target.value)}
          rows={3}
          required={!sealIntact}
          minLength={!sealIntact ? 20 : 0}
        />
      </label>
      <button type="submit" className="primary">
        {sealIntact ? 'Approve clean return' : 'Record broken seal'}
      </button>
    </form>
  );
}

function MissingForm({ onSuccess, onError }: ActionProps) {
  const [bottleId, setBottleId] = useState('');
  const [reason, setReason] = useState('');
  const handle = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.markBottleMissing(bottleId, reason);
      onSuccess(`Bottle ${bottleId} marked missing.`);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'mark missing failed');
    }
  };
  return (
    <form onSubmit={handle} className="staff-form">
      <h2>Mark bottle missing</h2>
      <label>
        Bottle ID
        <input value={bottleId} onChange={(e) => setBottleId(e.target.value)} required />
      </label>
      <label>
        Reason (≥20 chars)
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          minLength={20}
          required
        />
      </label>
      <button type="submit" className="primary">Mark missing</button>
    </form>
  );
}

function AddBottleForm({ onSuccess, onError }: ActionProps) {
  const [labelName, setLabelName] = useState('');
  const [producer, setProducer] = useState('');
  const [vintage, setVintage] = useState(2018);
  const [region, setRegion] = useState('');
  const [varietal, setVarietal] = useState('');
  const [photoUrl, setPhotoUrl] = useState('https://example.com/bottle.jpg');
  const [retailDollars, setRetailDollars] = useState(500);
  const [pricePerNightDollars, setPricePerNightDollars] = useState(50);

  const handle = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const created = await api.createBottle({
        labelName,
        producer,
        vintage,
        region,
        varietal,
        photoUrl,
        retailValueCents: Math.round(retailDollars * 100),
        pricePerNightCents: Math.round(pricePerNightDollars * 100)
      });
      onSuccess(`Added ${created.labelName} ${created.vintage} to inventory.`);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'create failed');
    }
  };

  return (
    <form onSubmit={handle} className="staff-form">
      <h2>Add bottle</h2>
      <div className="grid-2">
        <label>Label
          <input value={labelName} onChange={(e) => setLabelName(e.target.value)} required />
        </label>
        <label>Producer
          <input value={producer} onChange={(e) => setProducer(e.target.value)} required />
        </label>
        <label>Vintage
          <input type="number" min={1900} max={new Date().getFullYear()} value={vintage} onChange={(e) => setVintage(Number(e.target.value))} required />
        </label>
        <label>Region
          <input value={region} onChange={(e) => setRegion(e.target.value)} required />
        </label>
        <label>Varietal
          <input value={varietal} onChange={(e) => setVarietal(e.target.value)} required />
        </label>
        <label>Photo URL
          <input value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} required />
        </label>
        <label>Retail value (USD)
          <input type="number" min={1} step={0.01} value={retailDollars} onChange={(e) => setRetailDollars(Number(e.target.value))} required />
        </label>
        <label>Price per night (USD)
          <input type="number" min={1} step={0.01} value={pricePerNightDollars} onChange={(e) => setPricePerNightDollars(Number(e.target.value))} required />
        </label>
      </div>
      <p className="note">Deposit equals retail value (set automatically).</p>
      <button type="submit" className="primary">Add to catalog</button>
    </form>
  );
}
