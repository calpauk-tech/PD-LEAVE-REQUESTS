import fs from 'fs';
let appContent = fs.readFileSync('App.tsx', 'utf-8');
appContent = appContent.replace(/value=\{adj\.cost \|\| 0\}/, "value={adj.cost !== undefined && adj.cost !== null && adj.cost !== '' ? adj.cost : ''}");
fs.writeFileSync('App.tsx', appContent);
