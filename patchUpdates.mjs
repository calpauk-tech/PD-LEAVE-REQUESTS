import fs from 'fs';

let appContent = fs.readFileSync('App.tsx', 'utf-8');

// 1. Text changes for "Pending Requests"
appContent = appContent.replace(
    'accounts with updates pending',
    'leave requests to be created'
);
appContent = appContent.replace(
    /All accounts with updates pending will be updated upon confirmation, not just the filtered\/selected ones\. Values can be changed via manual individual input or via the bulk edit option\./,
    'All leave requests will get bundled and sent upon confirmation, not just the filtered/selected ones.'
);

// 2. Remove "Validity" sort button in Pending requests review (line 2602)
appContent = appContent.replace(
    /<button onClick=\{\(\) => handleSort\('validity'\)\}.*?>Validity<\/button>/,
    ''
);

// Remove "Validity Period" column if it still exists (line ~2876 for result table or elsewhere)
appContent = appContent.replace(
    /<th className="px-4 py-3">Validity Period<\/th>/g,
    ''
);
// Remove validity data cells
appContent = appContent.replace(
    /<td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">\s*\{s\.validFrom \? formatDateForDisplay\([^}]+\) : 'N\/A'\} - \{s\.validTo \? formatDateForDisplay\([^}]+\) : '∞'\}\s*<\/td>/g,
    ''
);

// 3. Swap Unit and Cost headers
appContent = appContent.replace(
    /<th scope="col" className="px-4 py-3 align-middle text-left w-24">Unit<\/th>\s*<th scope="col" className="px-2 py-3 align-middle text-left cursor-pointer hover:bg-gray-100 transition-colors group w-24">Cost<\/th>/,
    '<th scope="col" className="px-2 py-3 align-middle text-left cursor-pointer hover:bg-gray-100 transition-colors group w-24">Cost</th>\n        <th scope="col" className="px-4 py-3 align-middle text-left w-24">Unit</th>'
);

// 4. Swap Unit and Cost cells
const billingModeCell = /<td className="px-4 py-3 align-middle text-gray-600 text-sm">\s*\{adj\.billingMode \|\| '-'\}\s*\{adj\.billingModeError && <div [^>]+>\{adj\.billingModeError\}<\/div>\}\s*<\/td>/m;
const match = appContent.match(billingModeCell);
if (match) {
    appContent = appContent.replace(billingModeCell, '');
    const costCellEnd = /<\/td>\s*<td className="px-4 py-3 align-middle">\s*<EditableCell\s*value=\{adj\.comment \|\| ''\}/m;
    appContent = appContent.replace(costCellEnd, `</td>\n        ${match[0]}\n        \n<td className="px-4 py-3 align-middle">\n            <EditableCell\n                value={adj.comment || ''}`);
}

// 5. Update Status Pill styling
// Change class logic in Pill select to ensure proper filling (bg colors without borders instead? Wait, native selects on some platforms are weird. We'll use `bg-* text-*` properly.)
// Old:
// className={\`w-28 text-xs font-medium border rounded px-1 py-1 focus:outline-none focus:ring-1 \${
//                    (adj.requestStatus || 'Requested') === 'Requested' ? 'bg-yellow-100 border-yellow-200 text-yellow-800 focus:ring-yellow-500' :
//                     (adj.requestStatus || 'Requested') === 'Approved' ? 'bg-green-100 border-green-200 text-green-800 focus:ring-green-500' :
//                     'bg-red-100 border-red-200 text-red-800 focus:ring-red-500'
//                 }\`}

const pillSelectorLogicOld = /className=\{\`w-28 text-xs font-medium border rounded px-1 py-1 focus:outline-none focus:ring-1 \$\{[\s\S]*?bg-red-100 border-red-200 text-red-800 focus:ring-red-500'[\s\S]*?\}\`\}/;
const pillSelectorLogicNew = `className={\`w-28 text-xs font-bold border-0 rounded px-2 py-1.5 focus:outline-none focus:ring-2 appearance-none cursor-pointer \${
                    (adj.requestStatus || 'Requested') === 'Requested' ? 'bg-[#FFF3CD] text-[#856404] focus:ring-[#FFE8A1]' :
                    (adj.requestStatus || 'Requested') === 'Approved' ? 'bg-[#D4EDDA] text-[#155724] focus:ring-[#C3E6CB]' :
                    'bg-[#F8D7DA] text-[#721C24] focus:ring-[#F5C6CB]'
                }\`}`;
                
appContent = appContent.replace(pillSelectorLogicOld, pillSelectorLogicNew);

// Add custom dropdown arrow back if we use appearance-none
// Let's just wrap it or keep default select but with solid styles
// Another approach to pill styles: Let's remove appearance-none, but keep the bold colors
const pillSelectColoring = `className={\`w-28 text-xs font-bold border-0 rounded px-2 py-1.5 focus:outline-none focus:ring-2 cursor-pointer shadow-sm \${
                    (adj.requestStatus || 'Requested') === 'Requested' ? 'bg-yellow-100 text-yellow-800 focus:ring-yellow-300' :
                    (adj.requestStatus || 'Requested') === 'Approved' ? 'bg-green-100 text-green-800 focus:ring-green-300' :
                    'bg-red-100 text-red-800 focus:ring-red-300'
                }\`}`;
appContent = appContent.replace(pillSelectorLogicNew, pillSelectColoring);
appContent = appContent.replace(pillSelectorLogicOld, pillSelectColoring);

fs.writeFileSync('App.tsx', appContent);
console.log('UI updates applied');
