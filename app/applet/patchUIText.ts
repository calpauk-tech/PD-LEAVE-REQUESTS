import fs from 'fs';
let content = fs.readFileSync('App.tsx', 'utf-8');

// Replace standard terms
content = content.replace("subtitle: 'Adj. balances'", "subtitle: 'Send requests'");
content = content.replace(/Make Adjustments/g, "Make Requests");

// Upload instructions
const oldUploadInstructions = "Select the completed Excel file with your leave balance adjustments. Make sure to use the provided adjustment template generated from this app. Adjustments will be read from the file and prepared for your review before the update process starts.";
const newUploadInstructions = "Select the completed Excel file with your leave requests. Make sure to use the provided template format or similar format. The requests will be read from the file and prepared for your review before the update process starts.";
content = content.replace(oldUploadInstructions, newUploadInstructions);

// Table titles & buttons
content = content.replace(/Pending Adjustments/g, "Pending Requests");
content = content.replace(/>Send Adjustments</g, ">Send Requests<");
content = content.replace(/Start New Adjustment/g, "Start New Process");

// Modal texts
content = content.replace(/balance adjustments/g, "leave requests");

// Excel Export
content = content.replace(/Planday_LeaveAdjustment_Results.xlsx/g, "Planday_LeaveRequests_Results.xlsx");

// Table Columns rename logic. "Adjustment" and "New Balance" should not be relevant anymore for leave requests... well, the table columns were for balance adjustments. But the request explicitly says:
// column format: Employee, Salary ID, Date, Account, Cost, Billing mode, Comment, Status
// The review table and update process needs to reflect this entirely.

fs.writeFileSync('App.tsx', content);
console.log("Patched UI texts");
