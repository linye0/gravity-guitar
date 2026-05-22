declare module 'abcjs' {
  export interface RenderParams {
    responsive?: 'resize' | 'none';
    add_classes?: boolean;
    staffwidth?: number;
    selectTypes?: boolean;
    [key: string]: any;
  }

  export function renderAbc(
    output: HTMLElement | string,
    abcSource: string,
    renderParams?: RenderParams
  ): any[];
}
