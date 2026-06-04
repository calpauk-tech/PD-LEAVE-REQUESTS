import fs from 'fs';

let appContent = fs.readFileSync('App.tsx', 'utf-8');

appContent = appContent.replace(/!\s*item\.effectiveDate/g, '!item.date');
appContent = appContent.replace(/!\s*a\.effectiveDate/g, '!a.date');
appContent = appContent.replace(/formatDateForDisplay\((item\.|)effectiveDate,/g, 'formatDateForDisplay($1date,');

// Adjust the error messages in App.tsx to match expectations
appContent = appContent.replace(/Some Effective Dates are outside the Account's validity period/g, "A validation error was detected (e.g., date missing, account missing, cost invalid).");
appContent = appContent.replace(/Some rows are missing Effective Dates./g, "Some rows have missing or invalid data.");

fs.writeFileSync('App.tsx', appContent);
console.log('Fixed effectiveDate variables');
