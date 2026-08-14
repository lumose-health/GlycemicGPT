import type { CaregiverPatientStatus, LinkedPatient } from "@/lib/api";

export interface CaregiverDashboardProps {
  refreshIntervalMs?: number;
}

export interface PatientOverviewCardProps {
  patient: LinkedPatient;
  status: CaregiverPatientStatus | null;
  onSelect: (patientId: string) => void;
}
