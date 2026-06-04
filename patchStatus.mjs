import fs from 'fs';

let appContent = fs.readFileSync('App.tsx', 'utf-8');

appContent = appContent.replace(
    /requestStatus: String\(row\['Status'\] \|\| 'Requested'\),/g,
    `requestStatus: (() => {
                            const s = String(row['Status'] || 'Requested').toLowerCase();
                            if (s === 'approved') return 'Approved';
                            if (s === 'denied') return 'Denied';
                            return 'Requested';
                        })(),`
);

fs.writeFileSync('App.tsx', appContent);
console.log('Fixed status casing handling');
