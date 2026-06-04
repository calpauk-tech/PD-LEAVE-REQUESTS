import fs from 'fs';
let appContent = fs.readFileSync('App.tsx', 'utf-8');
appContent = appContent.replace(
    /if \(item\.cost === undefined \|\| item\.cost === null \|\| item\.cost === ''\) \{/,
    "if (item.cost === undefined || item.cost === null || String(item.cost).trim() === '') {"
);
fs.writeFileSync('App.tsx', appContent);
