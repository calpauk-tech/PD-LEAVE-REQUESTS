import {
  PlandayApiCredentials,
  Employee,
  LeaveAccount,
  LeaveAccountBalance,
  AbsenceRequestPayload,
  AccountType,
} from "../types";

const AUTH_URL = "https://id.planday.com/connect/token";
const API_BASE_URL = "https://openapi.planday.com";

let credentials_internal: PlandayApiCredentials | null = null;
let accessToken: string | null = null;
let tokenExpiry: number | null = null;

export function initializeService(credentials: PlandayApiCredentials) {
  if (
    credentials_internal?.clientId !== credentials.clientId ||
    credentials_internal?.refreshToken !== credentials.refreshToken
  ) {
    accessToken = null;
    tokenExpiry = null;
  }
  credentials_internal = { ...credentials };
}

async function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Adds a small random delay (0-500ms) to prevent 'thundering herd' when retrying batches
function getJitter() {
  return Math.floor(Math.random() * 500);
}

async function getAccessToken(): Promise<string> {
  if (accessToken && tokenExpiry && Date.now() < tokenExpiry) {
    return accessToken;
  }

  if (!credentials_internal) {
    throw new Error("Planday service not initialized with credentials.");
  }

  const payload = new URLSearchParams({
    client_id: credentials_internal.clientId,
    grant_type: "refresh_token",
    refresh_token: credentials_internal.refreshToken,
  });

  const response = await fetch(AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: payload.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    sessionStorage.removeItem("plandayCredentials");
    credentials_internal = null;
    accessToken = null;
    tokenExpiry = null;
    throw new Error(
      `Failed to refresh access token: ${response.status} ${errorText}. Your credentials may be invalid or expired. Please re-enter them.`,
    );
  }

  const data = await response.json();
  accessToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;

  if (
    data.refresh_token &&
    data.refresh_token !== credentials_internal.refreshToken
  ) {
    credentials_internal.refreshToken = data.refresh_token;
    sessionStorage.setItem(
      "plandayCredentials",
      JSON.stringify(credentials_internal),
    );
  }

  return accessToken;
}

class RateLimiter {
  private queue: (() => void)[] = [];
  private activeCount = 0;
  private maxConcurrent = 15; // Smooth out browser concurrency
  private timestamps: number[] = [];
  
  // Safe thresholds under Planday limits (20/sec, 750/min portal limits)
  private MAX_PER_SECOND = 15;
  private MAX_PER_MINUTE = 700;

  async waitToProceed(): Promise<void> {
    return new Promise((resolve) => {
      this.queue.push(resolve);
      this.processQueue();
    });
  }

  private processQueue() {
    if (this.queue.length === 0) return;
    if (this.activeCount >= this.maxConcurrent) return;

    const now = Date.now();
    // Clean up timestamps older than 1 minute
    this.timestamps = this.timestamps.filter((t) => now - t < 60000);

    const requestsLastSecond = this.timestamps.filter((t) => now - t < 1000).length;
    const requestsLastMinute = this.timestamps.length;

    if (requestsLastSecond >= this.MAX_PER_SECOND || requestsLastMinute >= this.MAX_PER_MINUTE) {
      // Delay and try again
      setTimeout(() => this.processQueue(), 200);
      return;
    }

    const resolve = this.queue.shift();
    if (resolve) {
      this.activeCount++;
      this.timestamps.push(now);
      resolve();
    }
  }

  release() {
    this.activeCount--;
    this.processQueue();
  }

  // Optional dynamic backoff if headers say we are close
  updateFromHeaders(remainingSec: number, remainingMin: number, resetSec: number) {
     if (remainingSec <= 2 || remainingMin <= 10) {
       setTimeout(() => this.processQueue(), resetSec * 1000);
     }
  }
}

const apiRateLimiter = new RateLimiter();

