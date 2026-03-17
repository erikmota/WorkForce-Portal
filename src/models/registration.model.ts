import { User } from './user.model';
import { Job } from './job.model';

export interface Registration {
  id: string;
  slotId: string;
  job: Job;
  startTime: Date;
  endTime: Date;
  user: User;
  status: 'pending' | 'approved' | 'not-selected';
  comment?: string;
  needsTransportation?: boolean;
  transportationNotes?: string;
  registeredWithSkill?: string;
}
