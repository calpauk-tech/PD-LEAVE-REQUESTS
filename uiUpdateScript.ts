import fs from 'fs';

let content = fs.readFileSync('App.tsx', 'utf-8');

// The UI wrapping
const renderStart = content.indexOf('<div className="flex justify-between items-center mb-2">');
// Find the end of "3. Include Available Balance?" which is the end of the col-span-1 pl-2 div.
// Wait, I can just replace the segments directly.

const typesStart = content.indexOf('<div className="flex justify-between items-center mb-2">');
content = content.replace(
    '<label className="block text-sm font-medium text-gray-700">1. Select Account Types (Policies) to Include</label>',
    '{updateMethod !== \\'excel\\' ? <label className="block text-sm font-medium text-gray-700">1. Select Account Types (Policies) to Include</label> : <label className="block text-sm font-medium text-gray-700">Information for Template</label>}'
)

// Let's hide the account types inputs
content = content.replace(
    /\{accountTypesLoading \? \(/g,
    "{updateMethod === 'excel' ? <div className=\"bg-blue-50 text-blue-700 p-4 rounded-md text-sm\">When downloading the template for Excel Bulk upload, the file will contain a \"Leave Accounts\" sheet with all available leave accounts for the filtered employees below. You do not need to select account types or validity periods here.</div> : (accountTypesLoading ? ("
);

// We need to close the parentheses around accountTypes
// It ends with: "</div>\n                                    )}" -> about the "Deselect All" part / map part
// Wait, replacing JSX using regex string replace is dangerous. I will use AST or precise string replacement.

fs.writeFileSync('App.tsx', content);

