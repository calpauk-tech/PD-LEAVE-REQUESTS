import fs from 'fs';

let content = fs.readFileSync('App.tsx', 'utf-8');

const tStart = content.indexOf('const handleDownloadTemplate = async () => {');
const tEnd = content.indexOf('    const handleSwitchDateFormat = () => {');

if (tStart !== -1 && tEnd !== -1) {
    const replacement = `
    const handleDownloadTemplate = async () => {
        if (updateMethod !== 'excel' && selectedTypeIds.size === 0) { setError("Please select at least one account type."); return; }
        
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
            
            if (updateMethod === 'excel') {
                setLoadingText('Fetching accounts for the template...');

                const allAccountsWithEmployeeInfo: any[] = [];
                for (let i = 0; i < employees.length; i += FETCH_BATCH_SIZE) {
                    if (abortRef.current) throw new Error("Process stopped by user.");
                    const batchEmployees = employees.slice(i, i + FETCH_BATCH_SIZE);
                    const promises = batchEmployees.map(emp => fetchLeaveAccounts(emp.id, undefined).then(accounts => ({ emp, accounts })));
                    const results = await Promise.all(promises);
                    allAccountsWithEmployeeInfo.push(...results);
                    await new Promise(resolve => setTimeout(resolve, 125));
                    const completed = Math.min(i + FETCH_BATCH_SIZE, employees.length);
                    setProgress(10 + Math.round((completed / employees.length) * 30));
                }

                setProgress(50);
                
                // Sheet 1: Start and End Dates (example)
                const wsRangeData = [
                    { "Employee": "John Doe", "Tax ID": "", "Salary ID": "123456", "Start": "2026-06-01", "End": "2026-06-02", "Account": "Annual Leave", "Cost": 1, "Billing mode": "", "Comment": "Summer vacation", "Status": "Pending" }
                ];
                
                // Sheet 2: Single Dates (example)
                const wsSingleData = [
                    { "Employee": "Jane Doe", "Tax ID": "", "Salary ID": "654321", "Date": "2026-06-05", "Account": "Annual Leave", "Cost": 1, "Billing mode": "", "Comment": "Doctor appointment", "Status": "Pending" }
                ];

                // Sheet 3: Instructions
                const wsInstructionsData = [
                    { "Instruction": "Welcome to Planday Bulk Leave Requests." },
                    { "Instruction": "You have two sheets you can use to upload requests: 'Start and End Dates' or 'Single Dates'." },
                    { "Instruction": "The 'Start and End Dates' sheet is best used for multi-day requests (e.g. 5 days of vacation)." },
                    { "Instruction": "The 'Single Dates' sheet is best used for single day requests or when dates are non-sequential. Sequential dates will be automatically bundled." },
                    { "Instruction": "Ensure date format is matching your system format (e.g., YYYY-MM-DD or DD/MM/YYYY)." },
                    { "Instruction": "The 'Account' column should match the name of the leave account." },
                    { "Instruction": "Use the 'Leave Accounts' sheet to find available accounts for your filtered employees." },
                    { "Instruction": "NOTE: You MUST save the file as XLSX. Do NOT upload an empty sheet. Delete the example sheet you are not using, or both are processed." }
                ];

                // Sheet 4: Leave Accounts
                const wsAccountsData: any[] = [];
                allAccountsWithEmployeeInfo.forEach(({emp, accounts}) => {
                    accounts.forEach((acc: any) => {
                        wsAccountsData.push({
                            "Full Name": \`\${emp.firstName} \${emp.lastName}\`,
                            "Tax ID": emp.ssn || "",
                            "Salary ID": emp.salaryIdentifier || "",
                            "Leave Account Name": acc.name,
                            "Account ID": acc.id
                        });
                    });
                });

                const wb = XLSX.utils.book_new();

                const wsRange = XLSX.utils.json_to_sheet(wsRangeData);
                const wsSingle = XLSX.utils.json_to_sheet(wsSingleData);
                const wsInstructions = XLSX.utils.json_to_sheet(wsInstructionsData);
                const wsAccounts = XLSX.utils.json_to_sheet(wsAccountsData);

                const styleHeader = (ws: any, jsonCount: number) => {
                    if (jsonCount === 0) return;
                    const range = XLSX.utils.decode_range(ws['!ref'] as string);
                    for (let C = range.s.c; C <= range.e.c; ++C) {
                        const cellAddress = { c: C, r: 0 };
                        const cellRef = XLSX.utils.encode_cell(cellAddress);
                        if (!ws[cellRef]) continue;
                        ws[cellRef].s = {
                            fill: { fgColor: { rgb: "000080" } },
                            font: { color: { rgb: "FFFFFF" }, bold: true }
                        };
                    }
                };

                styleHeader(wsRange, wsRangeData.length);
                styleHeader(wsSingle, wsSingleData.length);
                styleHeader(wsInstructions, wsInstructionsData.length);
                styleHeader(wsAccounts, wsAccountsData.length);

                wsRange['!cols'] = [{wch:20}, {wch:15}, {wch:15}, {wch:12}, {wch:12}, {wch:20}, {wch:10}, {wch:15}, {wch:30}, {wch:10}];
                wsSingle['!cols'] = [{wch:20}, {wch:15}, {wch:15}, {wch:12}, {wch:20}, {wch:10}, {wch:15}, {wch:30}, {wch:10}];
                wsInstructions['!cols'] = [{wch:100}];
                wsAccounts['!cols'] = [{wch:25}, {wch:15}, {wch:15}, {wch:30}, {wch:15}];

                XLSX.utils.book_append_sheet(wb, wsInstructions, "Instructions");
                XLSX.utils.book_append_sheet(wb, wsRange, "Start and End Dates");
                XLSX.utils.book_append_sheet(wb, wsSingle, "Single Dates");
                XLSX.utils.book_append_sheet(wb, wsAccounts, "Leave Accounts");

                XLSX.writeFile(wb, \`Planday_Leave_Requests_\${getTodayYYYYMMDD()}.xlsx\`);
                
                setProgress(100);
                setCurrentStep('upload');

            } else {
                setLoadingText('Fetching accounts...');
                const allAccountsWithEmployeeInfo: any[] = [];
                for (let i = 0; i < employees.length; i += FETCH_BATCH_SIZE) {
                    if (abortRef.current) throw new Error("Process stopped by user.");
                    const batchEmployees = employees.slice(i, i + FETCH_BATCH_SIZE);
                    let apiDateFilter: any;
                    if (validityMode === 'custom' && dateRange.start && dateRange.end) apiDateFilter = dateRange;
                    const promises = batchEmployees.map(emp => fetchLeaveAccounts(emp.id, apiDateFilter).then(accounts => ({ emp, accounts })));
                    const results = await Promise.all(promises);
                    allAccountsWithEmployeeInfo.push(...results);
                    await new Promise(resolve => setTimeout(resolve, 125));
                    const completed = Math.min(i + FETCH_BATCH_SIZE, employees.length);
                    setProgress(10 + Math.round((completed / employees.length) * 30));
                }

                setProgress(42);
                const filteredAccountsList: any[] = [];
                allAccountsWithEmployeeInfo.forEach(({ emp, accounts }) => {
                    const filtered = accounts.filter((acc: any) => selectedTypeIds.has(acc.typeId));
                    filtered.forEach((acc: any) => {
                        filteredAccountsList.push({ accountId: acc.id, emp, acc });
                    });
                });
                setProgress(45);

                if (filteredAccountsList.length === 0) {
                    setFetchedTemplateData([]);
                    throw new Error("No leave accounts found matching the selected criteria.");
                }

                const allTemplateRows: any[] = [];
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
                        date: getTodayYYYYMMDD(),
                    });
                });
                setProgress(90);
                
                setLoadingText('Preparing editor...');
                const editorRows: any[] = allTemplateRows.map(row => validateRow({
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
            }

        } catch (err: any) {
            handleApiError(err);
            console.error(err);
        } finally {
            setIsLoading(prev => ({ ...prev, template: false }));
            setHasAttemptedSubmit(false);
        }
    };
`;
    content = content.substring(0, tStart) + replacement + content.substring(tEnd);
    fs.writeFileSync('App.tsx', content);
    console.log("Updated handleDownloadTemplate");
} else {
    console.log("Could not find boundaries.");
}
