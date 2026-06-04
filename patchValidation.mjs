import fs from 'fs';

let appContent = fs.readFileSync('App.tsx', 'utf-8');

appContent = appContent.replace(/cost: parseFloat\(row\['Cost'\]\) \|\| 1,[^\n]*\n/g, "");

// We will insert cost logic right before "return {"
const returnIdx = appContent.indexOf('return {\n                        id: `adj-');

if (returnIdx !== -1) {
    const costLogic = `
                    let costValue = row['Cost'];
                    let cost = parseFloat(costValue);
                    let costError: string | undefined = undefined;
                    
                    if (costValue === undefined || costValue === null || costValue === '') {
                        costError = 'Cost is required';
                        cost = NaN;
                    } else if (isNaN(cost)) {
                        costError = 'Cost must be a valid number';
                    } else if (billingMode.toLowerCase() === 'days' && cost > 1) {
                        costError = 'Cost cannot exceed 1 day';
                    } else if (billingMode.toLowerCase() === 'hours' && cost > 24) {
                        costError = 'Cost cannot exceed 24 hours';
                    }
                    
                    const validationErrors = [];
                    if (!startDate) validationErrors.push('Missing Date');
                    if (!accountId) validationErrors.push('Account Not Found');
                    if (costError) validationErrors.push(costError);
                    
                    const errorMessage = validationErrors.length > 0 ? validationErrors.join(' | ') : undefined;
                    
                    `;
    appContent = appContent.slice(0, returnIdx) + costLogic + appContent.slice(returnIdx);
    
    // update the error and isValidationError properties inside return { ... }
    appContent = appContent.replace(
        /error:\s*\(!startDate\)\s*\?\s*'Invalid Date'\s*:\s*\(!accountId\)\s*\?\s*'Account Not Found'\s*:\s*undefined,/,
        "error: errorMessage,"
    );
    appContent = appContent.replace(
        /isValidationError:\s*!startDate\s*\|\|\s*!accountId/,
        "isValidationError: validationErrors.length > 0"
    );
    // add cost back
    appContent = appContent.replace(
        /(end:\s*endDate,)/,
        "$1\n                        cost: cost,"
    );
    fs.writeFileSync('App.tsx', appContent);
    console.log("Patched validation logic");
} else {
    console.log("Could not find return statement");
}
