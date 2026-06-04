import fs from 'fs';

let appContent = fs.readFileSync('App.tsx', 'utf-8');

const regexMapReturn = /let costValue = row\['Cost'\];[\s\S]*?(return \{[\s\S]*?cost: cost,(?:(?!return|isValidationError)[\s\S])*isValidationError: validationErrors\.length > 0\s*\};)/;

appContent = appContent.replace(regexMapReturn, `
                    return validateReviewItem({
                        id: \`adj-\${idx}-\${Date.now()}\`,
                        employeeName: row['Employee'] || 'Unknown',
                        salaryIdentifier: row['Salary ID'] || null,
                        accountId: accountId || 0,
                        accountName: String(row['Account'] || 'Unknown'),
                        date: startDate,
                        start: startDate,
                        end: endDate,
                        cost: row['Cost'], 
                        billingMode: billingMode,
                        requestStatus: (() => {
                            const s = String(row['Status'] || 'Requested').toLowerCase();
                            if (s === 'approved') return 'Approved';
                            if (s === 'denied') return 'Denied';
                            return 'Requested';
                        })(),
                        comment: String(row['Comment'] || ''),
                        status: 'pending',
                        billingModeError,
                    }, accountTypes);
`);

// The newValidateItem definition
const newValidateItem = `
function validateReviewItem(item: any, accountTypes: any[]) {
    const errorList: string[] = [];
    if (!item.date) errorList.push("Missing Date");
    if (!item.accountId) errorList.push("Account Not Found");
    
    let costError = '';
    const cost = Number(item.cost);
    if (item.cost === undefined || item.cost === null || item.cost === '') {
        costError = 'Cost is required';
    } else if (isNaN(cost)) {
        costError = 'Cost must be a valid number';
    } else if (item.billingMode && item.billingMode.toLowerCase() === 'days' && cost > 1) {
        costError = 'Cost cannot exceed 1 day';
    } else if (item.billingMode && item.billingMode.toLowerCase() === 'hours' && cost > 24) {
        costError = 'Cost cannot exceed 24 hours';
    }
    
    if (costError) errorList.push(costError);
    
    return {
        ...item,
        isValidationError: errorList.length > 0,
        error: errorList.length > 0 ? errorList.join(' | ') : undefined
    };
}
`;

appContent = appContent.replace(/import\s+React.*?;\n/, match => match + newValidateItem);

// Editable cells updates:
appContent = appContent.replace(
    /if \(idx !== -1\) newReviews\[idx\] = \{ \.\.\.newReviews\[idx\], ([a-zA-Z]+): val \};/g,
    "if (idx !== -1) newReviews[idx] = validateReviewItem({ ...newReviews[idx], $1: val }, accountTypes) as any;"
);
appContent = appContent.replace(
    /if \(idx !== -1\) newReviews\[idx\] = \{ \.\.\.newReviews\[idx\], requestStatus: e\.target\.value \};/g,
    "if (idx !== -1) newReviews[idx] = validateReviewItem({ ...newReviews[idx], requestStatus: e.target.value }, accountTypes) as any;"
);
appContent = appContent.replace(
    /newReviews\[idx\] = \{ \.\.\.newReviews\[idx\], date: e\.target\.value, start: e\.target\.value, end: e\.target\.value \};/g,
    "newReviews[idx] = validateReviewItem({ ...newReviews[idx], date: e.target.value, start: e.target.value, end: e.target.value }, accountTypes) as any;"
);

fs.writeFileSync('App.tsx', appContent);
console.log("Validate logic successfully replaced.");
