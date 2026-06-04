import fs from 'fs';

let content = fs.readFileSync('App.tsx', 'utf-8');

const targetStr = `                // Sheet 4: Leave Accounts
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
                XLSX.utils.book_append_sheet(wb, wsAccounts, "Leave Accounts");`;

const replaceStr = `                const wb = XLSX.utils.book_new();

                const wsRange = XLSX.utils.json_to_sheet(wsRangeData);
                const wsSingle = XLSX.utils.json_to_sheet(wsSingleData);
                const wsInstructions = XLSX.utils.json_to_sheet(wsInstructionsData);

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
                    styleHeader(wsAccounts, wsAccountsData.length);
                    wsAccounts['!cols'] = [{wch:25}, {wch:15}, {wch:15}, {wch:30}, {wch:15}];
                    XLSX.utils.book_append_sheet(wb, wsAccounts, "Leave Accounts");
                }`;

if (content.includes(targetStr)) {
    content = content.replace(targetStr, replaceStr);
} else {
    console.log("Could not find Target String. It might have small spacing differences.");
    console.log("Snippet present: ", content.includes('const styleHeader = (ws: any, jsonCount: number) => {'));
}
fs.writeFileSync('App.tsx', content);

