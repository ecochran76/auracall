const escapeCssValue = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

export const cssAttrContains = (attr: string, value: string): string =>
  `[${attr}*="${escapeCssValue(value)}"]`;

export const cssAttrEquals = (attr: string, value: string): string =>
  `[${attr}="${escapeCssValue(value)}"]`;

export const cssClassContains = (value: string): string => cssAttrContains('class', value);

export const cssClassEquals = (value: string): string => cssAttrEquals('class', value);
