import fs from 'fs';

let content = fs.readFileSync('App.tsx', 'utf-8');

// Insert useState
const stateInsert = `    const [includeEmployeeAccounts, setIncludeEmployeeAccounts] = useState<boolean>(false);`;
content = content.replace(
    'const [includeInactive, setIncludeInactive] = useState(false);',
    'const [includeInactive, setIncludeInactive] = useState(false);\n' + stateInsert
);

// Update heading
content = content.replace(
    `<h2 className="text-2xl font-bold mb-6 text-gray-800">{updateMethod === 'excel' ? 'Configure & Download Template' : 'Select Accounts to Update'}</h2>`,
    `{updateMethod !== 'excel' && <h2 className="text-2xl font-bold mb-6 text-gray-800">Select Accounts to Update</h2>}`
);

// Update text banner
content = content.replace(
    `When downloading the template for Excel Bulk upload, the file will contain a "Leave Accounts" sheet with all available leave accounts for the filtered employees below. You do not need to select account types or validity periods here.`,
    `You can generate a template to use for bulk upload of leave requests. The file will contain the necessary columns needed, example data, and instructions. You can also choose to include employee and leave account data which will be added as a "Leave Accounts" sheet with all available leave accounts for the filtered employees below.`
);

// Filter Employees UI
const filtersSectionRegex = /(<div className="mt-8 bg-gray-50 p-4 border border-gray-200 rounded-lg">\s*)<h3 className="text-sm font-bold text-gray-700 mb-3">Filter Employees \(Optional\)<\/h3>/;
const filtersReplacement = 
`{updateMethod === 'excel' && (
    <div className="mt-8 bg-white p-4 border border-gray-200 rounded-lg shadow-sm">
        <h3 className="text-sm font-bold text-gray-700 mb-2">Include Employee Accounts in the template?</h3>
        <div className="flex items-center space-x-4">
            <label className="flex items-center space-x-2 cursor-pointer">
                <input type="radio" className="form-radio text-blue-600" name="includeEmployeeAccounts" checked={includeEmployeeAccounts === false} onChange={() => setIncludeEmployeeAccounts(false)} />
                <span className="text-sm text-gray-700">No</span>
            </label>
            <label className="flex items-center space-x-2 cursor-pointer">
                <input type="radio" className="form-radio text-blue-600" name="includeEmployeeAccounts" checked={includeEmployeeAccounts === true} onChange={() => setIncludeEmployeeAccounts(true)} />
                <span className="text-sm text-gray-700">Yes</span>
            </label>
        </div>
    </div>
)}

{(updateMethod !== 'excel' || includeEmployeeAccounts) && (
$1<h3 className="text-sm font-bold text-gray-700 mb-3">Filter Employees</h3>`;

content = content.replace(filtersSectionRegex, filtersReplacement);

// Close the wrapper
// Let's find the end of the Filters section. It's before the action buttons.
/*
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-between items-center mt-8 pt-6 border-t border-gray-200">
*/
content = content.replace(
    `                            </div>\n                        </div>\n\n                        <div className="flex justify-between items-center mt-8 pt-6 border-t border-gray-200">`,
    `                            </div>\n                        </div>\n                        )}\n\n                        <div className="flex justify-between items-center mt-8 pt-6 border-t border-gray-200">`
);

fs.writeFileSync('App.tsx', content);
console.log('Patched UI for Use Excel changes.');
