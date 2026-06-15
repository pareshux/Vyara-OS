/**
 * Workflow Engine — public API
 *
 * Other modules import ONLY from here, never from engine.ts or types.ts directly.
 * This boundary prevents implementation details leaking across modules.
 */
export { executeTransition, getAvailableTransitions } from './engine';
export type {
  WorkflowTemplate,
  WorkflowInstance,
  TransitionResult,
  ExecuteTransitionParams,
  WorkflowAction,
  GuardCondition,
  Stage,
  Transition,
  WorkflowType,
} from './types';
