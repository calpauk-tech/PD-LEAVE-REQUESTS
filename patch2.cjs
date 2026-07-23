const fs = require('fs');
let code = fs.readFileSync('App.tsx', 'utf8');

code = code.replace(
  `                            <td className="px-4 py-3 align-middle">
                              {adj.accountName}
                            </td>`,
  `                            <td className="px-4 py-3 align-middle">
                              {adj.accountName}
                              {adj.accountStatus === 'Inactive' && !adj.error && (
                                <div className="text-xs font-bold text-yellow-600 mt-1 max-w-[200px] break-words">
                                  Account is currently inactive (still possible to submit requests)
                                </div>
                              )}
                            </td>`
);

code = code.replace(
  `                                <p className="text-sm mb-2">
                                  {fromValStr !== toValStr
                                     ? "The selected accounts have different validity periods:"
                                     : "One or more of the selected accounts are currently inactive:"}
                                </p>`,
  `                                <p className="text-sm mb-2">
                                  {fromValStr !== toValStr
                                     ? "The selected accounts have different validity periods. Requests might overlap into inactive/old accounts."
                                     : "One or more of the selected accounts are currently inactive."}
                                </p>`
);

fs.writeFileSync('App.tsx', code);
