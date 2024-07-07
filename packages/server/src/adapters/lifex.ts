import LifxClient from "lifx-lan-client";
import { AdapterActionResult } from "~/adapter.js";
import { getLifxConfig } from "~/config/lifx.js";
import { InterpreterAction, InterpreterActionProperty } from "~/interpreter.js";
import { Action, AdapterInterface } from "./index.js";

type StandardProperties = {
  location?: string;
};

type ProfileProperties = StandardProperties & {
  color?: string;
  brightness?: string;
};

export class AdapterLifx implements AdapterInterface {
  private actions: Action[] = [];
  private client?: LifxClient.Client;

  public initialise = async (): Promise<void> => {
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
      properties: [
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
      properties: [
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
      properties: [
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
    properties: StandardProperties
  ): Promise<AdapterActionResult> => {
    const lights = await this.findLightsByLocation(
      properties.location ?? "all"
    );

    for (const light of lights) {
      light.off();
    }

    return {
      success: true,
      results: [
        {
          type: "interpreter-message",
          message: "Okay, lights off.",
        },
      ],
    };
  };

  public handlerLightsOn = async (
    properties: StandardProperties
  ): Promise<AdapterActionResult> => {
    const lights = await this.findLightsByLocation(
      properties.location ?? "all"
    );

    for (const light of lights) {
      light.on();
    }

    return {
      success: true,
      results: [
        {
          type: "interpreter-message",
          message: "Okay, lights on.",
        },
      ],
    };
  };

  public handleLightsProfile = async (
    properties: ProfileProperties
  ): Promise<AdapterActionResult> => {
    const lights = await this.findLightsByLocation(
      properties.location ?? "all"
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

        if (properties.brightness) {
          const state = await getState();

          let brightness = state.color.brightness;

          if (properties.brightness.startsWith("+")) {
            brightness =
              brightness + Number(properties.brightness.substring(1));
          } else if (properties.brightness.startsWith("-")) {
            brightness =
              brightness - Number(properties.brightness.substring(1));
          } else {
            brightness = Number(properties.brightness);
          }

          if (brightness < 0) {
            brightness = 0;
          }

          if (brightness > 100) {
            brightness = 100;
          }

          light.color(state.color.hue, state.color.saturation, brightness);
        }

        if (properties.color) {
          light.colorRgbHex(properties.color);
        }
      })
    );

    return {
      success: true,
      results: [
        {
          type: "interpreter-message",
          message: "Okay, lights updated.",
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
