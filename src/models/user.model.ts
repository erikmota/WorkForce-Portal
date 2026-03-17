export interface User {
  id: string;
  username: string;
  name: string;
  password: string; // In a real app, this would be a hash.
  dailyRate?: number;
  needsOnboarding?: boolean;
  isGlobalAdmin?: boolean;
  rolesByCompany?: Record<string, 'user' | 'company-admin'>;
  statusByCompany?: Record<string, 'active' | 'inactive'>;
  notifications?: string[];
  companyIds?: string[];
  skillsByCompany?: Record<string, string[]>; // Key: companyId, Value: array of skill names
  profilePictureUrl?: string;
  phone?: string;
  address?: {
    street?: string;
    number?: string;
    complement?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
    zipCode?: string;
  };
  bankDetails?: {
    bank?: string;
    agency?: string;
    account?: string;
    pixKey?: string;
  };
  passwordResetToken?: string;
  passwordResetTokenExpires?: Date;
}
