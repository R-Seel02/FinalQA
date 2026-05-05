import { useState, useEffect } from 'react';
import { Bottle } from '../types';
import { api } from '../api/client';
import { BottleCard } from '../components/BottleCard';
import { ReservationModal } from '../components/ReservationModal';
import { useAuth } from '../context/AuthContext';

export function CatalogPage() {
  const { user } = useAuth();
  const [bottles, setBottles] = useState<Bottle[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Bottle | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .listCatalog(1, search || undefined)
      .then((res) => {
        if (!cancelled) {
          setBottles(res.items);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'failed to load catalog');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [search]);

  const canReserve = user?.role === 'customer';

  return (
    <div className="catalog-page">
      <header className="page-header">
        <h1>The Cellar</h1>
        <p>Curated bottles for the discerning host. Display, don't drink.</p>
      </header>
      <div className="controls">
        <input
          type="search"
          placeholder="Search by name or producer..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {confirmation && (
        <div className="banner success" role="status">
          {confirmation}
          <button onClick={() => setConfirmation(null)}>&times;</button>
        </div>
      )}
      {error && (
        <div className="banner error" role="alert">
          {error}
        </div>
      )}
      {loading ? (
        <p>Loading catalog...</p>
      ) : bottles.length === 0 ? (
        <p className="empty">No bottles match your search.</p>
      ) : (
        <div className="bottle-grid">
          {bottles.map((b) => (
            <BottleCard
              key={b._id}
              bottle={b}
              onSelect={canReserve ? setSelected : undefined}
            />
          ))}
        </div>
      )}
      {selected && (
        <ReservationModal
          bottle={selected}
          onClose={() => setSelected(null)}
          onSuccess={() => {
            setConfirmation(`Reserved ${selected.labelName} ${selected.vintage}`);
            setSelected(null);
          }}
        />
      )}
    </div>
  );
}
