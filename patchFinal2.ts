import fs from 'fs';

let content = fs.readFileSync('App.tsx', 'utf-8');

// The closing of conditional Filters Section wrapper
content = content.replace(
    '                            </div>\n                        </div>\n                        \n                        <div className="mt-8 pt-6 border-t border-gray-200">',
    '                            </div>\n                        </div>\n                        )}\n                        \n                        <div className="mt-8 pt-6 border-t border-gray-200">'
);

fs.writeFileSync('App.tsx', content);
