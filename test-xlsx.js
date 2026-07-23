const XLSX = require('xlsx-js-style');
const wb = XLSX.utils.book_new();
const ws = XLSX.utils.json_to_sheet([{ Unit: { type: 'Days' } }]);
XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
XLSX.writeFile(wb, "test.xlsx");
