import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BottleCard } from '../src/components/BottleCard';
import { LoginForm } from '../src/components/LoginForm';
import { AuthProvider } from '../src/context/AuthContext';
import { Bottle } from '../src/types';

// Mock the api client module
vi.mock('../src/api/client', () => ({
  api: {
    login: vi.fn(),
    register: vi.fn()
  },
  setAuthToken: vi.fn(),
  loadStoredToken: vi.fn(() => null)
}));

import { api } from '../src/api/client';

const mockBottle: Bottle = {
  _id: 'b1',
  labelName: 'Château Test',
  producer: 'Test Estate',
  vintage: 2018,
  region: 'Bordeaux',
  varietal: 'Cabernet',
  photoUrl: 'https://example.com/test.jpg',
  retailValueCents: 50000_00,
  pricePerNightCents: 100_00,
  depositCents: 50000_00,
  state: 'available'
};

describe('BottleCard', () => {
  it('displays bottle metadata', () => {
    render(<BottleCard bottle={mockBottle} />);
    expect(screen.getByText('Château Test')).toBeInTheDocument();
    expect(screen.getByText('2018')).toBeInTheDocument();
    expect(screen.getByText('Test Estate')).toBeInTheDocument();
    expect(screen.getByText(/\$100\.00/)).toBeInTheDocument();
  });

  it('shows the deposit amount as refundable', () => {
    render(<BottleCard bottle={mockBottle} />);
    expect(screen.getByText(/Deposit: \$50,000\.00 \(refundable\)/)).toBeInTheDocument();
  });

  it('renders Reserve button only when onSelect is provided', () => {
    const { rerender } = render(<BottleCard bottle={mockBottle} />);
    expect(screen.queryByRole('button', { name: /reserve/i })).not.toBeInTheDocument();
    rerender(<BottleCard bottle={mockBottle} onSelect={() => {}} />);
    expect(screen.getByRole('button', { name: /reserve/i })).toBeInTheDocument();
  });

  it('calls onSelect when Reserve is clicked', async () => {
    const onSelect = vi.fn();
    render(<BottleCard bottle={mockBottle} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole('button', { name: /reserve/i }));
    expect(onSelect).toHaveBeenCalledWith(mockBottle);
  });
});

describe('LoginForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('submits credentials and routes on success', async () => {
    (api.login as ReturnType<typeof vi.fn>).mockResolvedValue({
      token: 'tok',
      user: { id: 'u1', email: 'a@b.com', role: 'customer' }
    });
    const onSuccess = vi.fn();
    render(
      <AuthProvider>
        <LoginForm onSuccess={onSuccess} />
      </AuthProvider>
    );

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'a@b.com' }
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'StrongPass1!' }
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(api.login).toHaveBeenCalledWith('a@b.com', 'StrongPass1!');
    });
    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith('customer');
    });
  });

  it('displays error message on auth failure', async () => {
    (api.login as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('invalid credentials')
    );
    render(
      <AuthProvider>
        <LoginForm onSuccess={() => {}} />
      </AuthProvider>
    );
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'a@b.com' }
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'wrong' }
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('invalid credentials');
    });
  });
});
