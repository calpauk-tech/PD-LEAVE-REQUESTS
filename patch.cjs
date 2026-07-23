const fs = require('fs');
let code = fs.readFileSync('App.tsx', 'utf8');

code = code.replace(
  `              if (matchAcc.spendingPeriod)
                row.spendingPeriod = matchAcc.spendingPeriod;
            }
          }`,
  `              if (matchAcc.spendingPeriod)
                row.spendingPeriod = matchAcc.spendingPeriod;
              row.accountStatus = matchAcc.status;
            }
          }`
);

code = code.replace(
  `            accountTypeId: accountTypeId,
            validityPeriod: row.validityPeriod,
            spendingPeriod: row.spendingPeriod,`,
  `            accountTypeId: accountTypeId,
            accountStatus: row.accountStatus,
            validityPeriod: row.validityPeriod,
            spendingPeriod: row.spendingPeriod,`
);

fs.writeFileSync('App.tsx', code);
