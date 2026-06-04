import fs from 'fs';

let content = fs.readFileSync('App.tsx', 'utf-8');

const processStart = content.indexOf('const executeBatchUpdate = async () => {');
const processEnd = content.indexOf('const handleSelectAllTypes = (e: React.ChangeEvent<HTMLInputElement>) => {');

if (processStart !== -1 && processEnd !== -1) {
    const replacement = `
    const executeBatchUpdate = async () => {
        abortRef.current = false;
        setShowConfirmModal(false);
        setCurrentStep('processing');
        setIsLoading(prev => ({...prev, submitting: true}));
        setProgress(0);
        
        let wakeLock: any = null;
        try {
            if ('wakeLock' in navigator) {
                // @ts-ignore
                wakeLock = await navigator.wakeLock.request('screen');
            }
        } catch (err) {}

        const summary: any[] = [];
        const UPDATE_BATCH_SIZE = 5;
        
        try {
            const pendingAdjustments = [...adjustmentsToReview];
            
            // grouping
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
                
                const key = \`\${item.employeeName}_\${item.accountId}_\${item.billingMode}\`;
                if (!groupings.has(key)) groupings.set(key, []);
                groupings.get(key)!.push(item);
            });

            let finalRequests: any[] = [];
            groupings.forEach((rows, key) => {
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
            });

            for (let i = 0; i < finalRequests.length; i += UPDATE_BATCH_SIZE) {
                if (abortRef.current) break;
                const batch = finalRequests.slice(i, i + UPDATE_BATCH_SIZE);
                
                const promises = batch.map(async (req) => {
                    try {
                        await postAbsenceRequest(req.payload);
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
             // Release Wake Lock
             if (wakeLock) {
                try {
                    await wakeLock.release();
                } catch(e) {}
             }
            setIsLoading(prev => ({...prev, submitting: false}));
            setProgress(100);
            setCurrentStep('summary');
        }
    };

    `;
    content = content.substring(0, processStart) + replacement + content.substring(processEnd);
    fs.writeFileSync('App.tsx', content);
    console.log("Updated handleBatchUpdate correctly.");
} else {
    console.log("Could not find the function boundaries.");
}
