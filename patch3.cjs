const fs = require('fs');
let code = fs.readFileSync('App.tsx', 'utf8');

code = code.replace(
  'className={`border-b hover:bg-gray-50 ${isRowError ? "bg-red-50" : "bg-white"}`}',
  'className={`border-b hover:bg-gray-50 ${isRowError ? "bg-red-50" : adj.accountStatus === "Inactive" ? "bg-yellow-50" : "bg-white"}`}'
);

fs.writeFileSync('App.tsx', code);
