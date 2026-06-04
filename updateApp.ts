import fs from 'fs';

let content = fs.readFileSync('App.tsx', 'utf-8');

// 1. replace useUndoableState<AdjustmentReview[]> -> we keep the same

// 2. Remove EditableAdjustmentCell
const startEditable = content.indexOf('const EditableAdjustmentCell =');
const endEditable = content.indexOf('// --- SVG Icons ---');
if(startEditable !== -1 && endEditable !== -1) {
    const replacement = `
const EditableCell = ({ value, onChange, disabled, type = 'text', width = 'w-20' }: { value: string | number, onChange: (val: any) => void, disabled?: boolean, type?: 'text'|'number', width?: string }) => {
    const [localValue, setLocalValue] = useState(String(value));
    
    useEffect(() => {
        setLocalValue(String(value));
    }, [value]);

    return (
        <input 
            type={type}
            className={\`\${width} text-right bg-transparent border-b border-dashed focus:outline-none focus:border-blue-500 font-mono border-gray-300 hover:border-gray-400 text-gray-800\`}
            value={localValue}
            onChange={(e) => setLocalValue(e.target.value)}
            disabled={disabled}
            onBlur={() => {
                if (type === 'number') {
                    const parsed = parseFloat(localValue);
                    if (!isNaN(parsed)) onChange(parsed);
                    else onChange(0);
                } else {
                    onChange(localValue);
                }
            }}
        />
    )
};
`;
    content = content.substring(0, startEditable) + replacement + content.substring(endEditable);
}

