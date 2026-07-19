import { defineStore } from 'pinia';
import api from '../api/axios';

interface AuthState {
  token: string | null;
  role: string | null;
  mustChangePassword: boolean;
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    token: localStorage.getItem('token'),
    role: localStorage.getItem('role'),
    mustChangePassword: localStorage.getItem('mustChangePassword') === 'true',
  }),

  actions: {
    async login(username: string, password: string) {
      const res = await api.post('/auth/login', { username, password });
      this.token = res.data.token;
      this.role = res.data.role;
      this.mustChangePassword = res.data.mustChangePassword;

      localStorage.setItem('token', this.token!);
      localStorage.setItem('role', this.role!);
      localStorage.setItem('mustChangePassword', String(this.mustChangePassword));
    },

    logout() {
      this.token = null;
      this.role = null;
      this.mustChangePassword = false;
      localStorage.removeItem('token');
      localStorage.removeItem('role');
      localStorage.removeItem('mustChangePassword');
    },
  },
});