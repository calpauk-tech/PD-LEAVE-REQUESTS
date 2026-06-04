import fs from 'fs';

let content = fs.readFileSync('App.tsx', 'utf-8');

const targetStr = `                                    </div>
                                </div>
                            </div>
                        </div>

                        )}{/* Filters Section */}`;

const replacementStr = `                                    </div>
                                </div>
                            </div>
                            )}
                        </div>

                        {/* Filters Section */}`;

content = content.replace(targetStr, replacementStr);
fs.writeFileSync('App.tsx', content);

