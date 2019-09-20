// eslint-disable-next-line import/default
import camelcase from "camelcase";
import {load} from "js-yaml";
import {readFileSync} from "fs";
import {schema} from "./schema";

export * from "./expandYamlValue";

export function objectToCamelCase(obj: object): object {
  if (Object(obj) === obj) {
    Object.getOwnPropertyNames(obj).forEach((name) => {
      const newName = camelcase(name);
      if (newName !== name) {
        // @ts-ignore
        obj[newName] = obj[name];
        // @ts-ignore
        delete obj[name];
      }
      // @ts-ignore
      objectToCamelCase(obj[newName]);
    });
  } else if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      obj[i] = objectToCamelCase(obj[i]);
    }
  }
  return obj;
}

export function loadYamlFile(path: string): object {
  return objectToCamelCase(
    load(
      readFileSync(path, "utf8"),
      {schema}
    )
  );
}