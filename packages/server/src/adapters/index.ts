import { AdapterActionResult } from "~/adapter.js";
import { InterpreterActionProperty } from "~/interpreter.js";

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
