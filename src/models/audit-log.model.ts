export interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  timestamp: Date;
  fieldName: string;
  oldValue: string;
  newValue: string;
  changedBy: string; // User ID of who made the change (admin or user themselves)
  changedByName: string;
}