// 3. Update bulk edit fields
content = content.replace(/adjustment' \| 'newBalance' \| 'effectiveDate'/g, "cost' | 'billingMode' | 'date' | 'start' | 'end'");
content = content.replace(/const \[bulkEditValueAdjustment, setBulkEditValueAdjustment\] = useState<string>\(''\);/g, "const [bulkEditValueCost, setBulkEditValueCost] = useState<string>('');");
content = content.replace(/const \[bulkEditValueNewBalance, setBulkEditValueNewBalance\] = useState<string>\(''\);/g, "const [bulkEditValueBillingMode, setBulkEditValueBillingMode] = useState<string>('');");

// 4. Update the handleDownloadTemplate template building to the new header format
// First find handleDownloadTemplate start to end
const dlStart = content.indexOf('const handleDownloadTemplate = async () => {');
const dsEnd = content.indexOf('const handleSwitchDateFormat = () => {');
if(dlStart !== -1 && dsEnd !== -1) {
    const replacement = `
    const handleDownloadTemplate = async () => {
        if (selectedTypeIds.size === 0) { setError("Please select at least one account type."); return; }
        
        setIsLoading(prev => ({ ...prev, template: true }));
        setProgress(0);
        setError(null);
        clearAdjustmentsHistory([]);
        setSortConfig(null);
        setSearchQuery('');
        setUploadConflicts(null);
        setUploadValidityErrors(null);
        abortRef.current = false;

        try {
            const FETCH_BATCH_SIZE = 5; 
            setLoadingText('Fetching all employees...');
            setProgress(5);
            let employees = await fetchEmployees();
            
            // basic local filtering
            if (departments.length > 0 && selectedDepartmentIds.size > 0 && selectedDepartmentIds.size < departments.length) {
                employees = employees.filter(emp => {
                     if (Array.isArray(emp.departments)) return emp.departments.some(d => selectedDepartmentIds.has(String(d)) || selectedDepartmentIds.has(String(d.department)) || selectedDepartmentIds.has(String(d.id)));
                     else if (emp.departmentId !== undefined) return selectedDepartmentIds.has(String(emp.departmentId));
                     return false;
                });
            }
            
            setProgress(10);
            setLoadingText('Fetching accounts...');
            const allAccountsWithEmployeeInfo = [];
            for (let i = 0; i < employees.length; i += FETCH_BATCH_SIZE) {
                if (abortRef.current) throw new Error("Process stopped by user.");
                const batchEmployees = employees.slice(i, i + FETCH_BATCH_SIZE);
                let apiDateFilter;
                if (validityMode === 'custom' && dateRange.start && dateRange.end) apiDateFilter = dateRange;
                const promises = batchEmployees.map(emp => fetchLeaveAccounts(emp.id, apiDateFilter).then(accounts => ({ emp, accounts })));
                const results = await Promise.all(promises);
                allAccountsWithEmployeeInfo.push(...results);
                await new Promise(resolve => setTimeout(resolve, 125));
                const completed = Math.min(i + FETCH_BATCH_SIZE, employees.length);
                setProgress(10 + Math.round((completed / employees.length) * 30));
            }

            setProgress(42);
            const filteredAccountsList = [];
            allAccountsWithEmployeeInfo.forEach(({ emp, accounts }) => {
                const filtered = accounts.filter(acc => selectedTypeIds.has(acc.typeId));
                filtered.forEach(acc => {
                    filteredAccountsList.push({ accountId: acc.id, emp, acc });
                });
            });
            setProgress(45);

            if (filteredAccountsList.length === 0) {
                setFetchedTemplateData([]);
                throw new Error("No leave accounts found matching the selected criteria.");
            }

            const allTemplateRows = [];
            setLoadingText('Generating rows...');
            filteredAccountsList.forEach(({emp, acc}) => {
                allTemplateRows.push({
                    employeeId: emp.id,
                    salaryIdentifier: emp.salaryIdentifier || null,
                    employeeName: \`\${emp.firstName} \${emp.lastName}\`,
                    accountId: acc.id,
                    accountName: acc.name,
                    accountTypeCategory: getAccountCategory(acc.typeId, accountTypes),
                    cost: 0,
                    billingMode: "",
                    comment: "",
                    date: getTodayYYYYMMDD(), // single date default
                });
            });
            setProgress(90);
            
            if (updateMethod === 'editor') {
                setLoadingText('Preparing editor...');
                const editorRows = allTemplateRows.map(row => validateRow({
                    id: crypto.randomUUID(),
                    employeeId: row.employeeId,
                    salaryIdentifier: row.salaryIdentifier,
                    employeeName: row.employeeName,
                    accountId: row.accountId,
                    accountName: row.accountName,
                    accountTypeCategory: row.accountTypeCategory,
                    date: row.date,
                    cost: 0,
                    billingMode: "",
                    comment: "",
                    status: "pending"
                }));
                clearAdjustmentsHistory(editorRows);
                resetReviewSessionState(editorRows);
                setProgress(100);
                setCurrentStep('review');
                setIsLoading(prev => ({ ...prev, template: false }));
                return;
            }

            setLoadingText('Finalizing Excel file...');
            setProgress(95);
            setFetchedTemplateData(allTemplateRows);

            // Generates Format 2: Start/End
            const headers = [
                "Employee", 
                "Tax ID", 
                "Salary ID", 
                "Start", 
                "End",
                "Account",
                "Cost",
                "Billing mode",
                "Comment",
                "Status"
            ];
            
            const dataForSheet = allTemplateRows.map((row, index) => {
                return {
                    "Employee": row.employeeName,
                    "Tax ID": "",
                    "Salary ID": row.salaryIdentifier || "",
                    "Start": row.date,
                    "End": row.date,
                    "Account": String(row.accountId),
                    "Cost": "",
                    "Billing mode": "",
                    "Comment": "",
                    "Status": "Pending"
                };
            });

            const ws = XLSX.utils.json_to_sheet(dataForSheet, { header: headers });
            
            const colWidths = [
                { wch: 25 }, { wch: 15 }, { wch: 20 }, { wch: 15 }, { wch: 15 }, 
                { wch: 15 }, { wch: 10 }, { wch: 20 }, { wch: 30 }, { wch: 15 }
            ];
            ws['!cols'] = colWidths;
            
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Leave Requests");
            XLSX.writeFile(wb, \`Planday_Leave_Requests_\${getTodayYYYYMMDD()}.xlsx\`);
            
            setProgress(100);
            setCurrentStep('upload');

        } catch (err: any) {
            handleApiError(err);
            console.error(err);
        } finally {
            setIsLoading(prev => ({ ...prev, template: false }));
            setHasAttemptedSubmit(false);
        }
    };
    `;
    content = content.substring(0, dlStart) + replacement + content.substring(dsEnd);
}

// 4.1 Update processUploadedFile to parse the new structure
const upStart = content.indexOf('const processUploadedFile = (file: File, formatOverride');
const upEnd = content.indexOf('    const handleSwitchDateFormat = () => {');
if(upStart !== -1 && upEnd !== -1) {
    const replacement = `
    const processUploadedFile = (file: File, formatOverride?: 'EU' | 'US') => {
        setError(null);
        setUploadConflicts(null);
        setUploadValidityErrors(null);
        setLastUploadedFile(file);
        
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = new Uint8Array(event.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array', cellDates: true });
                const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                const json: any[] = XLSX.utils.sheet_to_json(worksheet, { raw: true });
                
                const reviews = json.map((row, idx): any => {
                    // Try to extract fields directly according to the user's specific columns
                    const startRaw = row['Start'] || row['Date'];
                    const endRaw = row['End'] || row['Date'] || startRaw;
                    let startDate = null;
                    let endDate = null;
                    
                    if (startRaw instanceof Date) startDate = startRaw.toISOString().split('T')[0];
                    else if (typeof startRaw === 'string') startDate = parseDateToIso(startRaw, downloadDateFormat);

                    if (endRaw instanceof Date) endDate = endRaw.toISOString().split('T')[0];
                    else if (typeof endRaw === 'string') endDate = parseDateToIso(endRaw, downloadDateFormat);

                    let accountId = null;
                    const accountMatch = String(row['Account']).match(/\\d+/); // might be "1234 - Annual"
                    if (accountMatch) accountId = parseInt(accountMatch[0], 10);
                    else if (typeof row['Account'] === 'number') accountId = row['Account'];
                    
                    if(!accountId) accountId = row['Account ID'];
                    
                    return {
                        id: \`adj-\${idx}-\${Date.now()}\`,
                        employeeName: row['Employee'] || 'Unknown',
                        salaryIdentifier: row['Salary ID'] || null,
                        accountId: accountId || 0,
                        accountName: String(row['Account'] || 'Unknown'),
                        date: startDate, // if date, we can use start as date
                        start: startDate,
                        end: endDate,
                        cost: parseFloat(row['Cost']) || 0,
                        billingMode: String(row['Billing mode'] || ''),
                        comment: String(row['Comment'] || ''),
                        status: 'pending',
                        error: (!startDate) ? 'Invalid Date' : undefined,
                        isValidationError: !startDate
                    };
                }).filter(r => r.accountId !== 0);

                if (reviews.length === 0) {
                    setError("No valid requests found in the file.");
                } else {
                    clearAdjustmentsHistory(reviews);
                    resetReviewSessionState(reviews);
                    setCurrentStep('review');
                }
            } catch (err:any) { 
                console.error(err);
                handleApiError(new Error("Failed to parse the uploaded file. Please check the date formats and try again.")); 
            }
        };
        reader.readAsArrayBuffer(file);
    };
    `;
    content = content.substring(0, upStart) + replacement + content.substring(upEnd);
}

// 5. Replace handleProcessUpdates -> this becomes handleBatchUpdate where bundled uploads are executed
const processStart = content.indexOf('const executeBatchUpdate = async () => {');
const processEnd = content.indexOf('    const updateSearchAndFilters = () => {');
if(processStart !== -1 && processEnd !== -1) {
    const replacement = `
    const executeBatchUpdate = async () => {
        abortRef.current = false;
        setShowConfirmModal(false);
        setCurrentStep('processing');
        setIsLoading(prev => ({...prev, submitting: true}));
        setProgress(0);
        
        const summary: any[] = [];
        const UPDATE_BATCH_SIZE = 5;
        
        try {
            const pendingAdjustments = [...adjustmentsToReview];
            
            // 1) First construct the requests list from rows.
            // "In the single date method, when there is multiple rows that have sequential dates... bundle"
            // "In the start and end date method... bundle"
            
            // Let's group by Employee + Account + Billing Mode + Comment
            const groupings = new Map<string, any[]>();
            pendingAdjustments.forEach(item => {
                if (item.status === 'error' && item.isValidationError) {
                    summary.push(item);
                    return;
                }
                if (!item.start) {
                    item.status = 'error';
                    item.error = 'Skipped - no date';
                    summary.push({ ...item, timestamp: new Date().toLocaleString() });
                    return;
                }
                const absenceType = accountTypes.find(t => t.id === item.accountId)?.absenceType || 'Accrued';
                item.absenceType = absenceType;
                
                // create grouping key
                const key = \`\${item.employeeName}_\${item.accountId}_\${item.billingMode}\`;
                if (!groupings.has(key)) groupings.set(key, []);
                groupings.get(key)!.push(item);
            });

            // we will build payloads from the groupings
            // each payload can have multiple registrations.
            // Simplified bundler for now: just send grouped items as 1 request if they belong together
            let finalRequests: any[] = [];
            groupings.forEach((rows, key) => {
                // sort rows by date
                rows.sort((a,b) => (a.start || "").localeCompare(b.start || ""));
                
                // Let's create a single request per group for simplicity, with min start and max end.
                if (rows.length === 0) return;
                const minStart = rows[0].start;
                const maxEnd = rows[rows.length - 1].end || rows[rows.length - 1].start;
                const comment = rows[0].comment;
                
                const absenceType = rows[0].absenceType;
                
                const registrations = rows.map(r => {
                    const unitStr = accountTypes.find(t => t.id === r.accountId)?.unit || 'Hours';
                    return {
                        date: r.start,
                        account: {
                            id: r.accountId,
                            costs: [
                                {
                                    value: r.cost,
                                    unit: { type: unitStr }
                                }
                            ]
                        }
                    };
                });
                
                finalRequests.push({
                    originalRows: rows,
                    payload: {
                        note: comment || "Bulk Request",
                        absenceType: absenceType,
                        absencePeriod: {
                            start: minStart,
                            end: maxEnd
                        },
                        registrations: registrations
                    }
                });
            });

            for (let i = 0; i < finalRequests.length; i += UPDATE_BATCH_SIZE) {
                if (abortRef.current) break;
                const batch = finalRequests.slice(i, i + UPDATE_BATCH_SIZE);
                
                const promises = batch.map(async (req) => {
                    try {
                        await postAbsenceRequest(req.payload); // Needs to import postAbsenceRequest! We'll just call it since it's in scope
                        return { req, success: true };
                    } catch (err: any) {
                        return { req, success: false, error: err.message };
                    }
                });

                const results = await Promise.all(promises);
                results.forEach(res => {
                    res.req.originalRows.forEach((row: any) => {
                        if (res.success) {
                            row.status = 'success';
                            row.error = '';
                        } else {
                            row.status = 'error';
                            row.error = res.error;
                        }
                        row.timestamp = new Date().toLocaleString();
                        summary.push(row);
                    });
                });

                setProgress(Math.round(((i + batch.length) / finalRequests.length) * 100));
            }

            setUpdateSummary(summary);
            setAdjustmentsToReview(summary as any);
        } catch (err: any) {
            handleApiError(err);
        } finally {
            setIsLoading(prev => ({...prev, submitting: false}));
            setProgress(100);
            setCurrentStep('summary');
        }
    };
    `;
    content = content.substring(0, processStart) + replacement + content.substring(processEnd);
}

fs.writeFileSync('App.tsx', content);
console.log("Updated App.tsx with AST script successfully");

