import fs from 'fs';

let appContent = fs.readFileSync('App.tsx', 'utf-8');

const regex = /let billingModeError: string \| undefined = undefined;[\s\S]*?if \(accountId\) \{[\s\S]*?\}\s*return \{/g;

const replacement = `let billingModeError: string | undefined = undefined;
                    let billingMode = String(row['Billing mode'] || '');
                    if (accountId) {
                        const salId = String(row['Salary ID'] || '');
                        const empName = String(row['Employee'] || '');
                        let emp = null;
                        if (salId) emp = allEmployees.find(e => e.salaryIdentifier === salId);
                        if (!emp) emp = allEmployees.find(e => \`\${e.firstName} \${e.lastName}\`.toLowerCase() === empName.trim().toLowerCase());
                        
                        if (emp && employeeCache.has(emp.id)) {
                            const cache = employeeCache.get(emp.id);
                            // Find the individual employee leave account
                            const empAcc = cache.accounts.find((a: any) => a.id === accountId);
                            if (empAcc) {
                                // Find the Global Leave account type for its unit
                                const typeDef = accountTypes.find(t => t.id === empAcc.typeId);
                                if (typeDef && typeDef.unit && billingMode) {
                                    if (billingMode.toLowerCase() !== typeDef.unit.toLowerCase()) {
                                        billingModeError = \`Template billing mode is '\${billingMode}'. Account expected '\${typeDef.unit}'. Will auto-convert.\`;
                                    }
                                }
                            }
                        }
                    }
                    
                    return {`;
                    
appContent = appContent.replace(regex, replacement);

fs.writeFileSync('App.tsx', appContent);
console.log('Fixed billing mode tracking');
