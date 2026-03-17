

export interface Job {
  id: string;
  title: string;
  companyId: string;
  companyName: string;
  description: string;
  location: string;
  hideTitleFromUser?: boolean;
  isGrouped?: boolean;
  offersTransportation?: boolean;
  transportationDepartureTime?: string;
  transportationDepartureLocation?: string;
  transportationNotes?: string;
}