async function fetchWithAuth(
  url: string,
  options: RequestInit = { method: "GET" },
  retries = 5,
): Promise<Response> {
  if (!credentials_internal) throw new Error("Service not initialized");

  await apiRateLimiter.waitToProceed();

  try {
    const token = await getAccessToken();
    const headers = {
      ...options.headers,
      Authorization: `Bearer ${token}`,
      "X-ClientId": credentials_internal.clientId,
    };

    const response = await fetch(url, { ...options, headers });
    
    // Check remaining limits dynamically
    const remainingLimit = response.headers.get("x-ratelimit-remaining");
    const limitReset = response.headers.get("x-ratelimit-reset");
    if (remainingLimit && limitReset) {
      // Simplistic check, just passing back to limiter
      const rem = parseInt(remainingLimit, 10);
      const res = parseInt(limitReset, 10);
      if (rem < 5) {
         apiRateLimiter.updateFromHeaders(rem, rem, res);
      }
    }

    // Handle Rate Limiting (429)
    if (response.status === 429) {
      if (retries > 0) {
        const retryAfterHeader = response.headers.get("Retry-After");
        const xRateLimitReset = response.headers.get("x-ratelimit-reset");

        let waitTime = 2000; // Default 2s

        if (retryAfterHeader) {
          waitTime = parseInt(retryAfterHeader, 10) * 1000;
        } else if (xRateLimitReset) {
          waitTime = (parseInt(xRateLimitReset, 10) + 1) * 1000;
        }

        waitTime += getJitter();

        console.warn(`Rate limited (429). Retrying in ${waitTime}ms...`);
        apiRateLimiter.release();
        await wait(waitTime);
        return fetchWithAuth(url, options, retries - 1);
      }
    }

    // Handle Server Errors (5xx)
    if (response.status >= 500 && retries > 0) {
      console.warn(`Server error ${response.status}. Retrying...`);
      apiRateLimiter.release();
      await wait(2000 + getJitter());
      return fetchWithAuth(url, options, retries - 1);
    }

    apiRateLimiter.release();
    return response;
  } catch (error: any) {
    apiRateLimiter.release();
    // Handle Network Errors (Fetch failed to leave browser)
    // Checks for "TypeError: Failed to fetch" (Chrome) or "NetworkError" (Firefox)
    const isNetworkError =
      error instanceof TypeError ||
      error.name === "TypeError" ||
      error.name === "NetworkError" ||
      error.message?.includes("NetworkError");

    if (isNetworkError && retries > 0) {
      console.warn(
        `Network error detected: ${error.message}. Retries remaining: ${retries - 1}`,
      );

      // Progressive backoff: 2s, 4s, 6s...
      // e.g. If retries=5 (first attempt), we wait 2000 * 1 = 2000ms
      const attempt = 6 - retries;
      const backoff = 2000 * attempt;

      await wait(backoff + getJitter());
      return fetchWithAuth(url, options, retries - 1);
    }
    throw error;
  }
}

async function fetchPaginatedData(endpoint: string): Promise<any[]> {
  let allData: any[] = [];
  let offset = 0;
  const limit = 50; // Keep limit reasonable to avoid massive response bodies

  while (true) {
    const url = `${API_BASE_URL}${endpoint}${endpoint.includes("?") ? "&" : "?"}limit=${limit}&offset=${offset}`;
    const response = await fetchWithAuth(url);
    if (!response.ok)
      throw new Error(`Failed to fetch ${endpoint}: ${await response.text()}`);
    const result = await response.json();

    if (result && result.data && Array.isArray(result.data)) {
      allData = allData.concat(result.data);
      if (
        result.data.length < limit ||
        (result.paging && result.paging.total <= allData.length)
      ) {
        break;
      }
      offset += result.data.length;
    } else {
      break;
    }
  }
  return allData;
}

export async function fetchPortalInfo(): Promise<{ name: string }> {
  const response = await fetchWithAuth(`${API_BASE_URL}/portal/v1.0/info`);
  if (!response.ok) {
    console.warn(`Failed to fetch portal info: ${response.status}`);
    return { name: "Unknown" };
  }
  const result = await response.json();
  return { name: result.data?.name || "Unknown" };
}

export async function fetchEmployees(): Promise<Employee[]> {
  return fetchPaginatedData("/hr/v1.0/employees");
}

export async function fetchDepartments(): Promise<
  { id: number; name: string }[]
> {
  const response = await fetchWithAuth(`${API_BASE_URL}/hr/v1.0/departments`);
  if (response.status === 403) {
    throw new Error(
      "Missing HR Departments Scope (hr.departments.read). Please add this scope to your Planday App credentials.",
    );
  }
  if (!response.ok) {
    console.warn(`Failed to fetch departments: ${response.status}`);
    return [];
  }
  const result = await response.json();
  return result.data || [];
}

export async function fetchEmployeeGroups(): Promise<
  { id: number; name: string }[]
> {
  const response = await fetchWithAuth(
    `${API_BASE_URL}/hr/v1.0/employeegroups`,
  );
  if (response.status === 403) {
    throw new Error(
      "Missing HR Employee Groups Scope (hr.employeegroups.read). Please add this scope to your Planday App credentials.",
    );
  }
  if (!response.ok) {
    console.warn(`Failed to fetch employee groups: ${response.status}`);
    return [];
  }
  const result = await response.json();
  return result.data || [];
}

