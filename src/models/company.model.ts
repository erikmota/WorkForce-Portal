export interface Company {
  id: string;
  name: string;
  address?: string;
  city?: string;
  state?: string;
  phone1?: string;
  phone2?: string;
  email?: string;
  contactName?: string;
  contractType?: 'monthly' | 'anual' | 'other';
  contractValue?: number;
  bannerImageUrl?: string;
  defaultStartTime?: string;
  defaultEndTime?: string;
  maxMonthlyHiresPerUser?: number;
}
