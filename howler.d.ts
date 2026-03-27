declare module "howler" {
  export class Howl {
    constructor(options: Record<string, unknown>)
    duration(id?: number): number
    seek(seek?: number, id?: number): number
    unload(): void
  }
}
