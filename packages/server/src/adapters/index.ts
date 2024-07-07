import { AdapterActionResult } from "~/adapter.js";
import { InterpreterAction, InterpreterActionProperty } from "~/interpreter.js";

export type ActionJob = {
  type: "job";

  id: string;
  description?: string;
  handler: (properties: any) => Promise<AdapterActionResult | null>;
  properties: InterpreterActionProperty[];
};

export type ActionCommand = {
  type: "command";

  id: string;
  description: string;
  handler: (properties: any) => Promise<AdapterActionResult | null>;
  properties: InterpreterActionProperty[];
};

export type Action = ActionJob | ActionCommand;

export type AdapterInterface = {
  initialise: () => Promise<void>;

  runAction: (
    id: string,
    properties: any
  ) => Promise<AdapterActionResult | null>;

  getInterpreterActions: () => Promise<InterpreterAction[]>;
};
