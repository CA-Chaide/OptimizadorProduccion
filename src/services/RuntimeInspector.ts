
import React from 'react';

/**
 * RuntimeInspector: Sistema de observabilidad profunda para rastrear
 * variables, estados, operaciones y contexto de ejecución en tiempo real.
 */

export interface VariableSnapshot {
  id: string;
  timestamp: Date;
  section: string;
  scope: string; // 'component', 'function', 'api', 'calculation'
  name: string;
  value: any;
  type: string; // typeof value
  metadata?: {
    source?: string; // de dónde viene (API, usuario, cálculo)
    dependencies?: string[]; // variables de las que depende
    description?: string;
  };
}

export interface ExecutionContext {
  id: string;
  timestamp: Date;
  section: string;
  action: string; // 'load', 'filter', 'calculate', 'submit', 'transform'
  status: 'started' | 'running' | 'completed' | 'failed';
  inputs?: Record<string, any>;
  outputs?: Record<string, any>;
  duration?: number;
  error?: string;
  stackTrace?: string[];
}

export interface StateSnapshot {
  section: string;
  timestamp: Date;
  state: Record<string, any> | string;
  props?: Record<string, any> | string;
  computed?: Record<string, any> | string;
}

type InspectorListener = (event: {
  type: 'variable' | 'context' | 'state';
  data: VariableSnapshot | ExecutionContext | StateSnapshot;
}) => void;

class RuntimeInspector {
  private static instance: RuntimeInspector;
  private listeners: InspectorListener[] = [];
  
  private variables: Map<string, VariableSnapshot[]> = new Map();
  private contexts: ExecutionContext[] = [];
  private states: Map<string, StateSnapshot> = new Map();
  private activeContexts: Map<string, ExecutionContext> = new Map();

  private constructor() {}

  public static getInstance(): RuntimeInspector {
    if (!RuntimeInspector.instance) {
      RuntimeInspector.instance = new RuntimeInspector();
    }
    return RuntimeInspector.instance;
  }

