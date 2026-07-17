import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: number;
  username: string;
  role: string;
}

interface AuthState {
  token: string | null;
  user: User | null;
  setAuth: (token: string, user: User) => void;
  logout: () => void;
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setAuth: (token, user) => set({ token, user }),
      logout: () => set({ token: null, user: null }),
    }),
    { name: 'oj-auth' },
  ),
);

interface ThemeState {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}

export const useTheme = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'light',
      toggleTheme: () => set({ theme: get().theme === 'light' ? 'dark' : 'light' }),
    }),
    { name: 'oj-theme' },
  ),
);

interface ProblemBankState {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export const useProblemBank = create<ProblemBankState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
