export function objectSchema(properties, required = Object.keys(properties)) {
  return {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  };
}

export const stringSchema = (description) => ({ type: "string", description });
export const booleanSchema = (description) => ({ type: "boolean", description });
export const integerSchema = (description, options = {}) => ({
  type: "integer",
  description,
  ...options,
});
export const arraySchema = (description, items) => ({
  type: "array",
  description,
  items,
});

export function requireString(input, key) {
  if (typeof input?.[key] !== "string" || input[key].length === 0) {
    throw new Error(`Expected non-empty string: ${key}`);
  }
  return input[key];
}

export function optionalString(input, key, fallback = undefined) {
  if (input?.[key] === undefined) return fallback;
  if (typeof input[key] !== "string") throw new Error(`Expected string: ${key}`);
  return input[key];
}

export function optionalBoolean(input, key, fallback = false) {
  if (input?.[key] === undefined) return fallback;
  if (typeof input[key] !== "boolean") throw new Error(`Expected boolean: ${key}`);
  return input[key];
}

export function optionalInteger(input, key, fallback = undefined) {
  if (input?.[key] === undefined) return fallback;
  if (!Number.isInteger(input[key])) throw new Error(`Expected integer: ${key}`);
  return input[key];
}

export function optionalArray(input, key, fallback = []) {
  if (input?.[key] === undefined) return fallback;
  if (!Array.isArray(input[key])) throw new Error(`Expected array: ${key}`);
  return input[key];
}
