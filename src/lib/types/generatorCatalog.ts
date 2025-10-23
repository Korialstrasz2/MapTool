import type { GeneratorResult } from '$lib/types/generation';

export interface GeneratorParameterDefinition {
  id: string;
  label: string;
  type: 'range' | 'number';
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  description?: string;
  defaultValue: number;
}

export interface GeneratorVariant {
  id: string;
  name: string;
  description: string;
  parameterOverrides?: Record<string, number>;
}

export interface GeneratorContext {
  width: number;
  height: number;
  seed: number;
  parameters: Record<string, number>;
  variantId: string;
}

export interface GeneratorRunner {
  generate(context: GeneratorContext): Promise<GeneratorResult>;
}

export interface GeneratorFamily {
  id: string;
  name: string;
  description: string;
  tags: string[];
  variants: GeneratorVariant[];
  parameters: GeneratorParameterDefinition[];
  createRunner(): Promise<GeneratorRunner>;
}

export interface GeneratorSelectionPayload {
  familyId: string;
  variantId: string;
  width: number;
  height: number;
  seed: number;
  parameters: Record<string, number>;
}
