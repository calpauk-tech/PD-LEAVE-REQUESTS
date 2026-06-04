const fs = require('fs');

let content = fs.readFileSync('App.tsx', 'utf-8');

const targetStr = `            groupings.forEach((rows, key) => {
                rows.sort((a,b) => (a.start || "").localeCompare(b.start || ""));
                
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
            });`;

// We need to implement proper sequential bundling logic
const repStr = `            groupings.forEach((rows, key) => {
                const parseDate = (dstr) => {
                    const [y, m, d] = dstr.split('-').map(Number);
                    return new Date(y, m - 1, d);
                };

                rows.sort((a,b) => (a.start || "").localeCompare(b.start || ""));
                
                if (rows.length === 0) return;

                // Group into sequential chunks
                let currentChunk = [rows[0]];
                let chunks = [currentChunk];

                for (let i = 1; i < rows.length; i++) {
                    const curr = rows[i];
                    const prev = currentChunk[currentChunk.length - 1];
                    const currDate = parseDate(curr.start);
                    const prevDate = parseDate(prev.start);
                    
                    const diffTime = Math.abs(currDate.getTime() - prevDate.getTime());
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                    // Sequential dates will be automatically bundled
                    if (diffDays <= 3) {
                        currentChunk.push(curr);
                    } else {
                        currentChunk = [curr];
                        chunks.push(currentChunk);
                    }
                }

                chunks.forEach(chunk => {
                    const minStart = chunk[0].start;
                    const maxEnd = chunk[chunk.length - 1].end || chunk[chunk.length - 1].start;
                    const comment = chunk[0].comment;
                    const absenceType = chunk[0].absenceType;

                    const registrations = chunk.map(r => {
                        let unitStr = 'Hours';
                        if (r.billingMode && r.billingMode.toLowerCase() === 'days') unitStr = 'Days';
                        return {
                            date: r.start,
                            account: {
                                id: r.accountId,
                                costs: [
                                    {
                                        value: Number(r.cost),
                                        unit: { type: unitStr }
                                    }
                                ]
                            }
                        };
                    });
                    
                    finalRequests.push({
                        originalRows: chunk,
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
            });`;

if (content.indexOf(targetStr) !== -1) {
    content = content.replace(targetStr, repStr);
    fs.writeFileSync('App.tsx', content);
    console.log("Patched sequential bundling");
} else {
    console.log("Could not find grouping string");
}

let c = fs.readFileSync('App.tsx', 'utf-8');

// Replace standard terms
c = c.replace(/subtitle: 'Adj. balances'/g, "subtitle: 'Send requests'");
c = c.replace(/Make Adjustments/g, "Make Requests");
const oldUploadInstructions = 'Select the completed Excel file with your leave balance adjustments. Make sure to use the provided adjustment template generated from this app. Adjustments will be read from the file and prepared for your review before the update process starts.';
const newUploadInstructions = 'Select the completed Excel file with your leave requests. Make sure to use the provided template format or similar format. The requests will be read from the file and prepared for your review before the update process starts.';
c = c.replace(oldUploadInstructions, newUploadInstructions);
c = c.replace(/Pending Adjustments/g, "Pending Requests");
c = c.replace(/>Send Adjustments</g, ">Send Requests<");
c = c.replace(/Start New Adjustment/g, "Start New Process");
c = c.replace(/balance adjustments/g, "leave requests");
c = c.replace(/Planday_LeaveAdjustment_Results.xlsx/g, "Planday_LeaveRequests_Results.xlsx");

fs.writeFileSync('App.tsx', c);
console.log('UI Texts replaced');
