import fs from 'fs';

let content = fs.readFileSync('App.tsx', 'utf-8');

// The thead part
const theadStartStr = '<thead className="text-xs text-gray-700 uppercase bg-gray-50 sticky top-0 z-10 shadow-sm">';
const tbodyStartStr = '<tbody>{paginatedReviews.map((adj, idx) => {';
const tbodyEndStr = '</tbody>';

const theadStart = content.indexOf(theadStartStr);
const tbodyStart = content.indexOf(tbodyStartStr);
if (theadStart !== -1 && tbodyStart !== -1) {
    const newThead = `
<thead className="text-xs text-gray-700 uppercase bg-gray-50 sticky top-0 z-10 shadow-sm">
    <tr>
        <th scope="col" className="px-4 py-3 w-10">
            <input 
                type="checkbox" 
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                checked={sortedReviews.length > 0 && Array.from(selectedReviewIds).some(id => sortedReviews.some(r => r.id === id))}
                onChange={(e) => {
                    if (e.target.checked) handleSelectFiltered();
                    else setSelectedReviewIds(new Set());
                }}
            />
        </th>
        <th scope="col" className="px-4 py-3 align-middle text-left">
            <div className="flex flex-col flex-start py-2">
            <div className="flex items-center gap-1 cursor-pointer hover:bg-gray-100 transition-colors group px-2 py-1 rounded" onClick={() => handleSort('employeeName')}>
                Employee ({sortedReviews.length}/{adjustmentsToReview.length})
                {sortConfig?.key === 'employeeName' && (sortConfig.direction === 'asc' ? <SortAscIcon className="h-3 w-3"/> : <SortDescIcon className="h-3 w-3"/>)}
            </div>
            {selectedReviewIds.size > 0 && (
                <div className="flex gap-2 w-full justify-start mt-1">
                    <button onClick={(e) => { e.stopPropagation(); handleClearSelection(); }} className="text-xs px-2 py-1 rounded border border-gray-300 bg-white hover:bg-gray-100 text-gray-700">Clear</button>
                    <button onClick={(e) => { e.stopPropagation(); handleRemoveSelected(); }} className="text-xs px-2 py-1 rounded border border-red-300 bg-red-50 hover:bg-red-100 text-red-700">Remove</button>
                </div>
            )}
            </div>
        </th>
        <th scope="col" className="px-4 py-3 align-middle text-left cursor-pointer hover:bg-gray-100 transition-colors group" onClick={() => handleSort('accountName')}>
            <div className="flex items-center justify-start gap-1">Account {sortConfig?.key === 'accountName' && (sortConfig.direction === 'asc' ? <SortAscIcon className="h-3 w-3"/> : <SortDescIcon className="h-3 w-3"/>)}</div>
        </th>
        <th scope="col" className="px-4 py-3 align-middle text-left">Date / Start Date</th>
        <th scope="col" className="px-4 py-3 align-middle text-left">End Date</th>
        <th scope="col" className="px-2 py-3 align-middle text-left cursor-pointer hover:bg-gray-100 transition-colors group w-24">Cost</th>
        <th scope="col" className="px-4 py-3 align-middle text-left">Billing Mode</th>
        <th scope="col" className="px-4 py-3 align-middle text-left">Comment</th>
    </tr>
</thead>
`;

    let tbodyEndIdx = content.indexOf(tbodyEndStr, tbodyStart);
    if(tbodyEndIdx !== -1) {
        tbodyEndIdx += tbodyEndStr.length;
        
        const newTbody = `
<tbody>{paginatedReviews.map((adj, idx) => {
    const isRowError = hasAttemptedSubmit && (adj.isValidationError || !adj.start);
    return (
    <tr key={adj.id} className={\`border-b hover:bg-gray-50 \${isRowError ? 'bg-red-50' : 'bg-white'}\`}>
        <td className="px-4 py-3 text-center">
            <input 
                type="checkbox" 
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                checked={selectedReviewIds.has(adj.id)}
                onChange={() => toggleReviewSelection(adj.id)}
            />
        </td>
        <td className="px-4 py-3 font-medium text-gray-900 leading-tight align-middle">
            <div>{adj.employeeName}</div>
            {adj.salaryIdentifier && <div className="text-xs font-mono text-gray-500 mt-0.5">SID: {adj.salaryIdentifier}</div>}
        </td>
        <td className="px-4 py-3 align-middle">{adj.accountName}</td>
        <td className="px-4 py-3 font-mono text-gray-600 align-middle">
            <div className="flex flex-col justify-center items-center w-full h-full">
                <input 
                    type="date" 
                    value={adj.start || ''} 
                    onChange={(e) => {
                        const newReviews = [...adjustmentsToReview];
                        const idx = newReviews.findIndex((r) => r.id === adj.id);
                        if (idx !== -1) newReviews[idx] = { ...newReviews[idx], start: e.target.value };
                        setAdjustmentsToReview(newReviews as any);
                    }}
                    className={\`text-sm border rounded px-2 py-1 w-full max-w-[140px] \${(hasAttemptedSubmit && !adj.start) ? 'border-red-500 ring-1 ring-red-500 text-red-700' : 'border-gray-300'}\`}
                    disabled={isLoading.submitting}
                />
            </div>
        </td>
        <td className="px-4 py-3 font-mono text-gray-600 align-middle">
            <div className="flex flex-col justify-center items-center w-full h-full">
                <input 
                    type="date" 
                    value={adj.end || ''} 
                    onChange={(e) => {
                        const newReviews = [...adjustmentsToReview];
                        const idx = newReviews.findIndex((r) => r.id === adj.id);
                        if (idx !== -1) newReviews[idx] = { ...newReviews[idx], end: e.target.value };
                        setAdjustmentsToReview(newReviews as any);
                    }}
                    className="text-sm border rounded px-2 py-1 w-full border-gray-300 max-w-[140px]"
                    disabled={isLoading.submitting}
                />
            </div>
        </td>
        <td className="px-2 py-3 align-middle">
            <EditableCell
                value={adj.cost || 0}
                type="number"
                width="w-16"
                onChange={(val) => {
                    const newReviews = [...adjustmentsToReview];
                    const idx = newReviews.findIndex((r) => r.id === adj.id);
                    if (idx !== -1) newReviews[idx] = { ...newReviews[idx], cost: val };
                    setAdjustmentsToReview(newReviews as any);
                }}
            />
        </td>
        <td className="px-4 py-3 align-middle">
            <EditableCell
                value={adj.billingMode || ''}
                width="w-full"
                onChange={(val) => {
                    const newReviews = [...adjustmentsToReview];
                    const idx = newReviews.findIndex((r) => r.id === adj.id);
                    if (idx !== -1) newReviews[idx] = { ...newReviews[idx], billingMode: val };
                    setAdjustmentsToReview(newReviews as any);
                }}
            />
        </td>
        <td className="px-4 py-3 align-middle">
            <EditableCell
                value={adj.comment || ''}
                width="w-full"
                onChange={(val) => {
                    const newReviews = [...adjustmentsToReview];
                    const idx = newReviews.findIndex((r) => r.id === adj.id);
                    if (idx !== -1) newReviews[idx] = { ...newReviews[idx], comment: val };
                    setAdjustmentsToReview(newReviews as any);
                }}
            />
        </td>
    </tr>
    );
})}</tbody>
`;
        content = content.substring(0, theadStart) + newThead + newTbody + content.substring(tbodyEndIdx);
    }
}

