/** Resolve a picker's file again because its metadata can change while the picker stays open. */
export function currentTarget<TFile, TMeta>(file: TFile, get: (file: TFile) => TMeta | null): TMeta | null {
  return get(file)
}
