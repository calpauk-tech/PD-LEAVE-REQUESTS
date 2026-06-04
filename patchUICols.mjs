import fs from 'fs';

let appContent = fs.readFileSync('App.tsx', 'utf-8');

// 1. Add Billing Mode header
appContent = appContent.replace(
    /<th scope="col" className="px-2 py-3 align-middle text-left cursor-pointer hover:bg-gray-100 transition-colors group w-24">Cost<\/th>/,
    '<th scope="col" className="px-4 py-3 align-middle text-left w-24">Unit</th>\n        <th scope="col" className="px-2 py-3 align-middle text-left cursor-pointer hover:bg-gray-100 transition-colors group w-24">Cost</th>'
);

// 2. Add Billing Mode cell
appContent = appContent.replace(
    /<td className="px-4 py-3 align-middle">\{adj\.accountName\}<\/td>\s*<td className="px-4 py-3 font-mono text-gray-600 align-middle">/,
    `<td className="px-4 py-3 align-middle">{adj.accountName}</td>
        <td className="px-4 py-3 align-middle text-gray-600 text-sm">
            {adj.billingMode || '-'}
            {adj.billingModeError && <div className="text-xs text-orange-600 mt-1 leading-tight font-medium" title={adj.billingModeError}>Will convert</div>}
        </td>
        <td className="px-4 py-3 font-mono text-gray-600 align-middle">`
);

// 3. Update Status pill
const statusPillTarget = `className="w-28 text-xs border border-gray-300 rounded px-1 py-1 focus:ring-blue-500 focus:border-blue-500"`;
const statusPillReplacement = `className={\`w-28 text-xs font-medium border rounded px-1 py-1 focus:outline-none focus:ring-1 \${
                    (adj.requestStatus || 'Requested') === 'Requested' ? 'bg-yellow-100 border-yellow-200 text-yellow-800 focus:ring-yellow-500' :
                    (adj.requestStatus || 'Requested') === 'Approved' ? 'bg-green-100 border-green-200 text-green-800 focus:ring-green-500' :
                    'bg-red-100 border-red-200 text-red-800 focus:ring-red-500'
                }\`}`;
appContent = appContent.replace(statusPillTarget, statusPillReplacement);

fs.writeFileSync('App.tsx', appContent);
console.log('Patched UI for review table');