export async function fetchEmployeeTypes(): Promise<
  { id: number; name: string }[]
> {
  const response = await fetchWithAuth(`${API_BASE_URL}/hr/v1.0/employeetypes`);
  if (response.status === 403) {
    throw new Error(
      "Missing HR Employee Types Scope (hr.employeetypes.read). Please add this scope to your Planday App credentials.",
    );
  }
  if (!response.ok) {
    console.warn(`Failed to fetch employee types: ${response.status}`);
    return [];
  }
  const result = await response.json();
  return result.data || [];
}

export async function fetchSampleAccounts(limit: number = 50): Promise<any[]> {
  const response = await fetchWithAuth(
    `${API_BASE_URL}/absence/v1.0/accounts?limit=${limit}`,
  );
  if (!response.ok) {
    console.warn(`Failed to fetch sample accounts: ${response.status}`);
    return [];
  }
  const result = await response.json();
  return result.data || [];
}
export async function fetchAllValidityPeriods(
  activeTypeIds: number[],
  signal?: AbortSignal
): Promise<Record<number, { start: string; end: string } | null>> {
  let offset = 0;
  const limit = 100;
  const maxPages = 20; // Check up to 2000 accounts
  let pagesChecked = 0;
  const periodsMap: Record<number, Set<string>> = {};
  
  activeTypeIds.forEach((id) => {
    periodsMap[id] = new Set<string>();
  });

  while (pagesChecked < maxPages) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    
    const url = `${API_BASE_URL}/absence/v1.0/accounts?limit=${limit}&offset=${offset}`;
    const response = await fetchWithAuth(url, { signal });
    if (!response.ok) break;
    const result = await response.json();

    if (result && result.data && Array.isArray(result.data)) {
      for (const acc of result.data) {
        const tId = acc.typeId || acc.accountType?.id;
        if (tId && activeTypeIds.includes(tId)) {
          if (
            acc.validityPeriod &&
            acc.validityPeriod.start &&
            acc.validityPeriod.end
          ) {
            periodsMap[tId].add(JSON.stringify(acc.validityPeriod));
          }
        }
      }

      if (result.data.length < limit) break;
      offset += limit;
      pagesChecked++;
    } else {
      break;
    }
  }

  const finalMap: Record<number, { start: string; end: string } | null> = {};
  const today = new Date().toISOString().split("T")[0]; // "YYYY-MM-DD"

  activeTypeIds.forEach((id) => {
    const periodsSet = periodsMap[id];
    if (periodsSet.size === 0) {
      finalMap[id] = null;
    } else {
      const periods = Array.from(periodsSet).map(p => JSON.parse(p) as { start: string; end: string });
      
      // Look for a period where today falls within [start, end]
      const activePeriods = periods.filter(p => {
        const start = p.start.split("T")[0];
        const end = p.end.split("T")[0];
        return today >= start && today <= end;
      });

      if (activePeriods.length > 0) {
        // If there are multiple, pick the one that ends latest, then starts latest
        activePeriods.sort((a, b) => {
          if (a.end !== b.end) return a.end > b.end ? -1 : 1;
          return a.start > b.start ? -1 : 1;
        });
        finalMap[id] = activePeriods[0];
      } else {
        // No active period for today, pick the most recent one (latest end date)
        periods.sort((a, b) => {
          if (a.end !== b.end) return a.end > b.end ? -1 : 1;
          return a.start > b.start ? -1 : 1;
        });
        finalMap[id] = periods[0];
      }
    }
  });

  return finalMap;
}
export async function fetchAccountTypes(): Promise<AccountType[]> {
  const response = await fetchWithAuth(
    `${API_BASE_URL}/absence/v1.0/accounttypes`,
  );
  if (!response.ok)
    throw new Error(`Failed to fetch account types: ${await response.text()}`);
  const result = await response.json();
  return result.data;
}

export async function fetchLeaveAccounts(
  employeeId: number,
  dateRange?: { start: string; end: string },
  status?: string,
): Promise<LeaveAccount[]> {
  let endpoint = `/absence/v1.0/accounts?employeeId=${employeeId}`;
  if (dateRange?.start) {
    endpoint += `&startDate=${dateRange.start}`;
  }
  if (dateRange?.end) {
    endpoint += `&endDate=${dateRange.end}`;
  }
  if (status) {
    endpoint += `&status=${status}`;
  }
  return fetchPaginatedData(endpoint);
}

