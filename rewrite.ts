import { Project, SyntaxKind } from 'ts-morph';
import fs from 'fs';

const project = new Project();
const sourceFile = project.addSourceFileAtPath('App.tsx');

// 1. Rename AppStep subtitles or titles if needed.
const getStepConfigFunc = sourceFile.getVariableDeclaration('getStepConfig')?.getInitializerIfKind(SyntaxKind.ArrowFunction);
if (getStepConfigFunc) {
    let bodyText = getStepConfigFunc.getBodyText();
    if (bodyText) {
        bodyText = bodyText.replace(/Adj\. balances/, 'Leave reqs').replace(/Make Adjustments/, 'Map Requests');
        getStepConfigFunc.setBodyText(bodyText);
    }
}

// 2. Remove old sortConfig
sourceFile.getVariableDeclaration('sortConfig')?.getFirstAncestorByKind(SyntaxKind.VariableStatement)?.remove();

// 3. Update validateRow to basic
const validateRowDecl = sourceFile.getVariableDeclaration('validateRow');
if (validateRowDecl) {
    const init = validateRowDecl.getInitializerIfKind(SyntaxKind.ArrowFunction);
    if (init) {
        init.setBodyText(`
        const item = { ...row };
        if (item.isValidationError) {
            item.status = 'pending';
            item.error = undefined;
            item.isValidationError = false;
        }
        if (!item.date && !item.start) {
            item.status = 'error';
            item.error = 'Missing valid date or start date';
            item.isValidationError = true;
        }
        return item;
        `);
    }
}

// Write changes
project.saveSync();
console.log("AST rewrite completed successfully.");
