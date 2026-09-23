export type AppRole = 'pending' | 'bd_user' | 'root_admin';

export type AuthUser = {
  id: string;
  email: string;
  role: AppRole;
  full_name: string | null;
};

declare global {
  namespace Express {
    interface Request {
      auth?: AuthUser;
    }
  }
}

export {};
