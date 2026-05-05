import { Bottle } from '../types';
import { formatCents } from '../utils/format';

interface Props {
  bottle: Bottle;
  onSelect?: (bottle: Bottle) => void;
}

export function BottleCard({ bottle, onSelect }: Props) {
  return (
    <article className="bottle-card" data-testid="bottle-card">
      <img
        src={bottle.photoUrl}
        alt={`${bottle.labelName} ${bottle.vintage}`}
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
        }}
      />
      <h3>
        {bottle.labelName} <span className="vintage">{bottle.vintage}</span>
      </h3>
      <p className="producer">{bottle.producer}</p>
      <p className="region">
        {bottle.region} &middot; {bottle.varietal}
      </p>
      <div className="pricing">
        <div>
          <strong>{formatCents(bottle.pricePerNightCents)}</strong>
          <span> / night</span>
        </div>
        <div className="deposit">
          Deposit: {formatCents(bottle.depositCents)} (refundable)
        </div>
      </div>
      {onSelect && (
        <button onClick={() => onSelect(bottle)} className="primary">
          Reserve
        </button>
      )}
    </article>
  );
}
