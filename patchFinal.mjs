import fs from 'fs';
let appContent = fs.readFileSync('App.tsx', 'utf-8');

appContent = appContent.replace(/"Billing mode": "days"/g, '"Unit": "days"');
appContent = appContent.replace(/"Billing mode": "hours"/g, '"Unit": "hours"');
appContent = appContent.replace(/let billingMode = String\(row\['Billing mode'\] \|\| ''\);/g, "let billingMode = String(row['Unit'] || row['Billing mode'] || '');");
appContent = appContent.replace(/>Billing mode<\/th>/g, '>Unit</th>');

// Replace "Template billing mode is"
appContent = appContent.replace(/Template billing mode is/g, 'Template unit is');
// Replace "account expected"
// appContent = appContent.replace(/Account expected/g, 'Account expected');

fs.writeFileSync('App.tsx', appContent);
console.log('Fixed Billing mode to Unit');
