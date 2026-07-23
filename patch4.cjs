const fs = require('fs');
let code = fs.readFileSync('App.tsx', 'utf8');

code = code.replace(
  `          let apiDateFilter: any;
          if (
            updateMethod !== "migrate" &&
            validityMode === "custom" &&
            dateRange.start &&
            dateRange.end
          )
            apiDateFilter = dateRange;
          const promises = batchEmployees.map((emp) =>
            fetchLeaveAccounts(emp.id, apiDateFilter, undefined).then(
              (accounts) => ({ emp, accounts }),
            ),
          );`,
  `          const promises = batchEmployees.map((emp) =>
            fetchLeaveAccounts(emp.id, undefined, undefined).then(
              (accounts) => ({ emp, accounts }),
            ),
          );`
);

fs.writeFileSync('App.tsx', code);
