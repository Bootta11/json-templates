// json-templates
// Simple templating within JSON structures.
//
// Created by Curran Kelleher and Chrostophe Serafin.
// Contributions from Paul Brewer and Javier Blanco Martinez.
const objectPath = require('object-path');
const dedupe = require('dedupe');
const safeEval = require('notevil');

// An enhanced version of `typeof` that handles arrays and dates as well.
function type(value) {
  let valueType = typeof value;
  if (Array.isArray(value)) {
    valueType = 'array';
  } else if (value instanceof Date) {
    valueType = 'date';
  } else if (value === null) {
    valueType = 'null';
  }

  return valueType;
}

// Constructs a parameter object from a match result.
// e.g. "['{{foo}}']" --> { key: "foo" }
// e.g. "['{{foo:bar}}']" --> { key: "foo", defaultValue: "bar" }
function Parameter(match) {
  let param;
  const matchValue = match.substr(2, match.length - 4).trim();
  const i = matchValue.indexOf(':');

  if (i !== -1) {
    param = {
      key: matchValue.substr(0, i),
      defaultValue: matchValue.substr(i + 1)
    };
  } else {
    param = { key: matchValue };
  }

  return param;
}

// Constructs a template function with deduped `parameters` property.
function Template(fn, parameters) {
  // Paul Brewer Dec 2017 add deduplication call, use only key property to eliminate
  Object.assign(fn, {
    parameters: dedupe(parameters, item => item.key)
  });

  return fn;
}

// Parses the given template object.
//
// Returns a function `template(context)` that will "fill in" the template
// with the context object passed to it.
//
// The returned function has a `parameters` property,
// which is an array of parameter descriptor objects,
// each of which has a `key` property and possibly a `defaultValue` property.
function parse(value, evalDefaults = false) {
  switch (type(value)) {
    case 'string':
      return parseString(value, evalDefaults);
    case 'object':
      return parseObject(value, evalDefaults);
    case 'array':
      return parseArray(value, evalDefaults);
    default:
      return Template(function() {
        return value;
      }, []);
  }
}

// Parses leaf nodes of the template object that are strings.
// Also used for parsing keys that contain templates.
const parseString = (() => {
  // This regular expression detects instances of the
  // template parameter syntax such as {{foo}} or {{foo:someDefault}}.
  const regex = /{{(\w|:|[\{\}\"\[\]\s-+.,@/\//()?=*_$])+?}}/g;

  return (str, evalDefaults = false) => {
    let parameters = [];
    let templateFn = () => str;

    if (regex.test(str)) {
      const matches = str.match(regex);
      parameters = matches.map(Parameter);
      templateFn = context => {
        context = context || {};
        return matches.reduce((str, match, i) => {
          const parameter = parameters[i];
          let value = objectPath.get(context, parameter.key);
          if (value === undefined || value == null) {
            value = parameter.defaultValue;

            if (evalDefaults === true) {
              try{
                value = safeEval(parameter.defaultValue, context)
              }catch (ex){
                //do nothing
              }
            }
          }

          if (typeof value === 'function') {
            value = value();
          }

          if (typeof value === 'object') {
            return value;
          }

          if (value === undefined || value === null) {
            return null;
          }

          // Accommodate numbers as values.
          if (matches.length === 1 && str.startsWith('{{') && str.endsWith('}}')) {
            return value;
          }

          return str.replace(match, value);
        }, str);
      };
    }

    return Template(templateFn, parameters);
  };
})();

// Parses non-leaf-nodes in the template object that are objects.
function parseObject(object, evalDefaults = false) {
  const children = Object.keys(object).map(key => ({
    keyTemplate: parseString(key, evalDefaults),
    valueTemplate: parse(object[key], evalDefaults)
  }));
  const templateParameters = children.reduce(
    (parameters, child) =>
      parameters.concat(child.valueTemplate.parameters, child.keyTemplate.parameters),
    []
  );
  const templateFn = context => {
    return children.reduce((newObject, child) => {
      newObject[child.keyTemplate(context)] = child.valueTemplate(context);
      return newObject;
    }, {});
  };

  return Template(templateFn, templateParameters);
}

// Parses non-leaf-nodes in the template object that are arrays.
function parseArray(array, evalDefaults = false) {
  const templates = array.map(el => parse(el, evalDefaults));
  const templateParameters = templates.reduce(
    (parameters, template) => parameters.concat(template.parameters),
    []
  );
  const templateFn = context => templates.map(template => template(context));

  return Template(templateFn, templateParameters);
}

module.exports = parse;
