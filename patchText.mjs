import fs from 'fs';

let appContent = fs.readFileSync('App.tsx', 'utf-8');
appContent = appContent.replace(/Please correct the highlighted dates below or remove these rows before continuing\./g, "Please correct the highlighted rows below or remove these rows before continuing.");
fs.writeFileSync('App.tsx', appContent);
