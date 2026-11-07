import * as fs from 'fs';
import * as path from 'path';
import handlebars from 'handlebars';
import { codegen } from './data';

function main() {

  console.log("Code generation...");

  const sourceDir = `./codegen/templates/src`;
  const targetDir = `./packages/screamer/src/Screamer`;

  const capitalize = (string: string) =>
    string[0].toUpperCase() + string.slice(1);

  const uncapitalize = (string: string) =>
    string[0].toLowerCase() + string.slice(1);

  handlebars.registerHelper('capitalize', capitalize);

  handlebars.registerHelper('unhyphenate', (s: string) =>
    uncapitalize(s.split('-').map(capitalize).join(''))
  );

  handlebars.registerHelper('json', (value: unknown) => JSON.stringify(value, null, 2));

  handlebars.registerHelper('handlerize', (string: string) =>
    string.replace(/^on/, '').toLowerCase()
  );

  // Each template's path below the templates directory is its module's path
  // below targetDir: `Html/Attributes.hbs` is `Screamer.Html.Attributes`,
  // written to `Html/Attributes.g.purs`. A template named `*.ts.hbs` is a
  // foreign module, written to `*.g.ts`.
  const templates = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
      const rel = path.join(dir, entry.name);
      return entry.isDirectory() ? templates(rel) : [rel];
    });

  templates(sourceDir).forEach(sourceFile => {

    const relative = path.relative(sourceDir, sourceFile);
    const parsed = path.parse(relative);
    const foreign = parsed.name.endsWith('.ts');
    const base = foreign ? parsed.name.slice(0, -3) : parsed.name;
    const targetFile = `${targetDir}/${path.join(parsed.dir, base)}.g.${foreign ? 'ts' : 'purs'}`;

    console.log(`Reading template ${sourceFile}.`);
    let template = fs.readFileSync(sourceFile, `utf8`);

    let compiled = handlebars.compile(template);

    console.log(`Writing generated code to ${targetFile}.`);
    fs.mkdirSync(path.dirname(targetFile), { recursive: true });
    fs.writeFileSync(targetFile, compiled(codegen));

  });

  //  console.log(codegen.EventClasses);
  //  console.log(Object.entries(codegen.EventClassFields));

}

main();
