import fs from 'fs';

let content = fs.readFileSync('App.tsx', 'utf-8');

// Insert useState
const stateInsert = `    const [includeEmployeeAccounts, setIncludeEmployeeAccounts] = useState<boolean>(false);`;
content = content.replace(
    'const [includeInactive, setIncludeInactive] = useState(false);',
    'const [includeInactive, setIncludeInactive] = useState(false);\n' + stateInsert
);

// Modify handleDownloadTemplate accounts fetching logic
const fetchAccountsLogic = `            if (updateMethod === 'excel') {
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
                }`;

const fetchAccountsReplacement = `            if (updateMethod === 'excel') {
                const allAccountsWithEmployeeInfo: any[] = [];
                if (includeEmployeeAccounts) {
                    setLoadingText('Fetching accounts for the template...');
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
                } else {
                    setProgress(40);
                }`;
if (content.includes(fetchAccountsLogic)) {
    content = content.replace(fetchAccountsLogic, fetchAccountsReplacement);
} else {
    console.log("Could not find fetchAccountsLogic");
}


// Delete the wsAccounts sheet logic from where it is and append conditionally
const sheetLogic = `                // Sheet 4: Leave Accounts
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

                // Add styling to headers
                const styleRangeHeader = (ws: XLSX.WorkSheet) => {
                    const range = XLSX.utils.decode_range(ws['!ref'] || "A1:A1");
                    for(let C = range.s.c; C <= range.e.c; ++C) {
                        const address = XLSX.utils.encode_cell({c:C, r:0});
                        if(!ws[address]) continue;
                        ws[address].s = { font: { bold: true } };
                    }
                };

                styleRangeHeader(wsRange);
                styleRangeHeader(wsSingle);
                styleRangeHeader(wsInstructions);
                styleRangeHeader(wsAccounts);

                // Set column widths
                wsRange['!cols'] = [{wch:20}, {wch:15}, {wch:15}, {wch:12}, {wch:12}, {wch:20}, {wch:10}, {wch:15}, {wch:30}, {wch:10}];
                wsSingle['!cols'] = [{wch:20}, {wch:15}, {wch:15}, {wch:12}, {wch:20}, {wch:10}, {wch:15}, {wch:30}, {wch:10}];
                wsInstructions['!cols'] = [{wch:100}];
                wsAccounts['!cols'] = [{wch:25}, {wch:15}, {wch:15}, {wch:30}, {wch:15}];

                XLSX.utils.book_append_sheet(wb, wsInstructions, "Instructions");
                XLSX.utils.book_append_sheet(wb, wsRange, "Start and End Dates");
                XLSX.utils.book_append_sheet(wb, wsSingle, "Single Dates");
                XLSX.utils.book_append_sheet(wb, wsAccounts, "Leave Accounts");`;

const sheetLogicFixed = `                const wb = XLSX.utils.book_new();

                const wsRange = XLSX.utils.json_to_sheet(wsRangeData);
                const wsSingle = XLSX.utils.json_to_sheet(wsSingleData);
                const wsInstructions = XLSX.utils.json_to_sheet(wsInstructionsData);
                
                // Add styling to headers
                const styleRangeHeader = (ws: XLSX.WorkSheet) => {
                    const range = XLSX.utils.decode_range(ws['!ref'] || "A1:A1");
                    for(let C = range.s.c; C <= range.e.c; ++C) {
                        const address = XLSX.utils.encode_cell({c:C, r:0});
                        if(!ws[address]) continue;
                        ws[address].s = { font: { bold: true } };
                    }
                };

                styleRangeHeader(wsRange);
                styleRangeHeader(wsSingle);
                styleRangeHeader(wsInstructions);

                // Set column widths
                wsRange['!cols'] = [{wch:20}, {wch:15}, {wch:15}, {wch:12}, {wch:12}, {wch:20}, {wch:10}, {wch:15}, {wch:30}, {wch:10}];
                wsSingle['!cols'] = [{wch:20}, {wch:15}, {wch:15}, {wch:12}, {wch:20}, {wch:10}, {wch:15}, {wch:30}, {wch:10}];
                wsInstructions['!cols'] = [{wch:100}];
                
                XLSX.utils.book_append_sheet(wb, wsInstructions, "Instructions");
                XLSX.utils.book_append_sheet(wb, wsRange, "Start and End Dates");
                XLSX.utils.book_append_sheet(wb, wsSingle, "Single Dates");
                
                if (includeEmployeeAccounts) {
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
                    const wsAccounts = XLSX.utils.json_to_sheet(wsAccountsData);
                    styleRangeHeader(wsAccounts);
                    wsAccounts['!cols'] = [{wch:25}, {wch:15}, {wch:15}, {wch:30}, {wch:15}];
                    XLSX.utils.book_append_sheet(wb, wsAccounts, "Leave Accounts");
                }`;
