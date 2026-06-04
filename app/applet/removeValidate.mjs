import fs from 'fs';

let appContent = fs.readFileSync('App.tsx', 'utf-8');

appContent = appContent.replace(/validateRow\((.*?)\)/g, "$1");

fs.writeFileSync('App.tsx', appContent);
console.log("Replaced validateRow");
