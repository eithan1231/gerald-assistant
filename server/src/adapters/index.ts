import { AdapterActionResult } from "~/adapter.js";
import { InterpreterAction, InterpreterActionProperty } from "~/interpreter.js";

export type ActionJob = {
  type: "job";

  id: string;
  description?: string;
  handler: (
    payload: AdapterInterfaceRunActionData
  ) => Promise<AdapterActionResult | null>;
  parameters: InterpreterActionProperty[];
};

export type ActionCommand = {
  type: "command";

  id: string;
  description: string;
  handler: (
    payload: AdapterInterfaceRunActionData
  ) => Promise<AdapterActionResult | null>;
  parameters: InterpreterActionProperty[];
};

export type Action = ActionJob | ActionCommand;

export type AdapterInterfaceRunActionData<T = any> = {
  id: string;
  parameters: T;
  toolId?: string;
};

export type AdapterInterface = {
  initialise: () => Promise<void>;

  runAction: (
    payload: AdapterInterfaceRunActionData
  ) => Promise<AdapterActionResult | null>;

  getInterpreterActions: () => Promise<InterpreterAction[]>;
};
