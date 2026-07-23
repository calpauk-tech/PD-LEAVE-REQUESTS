const XLSX = require('xlsx');

// Create a workbook with a single sheet
const ws_data = [
  ["Date", "Salary ID", "Employee", "Tax ID", "Account", "Cost", "Billing mode", "Status"],
  ["2023-01-01", "123", "John Doe", "", "Vacation", 1, "Day", "Approved"]
];
const ws = XLSX.utils.aoa_to_sheet(ws_data);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "Sheet1");

const json = XLSX.utils.sheet_to_json(ws, { raw: true });
console.log("JSON[0] keys:", Object.keys(json[0]));
