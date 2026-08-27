/**
 * TypeScript 声明：薄壳能 import .css / .module.css。
 * 解析库包组件（SessionBubbleList import module.css）时同样需要。
 */

declare module "*.module.css" {
  const classes: { readonly [key: string]: string };
  export default classes;
}

declare module "*.css" {
  const content: string;
  export default content;
}
