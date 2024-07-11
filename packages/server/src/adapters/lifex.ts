import LifxClient from "lifx-lan-client";
import { AdapterActionResult } from "~/adapter.js";
import { getLifxConfig } from "~/config/lifx.js";
import { InterpreterAction, InterpreterActionProperty } from "~/interpreter.js";
import {
  Action,
  AdapterInterface,
  AdapterInterfaceRunActionData,
} from "./index.js";

type StandardParameters = {
  location?: string;
};

type ProfileParameters = StandardParameters & {
  color?: string;
  brightness?: string;
};

export class AdapterLifx implements AdapterInterface {
  private actions: Action[] = [];
  private client?: LifxClient.Client;

  public initialise = async (): Promise<void> => {
    console.log("[AdapterLifx/initialise] Started");

    this.client = new LifxClient.Client();

    const clientInitPromise = () => {
      return new Promise((resolve, reject) =>
        this.client?.init({}, (error: any) => {
          if (error) {
            return reject(error);
          }

          return resolve(null);
        })
      );
    };

    await clientInitPromise();

    const lifxConfig = await getLifxConfig();
    const locations = lifxConfig.commands.map((command) => command.name);

    this.actions.push({
      type: "command",
      id: "turn_lights_off",
      description: "Turn the lights off",
      handler: this.handlerLightsOff,
      parameters: [
        {
          name: "location",
          description: "Placement or location of light",
          enum: locations,
        },
      ],
    });

    this.actions.push({
      type: "command",
      id: "turn_lights_on",
      description: "Turn the lights on",
      handler: this.handlerLightsOn,
      parameters: [
        {
          name: "location",
          description: "Placement or location of light",
          enum: locations,
        },
      ],
    });

    this.actions.push({
      type: "command",
      id: "change_lights_profile",
      description: "Changes light brightness and color",
      handler: this.handlerLightsOn,
      parameters: [
        {
          name: "location",
          description: "Placement or location of light",
          enum: locations,
        },
        {
          name: "brightness",
          description:
            "Brightness of light, absolute or relative. For relative, prefix with plus (+) or minus (-). For absolute, provide whole value",
          type: "string",
        },
        {
          name: "color",
          description:
            "The color of the light. Value must be RGB hex string with # prefix",
          type: "string",
        },
      ],
    });
  };

  private findLightsByLocation = async (location: string) => {
    if (!this.client) {
      return [];
    }

    const config = await getLifxConfig();

    const commands = config.commands.find(
      (command) => command.name === location
    );

    if (!commands?.lights) {
      return [];
    }

    let result: any[] = [];

    for (const commandLight of commands.lights) {
      const command = config.lights.find(
        (configLight) => configLight.name === commandLight
      );

      if (!command?.deviceLabel) {
        continue;
      }

      const light = this.client.light(command.deviceLabel);
      if (light) {
        result.push(light);
      }
    }

    return result;
  };

  public handlerLightsOff = async (
    payload: AdapterInterfaceRunActionData
  ): Promise<AdapterActionResult> => {
    if (!payload.toolId) {
      throw new Error("Tool ID not found");
    }

    const lights = await this.findLightsByLocation(
      payload.parameters.location ?? "all"
    );

    for (const light of lights) {
      light.off();
    }

    return {
      success: true,
      results: [
        {
          type: "interpreter-tool-message",
          toolId: payload.toolId,
          message: "Okay, lights off.",
        },
      ],
    };
  };

  public handlerLightsOn = async (
    payload: AdapterInterfaceRunActionData
  ): Promise<AdapterActionResult> => {
    if (!payload.toolId) {
      throw new Error("Tool ID not found");
    }

    const lights = await this.findLightsByLocation(
      payload.parameters.location ?? "all"
    );

    for (const light of lights) {
      light.on();
    }

    return {
      success: true,
      results: [
        {
          type: "interpreter-tool-message",
          toolId: payload.toolId,
          message: "Okay, lights on.",
        },
      ],
    };
  };

  public handleLightsProfile = async (
    payload: AdapterInterfaceRunActionData
  ): Promise<AdapterActionResult> => {
    if (!payload.toolId) {
      throw new Error("Tool ID not found");
    }

    const lights = await this.findLightsByLocation(
      payload.parameters.location ?? "all"
    );

    await Promise.all(
      lights.map(async (light) => {
        const getState = (): Promise<any> => {
          return new Promise((resolve, reject) =>
            light.getState((err: any, data: any) => {
              if (err) {
                reject(err);
              } else {
                resolve(data);
              }
            })
          );
        };

        if (payload.parameters.brightness) {
          const state = await getState();

          let brightness = state.color.brightness;

          if (payload.parameters.brightness.startsWith("+")) {
            brightness =
              brightness + Number(payload.parameters.brightness.substring(1));
          } else if (payload.parameters.brightness.startsWith("-")) {
            brightness =
              brightness - Number(payload.parameters.brightness.substring(1));
          } else {
            brightness = Number(payload.parameters.brightness);
          }

          if (brightness < 0) {
            brightness = 0;
          }

          if (brightness > 100) {
            brightness = 100;
          }

          light.color(state.color.hue, state.color.saturation, brightness);
        }

        if (payload.parameters.color) {
          light.colorRgbHex(payload.parameters.color);
        }
      })
    );

    return {
      success: true,
      results: [
        {
          type: "interpreter-tool-message",
          toolId: payload.toolId,
          message: "Okay, lights updated.",
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
