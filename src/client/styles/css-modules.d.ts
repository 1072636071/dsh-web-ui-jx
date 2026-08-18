/**
 * TypeScript 声明：让 .ts/.tsx 能 import .css / .module.css。
 *
 * - *.module.css：CSS Modules，返回 class name 映射对象。
 * - *.css：普通 CSS，副作用 import（vite 构建时注入样式）。
 *
 * 放在 src/ 下，被 tsconfig include:["src"] 自动包含。
 */

declare module "*.module.css" {
  const classes: { readonly [key: string]: string };
  export default classes;
}

declare module "*.css" {
  const content: string;
  export default content;
}
