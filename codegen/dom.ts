import * as fs from 'fs';
import * as path from 'path';
import * as handlebars from 'handlebars';
import { codegen } from './data/dom';

function main() {

  console.log("Code generation...");

  const sourceDir = `./codegen/templates/src`;
  const targetDir = `./src/Screamer/DOM`;

  fs.readdirSync(sourceDir).forEach(source => {

    const sourceFile = `${sourceDir}/${source}`;

    const target = path.parse(source).name;
    const targetFile = `${targetDir}/${target}.g.purs`;

    console.log(`Reading template ${sourceFile}.`);
    let template = fs.readFileSync(sourceFile, `utf8`);

    let compiled = handlebars.compile(template);

    console.log(`Writing generated code to ${targetFile}.`);
    fs.writeFileSync(targetFile, compiled(codegen));

  });

}

main();
