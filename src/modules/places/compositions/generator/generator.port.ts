export const GENERATOR = Symbol('COMPOSITION_GENERATOR');

export interface CompositionGenInput {
  placeName: string;
  regionName: string;
  description?: string;
}
export interface CompositionGenResult {
  items: { title: string; description: string }[];
}
export interface CompositionGeneratorPort {
  readonly enabled: boolean;
  generate(input: CompositionGenInput): Promise<CompositionGenResult>;
}
