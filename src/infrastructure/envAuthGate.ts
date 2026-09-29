import type { AuthGate } from '../repositories/authGate';

export class EnvCredentialsAuthGate implements AuthGate {
  private static readonly STORAGE_KEY = 'ftm_env_auth';

  async isAuthenticated(): Promise<boolean> {
    const token = localStorage.getItem(EnvCredentialsAuthGate.STORAGE_KEY);
    return token === 'authenticated_organizer';
  }

  async getOrganizerId(): Promise<string | null> {
    const isAuth = await this.isAuthenticated();
    return isAuth ? 'env-organizer-id' : null;
  }

  login(usernameInput: string, passwordInput: string): boolean {
    const expectedUsername = import.meta.env.VITE_ORGANIZER_USERNAME || 'admin';
    const expectedPassword = import.meta.env.VITE_ORGANIZER_PASSWORD || 'password123';

    if (usernameInput === expectedUsername && passwordInput === expectedPassword) {
      localStorage.setItem(EnvCredentialsAuthGate.STORAGE_KEY, 'authenticated_organizer');
      return true;
    }
    return false;
  }

  logout(): void {
    localStorage.removeItem(EnvCredentialsAuthGate.STORAGE_KEY);
  }
}
