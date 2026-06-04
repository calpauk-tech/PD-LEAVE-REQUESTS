import fs from 'fs';

let content = fs.readFileSync('App.tsx', 'utf-8');

const targetStr = `    const [bulkEditValueCost, setBulkEditValueCost] = useState<string>('');
    const [bulkEditValueBillingMode, setBulkEditValueBillingMode] = useState<string>('');
    const [bulkEditEffectiveDateType, setBulkEditEffectiveDateType] = useState<'custom' | 'today' | 'start_date'>('today');
    const [bulkEditValueEffectiveDate, setBulkEditValueEffectiveDate] = useState<string>('');
    const [bulkEditValueComment, setBulkEditValueComment] = useState<string>('');`;

const replacementStr = `    const [bulkEditValueCost, setBulkEditValueCost] = useState<string>('');
    const [bulkEditValueBillingMode, setBulkEditValueBillingMode] = useState<string>('');
    const [bulkEditEffectiveDateType, setBulkEditEffectiveDateType] = useState<'custom' | 'today' | 'start_date'>('today');
    const [bulkEditValueEffectiveDate, setBulkEditValueEffectiveDate] = useState<string>('');
    const [bulkEditValueComment, setBulkEditValueComment] = useState<string>('');
    const [bulkEditValueAdjustment, setBulkEditValueAdjustment] = useState<string>('');
    const [bulkEditValueNewBalance, setBulkEditValueNewBalance] = useState<string>('');`;

if (content.includes(targetStr)) {
    content = content.replace(targetStr, replacementStr);
    fs.writeFileSync('App.tsx', content);
    console.log("Patched successfully!");
} else {
    console.log("Could not find string.");
}
