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

async function wait(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  return new Promise((resolve, reject) => {
    let timer: any = null;
    let onAbort: (() => void) | null = null;
    if (signal) {
      onAbort = () => {
        if (timer) clearTimeout(timer);
        signal.removeEventListener("abort", onAbort!);
        reject(new DOMException("Aborted", "AbortError"));
      };
      signal.addEventListener("abort", onAbort);
    }
    timer = setTimeout(() => {
      if (signal && onAbort) signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
  });
}

// Adds a small random delay (0-500ms) to prevent 'thundering herd' when retrying batches
function getJitter() {
  return Math.floor(Math.random() * 500);
}

async function getAccessToken(signal?: AbortSignal): Promise<string> {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

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
    signal,
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

interface RateLimiterQueueItem {
  resolve: () => void;
  reject: (err: any) => void;
  signal?: AbortSignal;
  onAbort?: () => void;
}

class RateLimiter {
  private queue: RateLimiterQueueItem[] = [];
  private activeCount = 0;
  private maxConcurrent = 12; // Smooth out browser concurrency
  private timestamps: number[] = [];
  private timeoutId: any = null;
  
  // Safe thresholds under Planday limits (20/sec, 750/min portal limits)
  private MAX_PER_SECOND = 14;
  private MAX_PER_MINUTE = 650;

  async waitToProceed(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    return new Promise((resolve, reject) => {
      const item: RateLimiterQueueItem = { resolve, reject, signal };

      if (signal) {
        const onAbort = () => {
          signal.removeEventListener("abort", onAbort);
          const idx = this.queue.indexOf(item);
          if (idx !== -1) {
            this.queue.splice(idx, 1);
          }
          reject(new DOMException("Aborted", "AbortError"));
        };
        item.onAbort = onAbort;
        signal.addEventListener("abort", onAbort);
      }

      this.queue.push(item);
      this.processQueue();
    });
  }

  cancelAll(reason = "Aborted by user") {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    const oldQueue = this.queue;
    this.queue = [];
    for (const item of oldQueue) {
      if (item.signal && item.onAbort) {
        item.signal.removeEventListener("abort", item.onAbort);
      }
      try {
        item.reject(new DOMException(reason, "AbortError"));
      } catch (e) {}
    }
    this.activeCount = 0;
  }

  private processQueue() {
    if (this.queue.length === 0) return;
    if (this.activeCount >= this.maxConcurrent) return;

    const now = Date.now();
    this.timestamps = this.timestamps.filter((t) => now - t < 60000);

    const requestsLastSecond = this.timestamps.filter((t) => now - t < 1000).length;
    const requestsLastMinute = this.timestamps.length;

    if (requestsLastSecond >= this.MAX_PER_SECOND || requestsLastMinute >= this.MAX_PER_MINUTE) {
      if (!this.timeoutId) {
        this.timeoutId = setTimeout(() => {
          this.timeoutId = null;
          this.processQueue();
        }, 150);
      }
      return;
    }

    const item = this.queue.shift();
    if (item) {
      if (item.signal && item.onAbort) {
        item.signal.removeEventListener("abort", item.onAbort);
      }
      if (item.signal?.aborted) {
        item.reject(new DOMException("Aborted", "AbortError"));
        this.processQueue();
        return;
      }
      this.activeCount++;
      this.timestamps.push(now);
      item.resolve();
    }
  }

  release() {
    this.activeCount = Math.max(0, this.activeCount - 1);
    this.processQueue();
  }

  updateFromHeaders(remainingSec: number, remainingMin: number, resetSec: number) {
    if (remainingSec <= 2 || remainingMin <= 10) {
      setTimeout(() => this.processQueue(), Math.min(resetSec * 1000, 5000));
    }
  }
}

const apiRateLimiter = new RateLimiter();

export function cancelAllPendingRequests() {
  apiRateLimiter.cancelAll();
}

export async function fetchWithAuth(
  url: string,
  options: RequestInit = { method: "GET" },
  retries = 4,
  signal?: AbortSignal,
): Promise<Response> {
  if (!credentials_internal) throw new Error("Service not initialized");

  const effectiveSignal = signal || (options.signal as AbortSignal | undefined);
  if (effectiveSignal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  await apiRateLimiter.waitToProceed(effectiveSignal);

  let timedOut = false;
  let timeoutId: any = null;
  const timeoutController = new AbortController();
  timeoutId = setTimeout(() => {
    timedOut = true;
    timeoutController.abort();
  }, 30000);

  let onAbortListener: (() => void) | null = null;
  if (effectiveSignal) {
    onAbortListener = () => {
      timeoutController.abort(new DOMException("Aborted", "AbortError"));
    };
    effectiveSignal.addEventListener("abort", onAbortListener, { once: true });
  }

  try {
    const token = await getAccessToken(effectiveSignal);
    if (effectiveSignal?.aborted) throw new DOMException("Aborted", "AbortError");

    const headers = {
      ...options.headers,
      Authorization: `Bearer ${token}`,
      "X-ClientId": credentials_internal.clientId,
    };

    const response = await fetch(url, {
      ...options,
      headers,
      signal: timeoutController.signal,
    });

    if (timeoutId) clearTimeout(timeoutId);
    if (effectiveSignal && onAbortListener) {
      effectiveSignal.removeEventListener("abort", onAbortListener);
    }

    const remainingLimit = response.headers.get("x-ratelimit-remaining");
    const limitReset = response.headers.get("x-ratelimit-reset");
    if (remainingLimit && limitReset) {
      const rem = parseInt(remainingLimit, 10);
      const res = parseInt(limitReset, 10);
      if (rem < 5) {
        apiRateLimiter.updateFromHeaders(rem, rem, res);
      }
    }

    // Handle Rate Limiting (429)
    if (response.status === 429) {
      if (effectiveSignal?.aborted) throw new DOMException("Aborted", "AbortError");
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

        apiRateLimiter.release();
        await wait(waitTime, effectiveSignal);
        return fetchWithAuth(url, options, retries - 1, effectiveSignal);
      }
    }

    // Handle Server Errors (5xx)
    if (response.status >= 500 && retries > 0) {
      if (effectiveSignal?.aborted) throw new DOMException("Aborted", "AbortError");
      apiRateLimiter.release();
      await wait(1500 + getJitter(), effectiveSignal);
      return fetchWithAuth(url, options, retries - 1, effectiveSignal);
    }

    apiRateLimiter.release();
    return response;
  } catch (error: any) {
    if (timeoutId) clearTimeout(timeoutId);
    if (effectiveSignal && onAbortListener) {
      effectiveSignal.removeEventListener("abort", onAbortListener);
    }
    apiRateLimiter.release();

    if (effectiveSignal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    if (timedOut) {
      if (retries > 0 && !effectiveSignal?.aborted) {
        console.warn(`Request timed out after 30s. Retries remaining: ${retries - 1}`);
        const attempt = 5 - retries;
        const backoff = 1500 * attempt;
        await wait(backoff + getJitter(), effectiveSignal);
        return fetchWithAuth(url, options, retries - 1, effectiveSignal);
      }
      throw new Error("Request timed out after 30s (Planday server did not respond)");
    }

    const isNetworkError =
      error instanceof TypeError ||
      error.name === "TypeError" ||
      error.name === "NetworkError" ||
      error.message?.includes("NetworkError");

    if (isNetworkError && retries > 0 && !effectiveSignal?.aborted) {
      const attempt = 5 - retries;
      const backoff = 1500 * attempt;
      await wait(backoff + getJitter(), effectiveSignal);
      return fetchWithAuth(url, options, retries - 1, effectiveSignal);
    }
    throw error;
  }
}

async function fetchPaginatedData(endpoint: string, signal?: AbortSignal): Promise<any[]> {
  let allData: any[] = [];
  let offset = 0;
  const limit = 50;

  while (true) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const url = `${API_BASE_URL}${endpoint}${endpoint.includes("?") ? "&" : "?"}limit=${limit}&offset=${offset}`;
    const response = await fetchWithAuth(url, { signal }, 4, signal);
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

export async function fetchPortalInfo(signal?: AbortSignal): Promise<{ name: string }> {
  const response = await fetchWithAuth(`${API_BASE_URL}/portal/v1.0/info`, { signal }, 3, signal);
  if (!response.ok) {
    console.warn(`Failed to fetch portal info: ${response.status}`);
    return { name: "Unknown" };
  }
  const result = await response.json();
  return { name: result.data?.name || "Unknown" };
}

export async function fetchEmployees(signal?: AbortSignal): Promise<Employee[]> {
  return fetchPaginatedData("/hr/v1.0/employees", signal);
}

export async function fetchDepartments(signal?: AbortSignal): Promise<
  { id: number; name: string }[]
> {
  const response = await fetchWithAuth(`${API_BASE_URL}/hr/v1.0/departments`, { signal }, 3, signal);
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

export async function fetchEmployeeGroups(signal?: AbortSignal): Promise<
  { id: number; name: string }[]
> {
  const response = await fetchWithAuth(
    `${API_BASE_URL}/hr/v1.0/employeegroups`,
    { signal },
    3,
    signal,
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

export async function fetchEmployeeTypes(signal?: AbortSignal): Promise<
  { id: number; name: string }[]
> {
  const response = await fetchWithAuth(`${API_BASE_URL}/hr/v1.0/employeetypes`, { signal }, 3, signal);
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

export async function fetchSampleAccounts(limit: number = 50, signal?: AbortSignal): Promise<any[]> {
  const response = await fetchWithAuth(
    `${API_BASE_URL}/absence/v1.0/accounts?limit=${limit}`,
    { signal },
    3,
    signal,
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
    const response = await fetchWithAuth(url, { signal }, 3, signal);
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
      
      const activePeriods = periods.filter(p => {
        const start = p.start.split("T")[0];
        const end = p.end.split("T")[0];
        return today >= start && today <= end;
      });

      if (activePeriods.length > 0) {
        activePeriods.sort((a, b) => {
          if (a.end !== b.end) return a.end > b.end ? -1 : 1;
          return a.start > b.start ? -1 : 1;
        });
        finalMap[id] = activePeriods[0];
      } else {
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

export async function fetchAccountTypes(signal?: AbortSignal): Promise<AccountType[]> {
  const response = await fetchWithAuth(
    `${API_BASE_URL}/absence/v1.0/accounttypes`,
    { signal },
    3,
    signal,
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
  signal?: AbortSignal,
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
  return fetchPaginatedData(endpoint, signal);
}

export async function fetchAccountBalance(
  accountId: number,
  date: string,
  signal?: AbortSignal,
): Promise<LeaveAccountBalance> {
  const result = await fetchWithAuth(
    `${API_BASE_URL}/absence/v1.0/accounts/${accountId}/balance?balanceDate=${date}`,
    { signal },
    3,
    signal,
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
  signal?: AbortSignal,
): Promise<any> {
  const result = await fetchWithAuth(
    `${API_BASE_URL}/absence/v1.0/absencerequests`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    },
    3,
    signal,
  );
  if (!result.ok) {
    const errorText = await result.text();
    throw new Error(`Failed to post absence request: ${errorText}`);
  }
  return result.status === 204
    ? { success: true }
    : await result.json().catch(() => ({ success: true }));
}

export async function approveAbsenceRequest(id: number, signal?: AbortSignal): Promise<any> {
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
      signal,
    },
    3,
    signal,
  );
  if (!result.ok)
    throw new Error(`Failed to approve request: ${await result.text()}`);
  return result.status === 204
    ? { success: true }
    : await result.json().catch(() => ({ success: true }));
}

export async function declineAbsenceRecord(id: number, signal?: AbortSignal): Promise<any> {
  const result = await fetchWithAuth(
    `${API_BASE_URL}/absence/v1.0/absencerecords/${id}/decline`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reason: "Bulk declined via API",
        notify: false,
      }),
      signal,
    },
    3,
    signal,
  );
  if (!result.ok)
    throw new Error(`Failed to decline record: ${await result.text()}`);
  return result.status === 204
    ? { success: true }
    : await result.json().catch(() => ({ success: true }));
}

export async function denyAbsenceRequest(id: number, signal?: AbortSignal): Promise<any> {
  const result = await fetchWithAuth(
    `${API_BASE_URL}/absence/v1.0/absencerequests/${id}/deny`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reason: "Bulk denied via API",
        notify: false,
      }),
      signal,
    },
    3,
    signal,
  );
  if (!result.ok) {
    throw new Error(`Failed to deny request: ${await result.text()}`);
  }
  return result.status === 204
    ? { success: true }
    : await result.json().catch(() => ({ success: true }));
}

export async function getAbsenceRecords(employeeId?: number, signal?: AbortSignal): Promise<any[]> {
  let endpoint = `/absence/v1.0/absencerecords`;
  const params = new URLSearchParams();
  params.append("startDate", "2020-01-01");
  params.append("endDate", "2030-01-01");
  if (employeeId) {
    params.append("employeeId", String(employeeId));
  }
  return fetchPaginatedData(`${endpoint}?${params.toString()}`, signal);
}

export async function getAbsenceRequestById(id: number, signal?: AbortSignal): Promise<any> {
  const result = await fetchWithAuth(`${API_BASE_URL}/absence/v1.0/absencerequests/${id}`, { signal }, 3, signal);
  if (!result.ok) throw new Error(`Failed to fetch request ${id}: ${await result.text()}`);
  const data = await result.json();
  return data.data || data;
}

export async function getAbsenceRecordById(id: number, signal?: AbortSignal): Promise<any> {
  const result = await fetchWithAuth(`${API_BASE_URL}/absence/v1.0/absencerecords/${id}`, { signal }, 3, signal);
  if (!result.ok) throw new Error(`Failed to fetch record ${id}: ${await result.text()}`);
  const data = await result.json();
  return data.data || data;
}

export async function getAbsenceRequests(employeeId?: number, signal?: AbortSignal): Promise<any[]> {
  let endpoint = `/absence/v1.0/absencerequests`;
  const params = new URLSearchParams();
  params.append("startDate", "2020-01-01");
  params.append("endDate", "2030-01-01");
  if (employeeId) {
    params.append("employeeId", String(employeeId));
  }
  return fetchPaginatedData(`${endpoint}?${params.toString()}`, signal);
}
