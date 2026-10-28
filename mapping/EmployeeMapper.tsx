import React, { useState, useEffect, useMemo } from "react";
import {
  Users,
  Search,
  CheckCircle,
  AlertCircle,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  XCircle,
  Check,
  RotateCcw,
  Layers,
} from "lucide-react";
import { IdentityConfig, MatchStatus, RowEmployeeMatch } from "./types";
import { Employee } from "../types";
import { calculateNameSimilarity, normalizeString } from "./similarity";

interface EmployeeMapperProps {
  rows: Record<string, any>[];
  headers: string[];
  identityConfig: IdentityConfig;
  allEmployees: Employee[];
  initialMapping?: Map<number, number | null>;
  onConfirm: (employeeMapping: Map<number, number | null>, rowMatches?: RowEmployeeMatch[]) => void;
  onBack: () => void;
}

export const EmployeeMapper: React.FC<EmployeeMapperProps> = ({
  rows,
  headers,
  identityConfig,
  allEmployees,
  initialMapping,
  onConfirm,
  onBack,
}) => {
  // Compute normalized identityKey and display info for each row
  const getRowIdentity = (
    row: Record<string, any>
  ): { identityKey: string; primary: string; secondary?: string } => {
    if (identityConfig.method === "system_id" && identityConfig.idColumn) {
      const rawId = String(row[identityConfig.idColumn] ?? "").trim();
      const crossName = identityConfig.crossCheckNameColumn
        ? String(row[identityConfig.crossCheckNameColumn] ?? "").trim()
        : undefined;
      return {
        identityKey: `id:${normalizeString(rawId)}`,
        primary: rawId ? `Employee ID: ${rawId}` : "(Missing ID)",
        secondary: crossName ? `Name: ${crossName}` : undefined,
      };
    }

    // method === "salary_and_name"
    const salId = identityConfig.salaryIdColumn
      ? String(row[identityConfig.salaryIdColumn] ?? "").trim()
      : "";

    let name = "";
    if (identityConfig.nameFormat === "split") {
      const fn = identityConfig.firstNameColumn ? String(row[identityConfig.firstNameColumn] ?? "").trim() : "";
      const ln = identityConfig.lastNameColumn ? String(row[identityConfig.lastNameColumn] ?? "").trim() : "";
      name = `${fn} ${ln}`.trim();
    } else if (identityConfig.fullNameColumn) {
      name = String(row[identityConfig.fullNameColumn] ?? "").trim();
    }

    const normSal = normalizeString(salId);
    const normName = normalizeString(name);

    return {
      identityKey: `sal_name:${normSal}:::${normName}`,
      primary: name || "(Missing Name)",
      secondary: salId ? `Salary ID: ${salId}` : "(Missing Salary ID)",
    };
  };

  // Pre-calculate count of rows sharing each identityKey
  const identityCounts = useMemo(() => {
    const counts = new Map<string, number>();
    rows.forEach((r) => {
      const { identityKey } = getRowIdentity(r);
      counts.set(identityKey, (counts.get(identityKey) || 0) + 1);
    });
    return counts;
  }, [rows, identityConfig]);

  // Run matching grouped by identityKey
  const runGroupedMatching = (
    currentManualAssignments?: Map<string, number | null>
  ): RowEmployeeMatch[] => {
    // 1. Identify all unique identity keys from rows
    const uniqueIdentityKeys = new Set<string>();
    const identityToSampleRow = new Map<string, { rowIndex: number; row: Record<string, any> }>();

    rows.forEach((r, idx) => {
      const { identityKey } = getRowIdentity(r);
      uniqueIdentityKeys.add(identityKey);
      if (!identityToSampleRow.has(identityKey)) {
        identityToSampleRow.set(identityKey, { rowIndex: idx, row: r });
      }
    });

    // 2. Track assigned employees to distinct identity keys (prevent assigning same DB emp to multiple DIFFERENT identity keys)
    const assignedEmpIds = new Set<number>();
    const identityAssignments = new Map<
      string,
      { employeeId: number | null; status: MatchStatus; score: number; reason: string }
    >();

    // Reserve manual assignments first
    if (currentManualAssignments) {
      for (const [key, empId] of currentManualAssignments.entries()) {
        if (empId !== null) {
          assignedEmpIds.add(empId);
          identityAssignments.set(key, {
            employeeId: empId,
            status: "manual",
            score: 1.0,
            reason: "Manually assigned",
          });
        } else {
          identityAssignments.set(key, {
            employeeId: null,
            status: "unmapped",
            score: 0,
            reason: "Marked as skipped",
          });
        }
      }
    }

    // 3. For each unassigned unique identityKey, find candidate matches
    interface Candidate {
      identityKey: string;
      employeeId: number;
      score: number;
      isExact: boolean;
      status: MatchStatus;
      reason: string;
    }

    const candidateList: Candidate[] = [];

    for (const key of uniqueIdentityKeys) {
      if (identityAssignments.has(key)) continue;

      const sample = identityToSampleRow.get(key);
      if (!sample) continue;

      if (identityConfig.method === "system_id" && identityConfig.idColumn) {
        const rawId = String(sample.row[identityConfig.idColumn] || "").trim();
        const numId = parseInt(rawId, 10);
        if (!isNaN(numId)) {
          const emp = allEmployees.find((e) => e.id === numId);
          if (emp) {
            candidateList.push({
              identityKey: key,
              employeeId: emp.id,
              score: 1.0,
              isExact: true,
              status: "exact",
              reason: "Exact Employee API ID match",
            });
            continue;
          }
        }
      } else {
        // salary_and_name
        const salId = identityConfig.salaryIdColumn
          ? String(sample.row[identityConfig.salaryIdColumn] || "").trim()
          : "";
        let name = "";
        if (identityConfig.nameFormat === "split") {
          const fn = identityConfig.firstNameColumn ? String(sample.row[identityConfig.firstNameColumn] || "").trim() : "";
          const ln = identityConfig.lastNameColumn ? String(sample.row[identityConfig.lastNameColumn] || "").trim() : "";
          name = `${fn} ${ln}`.trim();
        } else if (identityConfig.fullNameColumn) {
          name = String(sample.row[identityConfig.fullNameColumn] || "").trim();
        }

        const normSal = normalizeString(salId);
        const normName = normalizeString(name);

        allEmployees.forEach((emp) => {
          const empFullName = `${emp.firstName} ${emp.lastName}`.trim();
          const empSal = normalizeString(emp.salaryIdentifier || "");
          const nameSim = calculateNameSimilarity(name, empFullName);
          const salMatches = normSal && empSal && normSal === empSal;

          if (salMatches && nameSim >= 0.95) {
            // Perfect match on both
            candidateList.push({
              identityKey: key,
              employeeId: emp.id,
              score: 1.0,
              isExact: true,
              status: "exact",
              reason: "Exact match on both Salary ID & Employee Name",
            });
          } else if (salMatches && nameSim >= 0.60) {
            // Salary ID exact match + good name match
            candidateList.push({
              identityKey: key,
              employeeId: emp.id,
              score: 0.95,
              isExact: false,
              status: "auto",
              reason: `Matched by Salary ID with similar name (${Math.round(nameSim * 100)}%)`,
            });
          } else if (salMatches) {
            // Salary ID exact match
            candidateList.push({
              identityKey: key,
              employeeId: emp.id,
              score: 0.88,
              isExact: false,
              status: "auto",
              reason: "Matched by Salary Identifier",
            });
          } else if (nameSim >= 0.85) {
            // High name match
            candidateList.push({
              identityKey: key,
              employeeId: emp.id,
              score: nameSim * 0.9,
              isExact: false,
              status: "auto",
              reason: `Fuzzy Name match (${Math.round(nameSim * 100)}%)`,
            });
          }
        });
      }
    }

    // Sort candidateList descending by confidence score
    candidateList.sort((a, b) => {
      if (a.isExact !== b.isExact) return a.isExact ? -1 : 1;
      return b.score - a.score;
    });

    // Greedily assign best matches to unique identities
    for (const cand of candidateList) {
      if (identityAssignments.has(cand.identityKey)) continue;
      if (assignedEmpIds.has(cand.employeeId)) continue;

      identityAssignments.set(cand.identityKey, {
        employeeId: cand.employeeId,
        status: cand.status,
        score: cand.score,
        reason: cand.reason,
      });
      assignedEmpIds.add(cand.employeeId);
    }

    // 4. Map back to each row so that all similar rows get the same mapping!
    const fullRowMatches: RowEmployeeMatch[] = [];

    rows.forEach((row, rowIndex) => {
      const { identityKey, primary, secondary } = getRowIdentity(row);
      const sharedCount = identityCounts.get(identityKey) || 1;
      const assigned = identityAssignments.get(identityKey);

      if (assigned && assigned.employeeId !== null) {
        fullRowMatches.push({
          rowIndex,
          rowNumber: rowIndex + 2,
          identityKey,
          rawIdentifier: primary,
          rawSecondary: secondary,
          matchedEmployeeId: assigned.employeeId,
          matchStatus: assigned.status,
          confidenceScore: assigned.score,
          reason: assigned.reason,
          isSkipped: false,
          sharedCount,
        });
      } else {
        fullRowMatches.push({
          rowIndex,
          rowNumber: rowIndex + 2,
          identityKey,
          rawIdentifier: primary,
          rawSecondary: secondary,
          matchedEmployeeId: null,
          matchStatus: "unmapped",
          confidenceScore: 0,
          reason: assigned?.employeeId === null ? "Skipped by user" : "No high-confidence match found",
          isSkipped: assigned?.employeeId === null,
          sharedCount,
        });
      }
    });

    return fullRowMatches;
  };

  const [rowMatches, setRowMatches] = useState<RowEmployeeMatch[]>([]);
  const [isComputing, setIsComputing] = useState<boolean>(true);

  // Run matching asynchronously so React paints the transition and banner first
  useEffect(() => {
    setIsComputing(true);
    const timer = setTimeout(() => {
      const computed = runGroupedMatching();
      setRowMatches(computed);
      setIsComputing(false);
    }, 40);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, allEmployees, identityConfig]);

  // Filtering & Search
  const [filterMode, setFilterMode] = useState<"all" | "unmapped" | "auto" | "exact" | "manual">("all");
  const [showUnmappedFirst, setShowUnmappedFirst] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Map of claimed employeeId -> identityKey
  const claimedEmployeeMap = useMemo(() => {
    const map = new Map<number, string>();
    rowMatches.forEach((rm) => {
      if (rm.matchedEmployeeId !== null) {
        map.set(rm.matchedEmployeeId, rm.identityKey);
      }
    });
    return map;
  }, [rowMatches]);

  // Stats calculation
  const stats = useMemo(() => {
    const total = rowMatches.length;
    let exact = 0;
    let auto = 0;
    let manual = 0;
    let unmapped = 0;

    rowMatches.forEach((rm) => {
      if (rm.matchedEmployeeId === null || rm.isSkipped) {
        unmapped++;
      } else if (rm.matchStatus === "exact") {
        exact++;
      } else if (rm.matchStatus === "auto") {
        auto++;
      } else if (rm.matchStatus === "manual") {
        manual++;
      }
    });

    const mapped = exact + auto + manual;
    const percentage = total > 0 ? Math.round((mapped / total) * 100) : 0;

    return { total, mapped, exact, auto, manual, unmapped, percentage };
  }, [rowMatches]);

  // Crucial: When an employee is mapped, ALL rows with the same identityKey are mapped together!
  const handleAssignEmployeeForIdentity = (targetIdentityKey: string, employeeId: number | null) => {
    setRowMatches((prev) => {
      const updated = [...prev];

      // If this employee was claimed by a DIFFERENT identityKey, unclaim that other identityKey
      if (employeeId !== null) {
        const otherIdentityRow = updated.find(
          (r) => r.matchedEmployeeId === employeeId && r.identityKey !== targetIdentityKey
        );
        if (otherIdentityRow) {
          const oldIdentity = otherIdentityRow.identityKey;
          for (let i = 0; i < updated.length; i++) {
            if (updated[i].identityKey === oldIdentity) {
              updated[i] = {
                ...updated[i],
                matchedEmployeeId: null,
                matchStatus: "unmapped",
                confidenceScore: 0,
                reason: "Reassigned to another identity in file",
                isSkipped: false,
              };
            }
          }
        }
      }

      // Update ALL rows sharing this targetIdentityKey
      for (let i = 0; i < updated.length; i++) {
        if (updated[i].identityKey === targetIdentityKey) {
          updated[i] = {
            ...updated[i],
            matchedEmployeeId: employeeId,
            matchStatus: employeeId === null ? "unmapped" : "manual",
            confidenceScore: 1.0,
            reason: employeeId === null ? "Skipped by user" : "Manually selected (applied to all similar rows)",
            isSkipped: employeeId === null,
          };
        }
      }

      return updated;
    });
  };

  // Auto-map remaining unmapped rows
  const handleAutoMapRemaining = () => {
    setIsComputing(true);
    setTimeout(() => {
      const currentManuals = new Map<string, number | null>();
      rowMatches.forEach((rm) => {
        if (rm.matchStatus === "manual" || rm.isSkipped) {
          currentManuals.set(rm.identityKey, rm.matchedEmployeeId);
        }
      });
      const recomputed = runGroupedMatching(currentManuals);
      setRowMatches(recomputed);
      setIsComputing(false);
    }, 40);
  };

  // Reset all mappings
  const handleResetAll = () => {
    setIsComputing(true);
    setTimeout(() => {
      setRowMatches(runGroupedMatching());
      setIsComputing(false);
    }, 40);
  };

  // Filtered and sorted rows for rendering
  const displayRows = useMemo(() => {
    let list = [...rowMatches];

    if (filterMode === "unmapped") {
      list = list.filter((r) => r.matchedEmployeeId === null || r.isSkipped);
    } else if (filterMode === "auto") {
      list = list.filter((r) => r.matchStatus === "auto");
    } else if (filterMode === "exact") {
      list = list.filter((r) => r.matchStatus === "exact");
    } else if (filterMode === "manual") {
      list = list.filter((r) => r.matchStatus === "manual");
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((r) => {
        const rowNumMatch = String(r.rowNumber).includes(q);
        const rawMatch = r.rawIdentifier.toLowerCase().includes(q);
        const secondaryMatch = r.rawSecondary?.toLowerCase().includes(q);
        let empMatch = false;
        if (r.matchedEmployeeId) {
          const emp = allEmployees.find((e) => e.id === r.matchedEmployeeId);
          if (emp) {
            const name = `${emp.firstName} ${emp.lastName}`.toLowerCase();
            const salId = String(emp.salaryIdentifier || "").toLowerCase();
            empMatch = name.includes(q) || salId.includes(q) || String(emp.id).includes(q);
          }
        }
        return rowNumMatch || rawMatch || secondaryMatch || empMatch;
      });
    }

    if (showUnmappedFirst) {
      list.sort((a, b) => {
        const aUnmapped = a.matchedEmployeeId === null || a.isSkipped;
        const bUnmapped = b.matchedEmployeeId === null || b.isSkipped;
        if (aUnmapped && !bUnmapped) return -1;
        if (!aUnmapped && bUnmapped) return 1;
        return a.rowIndex - b.rowIndex;
      });
    } else {
      list.sort((a, b) => a.rowIndex - b.rowIndex);
    }

    return list;
  }, [rowMatches, filterMode, searchQuery, showUnmappedFirst, allEmployees]);

  const [confirmWarningOpen, setConfirmWarningOpen] = useState(false);

  const handleContinue = () => {
    if (stats.unmapped > 0 && !confirmWarningOpen) {
      setConfirmWarningOpen(true);
      return;
    }

    const resultMap = new Map<number, number | null>();
    rowMatches.forEach((rm) => {
      resultMap.set(rm.rowIndex, rm.matchedEmployeeId);
    });
    onConfirm(resultMap, rowMatches);
  };

  return (
    <div className="bg-white rounded-xl shadow-md border border-gray-200 p-8 max-w-6xl mx-auto">
      {/* Step Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-700 text-xs font-semibold rounded-full mb-2">
            <Users className="w-3.5 h-3.5" />
            Step 3 of 4: Employee Mapping
          </div>
          <h2 className="text-2xl font-bold text-gray-900">
            Match Spreadsheet Rows to Employees
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {identityConfig.method === "system_id"
              ? "Employees are matched by Employee API ID. All rows with the same API ID are linked together."
              : "Employees are matched by Salary Identifier and Employee Name. All rows with the same Salary Identifier and Name are linked together."}
          </p>
        </div>

        {/* Action Shortcuts */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleAutoMapRemaining}
            className="px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5"
            title="Attempt to fuzzy match unmapped rows"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Auto-Map Remaining
          </button>
          <button
            type="button"
            onClick={handleResetAll}
            className="px-3 py-2 border border-gray-200 hover:bg-gray-50 text-gray-600 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5"
            title="Reset to default automatic mapping"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>
        </div>
      </div>

      {isComputing ? (
        <div className="bg-blue-50/70 border-2 border-blue-200 rounded-xl p-10 text-center my-6 animate-in fade-in">
          <div className="max-w-md mx-auto flex flex-col items-center">
            <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-3 shadow-inner">
              <Sparkles className="w-6 h-6 animate-spin text-blue-600" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-1">
              Matching Employees & Calculating Similarity Scores...
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              Comparing spreadsheet identities with Planday employee records using 1-to-1 heuristics.
            </p>
            <div className="w-full bg-blue-100 rounded-full h-3 overflow-hidden border border-blue-200 mb-2 p-0.5">
              <div className="bg-blue-600 h-full w-full animate-pulse rounded-full" />
            </div>
            <span className="text-xs font-semibold text-blue-700">
              Processing {identityCounts.size} unique employee identities across {rows.length} rows...
            </span>
          </div>
        </div>
      ) : (
        <>
          {/* Progress & Stat Badges Bar */}
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 mb-6">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-gray-800">
                  {stats.mapped} of {stats.total} rows matched
                </span>
                <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-800 font-bold rounded-full">
                  {stats.percentage}% Complete
                </span>
              </div>

          <div className="flex items-center gap-2 text-xs font-medium">
            <span className="flex items-center gap-1 px-2.5 py-1 bg-green-50 text-green-700 border border-green-200 rounded-md">
              <span className="w-2 h-2 rounded-full bg-green-500"></span>
              {stats.exact} Exact
            </span>
            <span className="flex items-center gap-1 px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-md">
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
              {stats.auto} Auto
            </span>
            <span className="flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-md">
              <span className="w-2 h-2 rounded-full bg-blue-500"></span>
              {stats.manual} Manual
            </span>
            {stats.unmapped > 0 && (
              <span className="flex items-center gap-1 px-2.5 py-1 bg-red-50 text-red-700 border border-red-200 rounded-md font-bold">
                <span className="w-2 h-2 rounded-full bg-red-500"></span>
                {stats.unmapped} Unmapped
              </span>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
          <div
            className="bg-green-500 h-full transition-all duration-300"
            style={{ width: `${stats.percentage}%` }}
          />
        </div>
      </div>

      {/* Filter and Search Controls */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-4">
        {/* Search */}
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search by row #, value, or employee..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Filters and Toggle */}
        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
          <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg text-xs font-medium">
            <button
              onClick={() => setFilterMode("all")}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                filterMode === "all" ? "bg-white text-gray-900 shadow-2xs font-semibold" : "text-gray-600 hover:text-gray-900"
              }`}
            >
              All ({rowMatches.length})
            </button>
            <button
              onClick={() => setFilterMode("unmapped")}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                filterMode === "unmapped" ? "bg-white text-red-700 shadow-2xs font-bold" : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Unmapped ({stats.unmapped})
            </button>
            <button
              onClick={() => setFilterMode("auto")}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                filterMode === "auto" ? "bg-white text-amber-700 shadow-2xs font-semibold" : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Auto ({stats.auto})
            </button>
          </div>

          <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showUnmappedFirst}
              onChange={(e) => setShowUnmappedFirst(e.target.checked)}
              className="h-3.5 w-3.5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
            />
            Unmapped first
          </label>
        </div>
      </div>

      {/* Interactive Rows Table */}
      <div className="border border-gray-200 rounded-xl overflow-hidden mb-6">
        <div className="max-h-[460px] overflow-y-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider w-20">
                  Row
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Uploaded Identity
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider w-36">
                  Match Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider w-80">
                  Assigned Employee
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {displayRows.map((item) => {
                const assignedEmp = allEmployees.find((e) => e.id === item.matchedEmployeeId);
                const isUnmapped = item.matchedEmployeeId === null || item.isSkipped;
                const sharedCount = item.sharedCount || 1;

                return (
                  <tr
                    key={item.rowIndex}
                    className={`hover:bg-gray-50 transition-colors ${
                      isUnmapped ? "bg-red-50/25" : ""
                    }`}
                  >
                    {/* Row Number */}
                    <td className="px-4 py-3 text-xs font-mono text-gray-500 font-semibold whitespace-nowrap">
                      Row {item.rowNumber}
                    </td>

                    {/* Left: Uploaded Row Identifier */}
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-gray-900 text-sm">
                            {item.rawIdentifier || <span className="text-gray-400 italic">(Empty cell)</span>}
                          </span>
                          {sharedCount > 1 && (
                            <span
                              className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-bold rounded-full border border-blue-200 flex items-center gap-1"
                              title={`Linked with ${sharedCount} rows in the file sharing this same identity`}
                            >
                              <Layers className="w-3 h-3" />
                              {sharedCount} rows linked
                            </span>
                          )}
                        </div>
                        {item.rawSecondary && (
                          <span className="text-xs text-gray-500 mt-0.5 font-medium">
                            {item.rawSecondary}
                          </span>
                        )}
                        <span className="text-[11px] text-gray-400 mt-0.5 font-mono truncate max-w-md">
                          Preview: {JSON.stringify(rows[item.rowIndex] || {}).slice(0, 80)}...
                        </span>
                      </div>
                    </td>

                    {/* Middle: Match Status Badge */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      {item.isSkipped ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-600 border border-gray-300">
                          <XCircle className="w-3.5 h-3.5" />
                          Skipped
                        </span>
                      ) : item.matchStatus === "exact" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                          <CheckCircle className="w-3.5 h-3.5" />
                          Exact Match
                        </span>
                      ) : item.matchStatus === "auto" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                          <Sparkles className="w-3.5 h-3.5" />
                          Auto ({Math.round(item.confidenceScore * 100)}%)
                        </span>
                      ) : item.matchStatus === "manual" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                          <Check className="w-3.5 h-3.5" />
                          Manual
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-red-50 text-red-700 border border-red-200">
                          <AlertCircle className="w-3.5 h-3.5" />
                          Unmapped
                        </span>
                      )}
                    </td>

                    {/* Right: Employee Combobox / Select */}
                    <td className="px-4 py-3">
                      <div>
                        <select
                          value={item.matchedEmployeeId ?? "skip"}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === "skip") {
                              handleAssignEmployeeForIdentity(item.identityKey, null);
                            } else {
                              handleAssignEmployeeForIdentity(item.identityKey, parseInt(val, 10));
                            }
                          }}
                          className={`w-full px-3 py-1.5 text-xs rounded-lg border font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs ${
                            isUnmapped
                              ? "border-red-300 bg-white text-red-900 font-semibold"
                              : "border-gray-300 bg-white text-gray-800"
                          }`}
                        >
                          <option value="skip" className="text-gray-500 font-medium">
                            -- [Skip / Do Not Import] --
                          </option>
                          {allEmployees.map((emp) => {
                            const isClaimedByDifferentIdentity =
                              claimedEmployeeMap.has(emp.id) &&
                              claimedEmployeeMap.get(emp.id) !== item.identityKey;

                            return (
                              <option
                                key={emp.id}
                                value={emp.id}
                                className={isClaimedByDifferentIdentity ? "text-gray-400" : "text-gray-900 font-medium"}
                              >
                                {emp.firstName} {emp.lastName} (ID: {emp.id}
                                {emp.salaryIdentifier ? `, Sal: ${emp.salaryIdentifier}` : ""})
                                {isClaimedByDifferentIdentity ? " — [Assigned to other identity]" : ""}
                              </option>
                            );
                          })}
                        </select>
                        {sharedCount > 1 && (
                          <span className="block text-[11px] text-gray-500 mt-1">
                            Updating this will apply to all <strong>{sharedCount}</strong> rows with this identity.
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {displayRows.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center py-10 text-gray-500 text-sm">
                    No rows match current filter or search criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Warning Modal if Unmapped Rows Exist */}
      {confirmWarningOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-amber-200">
            <div className="flex items-center gap-3 text-amber-600 mb-3">
              <AlertCircle className="w-6 h-6 flex-shrink-0" />
              <h3 className="text-lg font-bold text-gray-900">
                Proceed with {stats.unmapped} unmapped {stats.unmapped === 1 ? "row" : "rows"}?
              </h3>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              There {stats.unmapped === 1 ? "is" : "are"} <strong>{stats.unmapped} {stats.unmapped === 1 ? "row" : "rows"}</strong> without an assigned employee.
              These rows will be <strong>skipped</strong> and not imported into the leave review table.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmWarningOpen(false)}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-100"
              >
                Review Mappings
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmWarningOpen(false);
                  const resultMap = new Map<number, number | null>();
                  rowMatches.forEach((rm) => {
                    resultMap.set(rm.rowIndex, rm.matchedEmployeeId);
                  });
                  onConfirm(resultMap);
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold shadow-xs"
              >
                Yes, Skip Unmapped & Continue
              </button>
            </div>
          </div>
        </div>
      )}
        </>
      )}

      {/* Bottom Navigation Actions */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-200">
        <button
          type="button"
          onClick={onBack}
          className="px-5 py-2.5 border border-gray-300 text-gray-700 hover:bg-gray-100 rounded-lg text-sm font-semibold transition-colors flex items-center gap-1.5"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Identity Method
        </button>

        <button
          type="button"
          onClick={handleContinue}
          className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold shadow-sm transition-colors flex items-center gap-2"
        >
          <span>Continue to Column Mapping</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
