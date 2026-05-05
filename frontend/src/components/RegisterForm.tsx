import { useState, FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';

interface Props {
  onSuccess: () => void;
}

export function RegisterForm({ onSuccess }: Props) {
  const { register } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [shippingAddress, setShippingAddress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await register(email, password, shippingAddress);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'registration failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="auth-form" aria-label="Registration form">
      <h2>Create an account</h2>
      <label>
        Email
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
      </label>
      <label>
        Password
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="new-password"
        />
        <small>
          At least 8 characters with one uppercase letter, one digit, and one
          symbol from !@#$%^&amp;*.
        </small>
      </label>
      <label>
        Shipping address
        <input
          type="text"
          value={shippingAddress}
          onChange={(e) => setShippingAddress(e.target.value)}
        />
      </label>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <button type="submit" disabled={submitting}>
        {submitting ? 'Creating...' : 'Create account'}
      </button>
    </form>
  );
}
