const fs = require('fs');
let code = fs.readFileSync('App.tsx', 'utf8');

const target = `        const absenceType =
          accountTypes.find(
            (t) => t.name.toLowerCase() === item.accountName.toLowerCase()
          )?.absenceType || "Accrued";
        item.absenceType = absenceType;
        const requestStatus = item.requestStatus || "Requested";
        const key = \`\${item.employeeName}_\${item.accountId}_\${item.billingMode}_\${requestStatus}\`;
        if (!groupings.has(key)) groupings.set(key, []);
        groupings.get(key)!.push(item);
      });

      let finalRequests: any[] = [];
      groupings.forEach((rows, key) => {
        const parseDate = (dstr: string) => {
          const [y, m, d] = dstr.split("-").map(Number);
          return new Date(y, m - 1, d);
        };
        rows.sort((a, b) => (a.start || "").localeCompare(b.start || ""));
        if (rows.length === 0) return;
        let currentChunk = [rows[0]];
        let chunks = [currentChunk];
        for (let i = 1; i < rows.length; i++) {
          const curr = rows[i];
          const prev = currentChunk[currentChunk.length - 1];
          const currDate = parseDate(curr.start);
          const prevDate = parseDate(prev.start);
          const diffTime = Math.abs(currDate.getTime() - prevDate.getTime());
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          if (diffDays === 1) {
            currentChunk.push(curr);
          } else {
            currentChunk = [curr];
            chunks.push(currentChunk);
          }
        }`;

const replacement = `        const absenceType =
          accountTypes.find(
            (t) => t.name.toLowerCase() === item.accountName.toLowerCase()
          )?.absenceType || "Accrued";
        item.absenceType = absenceType;
        const requestStatus = item.requestStatus || "Requested";
        
        let originalReqId = "unknown";
        if (updateMethod === "migrate" && deniedRequestsDataRef.current.length > 0) {
           const originalReq = deniedRequestsDataRef.current.find(r => 
               String(r.employeeId) === String(item.employeeId) &&
               r.registrations && r.registrations.some((reg: any) => reg.date.startsWith(item.start))
           );
           if (originalReq) {
               originalReqId = String(originalReq.id);
           } else {
               const originalReqByPeriod = deniedRequestsDataRef.current.find(r => 
                  String(r.employeeId) === String(item.employeeId) &&
                  r.absencePeriod && 
                  item.start >= r.absencePeriod.start.split("T")[0] && 
                  item.start <= r.absencePeriod.end.split("T")[0]
               );
               if (originalReqByPeriod) originalReqId = String(originalReqByPeriod.id);
           }
        }

        const key = \`\${item.employeeName}_\${item.accountId}_\${item.billingMode}_\${requestStatus}_\${originalReqId}\`;
        if (!groupings.has(key)) groupings.set(key, []);
        groupings.get(key)!.push(item);
      });

      let finalRequests: any[] = [];
      groupings.forEach((rows, key) => {
        const parseDate = (dstr: string) => {
          const [y, m, d] = dstr.split("-").map(Number);
          return new Date(y, m - 1, d);
        };
        rows.sort((a, b) => (a.start || "").localeCompare(b.start || ""));
        if (rows.length === 0) return;
        
        let chunks = [];
        const hasOriginalReqId = key.split('_').length > 4 && key.split('_')[4] !== 'unknown';

        if (hasOriginalReqId) {
            chunks = [rows];
        } else {
            let currentChunk = [rows[0]];
            chunks = [currentChunk];
            for (let i = 1; i < rows.length; i++) {
              const curr = rows[i];
              const prev = currentChunk[currentChunk.length - 1];
              const currDate = parseDate(curr.start);
              const prevDate = parseDate(prev.start);
              const diffTime = Math.abs(currDate.getTime() - prevDate.getTime());
              const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
              if (diffDays === 1) {
                currentChunk.push(curr);
              } else {
                currentChunk = [curr];
                chunks.push(currentChunk);
              }
            }
        }`;

if (code.includes(target)) {
  fs.writeFileSync('App.tsx', code.replace(target, replacement));
  console.log("Success");
} else {
  console.log("Failed to find target text");
}
