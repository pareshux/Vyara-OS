/**
 * Influence module — public API
 * Stream: Influence (Specify → Influence Graph → Samples → Design Services)
 *
 * Other modules: import ONLY from here.
 * This module must NOT import from sales/, quoting/, or any other domain module.
 * Cross-module data needs come via Inngest events or are passed by the caller.
 */

// Re-export service functions as the public interface
export type { InfluenceContact, SpecificationRecord } from './domain/types';
