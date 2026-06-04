import fs from 'fs';

let content = fs.readFileSync('App.tsx', 'utf-8');

// The "Select All" block
const target1 = \`                                    {accountTypes.length > 0 && (
                                        <div className="flex items-center">
                                            <input
                                                id="select-all-types"\`;
const replacement1 = \`                                    {updateMethod !== "excel" && accountTypes.length > 0 && (
                                        <div className="flex items-center">
                                            <input
                                                id="select-all-types"\`;
content = content.replace(target1, replacement1);

// The "Search" block
const target2 = \`                                {accountTypes.length > 0 && (
                                    <div className="mb-3">
                                        <input
                                            type="text"
                                            placeholder="Search account types..."\`;
const replacement2 = \`                                {updateMethod !== "excel" && accountTypes.length > 0 && (
                                    <div className="mb-3">
                                        <input
                                            type="text"
                                            placeholder="Search account types..."\`;
content = content.replace(target2, replacement2);

fs.writeFileSync('App.tsx', content);
