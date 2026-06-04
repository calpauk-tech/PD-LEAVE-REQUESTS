import fs from 'fs';

let content = fs.readFileSync('App.tsx', 'utf-8');

// Title replaces
content = content.replace("Planday Bulk Leave Adjustments", "Planday Bulk Leave Requests");
content = content.replace("Update Leave and Flex/TOIL balances in bulk from Excel files or Table", "Upload leave requests in bulk mapped to employee leave accounts");
content = content.replace("'Adjustments'", "'Requests'");

fs.writeFileSync('App.tsx', content);
console.log("Updated basic text elements.");
