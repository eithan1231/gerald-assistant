import { AdapterActionResult } from "~/adapter.js";
import { InterpreterAction } from "~/interpreter.js";
import { unixTimestamp } from "~/util.js";
import { Action } from "./index.js";

export class AdapterChromecast {
  private actions: Action[] = [];

  // private clients?: Record<string, ChromecastWrapper>;

  public initialise = async () => {
    this.actions.push({
      type: "command",
      id: "chromecast_start_jellyfin",
      description: "Opens Jellyfin application for Chromecast",
      handler: this.handlerStartJellyfin,
      properties: [],
    });
  };

  public handlerStartJellyfin = async (properties: {
    duration: number;
  }): Promise<AdapterActionResult> => {
    return {
      success: true,
      results: [
        {
          type: "interpreter-message",
          message: "Opened Jellyfin",
        },
      ],
    };
  };

  public runAction = async (id: string, properties: any) => {
    for (const action of this.actions) {
      if (action.id === id) {
        return await action.handler(properties);
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
          properties: action.properties,
        };
      });
  };
}
