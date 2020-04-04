import * as fs from 'fs';
import * as path from 'path';
import * as handlebars from 'handlebars';
import { codegen } from './data';

function main() {

  console.log("Code generation...");

  const sourceDir = `./codegen/templates/src`;
  const targetDir = `./src/Screamer/DOM`;

  const capitalize = (string: string) =>
    string[0].toUpperCase() + string.slice(1);

  const uncapitalize = (string: string) =>
    string[0].toLowerCase() + string.slice(1);

  handlebars.registerHelper('capitalize', capitalize);

  handlebars.registerHelper('unhyphenate', (s: string) =>
    uncapitalize(s.split('-').map(capitalize).join(''))
  );

  handlebars.registerHelper('handlerize', (string: string) =>
    string.replace(/^on/, '').toLowerCase()
  );

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

  //  console.log(codegen.EventClasses);
  //  console.log(Object.entries(codegen.EventClassFields));

}

main();
