import { AdapterActionResult } from "~/adapter.js";
import { InterpreterAction } from "~/interpreter.js";
import {
  Action,
  AdapterInterface,
  AdapterInterfaceRunActionData,
} from "./index.js";

export class AdapterInterpreterEnd implements AdapterInterface {
  private actions: Action[] = [];

  public initialise = async (): Promise<void> => {
    console.log("[AdapterNoop/initialise] Started");

    this.actions.push({
      type: "command",
      id: "interpreter-end",
      description: "Ends a conversation when there is no open-ended question.",
      handler: this.handlerInterpreterEnd,
      parameters: [],
    });
  };

  public handlerInterpreterEnd = async (
    payload: AdapterInterfaceRunActionData
  ): Promise<AdapterActionResult> => {
    if (!payload.toolId) {
      throw new Error("Tool ID not found");
    }

    return {
      success: true,
      results: [
        {
          type: "interpreter-end",
        },
      ],
    };
  };

  public runAction = async (payload: AdapterInterfaceRunActionData) => {
    for (const action of this.actions) {
      if (action.id === payload.id) {
        return await action.handler(payload);
      }
    }

    return null;
  };

  public getInterpreterActions = async (): Promise<InterpreterAction[]> => {
    return this.actions
      .filter((action) => action.type === "command")
      .map((action) => {
        return {
          id: action.id,
          description: action.description,
          parameters: action.parameters,
        };
      });
  };
}
