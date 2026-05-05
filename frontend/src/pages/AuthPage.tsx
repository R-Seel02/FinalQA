import { useState } from 'react';
import { LoginForm } from '../components/LoginForm';
import { RegisterForm } from '../components/RegisterForm';

interface Props {
  onAuthenticated: (role: 'customer' | 'concierge') => void;
}

export function AuthPage({ onAuthenticated }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('login');

  return (
    <div className="auth-page">
      <div className="auth-tabs">
        <button
          className={mode === 'login' ? 'active' : ''}
          onClick={() => setMode('login')}
        >
          Sign in
        </button>
        <button
          className={mode === 'register' ? 'active' : ''}
          onClick={() => setMode('register')}
        >
          Create account
        </button>
      </div>
      {mode === 'login' ? (
        <LoginForm onSuccess={onAuthenticated} />
      ) : (
        <RegisterForm onSuccess={() => onAuthenticated('customer')} />
      )}
    </div>
  );
}
