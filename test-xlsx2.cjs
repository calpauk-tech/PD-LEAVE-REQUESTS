const XLSX = require('xlsx-js-style');
const wb = XLSX.utils.book_new();
const ws = XLSX.utils.json_to_sheet([{ Name: 'Test', Unit: { type: 'Days' } }]);
XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
console.log(XLSX.utils.sheet_to_json(ws));