if (content.includes(sheetLogic)) {
    content = content.replace(sheetLogic, sheetLogicFixed);
} else {
    console.log("Could not find sheetLogic");
}


// Update heading
content = content.replace(
    `<h2 className="text-2xl font-bold mb-6 text-gray-800">{updateMethod === 'excel' ? 'Configure & Download Template' : 'Select Accounts to Update'}</h2>`,
    `{updateMethod !== 'excel' && <h2 className="text-2xl font-bold mb-6 text-gray-800">Select Accounts to Update</h2>}`
);

// Update text banner
content = content.replace(
    `When downloading the template for Excel Bulk upload, the file will contain a "Leave Accounts" sheet with all available leave accounts for the filtered employees below. You do not need to select account types or validity periods here.`,
    `You can generate a template to use for bulk upload of leave requests. The file will contain the necessary columns needed, example data, and instructions. You can also choose to include employee and leave account data which will be added as a "Leave Accounts" sheet with all available leave accounts for the filtered employees below.`
);

// Filter Employees UI
const filtersSectionRegex = /(<div className="mt-8 bg-gray-50 p-4 border border-gray-200 rounded-lg">\s*)<h3 className="text-sm font-bold text-gray-700 mb-3">Filter Employees \(Optional\)<\/h3>/;
const filtersReplacement = 
`{updateMethod === 'excel' && (
    <div className="mt-8 bg-white p-4 border border-gray-200 rounded-lg shadow-sm">
        <h3 className="text-sm font-bold text-gray-700 mb-2">Include Employee Accounts in the template?</h3>
        <div className="flex items-center space-x-4">
            <label className="flex items-center space-x-2 cursor-pointer">
                <input type="radio" className="form-radio text-blue-600" name="includeEmployeeAccounts" checked={includeEmployeeAccounts === false} onChange={() => setIncludeEmployeeAccounts(false)} />
                <span className="text-sm text-gray-700">No</span>
            </label>
            <label className="flex items-center space-x-2 cursor-pointer">
                <input type="radio" className="form-radio text-blue-600" name="includeEmployeeAccounts" checked={includeEmployeeAccounts === true} onChange={() => setIncludeEmployeeAccounts(true)} />
                <span className="text-sm text-gray-700">Yes</span>
            </label>
        </div>
    </div>
)}

{(updateMethod !== 'excel' || includeEmployeeAccounts) && (
$1<h3 className="text-sm font-bold text-gray-700 mb-3">Filter Employees</h3>`;

if (content.match(filtersSectionRegex)) {
    content = content.replace(filtersSectionRegex, filtersReplacement);
} else {
    console.log("Could not find filtersSectionRegex");
}

// Close the wrapper
const closeTarget = `                            </div>
                        </div>
                        
                        <div className="mt-8 pt-6 border-t border-gray-200">`;
const closeReplacement = `                            </div>
                        </div>
                        )}
                        
                        <div className="mt-8 pt-6 border-t border-gray-200">`;
if (content.includes(closeTarget)) {
    content = content.replace(closeTarget, closeReplacement);
} else {
    console.log("Could not find closeTarget");
}


fs.writeFileSync('App.tsx', content);