// Summary table
const resultTheadStartStr = '<thead className="text-xs text-gray-700 uppercase bg-gray-50 sticky top-0">';
const resultTbodyStartStr = '<tbody className="divide-y divide-gray-200">{updateSummary.map((adj, idx) => {';
const resultTbodyEndStr = '</tbody>';

const rTheadStart = content.indexOf(resultTheadStartStr);
const rTbodyStart = content.indexOf(resultTbodyStartStr);
if (rTheadStart !== -1 && rTbodyStart !== -1) {
    const newRThead = `
<thead className="text-xs text-gray-700 uppercase bg-gray-50 sticky top-0">
    <tr>
        <th className="px-4 py-3">Employee</th>
        <th className="px-4 py-3">Account</th>
        <th className="px-4 py-3">Date / Start Date</th>
        <th className="px-4 py-3 text-right">Cost</th>
        <th className="px-4 py-3">Result Message</th>
        <th className="px-4 py-3">Comment</th>
    </tr>
</thead>
`;

    let rTbodyEndIdx = content.indexOf(resultTbodyEndStr, rTbodyStart);
    if(rTbodyEndIdx !== -1) {
        rTbodyEndIdx += resultTbodyEndStr.length;
        
        const newRTbody = `
<tbody className="divide-y divide-gray-200">{updateSummary.map((adj, idx) => {
    return (
    <tr key={\`\${adj.id}-\${idx}\`} className="hover:bg-gray-50 transition-colors">
        <td className="px-4 py-3 text-sm font-medium text-gray-900 border-l border-gray-200">{adj.employeeName}</td>
        <td className="px-4 py-3 text-sm text-gray-700">{adj.accountName}</td>
        <td className="px-4 py-3 text-sm font-mono text-gray-600">{adj.start || 'N/A'}</td>
        <td className="px-4 py-3 text-sm font-mono text-right font-medium text-gray-900 border-b-gray-100">{adj.cost || 0}</td>
        <td className="px-4 py-3 text-sm align-middle space-y-1">
            <div className="flex justify-start">
                <span className={\`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium \${
                    adj.status === 'success' ? 'bg-green-100 text-green-800 border border-green-200' :
                    adj.status === 'skipped' ? 'bg-yellow-100 text-yellow-800 border border-yellow-200' :
                    'bg-red-100 text-red-800 border border-red-200'
                }\`}>
                    {adj.status === 'success' ? 'Success' : adj.status === 'skipped' ? 'Skipped' : 'Failed'}
                </span>
            </div>
            {adj.error && (
                <div className="text-xs text-red-600 mt-1 max-w-[200px] break-words">
                    {adj.error}
                </div>
            )}
        </td>
        <td className="px-4 py-3 text-sm text-gray-600 max-w-[200px] truncate border-r border-gray-200" title={adj.comment || 'API BULK UPDATE'}>{adj.comment || 'API BULK UPDATE'}</td>
    </tr>
    );
})}</tbody>
`;
        content = content.substring(0, rTheadStart) + newRThead + newRTbody + content.substring(rTbodyEndIdx);
    }
}

content = content.replace(/handleUpdateAdjustment\(item\.id, v\)/g, "v /* no longer used */");

fs.writeFileSync('App.tsx', content);
