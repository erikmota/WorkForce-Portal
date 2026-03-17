import { Job } from './job.model';

export interface TimeSlot {
  id: string;
  startTime: Date;
  endTime: Date;
  job: Job;
  capacity: number;
  color?: string;
  requiredSkills?: string[];
  capacityMode?: 'activity' | 'skill';
  capacityBySkill?: Record<string, number>;
}
