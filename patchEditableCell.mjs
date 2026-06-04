import fs from 'fs';
let appContent = fs.readFileSync('App.tsx', 'utf-8');

appContent = appContent.replace(
    /if \(type === 'number'\) \{\s*const parsed = parseFloat\(localValue\);\s*if \(!isNaN\(parsed\)\) onChange\(parsed\);\s*else onChange\(0\);\s*\}/,
    `if (type === 'number') {
                    if (localValue.trim() === '') return onChange('');
                    const parsed = parseFloat(localValue);
                    if (!isNaN(parsed)) onChange(parsed);
                    else onChange(localValue);
                }`
);

fs.writeFileSync('App.tsx', appContent);
console.log('Fixed EditableCell');
