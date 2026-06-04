import fs from 'fs';

let typesContent = fs.readFileSync('types.ts', 'utf-8');
if (!typesContent.includes('requestStatus?:')) {
    typesContent = typesContent.replace('comment: string;', 'comment: string;\n    requestStatus?: string;');
    fs.writeFileSync('types.ts', typesContent);
    console.log('patched types.ts');
}

let appContent = fs.readFileSync('App.tsx', 'utf-8');

// 1. Remove Bulk Edit section
const bulkEditStart = appContent.indexOf('{/* Bulk Edit Panel */}');
if (bulkEditStart !== -1) {
    const bulkEditEnd = appContent.indexOf('{/* Table Toolbar */}', bulkEditStart);
    if (bulkEditEnd !== -1) {
        appContent = appContent.substring(0, bulkEditStart) + appContent.substring(bulkEditEnd);
        console.log('Removed Bulk Edit');
    }
}

// 2. Change Review Title
const reviewTitleSearch = '<h2 className="text-2xl font-bold text-gray-800">Review & Update Balances</h2>';
const reviewTitleStart = appContent.indexOf(reviewTitleSearch);
if (reviewTitleStart !== -1) {
    const tooltipEnd = appContent.indexOf('</div>', appContent.indexOf('</div>', reviewTitleStart) + 6) + 6;
    if (tooltipEnd !== -1) {
         appContent = appContent.substring(0, reviewTitleStart) + '<h2 className="text-2xl font-bold text-gray-800 mb-2">Review & Send requests</h2>\n' + appContent.substring(tooltipEnd);
    }
}

// 3. Update parsed columns
appContent = appContent.replace(/billingMode: String\(row\['Billing mode'\] \|\| ''\),/g, "billingMode: String(row['Billing mode'] || ''),\n                        requestStatus: String(row['Status'] || 'Requested'),");

// 4. Update the Table Headers
appContent = appContent.replace(/<th scope="col" className="px-4 py-3 align-middle text-left">Date \/ Start Date<\/th>\s*<th scope="col" className="px-4 py-3 align-middle text-left">End Date<\/th>/, '<th scope="col" className="px-4 py-3 align-middle text-left w-32">Date</th>');
appContent = appContent.replace(/<th scope="col" className="px-4 py-3 align-middle text-left">Billing Mode<\/th>/, '');
appContent = appContent.replace(/<th scope="col" className="px-4 py-3 align-middle text-left">Comment<\/th>/, '<th scope="col" className="px-4 py-3 align-middle text-left w-[200px]">Comment</th>\n        <th scope="col" className="px-4 py-3 align-middle text-left w-[120px]">Status</th>');

// 5. Update Table Body Cells
const startDateCell = /<td className="px-4 py-3 font-mono text-gray-600 align-middle">[\s\S]*?<input \n\s*type="date" \n\s*value=\{adj\.start \|\| ''\} [\s\S]*?<\/td>\s*<td className="px-4 py-3 font-mono text-gray-600 align-middle">[\s\S]*?<\/td>/;
const replacementDateCell = `<td className="px-4 py-3 font-mono text-gray-600 align-middle">
            <div className="flex flex-col justify-center items-center w-full h-full">
                <input 
                    type="date" 
                    value={adj.date || adj.start || ''} 
                    onChange={(e) => {
                        const newReviews = [...adjustmentsToReview];
                        const idx = newReviews.findIndex((r) => r.id === adj.id);
                        if (idx !== -1) {
                            newReviews[idx] = { ...newReviews[idx], date: e.target.value, start: e.target.value, end: e.target.value };
                        }
                        setAdjustmentsToReview(newReviews as any);
                    }}
                    className={\`text-sm border rounded px-2 py-1 w-full max-w-[140px] \${(hasAttemptedSubmit && !adj.date && !adj.start) ? 'border-red-500 ring-1 ring-red-500 text-red-700' : 'border-gray-300'}\`}
                    disabled={isLoading.submitting}
                />
            </div>
        </td>`;
appContent = appContent.replace(startDateCell, replacementDateCell);

// Remove Billing Mode cell
const billingModeCell = /<td className="px-4 py-3 align-middle">\s*<EditableCell\s*value=\{adj\.billingMode \|\| ''\}[\s\S]*?<\/td>/;
appContent = appContent.replace(billingModeCell, '');

// Append Status cell after Comment
const commentCell = /<td className="px-4 py-3 align-middle">\s*<EditableCell\s*value=\{adj\.comment \|\| ''\}[\s\S]*?<\/td>/;
const replacementCommentCell = `<td className="px-4 py-3 align-middle">
            <EditableCell
                value={adj.comment || ''}
                width="w-full"
                onChange={(val) => {
                    const newReviews = [...adjustmentsToReview];
                    const idx = newReviews.findIndex((r) => r.id === adj.id);
                    if (idx !== -1) newReviews[idx] = { ...newReviews[idx], comment: val as string };
                    setAdjustmentsToReview(newReviews as any);
                }}
            />
        </td>
        <td className="px-2 py-3 align-middle text-xs">
            <select
                value={adj.requestStatus || 'Requested'}
                onChange={(e) => {
                    const newReviews = [...adjustmentsToReview];
                    const idx = newReviews.findIndex((r) => r.id === adj.id);
                    if (idx !== -1) newReviews[idx] = { ...newReviews[idx], requestStatus: e.target.value };
                    setAdjustmentsToReview(newReviews as any);
                }}
                className="w-full min-w-[100px] text-xs border border-gray-300 rounded px-1 py-1 focus:ring-blue-500 focus:border-blue-500"
            >
                <option value="Requested">Requested</option>
                <option value="Approved">Approved</option>
                <option value="Denied">Denied</option>
            </select>
        </td>`;
appContent = appContent.replace(commentCell, replacementCommentCell);

// Make sure that date, not start is used for isRowError validation
const rowErrorDef = /const isRowError = hasAttemptedSubmit && \(adj\.isValidationError \|\| !adj\.start\);/g;
appContent = appContent.replace(rowErrorDef, 'const isRowError = hasAttemptedSubmit && (adj.isValidationError || (!adj.date && !adj.start));');

fs.writeFileSync('App.tsx', appContent);
console.log('App patched successfully');