export async function fetchAccountBalance(
  accountId: number,
  date: string,
): Promise<LeaveAccountBalance> {
  const result = await fetchWithAuth(
    `${API_BASE_URL}/absence/v1.0/accounts/${accountId}/balance?balanceDate=${date}`,
  );

  if (result.status === 404) {
    return { balance: 0, unit: "N/A" };
  }

  if (!result.ok) {
    const errorText = await result.text();
    throw new Error(`Failed to fetch account balance: ${errorText}`);
  }

  const data = await result.json();
  const accountData = data.data;

  if (
    !accountData ||
    !accountData.balance ||
    !Array.isArray(accountData.balance) ||
    accountData.balance.length === 0
  ) {
    return { balance: 0, unit: "N/A" };
  }

  const balanceEntry = accountData.balance[0];

  return {
    balance: balanceEntry.value,
    unit: balanceEntry.unit?.type || "N/A",
  };
}

export async function postAbsenceRequest(
  payload: AbsenceRequestPayload,
): Promise<any> {
  const result = await fetchWithAuth(
    `${API_BASE_URL}/absence/v1.0/absencerequests`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  if (!result.ok) {
    const errorText = await result.text();
    throw new Error(`Failed to post absence request: ${errorText}`);
  }
  return result.status === 204
    ? { success: true }
    : await result.json().catch(() => ({ success: true }));
}

export async function approveAbsenceRequest(id: number): Promise<any> {
  const result = await fetchWithAuth(
    `${API_BASE_URL}/absence/v1.0/absencerequests/${id}/approve`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reason: "Bulk approved via API",
        notify: false,
        existingShifts: { action: "NoAction", change: { shiftTypeId: null } },
        coverShifts: { action: "DoNotCreate" },
      }),
    },
  );
  if (!result.ok)
    throw new Error(`Failed to approve request: ${await result.text()}`);
  return result.status === 204
    ? { success: true }
    : await result.json().catch(() => ({ success: true }));
}

export async function declineAbsenceRecord(id: number): Promise<any> {
  const result = await fetchWithAuth(
    `${API_BASE_URL}/absence/v1.0/absencerecords/${id}/decline`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reason: "Bulk declined via API",
        notify: false,
      }),
    }
  );
  if (!result.ok)
    throw new Error(`Failed to decline record: ${await result.text()}`);
  return result.status === 204
    ? { success: true }
    : await result.json().catch(() => ({ success: true }));
}

export async function denyAbsenceRequest(id: number): Promise<any> {
  const result = await fetchWithAuth(
    `${API_BASE_URL}/absence/v1.0/absencerequests/${id}/deny`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reason: "Bulk denied via API",
        notify: false,
      }),
    },
  );
  if (!result.ok) {
    throw new Error(`Failed to deny request: ${await result.text()}`);
  }
  return result.status === 204
    ? { success: true }
    : await result.json().catch(() => ({ success: true }));
}

export async function getAbsenceRecords(employeeId?: number): Promise<any[]> {
  let endpoint = `/absence/v1.0/absencerecords`;
  // Provide a wide date range if Planday requires it
  const params = new URLSearchParams();
  params.append("startDate", "2020-01-01");
  params.append("endDate", "2030-01-01");
  if (employeeId) {
    params.append("employeeId", String(employeeId));
  }
  return fetchPaginatedData(`${endpoint}?${params.toString()}`);
}

export async function getAbsenceRequestById(id: number): Promise<any> {
  const result = await fetchWithAuth(`${API_BASE_URL}/absence/v1.0/absencerequests/${id}`);
  if (!result.ok) throw new Error(`Failed to fetch request ${id}: ${await result.text()}`);
  const data = await result.json();
  return data.data || data;
}

export async function getAbsenceRecordById(id: number): Promise<any> {
  const result = await fetchWithAuth(`${API_BASE_URL}/absence/v1.0/absencerecords/${id}`);
  if (!result.ok) throw new Error(`Failed to fetch record ${id}: ${await result.text()}`);
  const data = await result.json();
  return data.data || data;
}

export async function getAbsenceRequests(employeeId?: number): Promise<any[]> {
  let endpoint = `/absence/v1.0/absencerequests`;
  const params = new URLSearchParams();
  params.append("startDate", "2020-01-01");
  params.append("endDate", "2030-01-01");
  if (employeeId) {
    params.append("employeeId", String(employeeId));
  }
  return fetchPaginatedData(`${endpoint}?${params.toString()}`);
}
