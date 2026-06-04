import fs from 'fs';

let content = fs.readFileSync('App.tsx', 'utf-8');

// The block for account types starts with: <div className="flex justify-between items-center mb-2"> inside the first child of space-y-6.
// Actually, it's easier to find the headers and conditionally wrap them.

content = content.replace(
    '<label className="block text-sm font-medium text-gray-700">1. Select Account Types (Policies) to Include</label>',
    '{updateMethod !== \\'excel\\' ? <label className="block text-sm font-medium text-gray-700">1. Select Account Types (Policies) to Include</label> : <label className="block text-sm font-medium text-gray-700">Information for Template</label>}'
);

content = content.replace(
    '{accountTypesLoading ? (',
    '{updateMethod === \\'excel\\' ? <div className="bg-blue-50 text-blue-700 p-4 rounded-md text-sm mb-4">When downloading the template for Excel Bulk upload, the file will contain a "Leave Accounts" sheet with all available leave accounts for the filtered employees below. You do not need to select account types or validity periods here.</div> : (accountTypesLoading ? ('
);

content = content.replace(
    '</div>}</div>', // Let's check where the account types section ends
    '</div>)}</div>'
    // ah wait, we can't easily match the closing brackets of JSX.
);

fs.writeFileSync('test1.tsx', content);
