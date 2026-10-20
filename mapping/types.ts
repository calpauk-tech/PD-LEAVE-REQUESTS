export interface EntityRecord {
  id: number | string;
  firstName: string;
  lastName: string;
  identifier?: string; // e.g., Payroll ID or External ID
  email?: string;
  department?: string;
  departmentId?: number;
}

export interface TargetFieldDefinition {
  key: string;            // System field name (e.g., 'email', 'salary', 'custom_123')
  label: string;          // Human-readable label (e.g., 'Email Address')
  type: 'Text' | 'Numeric' | 'Date' | 'Boolean' | 'Dropdown';
  required?: boolean;
  dropdownOptions?: string[];
  category?: string;
  description?: string;
}

export interface DiscrepancyItem {
  rowIndex: number;
  rowNumber: number;
  idValue: string;
  expectedName: string;
  uploadedName: string;
}

export type MatchStatus = 'exact' | 'auto' | 'manual' | 'unmapped';

export type IdentityMethod = 'system_id' | 'salary_and_name';

export interface IdentityConfig {
  method: IdentityMethod;
  idColumn?: string; // Employee API ID
  salaryIdColumn?: string; // Salary Identifier (required for salary_and_name)
  nameFormat?: 'single' | 'split';
  fullNameColumn?: string; // Employee Name (required for single format)
  firstNameColumn?: string; // First Name (for split format)
  lastNameColumn?: string; // Last Name (for split format)
  crossCheckNameColumn?: string;
  enableCrossCheck?: boolean;
}

export interface RowEmployeeMatch {
  rowIndex: number;
  rowNumber: number;
  identityKey: string;
  rawIdentifier: string;
  rawSecondary?: string;
  matchedEmployeeId: number | null;
  matchStatus: MatchStatus;
  confidenceScore: number;
  reason?: string;
  isSkipped?: boolean;
  sharedCount?: number;
}

export interface ParsedFileResult {
  fileName: string;
  headers: string[];
  rawHeaders: string[];
  duplicateHeadersNotification?: string[];
  rows: Record<string, any>[];
  totalRows: number;
}

export interface FieldMappingEntry {
  fileHeader: string;
  targetFieldKey: string;
  status: 'auto' | 'manual' | 'ignored' | 'identity';
  sampleValues: any[];
}
