import { Project, SyntaxKind, JsxElement, JsxFragment } from 'ts-morph';

const project = new Project();
const sourceFile = project.addSourceFileAtPath('App.tsx');

const jsxElements = sourceFile.getDescendantsOfKind(SyntaxKind.JsxElement);

for (const element of jsxElements) {
    const openingElement = element.getOpeningElement();
    const text = openingElement.getText();
    
    // We want to hide:
    // 1. Account Types selector (except the intro label)
    // 2. The grid holding Validity Period and Include Available Balance.
}
project.saveSync();
