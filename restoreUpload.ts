import fs from 'fs';

let content = fs.readFileSync('App.tsx', 'utf-8');

const tStart = content.indexOf('const handleSwitchDateFormat = () => {');

if (tStart !== -1) {
    const fnDef = `    const processUploadedFile = (file: File, formatOverride?: 'EU' | 'US') => {
        setError(null);
        setUploadConflicts(null);
        setUploadValidityErrors(null);
        setLastUploadedFile(file);
        
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = new Uint8Array(event.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array', cellDates: true });
                // We should prioritize "Start and End Dates" or "Single Dates"
                let worksheet = workbook.Sheets["Start and End Dates"] || workbook.Sheets["Single Dates"];
                if (!worksheet) worksheet = workbook.Sheets[workbook.SheetNames[0]];

                const json: any[] = XLSX.utils.sheet_to_json(worksheet, { raw: true });
                
                const reviews = json.map((row, idx): any => {
                    const startRaw = row['Start'] || row['Date'];
                    const endRaw = row['End'] || row['Date'] || startRaw;
                    let startDate = null;
                    let endDate = null;
                    
                    if (startRaw instanceof Date) startDate = startRaw.toISOString().split('T')[0];
                    if (endRaw instanceof Date) endDate = endRaw.toISOString().split('T')[0];
                    if (!startDate && typeof startRaw === 'string') {
                        // Assuming string format like YYYY-MM-DD
                        if (startRaw.match(/^\\d{4}-\\d{2}-\\d{2}$/)) startDate = startRaw;
                    }
                    if (!endDate && typeof endRaw === 'string') {
                        if (endRaw.match(/^\\d{4}-\\d{2}-\\d{2}$/)) endDate = endRaw;
                    }

                    let accountId = null;
                    const accountMatch = String(row['Account']).match(/\\d+/); 
                    if (accountMatch) accountId = parseInt(accountMatch[0], 10);
                    else if (typeof row['Account'] === 'number') accountId = row['Account'];
                    
                    if(!accountId) accountId = row['Account ID'];
                    
                    return {
                        id: \`adj-\${idx}-\${Date.now()}\`,
                        employeeName: row['Employee'] || 'Unknown',
                        salaryIdentifier: row['Salary ID'] || null,
                        accountId: accountId || 0,
                        accountName: String(row['Account'] || 'Unknown'),
                        date: startDate,
                        start: startDate,
                        end: endDate,
                        cost: parseFloat(row['Cost']) || 1, // Defaulting cost to 1 typically for leave
                        billingMode: String(row['Billing mode'] || ''),
                        comment: String(row['Comment'] || ''),
                        status: 'pending',
                        error: (!startDate) ? 'Invalid Date' : undefined,
                        isValidationError: !startDate || !accountId
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
    content = content.substring(0, tStart) + fnDef + content.substring(tStart);
    fs.writeFileSync('App.tsx', content);
    console.log("Restored processUploadedFile");
}