  public subscribe(listener: InspectorListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  public captureVariable(
    section: string,
    scope: string,
    name: string,
    value: any,
    metadata?: VariableSnapshot['metadata']
  ): void {
    const snapshot: VariableSnapshot = {
      id: `var-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      timestamp: new Date(),
      section,
      scope,
      name,
      value: this.serializeValue(value),
      type: typeof value,
      metadata,
    };

    if (!this.variables.has(section)) {
      this.variables.set(section, []);
    }
    const sectionVars = this.variables.get(section)!;
    if (sectionVars.length >= 50) sectionVars.shift();
    sectionVars.push(snapshot);

    this.notifyListeners({ type: 'variable', data: snapshot });
  }

  public startContext(section: string, action: string, inputs?: Record<string, any>): string {
    const contextId = `ctx-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const context: ExecutionContext = {
      id: contextId,
      timestamp: new Date(),
      section,
      action,
      status: 'started',
      inputs: inputs ? this.serializeValue(inputs) : undefined,
    };
    this.activeContexts.set(contextId, context);
    this.contexts.push(context);
    if (this.contexts.length > 100) this.contexts.shift();
    this.notifyListeners({ type: 'context', data: context });
    return contextId;
  }

  public updateContext(
    contextId: string,
    status: ExecutionContext['status'],
    data?: { outputs?: Record<string, any>; error?: string; stackTrace?: string[] }
  ): void {
    const context = this.activeContexts.get(contextId);
    if (!context) return;

    const duration = Date.now() - context.timestamp.getTime();
    const updated: ExecutionContext = {
      ...context,
      status,
      duration,
      outputs: data?.outputs ? this.serializeValue(data.outputs) : context.outputs,
      error: data?.error,
      stackTrace: data?.stackTrace,
    };

    if (status === 'completed' || status === 'failed') {
      this.activeContexts.delete(contextId);
    } else {
      this.activeContexts.set(contextId, updated);
    }

    const index = this.contexts.findIndex(c => c.id === contextId);
    if (index !== -1) this.contexts[index] = updated;
    this.notifyListeners({ type: 'context', data: updated });
  }

  public captureState(section: string, state: Record<string, any>, props?: Record<string, any>, computed?: Record<string, any>): void {
    const snapshot: StateSnapshot = {
      section,
      timestamp: new Date(),
      state: JSON.stringify(this.serializeValue(state), null, 2),
      props: props ? JSON.stringify(this.serializeValue(props), null, 2) : undefined,
      computed: computed ? JSON.stringify(this.serializeValue(computed), null, 2) : undefined,
    };
    this.states.set(section, snapshot);
    this.notifyListeners({ type: 'state', data: snapshot });
  }

  public getVariables(section?: string, limit: number = 50): VariableSnapshot[] {
    if (section) return this.variables.get(section)?.slice(-limit) || [];
    const allVars: VariableSnapshot[] = [];
    this.variables.forEach(vars => allVars.push(...vars.slice(-limit)));
    return allVars.slice(-limit);
  }

  public getContexts(section?: string, limit: number = 50): ExecutionContext[] {
    if (section) return this.contexts.filter(c => c.section === section).slice(-limit);
    return this.contexts.slice(-limit);
  }

  public getAllStates(): Record<string, StateSnapshot> {
    const result: Record<string, StateSnapshot> = {};
    this.states.forEach((state, section) => { result[section] = state; });
    return result;
  }

  public getActiveContexts(): ExecutionContext[] {
    return Array.from(this.activeContexts.values());
  }

  public getSummary(): any {
    const sectionNames = new Set<string>();
    let totalVars = 0;
    this.variables.forEach((vars, section) => { sectionNames.add(section); totalVars += vars.length; });
    this.contexts.forEach(ctx => sectionNames.add(ctx.section));
    this.states.forEach((_, section) => sectionNames.add(section));
    return {
      totalVariables: totalVars,
      totalContexts: this.contexts.length,
      activeContexts: this.activeContexts.size,
      sections: Array.from(sectionNames).sort(),
      recentActivity: this.contexts.slice(-10).map(ctx => ({ section: ctx.section, action: ctx.action, timestamp: ctx.timestamp })),
    };
  }

  private serializeValue(value: any, depth = 0): any {
    try {
      if (depth > 5) return '[Depth Limit]';
      if (value === null || value === undefined) return value;
      if (typeof value === 'function') return '[Function]';
      if (value instanceof Date) return value.toISOString();
      if (Array.isArray(value)) {
        if (value.length > 50) return `[Array(${value.length})]`;
        return value.map(v => this.serializeValue(v, depth + 1));
      }
      if (typeof value === 'object') {
        const keys = Object.keys(value);
        if (keys.length > 50) return `[Object with ${keys.length} keys]`;
        const serialized: any = {};
        for (const key of keys) serialized[key] = this.serializeValue(value[key], depth + 1);
        return serialized;
      }
      return value;
    } catch { return '[Error]'; }
  }

  private notifyListeners(event: any): void {
    this.listeners.forEach(l => { try { l(event); } catch {} });
  }
}

export const runtimeInspector = RuntimeInspector.getInstance();

export function useRuntimeInspector(section: string) {
  return React.useMemo(() => ({
    captureVariable: (name: string, value: any, metadata?: any) => {
      runtimeInspector.captureVariable(section, 'component', name, value, metadata);
    },
    captureState: (state: any, props?: any, computed?: any) => {
      runtimeInspector.captureState(section, state, props, computed);
    },
    startContext: (action: string, inputs?: any) => {
      return runtimeInspector.startContext(section, action, inputs);
    },
    updateContext: (id: string, status: any, data?: any) => {
      runtimeInspector.updateContext(id, status, data);
    },
  }), [section]);
}
