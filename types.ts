
export interface PlandayApiCredentials {
  clientId: string;
  refreshToken: string;
}

export interface Employee {
  id: number;
  firstName: string;
  lastName:string;
  ssn?: string;
  salaryIdentifier: string | null;
  departments?: number[] | any[];
  departmentId?: number;
  primaryDepartmentId?: number;
  employeeGroups?: number[] | any[];
  employeeGroupId?: number;
  employeeGroupIds?: number[];
  employeeType?: number | any;
  employeeTypeId?: number;
}

export interface Department {
  id: number | string;
  name: string;
}

export interface EmployeeGroup {
  id: number | string;
  name: string;
}

export interface EmployeeType {
  id: number | string;
  name: string;
}

export interface LeaveAccount {
  id: number;
  name: string;
  typeId: number;
  validityPeriod: {
    start: string | null;
    end: string | null;
  };
}

export interface LeaveAccountBalance {
    balance: number;
    unit: string;
}

export interface AbsenceRequestPayload {
    note: string;
    absenceType: string;
    status?: string;
    absencePeriod: {
        start: string;
        end: string;
    };
    registrations: {
        date: string;
        account: {
            id: number;
            costs: {
                value: number;
                unit: {
                    type: string;
                }
            }[];
        };
    }[];
}

export interface AccountType {
    id: number;
    name: string;
    unit: string;
    absenceType?: string;
    accruingRate?: {
        value: number;
        unit: {
            type: string;
        };
    };
}

export interface TemplateDataRow {
    employeeId: number;
    salaryIdentifier: string | null;
    employeeName: string;
    accountId: number;
    accountName: string;
    accountTypeCategory: 'FLEX/TOIL' | 'Fixed' | 'Accrued' | 'Unknown';
    date?: string; // used for single date method
    start?: string; // used for range method
    end?: string; // used for range method
    cost: number;
    billingMode: string;
    comment: string;
    requestStatus?: string;
}

export interface AdjustmentReview {
    id: string;
    employeeId?: number;
    employeeName: string;
    salaryIdentifier?: string | null;
    accountId: number;
    accountName: string;
    accountTypeCategory?: 'FLEX/TOIL' | 'Fixed' | 'Accrued' | 'Unknown';
    date?: string; // Single date format
    start?: string; // Range format
    end?: string; // Range format
    cost: number;
    billingMode: string;
    comment: string;
    absenceType?: string;
    unit?: string;
    status?: 'pending' | 'success' | 'error' | 'skipped';
    error?: string;
    billingModeError?: string;
    isValidationError?: boolean;
}