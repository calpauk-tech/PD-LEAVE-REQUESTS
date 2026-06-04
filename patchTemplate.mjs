import fs from 'fs';

let appContent = fs.readFileSync('App.tsx', 'utf-8');

appContent = appContent.replace(/"Status": "Pending"/g, '"Status": "Requested"');

fs.writeFileSync('App.tsx', appContent);
console.log("Patched wsSingleData Status to Requested");
